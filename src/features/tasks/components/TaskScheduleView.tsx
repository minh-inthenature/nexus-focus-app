import { useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getTodayDateString,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type { NoteRecord, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface TaskScheduleViewProps {
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  onToggleComplete: (taskId: string) => Promise<void>;
  onEditTask: (taskId: string) => void;
}

/**
 * Chronological task view grouping tasks by Overdue, Today, Upcoming dates,
 * and Unscheduled. Leaves full Calendar grids/events to Phase 6.
 */
export function TaskScheduleView({
  tasks,
  notesById,
  onToggleComplete,
  onEditTask,
}: TaskScheduleViewProps) {
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);
  const today = getTodayDateString();

  const overdueTasks: TaskRecord[] = [];
  const todayTasks: TaskRecord[] = [];
  const upcomingByDate = new Map<string, TaskRecord[]>();
  const unscheduledTasks: TaskRecord[] = [];

  for (const task of tasks) {
    const anchorDate = task.dueDate ?? task.startDate;
    if (!anchorDate) {
      unscheduledTasks.push(task);
      continue;
    }

    if (isTaskOverdue(task, today)) {
      overdueTasks.push(task);
    } else if (
      task.dueDate === today ||
      task.startDate === today ||
      anchorDate === today
    ) {
      todayTasks.push(task);
    } else if (anchorDate > today) {
      const list = upcomingByDate.get(anchorDate) ?? [];
      list.push(task);
      upcomingByDate.set(anchorDate, list);
    } else {
      // Completed past task
      const list = upcomingByDate.get(anchorDate) ?? [];
      list.push(task);
      upcomingByDate.set(anchorDate, list);
    }
  }

  const upcomingDates = Array.from(upcomingByDate.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const renderGroup = (
    heading: string,
    items: readonly TaskRecord[],
    isOverdueHeading = false,
  ) => (
    <section key={heading} className="space-y-2">
      <div className="flex items-center gap-2">
        <Calendar
          className={cn(
            'h-3.5 w-3.5',
            isOverdueHeading ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
        <h2
          className={cn(
            'text-xs font-semibold tracking-wider uppercase',
            isOverdueHeading ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {heading}
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          ({items.length})
        </span>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((task) => {
          const isDone = task.status === 'done';
          const linkedCount = task.linkedNoteIds.filter((id) =>
            notesById.has(id),
          ).length;

          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/35"
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
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer',
                    isDone
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-foreground/50',
                  )}
                >
                  {isDone ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => onEditTask(task.id)}
                  className={cn(
                    'truncate text-left text-sm font-medium hover:underline cursor-pointer',
                    isDone
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground',
                  )}
                >
                  {task.title}
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                {linkedCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" aria-hidden="true" />
                    <span>{linkedCount}</span>
                  </span>
                ) : null}
                <span className="capitalize">{task.priority}</span>
                {task.startDate && task.dueDate && task.startDate !== task.dueDate ? (
                  <Link
                    to={`/calendar?date=${task.dueDate}`}
                    title={`View ${task.dueDate} in Calendar`}
                    className="font-mono hover:text-foreground hover:underline"
                  >
                    {task.startDate} → {task.dueDate}
                  </Link>
                ) : task.dueDate ? (
                  <Link
                    to={`/calendar?date=${task.dueDate}`}
                    title={`View ${task.dueDate} in Calendar`}
                    className="font-mono hover:text-foreground hover:underline"
                  >
                    Due {task.dueDate}
                  </Link>
                ) : task.startDate ? (
                  <Link
                    to={`/calendar?date=${task.startDate}`}
                    title={`View ${task.startDate} in Calendar`}
                    className="font-mono hover:text-foreground hover:underline"
                  >
                    Starts {task.startDate}
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {overdueTasks.length > 0
        ? renderGroup('Overdue', overdueTasks, true)
        : null}

      {todayTasks.length > 0
        ? renderGroup(`Today · ${today}`, todayTasks)
        : null}

      {upcomingDates.map((date) =>
        renderGroup(date, upcomingByDate.get(date) ?? []),
      )}

      {unscheduledTasks.length > 0 ? (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setUnscheduledOpen((p) => !p)}
            aria-expanded={unscheduledOpen}
            className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground cursor-pointer"
          >
            {unscheduledOpen ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>Unscheduled ({unscheduledTasks.length})</span>
          </button>

          {unscheduledOpen ? (
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {unscheduledTasks.map((task) => {
                const isDone = task.status === 'done';
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/35"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        onClick={() => void onToggleComplete(task.id)}
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer',
                          isDone
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:border-foreground/50',
                        )}
                      >
                        {isDone ? (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditTask(task.id)}
                        className={cn(
                          'truncate text-left text-sm font-medium hover:underline cursor-pointer',
                          isDone
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                        )}
                      >
                        {task.title}
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {task.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
