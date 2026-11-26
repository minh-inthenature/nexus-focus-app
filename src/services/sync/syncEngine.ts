import { executeSyncCycle } from './syncExecutor';
import {
  recoverStuckSyncingChanges,
  resetFailedChangesToPending,
  subscribeSyncQueueMutation,
} from './syncQueue';
import { SyncStatusPublisher } from './syncStatus';
import type { SyncService, SyncSummary } from './sync.service';
import type { SyncStatusSnapshot, SyncTrigger } from './syncTypes';

export interface SyncRuntimeContext {
  readonly userId: string | null;
  readonly isDriveConnected: boolean;
  readonly notesFolderId: string | null;
}

const EDIT_DEBOUNCE_MS = 1800;
const FOCUS_MIN_INTERVAL_MS = 15_000;
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Coordinates automatic and manual hybrid synchronization across IndexedDB,
 * Google Drive, and Supabase with single-flight locking, debounce, crash
 * recovery, and exponential backoff retries.
 */
export class NexusSyncEngine implements SyncService {
  private publisher = new SyncStatusPublisher();
  private contextResolver: () => SyncRuntimeContext = () => ({
    userId: null,
    isDriveConnected: false,
    notesFolderId: null,
  });
  private remoteChangesHandler: (() => Promise<void>) | null = null;

  private started = false;
  private inFlightSync: Promise<SyncStatusSnapshot> | null = null;
  private queuedTrailingSync = false;
  private debounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private consecutiveFailures = 0;
  private lastSyncStartedAtMs = 0;

  private unsubscribeQueue: (() => void) | null = null;
  private onOnlineBound = () => {
    void this.refreshStatusOnly();
    void this.triggerSync('reconnect');
  };
  private onOfflineBound = () => {
    void this.refreshStatusOnly();
  };
  private onVisibilityChangeBound = () => {
    if (document.visibilityState === 'visible') {
      const elapsed = Date.now() - this.lastSyncStartedAtMs;
      if (
        elapsed >= FOCUS_MIN_INTERVAL_MS ||
        this.publisher.getSnapshot().pendingCount > 0
      ) {
        void this.triggerSync('tab_focus');
      }
    }
  };

