import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import {
  buildAllDayRange,
  CATEGORY_LABELS,
  formatEventTimeRangeLabel,
  getEventAccentClasses,
  getEventDateRange,
  getTodayDateKey,
} from '@/features/calendar/utils/calendarDateUtils';
import { cn } from '@/utils/cn';

export interface LinkedEventsPanelProps {
  noteId: string;
}

/**
 * Collapsible panel inside a Note displaying calendar events linked to that
 * note UUID, allowing quick event creation or jumping straight to that date
 * in the Calendar module.
 */
export function LinkedEventsPanel({ noteId }: LinkedEventsPanelProps) {
  const navigate = useNavigate();
  const events = useCalendarStore((state) => state.events);
  const initializeEvents = useCalendarStore((state) => state.initialize);
  const createEvent = useCalendarStore((state) => state.createEvent);

  const [open, setOpen] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(getTodayDateKey());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void initializeEvents();
  }, [initializeEvents]);

  const linkedEvents = useMemo(
    () => events.filter((ev) => ev.linkedNoteIds.includes(noteId)),
    [events, noteId],
  );

  const handleCreateFromNote = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || creating) return;

    const targetDate = newDate || getTodayDateKey();
    const range = buildAllDayRange(targetDate, targetDate);

    setCreating(true);
    try {
      await createEvent({
        title: trimmed,
        startAt: range.startAt,
        endAt: range.endAt,
        allDay: true,
        category: 'personal',
        linkedNoteIds: [noteId],
      });
      setNewTitle('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label="Linked calendar events"
      className="border-t border-border bg-card/20 px-6 py-3 md:px-10"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Linked Events</span>
          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px]">
            {linkedEvents.length}
          </span>
        </span>
      </button>

      {open ? (
        <div className="mt-2.5 space-y-2">
          {linkedEvents.length > 0 ? (
            <ul className="space-y-1">
              {linkedEvents.map((ev) => {
                const { startDateKey } = getEventDateRange(ev);
                const accent = getEventAccentClasses(ev.category, ev.color);
                return (
                  <li
                    key={ev.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent/60"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          accent.swatchClass,
                        )}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/calendar?date=${startDateKey}&eventId=${ev.id}`,
                          )
                        }
                        className="flex min-w-0 items-center gap-1.5 text-left font-medium text-foreground hover:underline cursor-pointer"
                      >
                        <span className="truncate">{ev.title}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </button>
                      <span className="rounded border border-border px-1 py-0.2 text-[10px] text-muted-foreground">
                        {CATEGORY_LABELS[ev.category]}
                      </span>
                    </div>

                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {startDateKey} · {formatEventTimeRangeLabel(ev)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form
            onSubmit={(e) => void handleCreateFromNote(e)}
            className="flex flex-wrap items-center gap-1.5"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Schedule an event linked to this note…"
              aria-label="New event from note"
              className="h-7 min-w-[160px] flex-1 rounded border border-border bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="date"
              aria-label="New event date from note"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-7 rounded border border-border bg-background/70 px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || creating}
              className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>Add event</span>
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
