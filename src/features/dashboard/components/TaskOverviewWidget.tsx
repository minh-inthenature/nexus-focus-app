import { ArrowRight, Check, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardTaskBuckets } from '@/features/dashboard/utils/dashboardSelectors';
import type { TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface TaskOverviewWidgetProps {
  buckets: DashboardTaskBuckets;
  hasAnyTasks: boolean;
  onToggleComplete: (taskId: string) => Promise<void>;
  onCreateTask: () => void;
}

/**
 * Clean full-height column widget listing Overdue, Due today, Upcoming, and
 * Recently completed tasks with 1-click completion and inline `+ Add` empty state.
 */
export function TaskOverviewWidget({
  buckets,
  hasAnyTasks,
  onToggleComplete,
  onCreateTask,
}: TaskOverviewWidgetProps) {
  const groups: Array<{
    key: string;
    label: string;
    presetLink: string;
    tasks: readonly TaskRecord[];
    isOverdue?: boolean;
  }> = [
    {
      key: 'overdue',
      label: 'Overdue',
      presetLink: '/tasks?preset=overdue',
      tasks: buckets.overdue,
      isOverdue: true,
    },
    {
      key: 'today',
      label: 'Due today',
      presetLink: '/tasks?preset=today',
      tasks: buckets.dueToday,
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      presetLink: '/tasks?preset=upcoming',
      tasks: buckets.upcoming,
    },
    {
      key: 'completed',
      label: 'Recently completed',
      presetLink: '/tasks?preset=completed',
      tasks: buckets.recentlyCompleted,
    },
  ].filter((g) => g.tasks.length > 0);

  return (
    <section className="space-y-3" aria-label="Task Overview">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Task Overview
        </h2>
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1 rounded-lg text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span>View all tasks</span>
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="border-t border-border/70">
        {groups.length === 0 ? (
          <div className="flex items-center justify-between py-3 text-xs text-muted-foreground">
            <span>
              {hasAnyTasks ? 'No scheduled tasks due' : 'No tasks yet'}
            </span>
            <button
              type="button"
              onClick={onCreateTask}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>Add</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {groups.map((group) => (
              <div key={group.key} className="py-2.5 first:pt-3 last:pb-1">
                <div className="pb-1.5">
                  <Link
                    to={group.presetLink}
                    className={cn(
                      'text-[10px] font-semibold tracking-wider tabular-nums uppercase hover:underline',
                      group.isOverdue
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {group.label} · {group.tasks.length}
                  </Link>
                </div>

                <div className="space-y-0.5">
                  {group.tasks.map((task) => {
                    const isDone = task.status === 'done';
                    return (
                      <div
                        key={task.id}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 ease-out hover:bg-accent/55"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isDone}
                            aria-label={
                              isDone
                                ? `Reopen "${task.title}"`
                                : `Complete "${task.title}"`
                            }
                            onClick={() => void onToggleComplete(task.id)}
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 cursor-pointer',
                              isDone
                                ? 'border-focus-accent/60 bg-focus-surface text-focus-foreground'
                                : 'border-border bg-card hover:border-primary/70',
                            )}
                          >
                            {isDone ? (
                              <Check className="h-3 w-3" aria-hidden="true" />
                            ) : null}
                          </button>

                          <Link
                            to={`/tasks?taskId=${task.id}`}
                            className={cn(
                              'truncate text-sm font-medium hover:underline',
                              isDone
                                ? 'text-muted-foreground line-through'
                                : 'text-foreground',
                            )}
                          >
                            {task.title}
                          </Link>
                        </div>

                        {task.dueDate ? (
                          <Link
                            to={`/calendar?date=${task.dueDate}`}
                            className={cn(
                              'shrink-0 text-[11px] tabular-nums hover:underline',
                              group.isOverdue
                                ? 'font-medium text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {task.dueDate}
                          </Link>
                        ) : (
                          <span className="shrink-0 text-[11px] text-muted-foreground capitalize">
                            {task.priority}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