  public configure(options: {
    getContext: () => SyncRuntimeContext;
    onRemoteChangesApplied: () => Promise<void>;
  }): void {
    this.contextResolver = options.getContext;
    this.remoteChangesHandler = options.onRemoteChangesApplied;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await recoverStuckSyncingChanges();
    await this.publisher.loadPersistedTimestamp();
    await this.refreshStatusOnly();

    this.unsubscribeQueue = subscribeSyncQueueMutation(() => {
      void this.refreshStatusOnly();
      this.scheduleDebouncedSync('local_edit');
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnlineBound);
      window.addEventListener('offline', this.onOfflineBound);
      window.addEventListener('focus', this.onVisibilityChangeBound);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.unsubscribeQueue) {
      this.unsubscribeQueue();
      this.unsubscribeQueue = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnlineBound);
      window.removeEventListener('offline', this.onOfflineBound);
      window.removeEventListener('focus', this.onVisibilityChangeBound);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.onVisibilityChangeBound,
      );
    }
  }

  public async refreshStatusOnly(): Promise<SyncStatusSnapshot> {
    const ctx = this.contextResolver();
    return this.publisher.refreshCounts({
      isConnected: Boolean(ctx.userId),
    });
  }

  public scheduleDebouncedSync(trigger: SyncTrigger = 'local_edit'): void {
    const ctx = this.contextResolver();
    if (!ctx.userId) {
      void this.refreshStatusOnly();
      return;
    }

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.triggerSync(trigger);
    }, EDIT_DEBOUNCE_MS);
  }

  public async triggerSync(
    trigger: SyncTrigger = 'manual',
  ): Promise<SyncStatusSnapshot> {
    if (this.inFlightSync) {
      if (trigger === 'local_edit' || trigger === 'manual') {
        this.queuedTrailingSync = true;
      }
      return this.inFlightSync;
    }

    const ctx = this.contextResolver();
    const isOnline =
      typeof navigator === 'undefined' ? true : navigator.onLine;

    if (!isOnline) {
      return this.publisher.refreshCounts({
        isConnected: Boolean(ctx.userId),
        stateOverride: 'offline',
      });
    }

    if (!ctx.userId) {
      return this.publisher.refreshCounts({
        isConnected: false,
        stateOverride: 'local_only',
      });
    }

    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const runLockedSync = async (): Promise<SyncStatusSnapshot> => {
      this.lastSyncStartedAtMs = Date.now();
      await this.publisher.refreshCounts({
        isConnected: true,
        stateOverride: 'syncing',
        activeTrigger: trigger,
      });

      try {
        const result = await executeSyncCycle(
          ctx.userId!,
          ctx.isDriveConnected ? ctx.notesFolderId : null,
        );

        if (result.appliedRemoteChanges && this.remoteChangesHandler) {
          await this.remoteChangesHandler();
        }

        if (result.fatalError) {
          this.consecutiveFailures += 1;
          this.scheduleRetryIfNeeded();
          return await this.publisher.refreshCounts({
            isConnected: true,
            lastError: result.fatalError,
          });
        }

        if (result.errorCount > 0) {
          this.consecutiveFailures += 1;
          this.scheduleRetryIfNeeded();
          return await this.publisher.refreshCounts({
            isConnected: true,
            lastError: `${result.errorCount} item(s) failed to sync.`,
          });
        }

        this.consecutiveFailures = 0;
        await this.publisher.savePersistedTimestamp(new Date().toISOString());
        return await this.publisher.refreshCounts({ isConnected: true });
      } catch (err) {
        this.consecutiveFailures += 1;
        this.scheduleRetryIfNeeded();
        return await this.publisher.refreshCounts({
          isConnected: true,
          lastError:
            err instanceof Error ? err.message : 'Synchronization failed.',
        });
      }
    };

    const runWithWebLock = async (): Promise<SyncStatusSnapshot> => {
      if (
        typeof navigator !== 'undefined' &&
        'locks' in navigator &&
        typeof navigator.locks?.request === 'function'
      ) {
        return navigator.locks.request('nexus-sync-lock', runLockedSync);
      }
      return runLockedSync();
    };

    this.inFlightSync = runWithWebLock().finally(() => {
      this.inFlightSync = null;
      if (this.queuedTrailingSync) {
        this.queuedTrailingSync = false;
        void this.triggerSync('local_edit');
      }
    });

    return this.inFlightSync;
  }

  public async retryFailed(): Promise<SyncStatusSnapshot> {
    this.consecutiveFailures = 0;
    await resetFailedChangesToPending();
    return this.triggerSync('retry');
  }

  private scheduleRetryIfNeeded(): void {
    if (this.consecutiveFailures > MAX_RETRY_ATTEMPTS) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const delayMs = Math.min(
      60_000,
      2000 * 2 ** Math.max(0, this.consecutiveFailures - 1),
    );
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
    }
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.triggerSync('retry');
    }, delayMs);
  }

  // SyncService interface compatibility
  public getSnapshot(): SyncStatusSnapshot {
    return this.publisher.getSnapshot();
  }

  public subscribeSnapshot(
    listener: (snapshot: SyncStatusSnapshot) => void,
  ): () => void {
    return this.publisher.subscribe(listener);
  }

  public getStatus(): SyncSummary {
    const snap = this.publisher.getSnapshot();
    return {
      state:
        snap.state === 'syncing'
          ? 'syncing'
          : snap.state === 'offline'
            ? 'offline'
            : snap.state === 'error'
              ? 'error'
              : 'idle',
      pendingCount: snap.pendingCount + snap.failedCount,
      ...(snap.lastSyncedAt ? { lastSyncedAt: snap.lastSyncedAt } : {}),
      conflicts: [],
    };
  }

  public async syncNow(): Promise<SyncSummary> {
    await this.triggerSync('manual');
    return this.getStatus();
  }

  public subscribe(listener: (summary: SyncSummary) => void): () => void {
    return this.publisher.subscribe(() => {
      listener(this.getStatus());
    });
  }
}

export const syncEngine = new NexusSyncEngine();
