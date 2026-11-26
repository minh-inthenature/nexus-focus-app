import { useEffect, useRef } from 'react';
import {
  Check,
  CheckSquare,
  ExternalLink,
  MapPin,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  CATEGORY_LABELS,
  eventOccursOnDate,
  formatDayHeaderLabel,
  formatEventTimeRangeLabel,
  formatTimeDisplay,
  getEventAccentClasses,
  getTodayDateKey,
  layoutOverlappingTimedEvents,
} from '@/features/calendar/utils/calendarDateUtils';
import { isTaskOverdue } from '@/features/tasks/utils/taskFilters';
import type { CalendarEventRecord, NoteRecord, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface CalendarDayViewProps {
  selectedDate: string;
  events: readonly CalendarEventRecord[];
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  showTasks: boolean;
  showCompletedTasks: boolean;
  onCreateEventAtSlot: (dateKey: string, startTimeHHMM?: string) => void;
  onCreateTaskOnDate: (dateKey: string) => void;
  onEditEvent: (eventId: string) => void;
  onToggleTaskCompleted: (taskId: string) => Promise<void>;
}

const HOUR_HEIGHT_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Detailed single-day schedule showing all-day events and tasks at top and a
 * clickable 24-hour chronological grid for timed events.
 */
export function CalendarDayView({
  selectedDate,
  events,
  tasks,
  notesById,
  showTasks,
  showCompletedTasks,
  onCreateEventAtSlot,
  onCreateTaskOnDate,
  onEditEvent,
  onToggleTaskCompleted,
}: CalendarDayViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayKey = getTodayDateKey();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT_PX;
    }
  }, [selectedDate]);

  const allDayEvents = events.filter(
    (ev) => ev.allDay && eventOccursOnDate(ev, selectedDate),
  );
  const timedEvents = events
    .filter((ev) => !ev.allDay && eventOccursOnDate(ev, selectedDate))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const laidOutTimed = layoutOverlappingTimedEvents(events, selectedDate);

  const dayTasks = showTasks
    ? tasks.filter(
        (t) =>
          t.dueDate === selectedDate &&
          (showCompletedTasks || t.status !== 'done'),
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Top All-day Events + Due Tasks Banner */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {formatDayHeaderLabel(selectedDate)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {allDayEvents.length} all-day · {timedEvents.length} timed
              {showTasks ? ` · ${dayTasks.length} due tasks` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onCreateTaskOnDate(selectedDate)}
            >
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add task</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onCreateEventAtSlot(selectedDate)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add event</span>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {allDayEvents.map((ev) => {
            const accent = getEventAccentClasses(ev.category, ev.color);
            return (
              <div
                key={ev.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs',
                  accent.surfaceClass,
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-medium">
                    All day
                  </span>
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                      accent.badgeClass,
                    )}
                  >
                    {CATEGORY_LABELS[ev.category]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditEvent(ev.id)}
                    className="text-sm font-medium hover:underline cursor-pointer"
                  >
                    {ev.title}
                  </button>
                </div>

                {ev.linkedNoteIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ev.linkedNoteIds.map((nid) => {
                      const note = notesById.get(nid);
                      return note ? (
                        <Link
                          key={nid}
                          to={`/notes/${note.id}`}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground hover:underline"
                        >
                          <span>{note.title}</span>
                          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                        </Link>
                      ) : null;
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          {dayTasks.map((task) => {
            const done = task.status === 'done';
            const overdue = isTaskOverdue(task, todayKey);
            return (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-background/50 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
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
                  <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Task
                  </span>
                  <Link
                    to={`/tasks?taskId=${task.id}`}
                    className={cn(
                      'text-sm font-medium hover:underline',
                      done ? 'text-muted-foreground line-through' : 'text-foreground',
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
                  className="text-muted-foreground hover:text-foreground"
                >
                  Open in Tasks →
                </Link>
              </div>
            );
          })}

          {allDayEvents.length === 0 && dayTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No all-day events or tasks due on this date. Click any hour slot below to schedule a timed event.
            </p>
          ) : null}
        </div>
      </div>

      {/* Chronological Timed Schedule + Hourly Grid */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div
          ref={scrollRef}
          className="max-h-[520px] overflow-y-auto"
        >
          <div
            className="grid grid-cols-[64px_minmax(0,1fr)]"
            style={{ height: `${24 * HOUR_HEIGHT_PX}px` }}
          >
            <div className="border-r border-border bg-muted/15">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT_PX}px` }}
                  className="border-b border-border/40 pr-2 pt-1 text-right font-mono text-[11px] text-muted-foreground"
                >
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>

            <div className="relative">
              {HOURS.map((hour) => {
                const hourLabel = `${String(hour).padStart(2, '0')}:00`;
                return (
                  <button
                    key={hour}
                    type="button"
                    aria-label={`Schedule event at ${hourLabel} on ${selectedDate}`}
                    onClick={() => onCreateEventAtSlot(selectedDate, hourLabel)}
                    style={{ height: `${HOUR_HEIGHT_PX}px` }}
                    className="group flex w-full items-center border-b border-border/40 px-3 text-left transition-colors hover:bg-accent/20 cursor-pointer"
                  >
                    <span className="text-[11px] text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100">
                      + Add event at {hourLabel}
                    </span>
                  </button>
                );
              })}

              {laidOutTimed.map(({ event, metrics, column, totalColumns }) => {
                const accent = getEventAccentClasses(
                  event.category,
                  event.color,
                );
                const widthPct = 100 / totalColumns;
                const leftPct = column * widthPct;

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditEvent(event.id);
                    }}
                    style={{
                      top: `${metrics.topPercent}%`,
                      height: `${metrics.heightPercent}%`,
                      left: `calc(${leftPct}% + 4px)`,
                      width: `calc(${widthPct}% - 8px)`,
                    }}
                    className={cn(
                      'absolute z-10 flex flex-col justify-center overflow-hidden rounded-md border px-3 py-1 text-left shadow-xs transition-opacity hover:opacity-95 cursor-pointer',
                      accent.surfaceClass,
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-medium opacity-85">
                        {formatTimeDisplay(event.startAt)} –{' '}
                        {formatTimeDisplay(event.endAt)}
                      </span>
                      <span className="text-xs font-semibold">
                        {event.title}
                      </span>
                      <span className="rounded border border-current/25 px-1.5 py-0.2 text-[10px]">
                        {CATEGORY_LABELS[event.category]}
                      </span>
                      {event.location ? (
                        <span className="inline-flex items-center gap-1 text-[11px] opacity-80">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          <span>{event.location}</span>
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Explicit chronological list summary for accessibility/quick scan */}
      {timedEvents.length > 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Timed Events Summary
          </h4>
          <div className="space-y-1.5">
            {timedEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {formatEventTimeRangeLabel(ev)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditEvent(ev.id)}
                    className="font-medium text-foreground hover:underline cursor-pointer"
                  >
                    {ev.title}
                  </button>
                </div>
                <span className="text-muted-foreground">
                  {CATEGORY_LABELS[ev.category]}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
