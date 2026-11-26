import {
  AlertTriangle,
  Check,
  Cloud,
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

export interface SyncStatusWidgetProps {
  collapsed: boolean;
}

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
  const totalPending = status.pendingCount + status.failedCount;

  let label = 'Local mode';
  let Icon = HardDrive;
  let dotClass = 'bg-muted-foreground/50';

  if (!status.isOnline || status.state === 'offline') {
    Icon = WifiOff;
    label = totalPending > 0 ? `Offline · ${totalPending} pending` : 'Offline';
    dotClass = 'bg-destructive';
  } else if (status.state === 'syncing') {
    Icon = RefreshCw;
    label = 'Syncing…';
    dotClass = 'bg-foreground';
  } else if (status.conflictCount > 0) {
    Icon = AlertTriangle;
    label = `${status.conflictCount} conflict(s)`;
    dotClass = 'bg-amber-500';
  } else if (status.failedCount > 0 || status.state === 'error') {
    Icon = AlertTriangle;
    label = `${status.failedCount} failed`;
    dotClass = 'bg-destructive';
  } else if (!isConnected) {
    Icon = HardDrive;
    label = totalPending > 0 ? `${totalPending} queued` : 'Local mode';
    dotClass = totalPending > 0 ? 'bg-amber-500/80' : 'bg-muted-foreground/50';
  } else if (totalPending > 0) {
    Icon = Cloud;
    label = `${totalPending} pending`;
    dotClass = 'bg-amber-500';
  } else {
    Icon = Check;
    label = 'Synced';
    dotClass = 'bg-focus-accent';
  }

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

  if (collapsed) {
    return (
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handlePrimaryClick}
            aria-label={`Sync status: ${label}`}
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
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      role="status"
      aria-label="Synchronization status"
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
        {status.state === 'syncing' ? (
          <RefreshCw
            className="h-3 w-3 shrink-0 animate-spin text-foreground"
            aria-hidden="true"
          />
        ) : (
          <span
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)}
            aria-hidden="true"
          />
        )}
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
