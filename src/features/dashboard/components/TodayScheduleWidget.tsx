import { ArrowRight, CheckSquare, FileText, MapPin, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  formatEventTimeRangeLabel,
  getEventAccentClasses,
} from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord, NoteRecord, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface TodayScheduleWidgetProps {
  todayKey: string;
  events: readonly CalendarEventRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  tasksById: ReadonlyMap<string, TaskRecord>;
  onCreateEvent: () => void;
}

/**
 * Displays today's calendar events chronologically under a flat Linear-style
 * header with a compact inline `+ Add` row when empty.
 */
export function TodayScheduleWidget({
  todayKey,
  events,
  notesById,
  tasksById,
  onCreateEvent,
}: TodayScheduleWidgetProps) {
  return (
    <section className="space-y-3" aria-label="Today's Schedule">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Today&apos;s Schedule
        </h2>
        <Link
          to={`/calendar?date=${todayKey}&view=day`}
          className="inline-flex items-center gap-1 rounded-lg text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span>Open Calendar</span>
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="border-t border-border/70">
        {events.length === 0 ? (
          <div className="flex items-center justify-between py-3 text-xs text-muted-foreground">
            <span>No events scheduled today</span>
            <button
              type="button"
              onClick={onCreateEvent}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>Add</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {events.map((ev) => {
              const accent = getEventAccentClasses(ev.category, ev.color);
              return (
                <div
                  key={ev.id}
                  className="-mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-out hover:bg-accent/55"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          accent.swatchClass,
                        )}
                        aria-hidden="true"
                      />
                      <Link
                        to={`/calendar?date=${todayKey}&eventId=${ev.id}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {ev.title}
                      </Link>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'rounded-lg border px-1.5 py-0.5 text-[10px] font-medium',
                          accent.badgeClass,
                        )}
                      >
                        {CATEGORY_LABELS[ev.category]}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatEventTimeRangeLabel(ev)}
                      </span>
                    </div>
                  </div>

                  {ev.location ||
                  ev.linkedNoteIds.length > 0 ||
                  ev.linkedTaskIds.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pl-4 text-[11px] text-muted-foreground">
                      {ev.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          <span>{ev.location}</span>
                        </span>
                      ) : null}
                      {ev.linkedNoteIds.map((nid) => {
                        const note = notesById.get(nid);
                        return note ? (
                          <Link
                            key={nid}
                            to={`/notes/${note.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-1.5 py-0.5 transition-colors duration-150 hover:text-foreground"
                          >
                            <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                            <span className="max-w-[140px] truncate">
                              {note.title}
                            </span>
                          </Link>
                        ) : null;
                      })}
                      {ev.linkedTaskIds.map((tid) => {
                        const task = tasksById.get(tid);
                        return task ? (
                          <Link
                            key={tid}
                            to={`/tasks?taskId=${task.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-1.5 py-0.5 transition-colors duration-150 hover:text-foreground"
                          >
                            <CheckSquare className="h-2.5 w-2.5" aria-hidden="true" />
                            <span className="max-w-[140px] truncate">
                              {task.title}
                            </span>
                          </Link>
                        ) : null;
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
