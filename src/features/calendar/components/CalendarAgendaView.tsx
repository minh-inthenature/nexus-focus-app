import {
  Calendar,
  Check,
  CheckSquare,
  ExternalLink,
  MapPin,
  Plus,
  Repeat,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import {
  CATEGORY_LABELS,
  formatDayHeaderLabel,
  formatEventTimeRangeLabel,
  getEventAccentClasses,
  getEventDateRange,
  getTodayDateKey,
} from '@/features/calendar/utils/calendarDateUtils';
import { isTaskOverdue } from '@/features/tasks/utils/taskFilters';
import type { CalendarEventRecord, NoteRecord, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface CalendarAgendaViewProps {
  selectedDate: string;
  startDateFilter: string;
  endDateFilter: string;
  events: readonly CalendarEventRecord[];
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  tasksById: ReadonlyMap<string, TaskRecord>;
  showTasks: boolean;
  showCompletedTasks: boolean;
  onEditEvent: (eventId: string) => void;
  onCreateEventOnDate: (dateKey: string) => void;
  onToggleTaskCompleted: (taskId: string) => Promise<void>;
}

interface AgendaDayBucket {
  dateKey: string;
  events: CalendarEventRecord[];
  tasks: TaskRecord[];
}

/**
 * Chronological Agenda view grouping upcoming events and visible tasks by date.
 */
export function CalendarAgendaView({
  selectedDate,
  startDateFilter,
  endDateFilter,
  events,
  tasks,
  notesById,
  tasksById,
  showTasks,
  showCompletedTasks,
  onEditEvent,
  onCreateEventOnDate,
  onToggleTaskCompleted,
}: CalendarAgendaViewProps) {
  const todayKey = getTodayDateKey();
  const minDate = startDateFilter || selectedDate;

  const bucketMap = new Map<string, AgendaDayBucket>();

  const getOrCreateBucket = (dateKey: string): AgendaDayBucket => {
    let bucket = bucketMap.get(dateKey);
    if (!bucket) {
      bucket = { dateKey, events: [], tasks: [] };
      bucketMap.set(dateKey, bucket);
    }
    return bucket;
  };

  for (const ev of events) {
    const { startDateKey, endDateKey } = getEventDateRange(ev);
    if (endDateKey < minDate) continue;
    if (endDateFilter && startDateKey > endDateFilter) continue;
    const anchorDate = startDateKey < minDate ? minDate : startDateKey;
    getOrCreateBucket(anchorDate).events.push(ev);
  }

  if (showTasks) {
    for (const task of tasks) {
      if (!showCompletedTasks && task.status === 'done') continue;
      const anchorDate = task.dueDate ?? task.startDate;
      if (!anchorDate) continue;
      if (anchorDate < minDate) continue;
      if (endDateFilter && anchorDate > endDateFilter) continue;
      getOrCreateBucket(anchorDate).tasks.push(task);
    }
  }

  const buckets = Array.from(bucketMap.values()).sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );

  for (const bucket of buckets) {
    bucket.events.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
  }

  if (buckets.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No upcoming agenda items"
        description={`No matching events or due tasks starting from ${minDate}.`}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCreateEventOnDate(selectedDate)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Create event on {selectedDate}</span>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => {
        const isToday = bucket.dateKey === todayKey;
        return (
          <section
            key={bucket.dateKey}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <header className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-foreground">
                  {formatDayHeaderLabel(bucket.dateKey)}
                </h3>
                {isToday ? (
                  <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Today
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onCreateEventOnDate(bucket.dateKey)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>Add event</span>
              </button>
            </header>

            <div className="divide-y divide-border">
              {bucket.events.map((ev) => {
                const accent = getEventAccentClasses(ev.category, ev.color);
                return (
                  <div
                    key={`${ev.id}-${ev.startAt}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/25"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[100px] font-mono text-xs text-muted-foreground">
                          {formatEventTimeRangeLabel(ev)}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                            accent.badgeClass,
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              accent.swatchClass,
                            )}
                            aria-hidden="true"
                          />
                          {CATEGORY_LABELS[ev.category]}
                        </span>
                        <button
                          type="button"
                          onClick={() => onEditEvent(ev.id)}
                          className="inline-flex items-center gap-1.5 text-left text-sm font-medium text-foreground hover:underline cursor-pointer"
                        >
                          <span>{ev.title}</span>
                          {ev.rrule ? (
                            <Repeat
                              className="h-3 w-3 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : null}
                        </button>
                      </div>

                      {ev.location || ev.description ? (
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {ev.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              <span>{ev.location}</span>
                            </span>
                          ) : null}
                          {ev.description ? <span>{ev.description}</span> : null}
                        </div>
                      ) : null}

                      {ev.linkedNoteIds.length > 0 || ev.linkedTaskIds.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {ev.linkedNoteIds.map((nid) => {
                            const note = notesById.get(nid);
                            return note ? (
                              <Link
                                key={nid}
                                to={`/notes/${note.id}`}
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <span>{note.title}</span>
                                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                              </Link>
                            ) : null;
                          })}
                          {ev.linkedTaskIds.map((tid) => {
                            const linkedTask = tasksById.get(tid);
                            return linkedTask ? (
                              <Link
                                key={tid}
                                to={`/tasks?taskId=${linkedTask.id}`}
                                className="inline-flex items-center gap-1 rounded border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <CheckSquare className="h-2.5 w-2.5" aria-hidden="true" />
                                <span>{linkedTask.title}</span>
                              </Link>
                            ) : null;
                          })}
                        </div>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onEditEvent(ev.id)}
                      className="h-7 px-2 text-xs"
                    >
                      Edit
                    </Button>
                  </div>
                );
              })}

              {bucket.tasks.map((task) => {
                const done = task.status === 'done';
                const overdue = isTaskOverdue(task, todayKey);
                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={
                          done
                            ? `Reopen "${task.title}"`
                            : `Complete "${task.title}"`
                        }
                        onClick={() => void onToggleTaskCompleted(task.id)}
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border cursor-pointer',
                          done
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background',
                        )}
                      >
                        {done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                      </button>

                      <span className="rounded border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Task due
                      </span>

                      <Link
                        to={`/tasks?taskId=${task.id}`}
                        className={cn(
                          'truncate text-sm font-medium hover:underline',
                          done
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                        )}
                      >
                        {task.title}
                      </Link>

                      {overdue ? (
                        <span className="text-[11px] font-medium text-destructive">
                          Overdue
                        </span>
                      ) : null}
                    </div>

                    <Link
                      to={`/tasks?taskId=${task.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span>Open task</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
