import { useEffect, useRef, useState } from 'react';
import { Check, CheckSquare, Repeat } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  eventOccursOnDate,
  formatTimeDisplay,
  getEventAccentClasses,
  getTodayDateKey,
  getWeekDates,
  layoutOverlappingTimedEvents,
  parseDateKeyToLocal,
  resolveEventColor,
  WEEKDAY_LABELS,
} from '@/features/calendar/utils/calendarDateUtils';
import { isTaskOverdue } from '@/features/tasks/utils/taskFilters';
import type { CalendarEventRecord, EventColor, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';
import { CurrentTimeLine, useCurrentLocalTime } from './CurrentTimeLine';
import {
  EventColorContextMenu,
  type EventColorContextMenuState,
} from './EventColorSwatches';

export interface CalendarWeekViewProps {
  selectedDate: string;
  events: readonly CalendarEventRecord[];
  tasks: readonly TaskRecord[];
  showTasks: boolean;
  showCompletedTasks: boolean;
  onSelectDate: (dateKey: string) => void;
  onCreateEventAtSlot: (dateKey: string, startTimeHHMM: string) => void;
  onEditEvent: (eventId: string) => void;
  onChangeEventColor?: (eventId: string, color: EventColor) => Promise<void>;
  onToggleTaskCompleted: (taskId: string) => Promise<void>;
}

const HOUR_HEIGHT_PX = 48;
const TOTAL_HOURS = 24;
const GRID_HEIGHT_PX = HOUR_HEIGHT_PX * TOTAL_HOURS;
const HOURS = Array.from({ length: TOTAL_HOURS }, (_, i) => i);

/**
 * 7-day Week view featuring a dedicated all-day + tasks strip at top and an
 * interactive 24-hour timed grid that positions overlapping events cleanly.
 */
export function CalendarWeekView({
  selectedDate,
  events,
  tasks,
  showTasks,
  showCompletedTasks,
  onSelectDate,
  onCreateEventAtSlot,
  onEditEvent,
  onChangeEventColor,
  onToggleTaskCompleted,
}: CalendarWeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [colorMenu, setColorMenu] = useState<EventColorContextMenuState | null>(
    null,
  );
  const weekDates = getWeekDates(selectedDate);
  const nowTime = useCurrentLocalTime();
  const todayKey = nowTime.dateKey || getTodayDateKey();

  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetHour = Math.max(0, Math.min(TOTAL_HOURS - 10, nowTime.hour - 3));
      scrollContainerRef.current.scrollTop = targetHour * HOUR_HEIGHT_PX;
    }
    // Intentionally only center once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header Row */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/30">
        <div className="border-r border-border px-2 py-2 text-[10px] font-mono text-muted-foreground" />
        {weekDates.map((dateKey, idx) => {
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDate;
          const dayNum = parseDateKeyToLocal(dateKey).getDate();
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              className={cn(
                'flex flex-col items-center justify-center border-r border-border/70 py-2 text-center transition-colors last:border-r-0 cursor-pointer',
                isSelected ? 'bg-accent/40' : 'hover:bg-accent/20',
              )}
            >
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                {WEEKDAY_LABELS[idx]}
              </span>
              <span
                className={cn(
                  'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs',
                  isToday
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : isSelected
                      ? 'bg-accent font-semibold text-foreground'
                      : 'text-foreground',
                )}
              >
                {dayNum}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day Events & Due Tasks Band */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-background/40">
        <div className="flex items-start justify-end border-r border-border px-1.5 py-2 font-mono text-[10px] text-muted-foreground">
          All day
        </div>
        {weekDates.map((dateKey) => {
          const allDayEvents = events.filter(
            (ev) => ev.allDay && eventOccursOnDate(ev, dateKey),
          );
          const dayTasks = showTasks
            ? tasks.filter(
                (t) =>
                  t.dueDate === dateKey &&
                  (showCompletedTasks || t.status !== 'done'),
              )
            : [];

          return (
            <div
              key={`allday-${dateKey}`}
              className="min-h-[42px] space-y-1 border-r border-border/70 p-1 last:border-r-0"
            >
              {allDayEvents.map((ev) => {
                const accent = getEventAccentClasses(ev.category, ev.color);
                return (
                  <button
                    key={`${ev.id}-${ev.startAt}`}
                    type="button"
                    onClick={() => onEditEvent(ev.id)}
                    onContextMenu={(e) => {
                      if (!onChangeEventColor) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setColorMenu({
                        eventId: ev.id,
                        title: ev.title,
                        currentColor: resolveEventColor(ev.category, ev.color),
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    title={`${ev.title} (${CATEGORY_LABELS[ev.category]})`}
                    className={cn(
                      'flex w-full items-center gap-1 rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight cursor-pointer',
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
                    <span className="truncate font-medium">{ev.title}</span>
                    {ev.rrule ? (
                      <Repeat
                        className="ml-auto h-2.5 w-2.5 shrink-0 opacity-70"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}

              {dayTasks.map((task) => {
                const done = task.status === 'done';
                const overdue = isTaskOverdue(task, todayKey);
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-1 rounded border border-dashed px-1 py-0.5 text-[11px]',
                      overdue
                        ? 'border-destructive/50 bg-destructive/10 text-destructive'
                        : 'border-border bg-card text-foreground',
                      done && 'opacity-55',
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={`Toggle "${task.title}"`}
                      onClick={() => void onToggleTaskCompleted(task.id)}
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border cursor-pointer',
                        done
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                      )}
                    >
                      {done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                    </button>
                    <Link
                      to={`/tasks?taskId=${task.id}`}
                      title={`Task: ${task.title}`}
                      className={cn(
                        'flex min-w-0 items-center gap-1 truncate hover:underline',
                        done && 'line-through',
                      )}
                    >
                      <CheckSquare className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden="true" />
                      <span className="truncate">{task.title}</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 24-hour Timed Grid */}
      <div
        ref={scrollContainerRef}
        className="max-h-[540px] overflow-y-auto"
      >
        <div
          className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]"
          style={{ height: `${GRID_HEIGHT_PX}px` }}
        >
          {/* Time Labels Gutter */}
          <div className="border-r border-border bg-muted/10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                className="border-b border-border/40 pr-1.5 pt-0.5 text-right font-mono text-[10px] text-muted-foreground"
              >
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* 7 Day Timed Columns */}
          {weekDates.map((dateKey) => {
            const laidOut = layoutOverlappingTimedEvents(events, dateKey);
            return (
              <div
                key={`col-${dateKey}`}
                className="relative border-r border-border/70 last:border-r-0"
              >
                {/* Hourly Interactive Slots */}
                {HOURS.map((hour) => {
                  const hourLabel = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`Create event on ${dateKey} at ${hourLabel}`}
                      onClick={() => {
                        onSelectDate(dateKey);
                        onCreateEventAtSlot(dateKey, hourLabel);
                      }}
                      style={{ height: `${HOUR_HEIGHT_PX}px` }}
                      className="block w-full border-b border-border/40 text-left transition-colors hover:bg-accent/20 cursor-pointer"
                    />
                  );
                })}

                {/* Positioned Overlap-Safe Event Cards */}
                {laidOut.map(({ event, metrics, column, totalColumns }) => {
                  const accent = getEventAccentClasses(
                    event.category,
                    event.color,
                  );
                  const widthPct = 100 / totalColumns;
                  const leftPct = column * widthPct;

                  return (
                    <button
                      key={`${event.id}-${event.startAt}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDate(dateKey);
                        onEditEvent(event.id);
                      }}
                      onContextMenu={(e) => {
                        if (!onChangeEventColor) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setColorMenu({
                          eventId: event.id,
                          title: event.title,
                          currentColor: resolveEventColor(
                            event.category,
                            event.color,
                          ),
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      style={{
                        top: `${metrics.topPercent}%`,
                        height: `${metrics.heightPercent}%`,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      title={`${event.title} (${formatTimeDisplay(event.startAt)}–${formatTimeDisplay(event.endAt)})`}
                      className={cn(
                        'absolute z-10 flex flex-col overflow-hidden rounded border px-1.5 py-0.5 text-left shadow-xs transition-opacity hover:opacity-95 cursor-pointer',
                        accent.surfaceClass,
                      )}
                    >
                      <span className="truncate font-mono text-[10px] leading-tight opacity-80">
                        {formatTimeDisplay(event.startAt)}
                      </span>
                      <span className="truncate text-[11px] font-medium leading-tight">
                        {event.title}
                      </span>
                    </button>
                  );
                })}

                {dateKey === todayKey ? (
                  <CurrentTimeLine topPercent={nowTime.topPercent} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

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
