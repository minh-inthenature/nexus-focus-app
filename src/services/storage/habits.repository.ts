import { getSupabaseClient } from '@/services/auth/supabase.client';
import {
  habitLogEntityId,
  parseHabitLogEntityId,
} from '@/services/sync/habitKeys';
import {
  clearPendingChangesForEntity,
  enqueueSyncChangeInTx,
  listActionableChanges,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import {
  createUuid,
  db,
  type HabitAccentColor,
  type HabitCategory,
  type HabitFrequency,
  type HabitLogRecord,
  type HabitRecord,
} from './db';

export { habitLogEntityId, parseHabitLogEntityId };

export interface CreateHabitInput {
  readonly userId?: string;
  readonly title: string;
  readonly category?: HabitCategory;
  readonly frequency?: HabitFrequency;
  readonly targetDays?: readonly number[];
  readonly accentColor?: HabitAccentColor;
  readonly sortOrder?: number;
}

export interface UpdateHabitPatch {
  readonly title?: string;
  readonly category?: HabitCategory;
  readonly frequency?: HabitFrequency;
  readonly targetDays?: readonly number[];
  readonly accentColor?: HabitAccentColor;
  readonly sortOrder?: number;
  readonly isArchived?: boolean;
}

const VALID_CATEGORIES = new Set<HabitCategory>([
  'Study',
  'Health',
  'Focus',
  'Personal',
]);
const VALID_FREQUENCIES = new Set<HabitFrequency>([
  'daily',
  'weekdays',
  'custom_days',
]);
const VALID_ACCENTS = new Set<HabitAccentColor>([
  'sage',
  'amber',
  'blue',
  'terracotta',
  'violet',
]);

function resolveTargetDays(
  frequency: HabitFrequency,
  customDays?: readonly number[],
): number[] {
  if (frequency === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  if (frequency === 'weekdays') return [1, 2, 3, 4, 5];
  const cleaned = Array.from(
    new Set((customDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ).sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : [1, 3, 5];
}

function isMissingHabitTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    /habits|habit_logs/i.test(err.message ?? '')
  );
}

export async function listHabits(): Promise<HabitRecord[]> {
  const all = await db.habits.toArray();
  return all.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function listHabitLogs(): Promise<HabitLogRecord[]> {
  return db.habit_logs.toArray();
}

export async function createHabit(input: CreateHabitInput): Promise<HabitRecord> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Habit title is required.');
  }

  const frequency: HabitFrequency = input.frequency ?? 'daily';
  const category: HabitCategory = input.category ?? 'Personal';
  const accentColor: HabitAccentColor = input.accentColor ?? 'sage';
  const targetDays = resolveTargetDays(frequency, input.targetDays);
  const existing = await db.habits.toArray();
  const maxOrder = existing.reduce((max, h) => Math.max(max, h.sortOrder), -1);
  const now = new Date().toISOString();

  const habit: HabitRecord = {
    id: createUuid(),
    userId: input.userId || 'local',
    title,
    category,
    frequency,
    targetDays,
    accentColor,
    sortOrder: input.sortOrder ?? maxOrder + 1,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.habits, db.sync_changes], async () => {
    await db.habits.add(habit);
    await enqueueSyncChangeInTx('habit', habit.id, 'create', 0);
  });
  notifySyncQueueMutated();
  return habit;
}

export async function updateHabit(
  habitId: string,
  patch: UpdateHabitPatch,
): Promise<HabitRecord> {
  const existing = await db.habits.get(habitId);
  if (!existing) {
    throw new Error('Habit not found.');
  }

  const nextTitle =
    patch.title !== undefined ? patch.title.trim() : existing.title;
  if (!nextTitle) {
    throw new Error('Habit title cannot be empty.');
  }

  const nextFrequency = patch.frequency ?? existing.frequency;
  const nextTargetDays =
    patch.frequency !== undefined || patch.targetDays !== undefined
      ? resolveTargetDays(
          nextFrequency,
          patch.targetDays ?? existing.targetDays,
        )
      : [...existing.targetDays];

  const updated: HabitRecord = {
    ...existing,
    title: nextTitle,
    category: patch.category ?? existing.category,
    frequency: nextFrequency,
    targetDays: nextTargetDays,
    accentColor: patch.accentColor ?? existing.accentColor,
    sortOrder: patch.sortOrder ?? existing.sortOrder,
    isArchived: patch.isArchived ?? existing.isArchived,
    updatedAt: new Date().toISOString(),
  };

  await db.transaction('rw', [db.habits, db.sync_changes], async () => {
    await db.habits.put(updated);
    await enqueueSyncChangeInTx('habit', updated.id, 'update', 0);
  });
  notifySyncQueueMutated();
  return updated;
}

