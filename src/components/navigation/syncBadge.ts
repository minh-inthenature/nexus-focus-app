import type { SyncStatusSnapshot } from '@/services/sync/syncTypes';

export type SyncBadgeTone =
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'local';

export const SYNC_BADGE_DOT_CLASS: Record<SyncBadgeTone, string> = {
  synced: 'bg-[#8AB8A3]',
  syncing: 'bg-amber-400/80 animate-pulse',
  offline: 'bg-slate-400/80',
  error: 'bg-destructive',
  local: 'bg-muted-foreground/50',
};

export interface SyncBadgeInfo {
  readonly tone: SyncBadgeTone;
  readonly label: string;
}

/**
 * Resolves the concise 3-state (+ error/local fallback) sync indicator label
 * and dot tone shared across Desktop sidebar and Mobile header.
 */
export function getSyncBadge(
  status: SyncStatusSnapshot,
  isConnected: boolean,
): SyncBadgeInfo {
  const totalPending = status.pendingCount + status.failedCount;

  if (!status.isOnline || status.state === 'offline') {
    return {
      tone: 'offline',
      label: totalPending > 0 ? `Offline (${totalPending} pending)` : 'Offline',
    };
  }

  if (status.conflictCount > 0) {
    return {
      tone: 'error',
      label: `${status.conflictCount} conflict(s)`,
    };
  }

  if (status.failedCount > 0 || status.state === 'error') {
    return {
      tone: 'error',
      label:
        status.failedCount > 0 ? `${status.failedCount} failed` : 'Sync error',
    };
  }

  if (!isConnected) {
    return {
      tone: 'local',
      label: totalPending > 0 ? `${totalPending} queued` : 'Local mode',
    };
  }

  if (status.state === 'syncing' || status.pendingCount > 0) {
    return {
      tone: 'syncing',
      label: 'Syncing...',
    };
  }

  return {
    tone: 'synced',
    label: 'Synced',
  };
}
