import { createUuid, db } from '@/services/storage/db';
import type {
  SyncChange,
  SyncEntityType,
  SyncOperation,
} from './syncTypes';

export type EnqueueResult = 'queued' | 'cancelled_unsynced';

type QueueMutationListener = () => void;
const queueListeners = new Set<QueueMutationListener>();

export function subscribeSyncQueueMutation(
  listener: QueueMutationListener,
): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

/**
 * Notifies subscribers (e.g. `syncEngine`) after a Dexie transaction commits.
 * Should be invoked outside/after Dexie transactions resolve.
 */
export function notifySyncQueueMutated(): void {
  for (const listener of queueListeners) {
    listener();
  }
}

export interface CoalescePlan {
  readonly action: 'insert' | 'update' | 'delete_existing';
  readonly nextOperation?: SyncOperation;
}

/**
 * Pure outbox coalescing rules preventing duplicate operations while
 * preserving causal correctness (e.g. create+update=create, create+delete=cancel).
 */
export function computeCoalescedOperation(
  existingOperation: SyncOperation | null,
  incomingOperation: SyncOperation,
): CoalescePlan {
  if (!existingOperation) {
    return { action: 'insert', nextOperation: incomingOperation };
  }

  if (existingOperation === 'create') {
    if (incomingOperation === 'delete') {
      return { action: 'delete_existing' };
    }
    return { action: 'update', nextOperation: 'create' };
  }

  if (existingOperation === 'update') {
    if (incomingOperation === 'delete') {
      return { action: 'update', nextOperation: 'delete' };
    }
    return { action: 'update', nextOperation: 'update' };
  }

  // existingOperation === 'delete'
  if (incomingOperation === 'create' || incomingOperation === 'update') {
    return { action: 'update', nextOperation: incomingOperation };
  }
  return { action: 'update', nextOperation: 'delete' };
}

/**
 * Enqueues or coalesces a `SyncChange` record inside an active Dexie `rw`
 * transaction that includes `db.sync_changes`.
 */
export async function enqueueSyncChangeInTx(
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  localRevision: number,
): Promise<EnqueueResult> {
  const candidates = await db.sync_changes
    .where('[entityType+entityId]')
    .equals([entityType, entityId])
    .filter((c) => c.status === 'pending' || c.status === 'failed')
    .toArray();

  const existing = candidates[0];
  const plan = computeCoalescedOperation(
    existing ? existing.operation : null,
    operation,
  );
  const now = new Date().toISOString();

  if (plan.action === 'delete_existing' && existing) {
    await db.sync_changes.delete(existing.id);
    return 'cancelled_unsynced';
  }

  if (plan.action === 'update' && existing && plan.nextOperation) {
    const updated: SyncChange = {
      id: existing.id,
      entityType,
      entityId,
      operation: plan.nextOperation,
      localRevision,
      createdAt: existing.createdAt,
      status: 'pending',
      retryCount: 0,
    };
    await db.sync_changes.put(updated);
    return 'queued';
  }

  const created: SyncChange = {
    id: createUuid(),
    entityType,
    entityId,
    operation: plan.nextOperation ?? operation,
    localRevision,
    createdAt: now,
    status: 'pending',
    retryCount: 0,
  };
  await db.sync_changes.add(created);
  return 'queued';
}

/**
 * Recovers changes left in `'syncing'` state if the browser closed mid-sync.
 */
export async function recoverStuckSyncingChanges(): Promise<number> {
  const stuck = await db.sync_changes
    .where('status')
    .equals('syncing')
    .toArray();

  for (const change of stuck) {
    await db.sync_changes.update(change.id, { status: 'pending' });
  }
  return stuck.length;
}

/**
 * Returns all pending or retryable failed changes ordered FIFO by `createdAt`.
 */
export async function listActionableChanges(): Promise<SyncChange[]> {
  const rows = await db.sync_changes
    .filter((c) => c.status === 'pending' || c.status === 'failed')
    .toArray();

  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markChangeSyncing(changeId: string): Promise<void> {
  await db.sync_changes.update(changeId, { status: 'syncing' });
}

export async function markChangeSynced(changeId: string): Promise<void> {
  await db.sync_changes.update(changeId, {
    status: 'synced',
  });
}

export async function markChangeFailed(
  changeId: string,
  errorMessage: string,
): Promise<void> {
  const existing = await db.sync_changes.get(changeId);
  if (!existing) return;

  await db.sync_changes.put({
    ...existing,
    status: 'failed',
    retryCount: existing.retryCount + 1,
    lastError: errorMessage,
  });
}

export async function resetFailedChangesToPending(): Promise<number> {
  const failed = await db.sync_changes
    .where('status')
    .equals('failed')
    .toArray();
  for (const item of failed) {
    await db.sync_changes.update(item.id, { status: 'pending' });
  }
  notifySyncQueueMutated();
  return failed.length;
}

export async function clearPendingChangesForEntity(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const matches = await db.sync_changes
    .where('[entityType+entityId]')
    .equals([entityType, entityId])
    .filter((c) => c.status !== 'synced')
    .toArray();

  for (const row of matches) {
    await db.sync_changes.delete(row.id);
  }
}

export async function purgeSyncedChanges(): Promise<void> {
  await db.sync_changes.where('status').equals('synced').delete();
}

export async function getOutboxCounts(): Promise<{
  pendingCount: number;
  failedCount: number;
}> {
  const [pendingCount, failedCount] = await Promise.all([
    db.sync_changes
      .filter((c) => c.status === 'pending' || c.status === 'syncing')
      .count(),
    db.sync_changes.where('status').equals('failed').count(),
  ]);
  return { pendingCount, failedCount };
}
