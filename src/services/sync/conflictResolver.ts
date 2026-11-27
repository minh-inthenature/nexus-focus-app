import { getSupabaseClient } from '@/services/auth/supabase.client';
import { googleDriveService } from '@/services/google-drive/google-drive.service';
import {
  applyRemoteCalendarEventUpsert,
  createCalendarEvent,
  purgeDeletedCalendarEventTombstone,
} from '@/services/storage/calendarEvents.repository';
import {
  createUuid,
  db,
  type CalendarEventRecord,
  type TaskRecord,
} from '@/services/storage/db';
import {
  deleteMappingByLocalNoteId,
  upsertDriveMapping,
} from '@/services/storage/driveMappings.repository';
import {
  applyRemoteNoteDelete,
  applyRemoteNoteUpsert,
  createNote,
} from '@/services/storage/notes.repository';
import {
  applyRemoteTaskUpsert,
  createTask,
  purgeDeletedTaskTombstone,
} from '@/services/storage/tasks.repository';
import { clearPendingChangesForEntity } from './syncQueue';
import type {
  RemoteCalendarEventMetadata,
  RemoteTaskMetadata,
  SyncConflictRecord,
  SyncConflictResolution,
} from './syncTypes';

/**
 * Persists a synchronization conflict in Dexie, replacing any older conflict
 * entry for the same entity so duplicates are avoided.
 */
