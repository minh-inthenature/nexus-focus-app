import { ChevronDown, ChevronRight, FolderKanban, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface TaskGroupHeaderProps {
  groupName: string | null;
  completedCount: number;
  totalCount: number;
  collapsed: boolean;
  compact?: boolean;
  onToggleCollapse: () => void;
  onAddTaskToGroup?: (groupName: string) => void;
}

/**
 * Collapsible header for a Task Group showing its title, done/total progress
 * bar, and a quick `+ Add task to group` action.
 */
export function TaskGroupHeader({
  groupName,
  completedCount,
  totalCount,
  collapsed,
  compact = false,
  onToggleCollapse,
  onAddTaskToGroup,
}: TaskGroupHeaderProps) {
  const pct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const displayLabel = groupName ?? 'Ungrouped';

  return (
    <div className="relative bg-muted/25">
      <div
        className={cn(
          'flex items-center justify-between',
          compact ? 'gap-1.5 px-2.5 py-1.5' : 'gap-2 px-3.5 py-2',
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className={cn(
            'flex min-w-0 flex-1 items-center text-left cursor-pointer group',
            compact ? 'gap-1.5' : 'gap-2',
          )}
        >
          {collapsed ? (
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
              aria-hidden="true"
            />
          )}

          {groupName ? (
            <FolderKanban
              className="h-3.5 w-3.5 shrink-0 text-primary/85"
              aria-hidden="true"
            />
          ) : null}

          <span
            className={cn(
              'min-w-0 flex-1 truncate font-medium sm:flex-initial',
              compact ? 'text-xs' : 'text-[13px]',
              groupName ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {displayLabel}
          </span>

          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {compact
              ? `${completedCount}/${totalCount}`
              : `${completedCount}/${totalCount} done`}
          </span>

          {!compact ? (
            <span
              aria-hidden="true"
              className="hidden h-1 w-14 shrink-0 overflow-hidden rounded-full bg-muted sm:inline-block"
            >
              <span
                className="block h-full rounded-full bg-primary/80 transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </span>
          ) : null}
        </button>

        {groupName && onAddTaskToGroup ? (
          <button
            type="button"
            onClick={() => onAddTaskToGroup(groupName)}
            title={`Add task to ${groupName}`}
            aria-label={`Add task to ${groupName}`}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {!compact ? <span>Add task</span> : null}
          </button>
        ) : null}
      </div>

      {compact ? (
        <div
          aria-hidden="true"
          className="h-0.5 w-full bg-muted/60"
        >
          <div
            className="h-full bg-primary/80 transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
