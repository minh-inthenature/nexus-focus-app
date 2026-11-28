import { describe, expect, it } from 'vitest';
import { getSyncBadge } from '@/components/navigation/syncBadge';
import {
  habitLogEntityId,
  parseHabitLogEntityId,
} from '@/services/sync/habitKeys';
import { computeCoalescedOperation } from '@/services/sync/syncQueue';
import type { SyncStatusSnapshot } from '@/services/sync/syncTypes';

function makeStatus(
  overrides: Partial<SyncStatusSnapshot> = {},
): SyncStatusSnapshot {
  return {
    state: 'idle',
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    isOnline: true,
    ...overrides,
  };
}

describe('offline habits outbox and sync badge', () => {
  it('roundtrips and validates habit_log composite entity IDs', () => {
    const key = habitLogEntityId('habit-123-abc', '2026-11-28');
    expect(key).toBe('habit-123-abc|2026-11-28');
    expect(parseHabitLogEntityId(key)).toEqual({
      habitId: 'habit-123-abc',
      completedDate: '2026-11-28',
    });

    expect(parseHabitLogEntityId('habit|with|pipe|2026-11-28')).toEqual({
      habitId: 'habit|with|pipe',
      completedDate: '2026-11-28',
    });

    expect(parseHabitLogEntityId('invalid-no-separator')).toBeNull();
    expect(parseHabitLogEntityId('|2026-11-28')).toBeNull();
    expect(parseHabitLogEntityId('habit-1|not-a-date')).toBeNull();
  });

  it('coalesces consecutive habit mutations cleanly for offline queues', () => {
    expect(computeCoalescedOperation(null, 'create')).toEqual({
      action: 'insert',
      nextOperation: 'create',
    });
    expect(computeCoalescedOperation('create', 'delete')).toEqual({
      action: 'delete_existing',
    });
    expect(computeCoalescedOperation('delete', 'create')).toEqual({
      action: 'update',
      nextOperation: 'create',
    });
  });

  it('resolves Offline, Syncing..., Synced, and Local mode badges accurately', () => {
    expect(
      getSyncBadge(makeStatus({ state: 'offline', isOnline: false, pendingCount: 3 }), true),
    ).toEqual({
      tone: 'offline',
      label: 'Offline (3 pending)',
    });

    expect(
      getSyncBadge(makeStatus({ state: 'offline', isOnline: false, pendingCount: 0 }), true),
    ).toEqual({
      tone: 'offline',
      label: 'Offline',
    });

    expect(
      getSyncBadge(makeStatus({ state: 'syncing', pendingCount: 2 }), true),
    ).toEqual({
      tone: 'syncing',
      label: 'Syncing...',
    });

    expect(getSyncBadge(makeStatus({ state: 'idle' }), true)).toEqual({
      tone: 'synced',
      label: 'Synced',
    });

    expect(getSyncBadge(makeStatus({ state: 'local_only' }), false)).toEqual({
      tone: 'local',
      label: 'Local mode',
    });
  });
});
