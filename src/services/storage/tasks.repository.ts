import {
  normalizeTaskTags,
  validateTaskDates,
} from '@/features/tasks/utils/taskFilters';
import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import {
  createUuid,
  db,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
} from './db';

export interface CreateTaskInput {
  readonly userId?: string;
  readonly title: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly tags?: readonly string[];
  readonly category?: string;
  readonly linkedNoteIds?: readonly string[];
}

export interface UpdateTaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly tags?: readonly string[];
  readonly category?: string | null;
  readonly linkedNoteIds?: readonly string[];
}

function dedupeIds(ids: readonly string[] | undefined): string[] {
  if (!ids) return [];
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

/**
 * Lists all active (non-deleted) tasks ordered by `updatedAt` descending.
 */
export async function listTasks(): Promise<TaskRecord[]> {
  const all = await db.tasks.filter((t) => !t.deletedAt).toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Lists all tasks including deleted tombstones for synchronization planning.
 */
export async function listAllTasksIncludingDeleted(): Promise<TaskRecord[]> {
  return db.tasks.toArray();
}

export async function getTaskById(taskId: string): Promise<TaskRecord | null> {
  const record = await db.tasks.get(taskId);
  if (!record || record.deletedAt) return null;
  return record;
}

/**
 * Lists active tasks linked to a specific note UUID.
 */
export async function listTasksForNote(noteId: string): Promise<TaskRecord[]> {
  const all = await db.tasks
    .filter((t) => !t.deletedAt && t.linkedNoteIds.includes(noteId))
    .toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Creates a task in IndexedDB with atomic sync outbox tracking.
 */
export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Task title is required.');
  }

  const startDate = input.startDate?.trim() || undefined;
  const dueDate = input.dueDate?.trim() || undefined;
  const dateError = validateTaskDates(startDate, dueDate);
  if (dateError) {
    throw new Error(dateError);
  }

  const now = new Date().toISOString();
  const status: TaskStatus = input.status ?? 'todo';
  const description = input.description?.trim() || undefined;
  const category = input.category?.trim() || undefined;

  const task: TaskRecord = {
    id: createUuid(),
    userId: input.userId || 'local',
    title,
    ...(description ? { description } : {}),
    status,
    priority: input.priority ?? 'medium',
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    tags: normalizeTaskTags(input.tags ?? []),
    ...(category ? { category } : {}),
    linkedNoteIds: dedupeIds(input.linkedNoteIds),
    createdAt: now,
    updatedAt: now,
    ...(status === 'done' ? { completedAt: now } : {}),
    revision: 1,
  };

  await db.transaction('rw', [db.tasks, db.sync_changes], async () => {
    await db.tasks.add(task);
    await enqueueSyncChangeInTx('task', task.id, 'create', task.revision);
  });

  notifySyncQueueMutated();
  return task;
}

/**
 * Updates a task inside a Dexie transaction, managing `completedAt` and
 * incrementing revision + enqueuing sync change.
 */
export async function updateTask(
  taskId: string,
  patch: UpdateTaskPatch,
): Promise<TaskRecord> {
  const updated = await db.transaction(
    'rw',
    [db.tasks, db.sync_changes],
    async () => {
      const existing = await db.tasks.get(taskId);
      if (!existing || existing.deletedAt) {
        throw new Error('Task not found.');
      }

      const nextTitle =
        patch.title !== undefined ? patch.title.trim() : existing.title;
      if (!nextTitle) {
        throw new Error('Task title cannot be empty.');
      }

      const nextStartDate =
        patch.startDate === null
          ? undefined
          : patch.startDate !== undefined
            ? patch.startDate.trim() || undefined
            : existing.startDate;
      const nextDueDate =
        patch.dueDate === null
          ? undefined
          : patch.dueDate !== undefined
            ? patch.dueDate.trim() || undefined
            : existing.dueDate;

      const dateError = validateTaskDates(nextStartDate, nextDueDate);
      if (dateError) {
        throw new Error(dateError);
      }

      const nextStatus = patch.status ?? existing.status;
      const now = new Date().toISOString();
      const nextCompletedAt =
        nextStatus === 'done'
          ? existing.completedAt ?? now
          : undefined;

      const nextDescription =
        patch.description !== undefined
          ? patch.description.trim() || undefined
          : existing.description;

      const nextCategory =
        patch.category === null
          ? undefined
          : patch.category !== undefined
            ? patch.category.trim() || undefined
            : existing.category;

      const next: TaskRecord = {
        ...existing,
        title: nextTitle,
        status: nextStatus,
        priority: patch.priority ?? existing.priority,
        tags:
          patch.tags !== undefined
            ? normalizeTaskTags(patch.tags)
            : existing.tags,
        linkedNoteIds:
          patch.linkedNoteIds !== undefined
            ? dedupeIds(patch.linkedNoteIds)
            : existing.linkedNoteIds,
        updatedAt: now,
        revision: existing.revision + 1,
      };

      // Assign optional fields cleanly without retaining cleared values
      const cleaned: TaskRecord = {
        id: next.id,
        userId: next.userId,
        title: next.title,
        status: next.status,
        priority: next.priority,
        tags: next.tags,
        linkedNoteIds: next.linkedNoteIds,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        revision: next.revision,
        ...(nextDescription ? { description: nextDescription } : {}),
        ...(nextStartDate ? { startDate: nextStartDate } : {}),
        ...(nextDueDate ? { dueDate: nextDueDate } : {}),
        ...(nextCategory ? { category: nextCategory } : {}),
        ...(nextCompletedAt ? { completedAt: nextCompletedAt } : {}),
        ...(existing.lastSyncedRevision !== undefined
          ? { lastSyncedRevision: existing.lastSyncedRevision }
          : {}),
        ...(existing.lastSyncedUpdatedAt !== undefined
          ? { lastSyncedUpdatedAt: existing.lastSyncedUpdatedAt }
          : {}),
      };

      await db.tasks.put(cleaned);
      await enqueueSyncChangeInTx(
        'task',
        cleaned.id,
        'update',
        cleaned.revision,
      );
      return cleaned;
    },
  );

  notifySyncQueueMutated();
  return updated;
}

/**
 * Toggles a task between `'done'` and `'todo'`.
 */
export async function toggleTaskCompleted(taskId: string): Promise<TaskRecord> {
  const existing = await db.tasks.get(taskId);
  if (!existing || existing.deletedAt) {
    throw new Error('Task not found.');
  }
  const nextStatus: TaskStatus = existing.status === 'done' ? 'todo' : 'done';
  return updateTask(taskId, { status: nextStatus });
}

/**
 * Deletes a task. Preserves a `deletedAt` tombstone for synced tasks until
 * remote Supabase deletion completes, or deletes immediately if unsynced.
 */
export async function deleteTask(taskId: string): Promise<void> {
  await db.transaction('rw', [db.tasks, db.sync_changes], async () => {
    const existing = await db.tasks.get(taskId);
    if (!existing) return;

    const now = new Date().toISOString();
    const nextRev = existing.revision + 1;
    const res = await enqueueSyncChangeInTx('task', taskId, 'delete', nextRev);

    if (res === 'queued' || existing.lastSyncedRevision !== undefined) {
      await db.tasks.update(taskId, {
        deletedAt: now,
        revision: nextRev,
        updatedAt: now,
      });
    } else {
      await db.tasks.delete(taskId);
    }
  });

  notifySyncQueueMutated();
}

/**
 * Applies a remote task into IndexedDB without enqueuing an outbound sync change.
 */
export async function applyRemoteTaskUpsert(task: TaskRecord): Promise<void> {
  await db.tasks.put(task);
}

/**
 * Purges a locally tombstoned or remotely deleted task from IndexedDB.
 */
export async function purgeDeletedTaskTombstone(
  taskId: string,
): Promise<void> {
  await db.tasks.delete(taskId);
}
