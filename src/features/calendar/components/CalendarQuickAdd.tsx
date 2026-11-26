import { useEffect, useState, type FormEvent } from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildAllDayRange,
  buildTimedRange,
  EVENT_CATEGORIES,
} from '@/features/calendar/utils/calendarDateUtils';
import type { EventCategory } from '@/services';

export interface CalendarQuickAddProps {
  selectedDate: string;
  onCreateEvent: (input: {
    title: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    category: EventCategory;
  }) => Promise<void>;
  onCreateTaskForDate: (dateKey: string) => void;
}

/**
 * Single-line quick event bar defaulting to the selected calendar date
 * (`09:00`–`10:00` local time or all-day), paired with quick task creation.
 */
export function CalendarQuickAdd({
  selectedDate,
  onCreateEvent,
  onCreateTaskForDate,
}: CalendarQuickAddProps) {
  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState(selectedDate);
  const [allDay, setAllDay] = useState(false);
  const [category, setCategory] = useState<EventCategory>('personal');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDateKey(selectedDate);
  }, [selectedDate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    const targetDate = dateKey || selectedDate;
    const range = allDay
      ? buildAllDayRange(targetDate, targetDate)
      : buildTimedRange(targetDate, '09:00', targetDate, '10:00');

    setSubmitting(true);
    try {
      await onCreateEvent({
        title: trimmed,
        startAt: range.startAt,
        endAt: range.endAt,
        allDay,
        category,
      });
      setTitle('');
      setAllDay(false);
      setCategory('personal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
    >
      <Plus
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`Quick add event on ${dateKey}… (Press Enter)`}
        aria-label="Quick add event"
        className="min-w-[180px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          aria-label="Quick add event date"
          value={dateKey}
          onChange={(e) => setDateKey(e.target.value)}
          className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <label className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          <span>All day</span>
        </label>

        <select
          aria-label="Quick add event category"
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory)}
          className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          {EVENT_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>

        <Button
          type="submit"
          size="sm"
          variant="subtle"
          disabled={!title.trim() || submitting}
        >
          Add event
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onCreateTaskForDate(dateKey || selectedDate)}
          title="Create a task due on this date"
        >
          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New task</span>
        </Button>
      </div>
    </form>
  );
}
