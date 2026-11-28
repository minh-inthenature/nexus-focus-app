import {
  AlertTriangle,
  Check,
  HardDrive,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { cn } from '@/utils/cn';
import {
  getSyncBadge,
  SYNC_BADGE_DOT_CLASS,
  type SyncBadgeTone,
} from './syncBadge';

export interface SyncStatusWidgetProps {
  collapsed: boolean;
}

const TONE_ICONS: Record<SyncBadgeTone, typeof Check> = {
  synced: Check,
  syncing: RefreshCw,
  offline: WifiOff,
  error: AlertTriangle,
  local: HardDrive,
};

/**
 * Compact footer indicator showing hybrid sync state, offline status,
 * subtle colored status dot, and manual sync / conflict trigger.
 */
export function SyncStatusWidget({ collapsed }: SyncStatusWidgetProps) {
  const status = useSyncStore((state) => state.status);
  const syncNow = useSyncStore((state) => state.syncNow);
  const retryFailed = useSyncStore((state) => state.retryFailed);
  const setConflictsDialogOpen = useSyncStore(
    (state) => state.setConflictsDialogOpen,
  );

  const authStatus = useAuthStore((state) => state.status);

  const isConnected = authStatus === 'authenticated';
  const badge = getSyncBadge(status, isConnected);
  const label = badge.label;
  const dotClass = SYNC_BADGE_DOT_CLASS[badge.tone];
  const Icon = TONE_ICONS[badge.tone];

  const handlePrimaryClick = () => {
    if (status.conflictCount > 0) {
      setConflictsDialogOpen(true);
      return;
    }
    if (status.failedCount > 0 && isConnected) {
      void retryFailed();
      return;
    }
    if (isConnected && status.state !== 'syncing') {
      void syncNow('manual');
    }
  };

  const tooltipText =
    status.lastError && (status.state === 'error' || status.failedCount > 0)
      ? `${label}: ${status.lastError}`
      : label;

  if (collapsed) {
    return (
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePrimaryClick}
            aria-label={`Sync status: ${tooltipText}`}
            className="flex h-8 w-full items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-150 hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:hover:bg-white/5 cursor-pointer"
          >
            <Icon
              className={cn(
                'h-4 w-4',
                status.state === 'syncing' && 'animate-spin',
                status.conflictCount > 0 && 'text-amber-500',
                status.failedCount > 0 && 'text-destructive',
              )}
              aria-hidden="true"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      role="status"
      aria-label="Synchronization status"
      title={tooltipText}
      className="flex h-7 items-center justify-between rounded-lg px-2 text-xs text-sidebar-foreground/70"
    >
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={!isConnected && status.conflictCount === 0}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 text-left transition-colors duration-150',
          (isConnected || status.conflictCount > 0) &&
            'hover:text-foreground cursor-pointer',
        )}
      >
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)}
          aria-hidden="true"
        />
        <span className="truncate tabular-nums">{label}</span>
      </button>

      {isConnected && status.state !== 'syncing' ? (
        <button
          type="button"
          onClick={() => void syncNow('manual')}
          title="Sync now"
          aria-label="Sync now"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
