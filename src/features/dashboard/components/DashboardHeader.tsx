import { useEffect, useRef, useState } from 'react';
import {
  CalendarPlus,
  CheckSquare,
  ChevronDown,
  FilePlus2,
  NotebookPen,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import type { DashboardMetrics } from '@/features/dashboard/utils/dashboardSelectors';
import { cn } from '@/utils/cn';

export interface DashboardHeaderProps {
  greeting: string;
  formattedDate: string;
  metrics: DashboardMetrics;
  customizeOpen: boolean;
  onToggleCustomize: () => void;
  onNewNote: () => void;
  onNewTask: () => void;
  onNewEvent: () => void;
  onOpenDailyNote: () => void;
}

/**
 * Calm local-time greeting, noise-free date subtitle (showing non-zero counts),
 * minimal ghost Customize control, and consolidated `+ New` dropdown + Daily note action.
 */
export function DashboardHeader({
  greeting,
  formattedDate,
  metrics,
  customizeOpen,
  onToggleCustomize,
  onNewNote,
  onNewTask,
  onNewEvent,
  onOpenDailyNote,
}: DashboardHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const isMac =
    typeof navigator !== 'undefined' &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const taskShortcut = isMac ? '⌘⇧N' : 'Ctrl+Shift+N';
  const eventShortcut = isMac ? '⌘⇧E' : 'Ctrl+Shift+E';

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const subtitleParts: string[] = [formattedDate];
  if (metrics.eventsTodayCount > 0) {
    subtitleParts.push(
      `${metrics.eventsTodayCount} event${metrics.eventsTodayCount === 1 ? '' : 's'} today`,
    );
  }
  if (metrics.tasksDueTodayCount > 0) {
    subtitleParts.push(
      `${metrics.tasksDueTodayCount} task${metrics.tasksDueTodayCount === 1 ? '' : 's'} due today`,
    );
  }
  if (metrics.overdueTasksCount > 0) {
    subtitleParts.push(`${metrics.overdueTasksCount} overdue`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={greeting}
        subtitle={subtitleParts.join(' · ')}
        actions={
          <Button
            type="button"
            variant="subtle"
            size="sm"
            aria-expanded={customizeOpen}
            onClick={onToggleCustomize}
            className={cn(
              'rounded-lg text-foreground transition-colors duration-150',
              customizeOpen && 'bg-accent text-accent-foreground',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Customize</span>
          </Button>
        }
      />

      {/* Consolidated Quick Actions: `+ New` dropdown + `Daily note` ghost */}
      <div
        role="toolbar"
        aria-label="Quick actions"
        className="flex flex-wrap items-center gap-2"
      >
        <div ref={menuContainerRef} className="relative">
          <Button
            type="button"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="rounded-lg transition-colors duration-150"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New</span>
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
          </Button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="Create new item"
              className="absolute top-full left-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-card p-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onNewNote();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <FilePlus2
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>New Note</span>
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onNewTask();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>New Task</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {taskShortcut}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onNewEvent();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors duration-150 hover:bg-accent cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <CalendarPlus
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>New Event</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {eventShortcut}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenDailyNote}
          className="rounded-lg transition-colors duration-150"
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Daily note</span>
        </Button>
      </div>
    </div>
  );
}