export async function recordSyncConflict(
  conflict: Omit<SyncConflictRecord, 'id' | 'createdAt'>,
): Promise<SyncConflictRecord> {
  const existing = await db.sync_conflicts
    .where('entityId')
    .equals(conflict.entityId)
    .first();

  const record: SyncConflictRecord = {
    ...conflict,
    id: existing?.id ?? createUuid(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await db.sync_conflicts.put(record);
  return record;
}

export async function listSyncConflicts(): Promise<SyncConflictRecord[]> {
  const rows = await db.sync_conflicts.toArray();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function syncNoteMetadataToSupabase(params: {
  userId: string;
  localNoteId: string;
  driveFileId: string;
  driveFolderId: string;
  driveFileName: string;
  title: string;
  localFolderId: string | null;
  isFavorite: boolean;
  isDaily: boolean;
  dailyDate?: string;
  localRevision: number;
  modifiedTime: string;
  md5Checksum?: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await client.from('drive_note_mappings').upsert(
    {
      user_id: params.userId,
      local_note_id: params.localNoteId,
      drive_file_id: params.driveFileId,
      drive_folder_id: params.driveFolderId,
      drive_file_name: params.driveFileName,
      title: params.title,
      local_folder_id: params.localFolderId,
      is_favorite: params.isFavorite,
      is_daily: params.isDaily,
      daily_date: params.dailyDate ?? null,
      local_revision: params.localRevision,
      last_known_modified_time: params.modifiedTime,
      last_known_checksum: params.md5Checksum ?? null,
      deleted_at: null,
    },
    { onConflict: 'user_id,local_note_id' },
  );
}

export function mapRemoteTaskToLocal(
  remote: RemoteTaskMetadata,
  userId: string,
): TaskRecord {
  return {
    id: remote.id,
    userId,
    title: remote.title,
    ...(remote.description ? { description: remote.description } : {}),
    status: remote.status,
    priority: remote.priority,
    ...(remote.startDate ? { startDate: remote.startDate } : {}),
    ...(remote.dueDate ? { dueDate: remote.dueDate } : {}),
    tags: [...remote.tags],
    ...(remote.category ? { category: remote.category } : {}),
    ...(remote.groupName ? { group: remote.groupName } : {}),
    ...(remote.isBacklog !== undefined ? { isBacklog: remote.isBacklog } : {}),
    linkedNoteIds: [...remote.linkedNoteIds],
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    ...(remote.completedAt ? { completedAt: remote.completedAt } : {}),
    revision: remote.revision,
    lastSyncedRevision: remote.revision,
    lastSyncedUpdatedAt: remote.updatedAt,
  };
}

/**
 * Upserts a task row into Supabase `tasks`, gracefully falling back if the
 * `group_name` / `is_backlog` migration hasn't been executed yet.
 */
export async function upsertTaskRowToSupabase(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  task: TaskRecord,
  userId: string,
  revisionOverride?: number,
): Promise<{ updated_at?: string; revision?: number } | null> {
  const basePayload = {
    id: task.id,
    user_id: userId,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    start_date: task.startDate ?? null,
    due_date: task.dueDate ?? null,
    tags: [...task.tags],
    category: task.category ?? null,
    linked_note_ids: [...task.linkedNoteIds],
    revision: revisionOverride ?? task.revision,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt ?? null,
    deleted_at: null,
  };

  const fullPayload = {
    ...basePayload,
    group_name: task.group ?? null,
    is_backlog: Boolean(task.isBacklog),
  };

  const { data, error } = await client
    .from('tasks')
    .upsert(fullPayload, { onConflict: 'id' })
    .select('updated_at, revision')
    .single();

  if (error) {
    const missingOptionalColumn =
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      /group_name|is_backlog/i.test(error.message);
    if (missingOptionalColumn) {
      const retry = await client
        .from('tasks')
        .upsert(basePayload, { onConflict: 'id' })
        .select('updated_at, revision')
        .single();
      if (retry.error) {
        throw new Error(retry.error.message);
      }
      return retry.data;
    }
    throw new Error(error.message);
  }

  return data;
}

async function pushTaskToSupabase(
  task: TaskRecord,
  userId: string,
  overrideRevision?: number,
): Promise<TaskRecord> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const nextRevision = overrideRevision ?? task.revision;
  const data = await upsertTaskRowToSupabase(client, task, userId, nextRevision);

  const syncedUpdatedAt =
    typeof data?.updated_at === 'string' ? data.updated_at : task.updatedAt;
  const syncedRevision =
    typeof data?.revision === 'number' ? data.revision : nextRevision;

  const syncedRecord: TaskRecord = {
    ...task,
    userId,
    revision: syncedRevision,
    lastSyncedRevision: syncedRevision,
    lastSyncedUpdatedAt: syncedUpdatedAt,
  };
  await applyRemoteTaskUpsert(syncedRecord);
  return syncedRecord;
}

async function resolveTaskConflict(
  conflict: SyncConflictRecord,
  resolution: SyncConflictResolution,
  userId: string,
): Promise<void> {
  const localTask = await db.tasks.get(conflict.entityId);

  if (resolution === 'keep_local') {
    if (localTask && !localTask.deletedAt) {
      const nextRev = Math.max(
        localTask.revision,
        (conflict.remoteTaskSnapshot?.revision ?? 0) + 1,
      );
      await pushTaskToSupabase(localTask, userId, nextRev);
    }
    await clearPendingChangesForEntity('task', conflict.entityId);
    await db.sync_conflicts.delete(conflict.id);
    return;
  }

  if (resolution === 'keep_remote') {
    if (conflict.reason === 'deleted_remotely') {
      await purgeDeletedTaskTombstone(conflict.entityId);
    } else if (conflict.remoteTaskSnapshot) {
      await applyRemoteTaskUpsert(
        mapRemoteTaskToLocal(conflict.remoteTaskSnapshot, userId),
      );
    }
    await clearPendingChangesForEntity('task', conflict.entityId);
    await db.sync_conflicts.delete(conflict.id);
    return;
  }

  // keep_both
  if (conflict.remoteTaskSnapshot) {
    const snap = conflict.remoteTaskSnapshot;
    await createTask({
      userId,
      title: `${snap.title} (Conflict Copy)`,
      ...(snap.description ? { description: snap.description } : {}),
      status: snap.status,
      priority: snap.priority,
      ...(snap.startDate ? { startDate: snap.startDate } : {}),
      ...(snap.dueDate ? { dueDate: snap.dueDate } : {}),
      tags: snap.tags,
      ...(snap.category ? { category: snap.category } : {}),
      ...(snap.groupName ? { group: snap.groupName } : {}),
      ...(snap.isBacklog !== undefined ? { isBacklog: snap.isBacklog } : {}),
      linkedNoteIds: snap.linkedNoteIds,
    });
  }

  if (localTask && !localTask.deletedAt) {
    const nextRev = Math.max(
      localTask.revision,
      (conflict.remoteTaskSnapshot?.revision ?? 0) + 1,
    );
    await pushTaskToSupabase(localTask, userId, nextRev);
  }

  await clearPendingChangesForEntity('task', conflict.entityId);
  await db.sync_conflicts.delete(conflict.id);
}

export function mapRemoteCalendarEventToLocal(
  remote: RemoteCalendarEventMetadata,
  userId: string,
): CalendarEventRecord {
  return {
    id: remote.id,
    userId,
    title: remote.title,
    ...(remote.description ? { description: remote.description } : {}),
    ...(remote.location ? { location: remote.location } : {}),
    startAt: remote.startAt,
    endAt: remote.endAt,
    allDay: remote.allDay,
    ...(remote.timezone ? { timezone: remote.timezone } : {}),
    category: remote.category,
    ...(remote.color ? { color: remote.color } : {}),
    linkedNoteIds: [...remote.linkedNoteIds],
    linkedTaskIds: [...remote.linkedTaskIds],
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    revision: remote.revision,
    lastSyncedRevision: remote.revision,
    lastSyncedUpdatedAt: remote.updatedAt,
  };
}

async function pushCalendarEventToSupabase(
  event: CalendarEventRecord,
  userId: string,
  overrideRevision?: number,
): Promise<CalendarEventRecord> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured.');
  }

  const nextRevision = overrideRevision ?? event.revision;
  const { data, error } = await client
    .from('calendar_events')
    .upsert(
      {
        id: event.id,
        user_id: userId,
        title: event.title,
        description: event.description ?? null,
        location: event.location ?? null,
        start_at: event.startAt,
        end_at: event.endAt,
        all_day: event.allDay,
        timezone: event.timezone ?? null,
        category: event.category,
        color: event.color ?? null,
        linked_note_ids: [...event.linkedNoteIds],
        linked_task_ids: [...event.linkedTaskIds],
        revision: nextRevision,
        created_at: event.createdAt,
        updated_at: event.updatedAt,
        deleted_at: null,
      },
      { onConflict: 'id' },
    )
    .select('updated_at, revision')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const syncedUpdatedAt =
    typeof data?.updated_at === 'string' ? data.updated_at : event.updatedAt;
  const syncedRevision =
    typeof data?.revision === 'number' ? data.revision : nextRevision;

  const syncedRecord: CalendarEventRecord = {
    ...event,
    userId,
    revision: syncedRevision,
    lastSyncedRevision: syncedRevision,
    lastSyncedUpdatedAt: syncedUpdatedAt,
  };
  await applyRemoteCalendarEventUpsert(syncedRecord);
  return syncedRecord;
}

async function resolveCalendarEventConflict(
  conflict: SyncConflictRecord,
  resolution: SyncConflictResolution,
  userId: string,
): Promise<void> {
  const localEvent = await db.calendar_events.get(conflict.entityId);

  if (resolution === 'keep_local') {
    if (localEvent && !localEvent.deletedAt) {
      const nextRev = Math.max(
        localEvent.revision,
        (conflict.remoteCalendarEventSnapshot?.revision ?? 0) + 1,
      );
      await pushCalendarEventToSupabase(localEvent, userId, nextRev);
    }
    await clearPendingChangesForEntity('calendar_event', conflict.entityId);
    await db.sync_conflicts.delete(conflict.id);
    return;
  }

  if (resolution === 'keep_remote') {
    if (conflict.reason === 'deleted_remotely') {
      await purgeDeletedCalendarEventTombstone(conflict.entityId);
    } else if (conflict.remoteCalendarEventSnapshot) {
      await applyRemoteCalendarEventUpsert(
        mapRemoteCalendarEventToLocal(
          conflict.remoteCalendarEventSnapshot,
          userId,
        ),
      );
    }
    await clearPendingChangesForEntity('calendar_event', conflict.entityId);
    await db.sync_conflicts.delete(conflict.id);
    return;
  }

  // keep_both
  if (conflict.remoteCalendarEventSnapshot) {
    const snap = conflict.remoteCalendarEventSnapshot;
    await createCalendarEvent({
      userId,
      title: `${snap.title} (Conflict Copy)`,
      ...(snap.description ? { description: snap.description } : {}),
      ...(snap.location ? { location: snap.location } : {}),
      startAt: snap.startAt,
      endAt: snap.endAt,
      allDay: snap.allDay,
      ...(snap.timezone ? { timezone: snap.timezone } : {}),
      category: snap.category,
      ...(snap.color ? { color: snap.color } : {}),
      linkedNoteIds: snap.linkedNoteIds,
      linkedTaskIds: snap.linkedTaskIds,
    });
  }

  if (localEvent && !localEvent.deletedAt) {
    const nextRev = Math.max(
      localEvent.revision,
      (conflict.remoteCalendarEventSnapshot?.revision ?? 0) + 1,
    );
    await pushCalendarEventToSupabase(localEvent, userId, nextRev);
  }

  await clearPendingChangesForEntity('calendar_event', conflict.entityId);
  await db.sync_conflicts.delete(conflict.id);
}

/**
 * Resolves a stored conflict explicitly based on user choice without losing data.
 */
export async function resolveSyncConflict(
  conflictId: string,
  resolution: SyncConflictResolution,
  userId: string,
  notesFolderId: string,
): Promise<void> {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict) return;

  if (conflict.entityType === 'task') {
    await resolveTaskConflict(conflict, resolution, userId);
    return;
  }

  if (conflict.entityType === 'calendar_event') {
    await resolveCalendarEventConflict(conflict, resolution, userId);
    return;
  }

  if (!conflict.driveFileId) {
    await clearPendingChangesForEntity('note', conflict.entityId);
    await db.sync_conflicts.delete(conflictId);
    return;
  }

  const localNote = await db.notes.get(conflict.entityId);

  if (resolution === 'keep_local') {
    if (localNote && !localNote.deletedAt) {
      const uploaded =
        conflict.reason === 'deleted_remotely'
          ? await googleDriveService.uploadMarkdownFile({
              localNoteId: localNote.id,
              name: localNote.title,
              content: localNote.content,
            })
          : await googleDriveService.updateMarkdownFile({
              fileId: conflict.driveFileId,
              name: localNote.title,
              content: localNote.content,
              forceOverwrite: true,
            });

      await upsertDriveMapping({
        userId,
        localNoteId: localNote.id,
        driveFileId: uploaded.id,
        driveFolderId: uploaded.parentId ?? notesFolderId,
        driveFileName: uploaded.name,
        lastKnownModifiedTime: uploaded.modifiedTime,
        ...(uploaded.md5Checksum
          ? { lastKnownChecksum: uploaded.md5Checksum }
          : {}),
      });

      await syncNoteMetadataToSupabase({
        userId,
        localNoteId: localNote.id,
        driveFileId: uploaded.id,
        driveFolderId: uploaded.parentId ?? notesFolderId,
        driveFileName: uploaded.name,
        title: localNote.title,
        localFolderId: localNote.folderId,
        isFavorite: localNote.isFavorite,
        isDaily: localNote.isDaily,
        ...(localNote.dailyDate ? { dailyDate: localNote.dailyDate } : {}),
        localRevision: localNote.revision,
        modifiedTime: uploaded.modifiedTime,
        ...(uploaded.md5Checksum ? { md5Checksum: uploaded.md5Checksum } : {}),
      });
    }

    await clearPendingChangesForEntity('note', conflict.entityId);
    await db.sync_conflicts.delete(conflictId);
    return;
  }

  if (resolution === 'keep_remote') {
    if (conflict.reason === 'deleted_remotely') {
      await applyRemoteNoteDelete(conflict.entityId);
      await deleteMappingByLocalNoteId(conflict.entityId);
    } else {
      const { file, content } = await googleDriveService.readMarkdownFile(
        conflict.driveFileId,
      );
      const nextRev = (localNote?.revision ?? 1) + 1;
      const now = new Date().toISOString();

      await applyRemoteNoteUpsert({
        id: conflict.entityId,
        folderId: localNote?.folderId ?? null,
        title:
          localNote?.title ??
          (file.name.replace(/\.(md|markdown)$/i, '').trim() || 'Untitled Note'),
        content,
        isFavorite: localNote?.isFavorite ?? false,
        isDaily: localNote?.isDaily ?? false,
        ...(localNote?.dailyDate ? { dailyDate: localNote.dailyDate } : {}),
        revision: nextRev,
        createdAt: localNote?.createdAt ?? now,
        updatedAt: file.modifiedTime || now,
      });

      await upsertDriveMapping({
        userId,
        localNoteId: conflict.entityId,
        driveFileId: file.id,
        driveFolderId: file.parentId ?? notesFolderId,
        driveFileName: file.name,
        lastKnownModifiedTime: file.modifiedTime,
        ...(file.md5Checksum ? { lastKnownChecksum: file.md5Checksum } : {}),
      });
    }

    await clearPendingChangesForEntity('note', conflict.entityId);
    await db.sync_conflicts.delete(conflictId);
    return;
  }

  // resolution === 'keep_both'
  let remoteContent = conflict.remoteContent;
  let remoteTitle = conflict.noteTitle;
  if (
    conflict.reason !== 'deleted_remotely' &&
    remoteContent === undefined
  ) {
    const res = await googleDriveService.readMarkdownFile(
      conflict.driveFileId,
    );
    remoteContent = res.content;
    remoteTitle =
      res.file.name.replace(/\.(md|markdown)$/i, '').trim() ||
      conflict.noteTitle;
  }

  if (remoteContent !== undefined) {
    await createNote({
      title: `${remoteTitle} (Conflict Copy)`,
      folderId: localNote?.folderId ?? null,
      content: remoteContent,
    });
  }

  if (localNote && !localNote.deletedAt) {
    const uploaded =
      conflict.reason === 'deleted_remotely'
        ? await googleDriveService.uploadMarkdownFile({
            localNoteId: localNote.id,
            name: localNote.title,
            content: localNote.content,
          })
        : await googleDriveService.updateMarkdownFile({
            fileId: conflict.driveFileId,
            name: localNote.title,
            content: localNote.content,
            forceOverwrite: true,
          });

    await upsertDriveMapping({
      userId,
      localNoteId: localNote.id,
      driveFileId: uploaded.id,
      driveFolderId: uploaded.parentId ?? notesFolderId,
      driveFileName: uploaded.name,
      lastKnownModifiedTime: uploaded.modifiedTime,
      ...(uploaded.md5Checksum
        ? { lastKnownChecksum: uploaded.md5Checksum }
        : {}),
    });

    await syncNoteMetadataToSupabase({
      userId,
      localNoteId: localNote.id,
      driveFileId: uploaded.id,
      driveFolderId: uploaded.parentId ?? notesFolderId,
      driveFileName: uploaded.name,
      title: localNote.title,
      localFolderId: localNote.folderId,
      isFavorite: localNote.isFavorite,
      isDaily: localNote.isDaily,
      ...(localNote.dailyDate ? { dailyDate: localNote.dailyDate } : {}),
      localRevision: localNote.revision,
      modifiedTime: uploaded.modifiedTime,
      ...(uploaded.md5Checksum ? { md5Checksum: uploaded.md5Checksum } : {}),
    });
  }

  await clearPendingChangesForEntity('note', conflict.entityId);
  await db.sync_conflicts.delete(conflictId);
}
