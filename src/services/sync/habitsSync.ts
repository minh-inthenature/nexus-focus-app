import {
  deleteHabitFromSupabase,
  parseHabitLogEntityId,
  pushHabitLogToggleToSupabase,
  pushHabitToSupabase,
  syncHabitsWithSupabase,
} from '@/services/storage/habits.repository';
import { db } from '@/services/storage/db';
import {
  enqueueSyncChangeInTx,
  listActionableChanges,
  markChangeFailed,
  markChangeSynced,
  markChangeSyncing,
} from './syncQueue';
import type { SyncChange } from './syncTypes';

const HABITS_OUTBOX_BACKFILL_META_KEY = 'habits_outbox_backfill_v1';

async function backfillHabitOutboxOnce(): Promise<void> {
  const existingMeta = await db.sync_meta.get(HABITS_OUTBOX_BACKFILL_META_KEY);
  if (existingMeta) return;

  await db.transaction(
    'rw',
    [db.habits, db.habit_logs, db.sync_changes, db.sync_meta],
    async () => {
      const checkAgain = await db.sync_meta.get(HABITS_OUTBOX_BACKFILL_META_KEY);
      if (checkAgain) return;

      const [habits, logs] = await Promise.all([
        db.habits.toArray(),
        db.habit_logs.toArray(),
      ]);

      for (const habit of habits) {
        await enqueueSyncChangeInTx('habit', habit.id, 'create', 0);
      }
      for (const log of logs) {
        await enqueueSyncChangeInTx(
          'habit_log',
          `${log.habitId}|${log.completedDate}`,
          'create',
          0,
        );
      }

      await db.sync_meta.put({
        key: HABITS_OUTBOX_BACKFILL_META_KEY,
        value: 'done',
        updatedAt: new Date().toISOString(),
      });
    },
  );
}

function habitChangePriority(change: SyncChange): number {
  if (change.entityType === 'habit' && change.operation !== 'delete') return 0;
  if (change.entityType === 'habit_log') return 1;
  return 2;
}

/**
 * Flushes queued habit and habit-log mutations to Supabase sequentially, then
 * pulls and merges remote updates while preserving any still-pending local edits.
 */
export async function runHabitsSyncPhase(userId: string): Promise<{
  appliedRemoteChanges: boolean;
  syncedCount: number;
  errorCount: number;
}> {
  await backfillHabitOutboxOnce();

  const actionable = await listActionableChanges();
  const habitChanges = actionable
    .filter((c) => c.entityType === 'habit' || c.entityType === 'habit_log')
    .sort((a, b) => {
      const prioDiff = habitChangePriority(a) - habitChangePriority(b);
      if (prioDiff !== 0) return prioDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });

  let syncedCount = 0;
  let errorCount = 0;

  for (const change of habitChanges) {
    await markChangeSyncing(change.id);
    try {
      if (change.entityType === 'habit') {
        if (change.operation === 'delete') {
          await deleteHabitFromSupabase(change.entityId, userId);
        } else {
          const local = await db.habits.get(change.entityId);
          if (local) {
            await pushHabitToSupabase(local, userId);
          } else {
            await deleteHabitFromSupabase(change.entityId, userId);
          }
        }
      } else {
        const parsed = parseHabitLogEntityId(change.entityId);
        if (!parsed) {
          await markChangeSynced(change.id);
          continue;
        }
        if (change.operation === 'delete') {
          await pushHabitLogToggleToSupabase(
            undefined,
            parsed.habitId,
            parsed.completedDate,
            false,
            null,
            userId,
          );
        } else {
          const [habit, localLog] = await Promise.all([
            db.habits.get(parsed.habitId),
            db.habit_logs
              .where('[habitId+completedDate]')
              .equals([parsed.habitId, parsed.completedDate])
              .first(),
          ]);
          if (localLog) {
            await pushHabitLogToggleToSupabase(
              habit,
              parsed.habitId,
              parsed.completedDate,
              true,
              localLog,
              userId,
            );
          } else {
            await pushHabitLogToggleToSupabase(
              undefined,
              parsed.habitId,
              parsed.completedDate,
              false,
              null,
              userId,
            );
          }
        }
      }

      await markChangeSynced(change.id);
      syncedCount += 1;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Habit sync change failed.';
      await markChangeFailed(change.id, msg);
      errorCount += 1;
    }
  }

  let appliedRemoteChanges = false;
  try {
    appliedRemoteChanges = await syncHabitsWithSupabase(userId);
  } catch {
    errorCount += 1;
  }

  return {
    appliedRemoteChanges,
    syncedCount,
    errorCount,
  };
}
