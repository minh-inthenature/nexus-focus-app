import { db } from '@/services/storage/db';
import { listSyncConflicts } from './conflictResolver';
import { getOutboxCounts } from './syncQueue';
import type {
  SyncEngineState,
  SyncStatusSnapshot,
  SyncTrigger,
} from './syncTypes';

const LAST_SYNCED_META_KEY = 'last_synced_at';

export type SyncStatusListener = (snapshot: SyncStatusSnapshot) => void;

export class SyncStatusPublisher {
  private snapshot: SyncStatusSnapshot = {
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  private listeners = new Set<SyncStatusListener>();

  public getSnapshot(): SyncStatusSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async loadPersistedTimestamp(): Promise<void> {
    const row = await db.sync_meta.get(LAST_SYNCED_META_KEY);
    if (row?.value) {
      this.update({ lastSyncedAt: row.value });
    }
  }

  public async savePersistedTimestamp(isoTime: string): Promise<void> {
    await db.sync_meta.put({
      key: LAST_SYNCED_META_KEY,
      value: isoTime,
      updatedAt: isoTime,
    });
    this.update({ lastSyncedAt: isoTime });
  }

  public async refreshCounts(options?: {
    isConnected?: boolean;
    activeTrigger?: SyncTrigger;
    stateOverride?: SyncEngineState;
    lastError?: string;
  }): Promise<SyncStatusSnapshot> {
    const [counts, conflicts] = await Promise.all([
      getOutboxCounts(),
      listSyncConflicts(),
    ]);

    const isOnline =
      typeof navigator !== 'undefined' ? navigator.onLine : true;

    let nextState: SyncEngineState;
    if (options?.stateOverride) {
      nextState = options.stateOverride;
    } else if (!isOnline) {
      nextState = 'offline';
    } else if (conflicts.length > 0) {
      nextState = 'conflict';
    } else if (options?.lastError || counts.failedCount > 0) {
      nextState = 'error';
    } else if (options?.isConnected === false) {
      nextState = 'local_only';
    } else {
      nextState = 'idle';
    }

    const nextSnapshot: SyncStatusSnapshot = {
      ...this.snapshot,
      state: nextState,
      pendingCount: counts.pendingCount,
      failedCount: counts.failedCount,
      conflictCount: conflicts.length,
      isOnline,
      ...(options?.activeTrigger !== undefined
        ? { activeTrigger: options.activeTrigger }
        : {}),
      ...(options?.lastError !== undefined
        ? { lastError: options.lastError }
        : counts.failedCount === 0
          ? { lastError: undefined }
          : {}),
    };

    this.snapshot = nextSnapshot;
    this.emit();
    return nextSnapshot;
  }

  public update(partial: Partial<SyncStatusSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
