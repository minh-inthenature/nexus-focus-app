import { useState } from 'react';
import {
  Check,
  CheckSquare,
  ExternalLink,
  MapPin,
  Plus,
  Repeat,
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
  getMonthGridDates,
  getTodayDateKey,
  resolveEventColor,
  WEEKDAY_LABELS,
} from '@/features/calendar/utils/calendarDateUtils';
import { isTaskOverdue } from '@/features/tasks/utils/taskFilters';
import type {
  CalendarEventRecord,
  EventColor,
  NoteRecord,
  TaskRecord,
} from '@/services';
import { cn } from '@/utils/cn';
import {
  EventColorContextMenu,
  type EventColorContextMenuState,
} from './EventColorSwatches';

export interface CalendarMonthViewProps {
  selectedDate: string;
  events: readonly CalendarEventRecord[];
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  tasksById: ReadonlyMap<string, TaskRecord>;
  showTasks: boolean;
  showCompletedTasks: boolean;
  onSelectDate: (dateKey: string) => void;
  onCreateEventOnDate: (dateKey: string) => void;
  onCreateTaskOnDate: (dateKey: string) => void;
  onEditEvent: (eventId: string) => void;
  onChangeEventColor?: (eventId: string, color: EventColor) => Promise<void>;
  onToggleTaskCompleted: (taskId: string) => Promise<void>;
}

const MAX_CELL_ITEMS = 3;

/**
 * Conventional 7-column Month view grid with limited labels per day,
 * `+ more` overflow interaction into the Selected Day Inspector, and visual
 * distinction between calendar events and due tasks.
 */
