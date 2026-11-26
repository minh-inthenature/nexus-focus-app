import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CATEGORY_LABELS,
  formatEventTimeRangeLabel,
  getEventAccentClasses,
  getEventDateRange,
} from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface UpcomingEventsWidgetProps {
  events: readonly CalendarEventRecord[];
  onCreateEvent: () => void;
}

/**
 * Displays upcoming calendar events over the next 7 days with a minimalist
 * borderless list and compact inline `+ Add` empty state.
 */
export function UpcomingEventsWidget({
  events,
  onCreateEvent,
}: UpcomingEventsWidgetProps) {
  return (
    <section className="space-y-3" aria-label="Upcoming Events">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Upcoming Events
        </h2>
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1 rounded-lg text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span>Open Calendar</span>
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="border-t border-border/70">
        {events.length === 0 ? (
          <div className="flex items-center justify-between py-3 text-xs text-muted-foreground">
            <span>No upcoming events in the next 7 days</span>
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
              const { startDateKey } = getEventDateRange(ev);
              const accent = getEventAccentClasses(ev.category, ev.color);
              return (
                <Link
                  key={`${ev.id}-${ev.startAt}`}
                  to={`/calendar?date=${startDateKey}&eventId=${ev.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-out hover:bg-accent/55"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        accent.swatchClass,
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-medium text-foreground">
                      {ev.title}
                    </span>
                    <span className="shrink-0 rounded-lg border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[ev.category]}
                    </span>
                  </div>

                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {startDateKey} · {formatEventTimeRangeLabel(ev)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