export async function deleteHabit(habitId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.habits, db.habit_logs, db.sync_changes],
    async () => {
      const logs = await db.habit_logs
        .where('habitId')
        .equals(habitId)
        .toArray();
      await db.habit_logs.where('habitId').equals(habitId).delete();
      await db.habits.delete(habitId);
      for (const log of logs) {
        await clearPendingChangesForEntity(
          'habit_log',
          habitLogEntityId(habitId, log.completedDate),
        );
      }
      await enqueueSyncChangeInTx('habit', habitId, 'delete', 0);
    },
  );
  notifySyncQueueMutated();
}

export async function toggleHabitLog(
  habitId: string,
  completedDate: string,
  userId = 'local',
): Promise<{ completed: boolean; log: HabitLogRecord | null }> {
  const entityKey = habitLogEntityId(habitId, completedDate);
  const result = await db.transaction(
    'rw',
    [db.habit_logs, db.sync_changes],
    async () => {
      const existing = await db.habit_logs
        .where('[habitId+completedDate]')
        .equals([habitId, completedDate])
        .first();

      if (existing) {
        await db.habit_logs.delete(existing.id);
        await enqueueSyncChangeInTx('habit_log', entityKey, 'delete', 0);
        return { completed: false, log: null };
      }

      const created: HabitLogRecord = {
        id: createUuid(),
        habitId,
        userId,
        completedDate,
        createdAt: new Date().toISOString(),
      };
      await db.habit_logs.add(created);
      await enqueueSyncChangeInTx('habit_log', entityKey, 'create', 0);
      return { completed: true, log: created };
    },
  );
  notifySyncQueueMutated();
  return result;
}

export async function pushHabitToSupabase(
  habit: HabitRecord,
  userId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'local') return;

  const { error } = await client.from('habits').upsert(
    {
      id: habit.id,
      user_id: userId,
      title: habit.title,
      category: habit.category,
      frequency: habit.frequency,
      target_days: [...habit.targetDays],
      accent_color: habit.accentColor,
      sort_order: habit.sortOrder,
      is_archived: habit.isArchived,
      created_at: habit.createdAt,
      updated_at: habit.updatedAt,
    },
    { onConflict: 'id' },
  );

  if (error && !isMissingHabitTableError(error)) {
    throw new Error(error.message);
  }
}

export async function deleteHabitFromSupabase(
  habitId: string,
  userId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'local') return;

  const { error } = await client
    .from('habits')
    .delete()
    .eq('id', habitId)
    .eq('user_id', userId);

  if (error && !isMissingHabitTableError(error)) {
    throw new Error(error.message);
  }
}

export async function pushHabitLogToggleToSupabase(
  habit: HabitRecord | undefined,
  habitId: string,
  completedDate: string,
  completed: boolean,
  log: HabitLogRecord | null,
  userId: string,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'local') return;

  if (completed && log) {
    if (habit) {
      await pushHabitToSupabase(habit, userId);
    }
    const { error } = await client.from('habit_logs').upsert(
      {
        id: log.id,
        habit_id: habitId,
        user_id: userId,
        completed_date: completedDate,
        created_at: log.createdAt,
      },
      { onConflict: 'habit_id,completed_date' },
    );
    if (error && !isMissingHabitTableError(error)) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await client
      .from('habit_logs')
      .delete()
      .eq('habit_id', habitId)
      .eq('completed_date', completedDate)
      .eq('user_id', userId);
    if (error && !isMissingHabitTableError(error)) {
      throw new Error(error.message);
    }
  }
}

/**
 * Pulls remote habits and logs from Supabase and merges them with local IndexedDB.
 * Local pending/failed mutations in `db.sync_changes` win over remote pulls until flushed;
 * clean records deleted on another device are removed locally.
 */