export function CalendarMonthView({
  selectedDate,
  events,
  tasks,
  notesById,
  tasksById,
  showTasks,
  showCompletedTasks,
  onSelectDate,
  onCreateEventOnDate,
  onCreateTaskOnDate,
  onEditEvent,
  onChangeEventColor,
  onToggleTaskCompleted,
}: CalendarMonthViewProps) {
  const [colorMenu, setColorMenu] = useState<EventColorContextMenuState | null>(
    null,
  );
  const todayKey = getTodayDateKey();
  const activeMonthPrefix = selectedDate.slice(0, 7);
  const gridDates = getMonthGridDates(selectedDate);

  const visibleTasksForDate = (dateKey: string): TaskRecord[] => {
    if (!showTasks) return [];
    return tasks.filter(
      (t) =>
        t.dueDate === dateKey &&
        (showCompletedTasks || t.status !== 'done'),
    );
  };

  const selectedDayEvents = events
    .filter((ev) => eventOccursOnDate(ev, selectedDate))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
  const selectedDayTasks = visibleTasksForDate(selectedDate);

  return (
    <div className="space-y-4">
      {/* 7-column Grid */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {WEEKDAY_LABELS.map((dayLabel) => (
            <div
              key={dayLabel}
              className="px-2 py-2 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {dayLabel}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridDates.map((dateKey, idx) => {
            const inCurrentMonth = dateKey.startsWith(activeMonthPrefix);
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            const dayNumber = Number(dateKey.slice(8, 10));

            const dayEvents = events
              .filter((ev) => eventOccursOnDate(ev, dateKey))
              .sort((a, b) => {
                if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
                return a.startAt.localeCompare(b.startAt);
              });
            const dayTasks = visibleTasksForDate(dateKey);

            const combinedCount = dayEvents.length + dayTasks.length;
            const combinedItems: Array<
              | { kind: 'event'; event: CalendarEventRecord }
              | { kind: 'task'; task: TaskRecord }
            > = [
              ...dayEvents.map((event) => ({ kind: 'event' as const, event })),
              ...dayTasks.map((task) => ({ kind: 'task' as const, task })),
            ];
            const displayedItems = combinedItems.slice(0, MAX_CELL_ITEMS);
            const overflowCount = Math.max(0, combinedCount - MAX_CELL_ITEMS);

            return (
              <div
                key={dateKey}
                role="gridcell"
                aria-selected={isSelected}
                onClick={() => onSelectDate(dateKey)}
                className={cn(
                  'group flex min-h-[112px] flex-col border-b border-r border-border/70 p-1.5 transition-colors cursor-pointer',
                  (idx + 1) % 7 === 0 && 'border-r-0',
                  idx >= 35 && 'border-b-0',
                  !inCurrentMonth && 'bg-muted/20 text-muted-foreground/70',
                  isSelected
                    ? 'bg-accent/35 ring-1 ring-inset ring-ring'
                    : 'hover:bg-accent/20',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs',
                      isToday
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : isSelected
                          ? 'bg-accent font-semibold text-foreground'
                          : inCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/70',
                    )}
                  >
                    {dayNumber}
                  </span>

                  <button
                    type="button"
                    aria-label={`Add event on ${dateKey}`}
                    title={`New event on ${dateKey}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate(dateKey);
                      onCreateEventOnDate(dateKey);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-1">
                  {displayedItems.map((entry) => {
                    if (entry.kind === 'event') {
                      const ev = entry.event;
                      const accent = getEventAccentClasses(
                        ev.category,
                        ev.color,
                      );
                      return (
                        <button
                          key={`ev-${ev.id}-${ev.startAt}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDate(dateKey);
                            onEditEvent(ev.id);
                          }}
                          onContextMenu={(e) => {
                            if (!onChangeEventColor) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setColorMenu({
                              eventId: ev.id,
                              title: ev.title,
                              currentColor: resolveEventColor(
                                ev.category,
                                ev.color,
                              ),
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          title={`${ev.title} (${CATEGORY_LABELS[ev.category]})${ev.rrule ? ' • Repeats' : ''}`}
                          className={cn(
                            'flex w-full min-w-0 items-center gap-1 overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-90 cursor-pointer',
                            accent.surfaceClass,
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              accent.swatchClass,
                            )}
                            aria-hidden="true"
                          />
                          {!ev.allDay ? (
                            <span className="shrink-0 font-mono text-[10px] opacity-80">
                              {formatTimeDisplay(ev.startAt)}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {ev.title}
                          </span>
                        </button>
                      );
                    }

                    const task = entry.task;
                    const done = task.status === 'done';
                    const overdue = isTaskOverdue(task, todayKey);
                    return (
                      <Link
                        key={`task-${task.id}`}
                        to={`/tasks?taskId=${task.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Task due: ${task.title}`}
                        className={cn(
                          'flex w-full items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-accent/50',
                          overdue
                            ? 'border-destructive/50 bg-destructive/10 text-destructive'
                            : 'border-border bg-background/60 text-foreground',
                          done && 'opacity-55 line-through',
                        )}
                      >
                        <CheckSquare
                          className="h-3 w-3 shrink-0 opacity-75"
                          aria-hidden="true"
                        />
                        <span className="truncate">{task.title}</span>
                      </Link>
                    );
                  })}

                  {overflowCount > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate(dateKey);
                      }}
                      className="px-1 text-left font-mono text-[10px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      +{overflowCount} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Inspector */}
      <section
        aria-label={`Schedule for ${selectedDate}`}
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {formatDayHeaderLabel(selectedDate)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedDayEvents.length} event
              {selectedDayEvents.length === 1 ? '' : 's'}
              {showTasks
                ? ` · ${selectedDayTasks.length} due task${selectedDayTasks.length === 1 ? '' : 's'}`
                : ''}
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
              onClick={() => onCreateEventOnDate(selectedDate)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add event</span>
            </Button>
          </div>
        </div>

        {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nothing scheduled on {selectedDate}.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedDayEvents.map((ev) => {
              const accent = getEventAccentClasses(ev.category, ev.color);
              return (
                <div
                  key={`${ev.id}-${ev.startAt}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatEventTimeRangeLabel(ev)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditEvent(ev.id)}
                        className="inline-flex items-center gap-1.5 text-left text-sm font-medium text-foreground hover:underline cursor-pointer"
                      >
                        <span>{ev.title}</span>
                        {ev.rrule ? (
                          <Repeat
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-label="Repeating event"
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
                        {ev.description ? (
                          <span className="truncate">{ev.description}</span>
                        ) : null}
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
                              className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              <span>{note.title}</span>
                              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                            </Link>
                          ) : (
                            <span
                              key={nid}
                              className="rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground italic"
                            >
                              Deleted note
                            </span>
                          );
                        })}
                        {ev.linkedTaskIds.map((tid) => {
                          const linkedTask = tasksById.get(tid);
                          return linkedTask ? (
                            <Link
                              key={tid}
                              to={`/tasks?taskId=${linkedTask.id}`}
                              className="inline-flex items-center gap-1 rounded border border-dashed border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
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

            {selectedDayTasks.map((task) => {
              const done = task.status === 'done';
              const overdue = isTaskOverdue(task, todayKey);
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-background/40 px-3 py-2"
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
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer',
                        done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-foreground/50',
                      )}
                    >
                      {done ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      ) : null}
                    </button>

                    <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Task
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
                    <span>Open in Tasks</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <EventColorContextMenu
        menu={colorMenu}
        onSelectColor={(eventId, nextColor) => {
          void onChangeEventColor?.(eventId, nextColor);
        }}
        onClose={() => setColorMenu(null)}
      />
    </div>
  );
}