export async function syncHabitsWithSupabase(userId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !userId || userId === 'local') return false;

  const [habitsRes, logsRes] = await Promise.all([
    client.from('habits').select('*').eq('user_id', userId),
    client.from('habit_logs').select('*').eq('user_id', userId),
  ]);

  if (habitsRes.error || logsRes.error) {
    const firstErr = habitsRes.error ?? logsRes.error;
    if (isMissingHabitTableError(firstErr)) return false;
    throw new Error(firstErr?.message ?? 'Failed to sync habits.');
  }

  const actionable = await listActionableChanges();
  const pendingHabitIds = new Set(
    actionable
      .filter((c) => c.entityType === 'habit')
      .map((c) => c.entityId),
  );
  const pendingLogKeys = new Set(
    actionable
      .filter((c) => c.entityType === 'habit_log')
      .map((c) => c.entityId),
  );

  const remoteHabits: HabitRecord[] = (habitsRes.data ?? []).map((r) => {
    const cat = String(r.category) as HabitCategory;
    const freq = String(r.frequency) as HabitFrequency;
    const color = String(r.accent_color) as HabitAccentColor;
    const frequency = VALID_FREQUENCIES.has(freq) ? freq : 'daily';
    const rawDays = Array.isArray(r.target_days)
      ? r.target_days.map(Number)
      : undefined;
    return {
      id: String(r.id),
      userId: String(r.user_id),
      title: String(r.title),
      category: VALID_CATEGORIES.has(cat) ? cat : 'Personal',
      frequency,
      targetDays: resolveTargetDays(frequency, rawDays),
      accentColor: VALID_ACCENTS.has(color) ? color : 'sage',
      sortOrder: Number(r.sort_order ?? 0),
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at ?? r.created_at),
    };
  });

  const remoteLogs: HabitLogRecord[] = (logsRes.data ?? []).map((r) => ({
    id: String(r.id),
    habitId: String(r.habit_id),
    userId: String(r.user_id),
    completedDate: String(r.completed_date).slice(0, 10),
    createdAt: String(r.created_at),
  }));

  const [localHabits, localLogs] = await Promise.all([
    db.habits.toArray(),
    db.habit_logs.toArray(),
  ]);
  const localById = new Map(localHabits.map((h) => [h.id, h]));
  const remoteById = new Map(remoteHabits.map((h) => [h.id, h]));

  const toPutLocalHabits: HabitRecord[] = [];
  const toDeleteHabitIds: string[] = [];

  for (const remote of remoteHabits) {
    if (pendingHabitIds.has(remote.id)) continue;
    const local = localById.get(remote.id);
    const differsAtSameTime =
      local &&
      remote.updatedAt === local.updatedAt &&
      (remote.title !== local.title ||
        remote.category !== local.category ||
        remote.frequency !== local.frequency ||
        remote.accentColor !== local.accentColor ||
        remote.sortOrder !== local.sortOrder ||
        remote.isArchived !== local.isArchived ||
        remote.targetDays.join(',') !== local.targetDays.join(','));
    if (!local || remote.updatedAt > local.updatedAt || differsAtSameTime) {
      toPutLocalHabits.push(remote);
    }
  }

  for (const local of localHabits) {
    if (!remoteById.has(local.id) && !pendingHabitIds.has(local.id)) {
      toDeleteHabitIds.push(local.id);
    }
  }

  const deletedHabitSet = new Set(toDeleteHabitIds);
  const remoteLogKeys = new Set(
    remoteLogs.map((l) => habitLogEntityId(l.habitId, l.completedDate)),
  );
  const localLogKeys = new Set(
    localLogs.map((l) => habitLogEntityId(l.habitId, l.completedDate)),
  );

  const missingLocalLogs = remoteLogs.filter((l) => {
    const key = habitLogEntityId(l.habitId, l.completedDate);
    return (
      !deletedHabitSet.has(l.habitId) &&
      !localLogKeys.has(key) &&
      !pendingLogKeys.has(key)
    );
  });

  const toDeleteLogIds = localLogs
    .filter((l) => {
      if (deletedHabitSet.has(l.habitId)) return true;
      const key = habitLogEntityId(l.habitId, l.completedDate);
      return !remoteLogKeys.has(key) && !pendingLogKeys.has(key);
    })
    .map((l) => l.id);

  const changed =
    toPutLocalHabits.length > 0 ||
    toDeleteHabitIds.length > 0 ||
    missingLocalLogs.length > 0 ||
    toDeleteLogIds.length > 0;

  if (changed) {
    await db.transaction('rw', [db.habits, db.habit_logs], async () => {
      if (toPutLocalHabits.length > 0) {
        await db.habits.bulkPut(toPutLocalHabits);
      }
      if (toDeleteHabitIds.length > 0) {
        await db.habits.bulkDelete(toDeleteHabitIds);
      }
      if (missingLocalLogs.length > 0) {
        await db.habit_logs.bulkPut(missingLocalLogs);
      }
      if (toDeleteLogIds.length > 0) {
        await db.habit_logs.bulkDelete(toDeleteLogIds);
      }
    });
  }

  return changed;
}
