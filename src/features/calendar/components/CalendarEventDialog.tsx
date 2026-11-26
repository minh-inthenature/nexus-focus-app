import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckSquare,
  ExternalLink,
  FilePlus2,
  FileText,
  Globe,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EventDraftDefaults } from '@/features/calendar/stores/useCalendarStore';
import {
  addDays,
  addOneHourHHMM,
  buildAllDayRange,
  buildTimedRange,
  EVENT_CATEGORIES,
  EVENT_COLOR_OPTIONS,
  formatLocalTimeHHMM,
  getEventDateRange,
  getLocalTimezone,
  getTodayDateKey,
  isValidDateKey,
  validateEventRange,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  buildRrule,
  dateKeyToWeekdayCode,
  formatRruleLabel,
  parseRrule,
  WEEKDAY_CODES_MONDAY_FIRST,
  WEEKDAY_LONG_NAMES,
  WEEKDAY_SHORT_NAMES,
  type RecurrenceFreq,
  type WeekdayCode,
} from '@/features/calendar/utils/recurrence';
import type {
  CalendarEventRecord,
  EventCategory,
  NoteRecord,
  TaskRecord,
} from '@/services';
import { cn } from '@/utils/cn';

export interface CalendarEventDialogProps {
  open: boolean;
  event: CalendarEventRecord | null;
  draftDefaults?: EventDraftDefaults | null;
  selectedDate: string;
  notes: readonly NoteRecord[];
  tasks: readonly TaskRecord[];
  onCreateLinkedNote: (title: string, initialBody: string) => Promise<NoteRecord>;
  onSave: (payload: {
    title: string;
    description: string;
    location: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    timezone: string;
    category: EventCategory;
    color: string;
    linkedNoteIds: string[];
    linkedTaskIds: string[];
    rrule: string | null;
  }) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
  onClose: () => void;
}

type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

function detectRepeatState(
  rrule: string | undefined,
  startDateKey: string,
): {
  preset: RepeatPreset;
  customFreq: RecurrenceFreq;
  customInterval: number;
  customWeekdays: WeekdayCode[];
  untilDateKey: string;
  customTouched: boolean;
} {
  const startWeekday = dateKeyToWeekdayCode(startDateKey);
  const startDay = Number(startDateKey.slice(8, 10)) || 1;
  if (!rrule) {
    return {
      preset: 'none',
      customFreq: 'WEEKLY',
      customInterval: 1,
      customWeekdays: [startWeekday],
      untilDateKey: '',
      customTouched: false,
    };
  }

  const parsed = parseRrule(rrule);
  if (!parsed) {
    return {
      preset: 'custom',
      customFreq: 'WEEKLY',
      customInterval: 1,
      customWeekdays: [startWeekday],
      untilDateKey: '',
      customTouched: false,
    };
  }

  const days = parsed.byDay?.map((d) => d.weekday) ?? [];
  const hasOrdinals = parsed.byDay?.some((d) => d.nth !== undefined) ?? false;
  const untilDateKey = parsed.untilDateKey ?? '';
  let preset: RepeatPreset = 'custom';

  if (parsed.count === undefined && !hasOrdinals) {
    if (
      parsed.freq === 'DAILY' &&
      parsed.interval === 1 &&
      days.length === 0 &&
      !parsed.byMonthDay
    ) {
      preset = 'daily';
    } else if (
      parsed.freq === 'WEEKLY' &&
      parsed.interval === 1 &&
      days.join(',') === 'MO,TU,WE,TH,FR'
    ) {
      preset = 'weekdays';
    } else if (
      parsed.freq === 'WEEKLY' &&
      parsed.interval === 1 &&
      (days.length === 0 || (days.length === 1 && days[0] === startWeekday))
    ) {
      preset = 'weekly';
    } else if (
      parsed.freq === 'WEEKLY' &&
      parsed.interval === 2 &&
      (days.length === 0 || (days.length === 1 && days[0] === startWeekday))
    ) {
      preset = 'biweekly';
    } else if (
      parsed.freq === 'MONTHLY' &&
      parsed.interval === 1 &&
      days.length === 0 &&
      (!parsed.byMonthDay ||
        (parsed.byMonthDay.length === 1 && parsed.byMonthDay[0] === startDay))
    ) {
      preset = 'monthly';
    } else if (
      parsed.freq === 'YEARLY' &&
      parsed.interval === 1 &&
      days.length === 0 &&
      !parsed.byMonthDay
    ) {
      preset = 'yearly';
    }
  }

  return {
    preset,
    customFreq: parsed.freq,
    customInterval: parsed.interval,
    customWeekdays: days.length > 0 ? days : [startWeekday],
    untilDateKey,
    customTouched: false,
  };
}

/**
 * Full event creation & editing modal handling all-day canonical UTC ranges,
 * local timezone conversion for timed events, recurrence (`RRULE`), validation,
 * Note/Task linking, creating a note directly from an event, and deletion.
 */
export function CalendarEventDialog({
  open,
  event,
  draftDefaults,
  selectedDate,
  notes,
  tasks,
  onCreateLinkedNote,
  onSave,
  onDelete,
  onClose,
}: CalendarEventDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDateKey, setStartDateKey] = useState(selectedDate);
  const [endDateKey, setEndDateKey] = useState(selectedDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>('none');
  const [customFreq, setCustomFreq] = useState<RecurrenceFreq>('WEEKLY');
  const [customInterval, setCustomInterval] = useState(1);
  const [customWeekdays, setCustomWeekdays] = useState<WeekdayCode[]>(['MO']);
  const [untilDateKey, setUntilDateKey] = useState('');
  const [customTouched, setCustomTouched] = useState(false);
  const [category, setCategory] = useState<EventCategory>('personal');
  const [color, setColor] = useState<string>('default');
  const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([]);
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);
  const [notePickerId, setNotePickerId] = useState('');
  const [taskPickerId, setTaskPickerId] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const localTimezone = getLocalTimezone();

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setConfirmDelete(false);
    setNotePickerId('');
    setTaskPickerId('');

    if (event) {
      const range = getEventDateRange(event);
      setTitle(event.title);
      setDescription(event.description ?? '');
      setLocation(event.location ?? '');
      setAllDay(event.allDay);
      setStartDateKey(range.startDateKey);
      setEndDateKey(range.endDateKey);
      setStartTime(
        event.allDay ? '09:00' : formatLocalTimeHHMM(event.startAt),
      );
      setEndTime(event.allDay ? '10:00' : formatLocalTimeHHMM(event.endAt));
      const rep = detectRepeatState(event.rrule, range.startDateKey);
      setRepeatPreset(rep.preset);
      setCustomFreq(rep.customFreq);
      setCustomInterval(rep.customInterval);
      setCustomWeekdays(rep.customWeekdays);
      setUntilDateKey(rep.untilDateKey);
      setCustomTouched(rep.customTouched);
      setCategory(event.category);
      setColor(event.color ?? 'default');
      setLinkedNoteIds([...event.linkedNoteIds]);
      setLinkedTaskIds([...event.linkedTaskIds]);
    } else {
      const baseStartDate =
        draftDefaults?.startDateKey ?? selectedDate ?? getTodayDateKey();
      const baseStartTime = draftDefaults?.startTime ?? '09:00';
      const defaultEnd = addOneHourHHMM(baseStartTime);
      const baseEndDate =
        draftDefaults?.endDateKey ??
        (draftDefaults?.startDateKey || selectedDate
          ? defaultEnd.dayOffset > 0 && !draftDefaults?.allDay
            ? addDays(baseStartDate, defaultEnd.dayOffset)
            : baseStartDate
          : baseStartDate);

      setTitle('');
      setDescription('');
      setLocation('');
      setAllDay(Boolean(draftDefaults?.allDay));
      setStartDateKey(baseStartDate);
      setEndDateKey(baseEndDate);
      setStartTime(baseStartTime);
      setEndTime(draftDefaults?.endTime ?? defaultEnd.time);
      const rep = detectRepeatState(undefined, baseStartDate);
      setRepeatPreset(rep.preset);
      setCustomFreq(rep.customFreq);
      setCustomInterval(rep.customInterval);
      setCustomWeekdays(rep.customWeekdays);
      setUntilDateKey('');
      setCustomTouched(false);
      setCategory('personal');
      setColor('default');
      setLinkedNoteIds([...(draftDefaults?.linkedNoteIds ?? [])]);
      setLinkedTaskIds([...(draftDefaults?.linkedTaskIds ?? [])]);
    }
  }, [open, event, draftDefaults, selectedDate]);

  const notesById = new Map(notes.map((n) => [n.id, n]));
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  const availableNotesToLink = notes.filter(
    (n) => !linkedNoteIds.includes(n.id),
  );
  const availableTasksToLink = tasks.filter(
    (t) => !linkedTaskIds.includes(t.id),
  );

  const startWeekdayCode = dateKeyToWeekdayCode(startDateKey);
  const startWeekdayName = WEEKDAY_LONG_NAMES[startWeekdayCode];
  const startDayOfMonth = isValidDateKey(startDateKey)
    ? Number(startDateKey.slice(8, 10))
    : 1;

  const computedRrule: string | null = (() => {
    const endOpt =
      untilDateKey && isValidDateKey(untilDateKey) ? untilDateKey : undefined;
    switch (repeatPreset) {
      case 'none':
        return null;
      case 'daily':
        return buildRrule({ freq: 'DAILY', untilDateKey: endOpt });
      case 'weekdays':
        return buildRrule({
          freq: 'WEEKLY',
          byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
          untilDateKey: endOpt,
        });
      case 'weekly':
        return buildRrule({
          freq: 'WEEKLY',
          byDay: [startWeekdayCode],
          untilDateKey: endOpt,
        });
      case 'biweekly':
        return buildRrule({
          freq: 'WEEKLY',
          interval: 2,
          byDay: [startWeekdayCode],
          untilDateKey: endOpt,
        });
      case 'monthly':
        return buildRrule({
          freq: 'MONTHLY',
          byMonthDay: [startDayOfMonth],
          untilDateKey: endOpt,
        });
      case 'yearly':
        return buildRrule({ freq: 'YEARLY', untilDateKey: endOpt });
      case 'custom': {
        if (!customTouched && event?.rrule) {
          return event.rrule;
        }
        return buildRrule({
          freq: customFreq,
          interval: customInterval,
          ...(customFreq === 'WEEKLY'
            ? {
                byDay:
                  customWeekdays.length > 0
                    ? customWeekdays
                    : [startWeekdayCode],
              }
            : {}),
          ...(customFreq === 'MONTHLY'
            ? { byMonthDay: [startDayOfMonth] }
            : {}),
          untilDateKey: endOpt,
        });
      }
    }
  })();

  const handleToggleWeekday = (code: WeekdayCode) => {
    setCustomTouched(true);
    setCustomWeekdays((prev) => {
      if (prev.includes(code)) {
        return prev.length > 1 ? prev.filter((c) => c !== code) : prev;
      }
      return [...prev, code];
    });
  };

  const handleToggleAllDay = (checked: boolean) => {
    setAllDay(checked);
    setValidationError(null);
  };

  const handleCreateNoteForEvent = async () => {
    if (creatingNote) return;
    setCreatingNote(true);
    try {
      const noteTitle = title.trim() || `Event Note (${startDateKey})`;
      const timeSummary = allDay
        ? `${startDateKey}${endDateKey !== startDateKey ? ` → ${endDateKey}` : ''} (All day)`
        : `${startDateKey} ${startTime} – ${endTime} (${localTimezone})`;
      const bodyLines = [
        `# ${noteTitle}`,
        '',
        `- **When**: ${timeSummary}`,
        ...(location.trim() ? [`- **Where**: ${location.trim()}`] : []),
        '',
        '## Notes',
        '',
      ];
      const created = await onCreateLinkedNote(noteTitle, bodyLines.join('\n'));
      setLinkedNoteIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
    } finally {
      setCreatingNote(false);
    }
  };

  const handleSubmit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Event title is required.');
      return;
    }

    if (!startDateKey || !endDateKey) {
      setValidationError('Start date and end date are required.');
      return;
    }

    if (allDay && endDateKey < startDateKey) {
      setValidationError('End date cannot be earlier than start date.');
      return;
    }

    const { startAt, endAt } = allDay
      ? buildAllDayRange(startDateKey, endDateKey)
      : buildTimedRange(startDateKey, startTime, endDateKey, endTime);

    const rangeError = validateEventRange(startAt, endAt);
    if (rangeError) {
      setValidationError(rangeError);
      return;
    }

    setSubmitting(true);
    setValidationError(null);
    try {
      await onSave({
        title: trimmedTitle,
        description,
        location,
        startAt,
        endAt,
        allDay,
        timezone: localTimezone,
        category,
        color,
        linkedNoteIds,
        linkedTaskIds,
        rrule: computedRrule,
      });
      onClose();
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to save event.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!event || !onDelete) return;
    setSubmitting(true);
    try {
      await onDelete(event.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="top-[6%] flex max-h-[88vh] max-w-lg flex-col overflow-hidden p-0">
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-serif text-base font-medium tracking-[-0.02em] text-foreground">
              {event ? 'Edit Event' : 'New Event'}
            </DialogTitle>
            {event?.googleEventId ? (
              event.googleEventId.startsWith('ics:') ? (
                <span className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Imported from .ics
                </span>
              ) : (
                <span className="rounded-lg border border-focus-accent/50 bg-focus-surface px-2 py-0.5 text-[10px] font-medium text-focus-foreground">
                  Synced with Google Calendar
                </span>
              )
            ) : null}
          </div>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            {event
              ? 'Update event schedule, category, location, or linked notes and tasks.'
              : 'Create a calendar event stored locally in IndexedDB and synced with Supabase.'}
          </DialogDescription>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4">
            {validationError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
              >
                {validationError}
              </p>
            ) : null}

            <div className="space-y-1">
              <label
                htmlFor="event-title-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Title
              </label>
              <input
                id="event-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                autoFocus
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* All-day toggle & Timezone info */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => handleToggleAllDay(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>All-day event</span>
              </label>

              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Globe className="h-3 w-3" aria-hidden="true" />
                <span>{allDay ? 'Timezone-neutral date' : localTimezone}</span>
              </span>
            </div>

            {/* Start / End Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="event-start-date-input"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Start date
                </label>
                <input
                  id="event-start-date-input"
                  type="date"
                  value={startDateKey}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartDateKey(nextStart);
                    if (endDateKey === startDateKey || endDateKey < nextStart) {
                      setEndDateKey(nextStart);
                    }
                  }}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="event-end-date-input"
                  className="text-xs font-medium text-muted-foreground"
                >
                  End date
                </label>
                <input
                  id="event-end-date-input"
                  type="date"
                  value={endDateKey}
                  onChange={(e) => setEndDateKey(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {!allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="event-start-time-input"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Start time
                  </label>
                  <input
                    id="event-start-time-input"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="event-end-time-input"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    End time
                  </label>
                  <input
                    id="event-end-time-input"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            ) : null}

            {/* Repeat / Recurrence */}
            <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="event-repeat-select"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    <span>Repeat</span>
                  </label>
                  <select
                    id="event-repeat-select"
                    value={repeatPreset}
                    onChange={(e) => {
                      const next = e.target.value as RepeatPreset;
                      setRepeatPreset(next);
                      setCustomTouched(true);
                      if (next === 'custom' && customWeekdays.length === 0) {
                        setCustomWeekdays([startWeekdayCode]);
                      }
                    }}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Every weekday (Mon – Fri)</option>
                    <option value="weekly">Weekly on {startWeekdayName}</option>
                    <option value="biweekly">
                      Every 2 weeks on {startWeekdayName}
                    </option>
                    <option value="monthly">
                      Monthly on day {startDayOfMonth}
                    </option>
                    <option value="yearly">Annually</option>
                    <option value="custom">Custom…</option>
                  </select>
                </div>

                {repeatPreset !== 'none' ? (
                  <div className="space-y-1">
                    <label
                      htmlFor="event-repeat-until"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Ends on (optional)
                    </label>
                    <input
                      id="event-repeat-until"
                      type="date"
                      value={untilDateKey}
                      min={startDateKey}
                      onChange={(e) => {
                        setCustomTouched(true);
                        setUntilDateKey(e.target.value);
                      }}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ) : null}
              </div>

              {repeatPreset === 'custom' ? (
                <div className="space-y-2.5 border-t border-border/70 pt-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      aria-label="Repeat interval"
                      value={customInterval}
                      onChange={(e) => {
                        setCustomTouched(true);
                        const n = Number.parseInt(e.target.value, 10);
                        setCustomInterval(
                          Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1,
                        );
                      }}
                      className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center text-xs text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <select
                      aria-label="Repeat frequency"
                      value={customFreq}
                      onChange={(e) => {
                        setCustomTouched(true);
                        setCustomFreq(e.target.value as RecurrenceFreq);
                      }}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    >
                      <option value="DAILY">
                        {customInterval === 1 ? 'day' : 'days'}
                      </option>
                      <option value="WEEKLY">
                        {customInterval === 1 ? 'week' : 'weeks'}
                      </option>
                      <option value="MONTHLY">
                        {customInterval === 1 ? 'month' : 'months'}
                      </option>
                      <option value="YEARLY">
                        {customInterval === 1 ? 'year' : 'years'}
                      </option>
                    </select>
                  </div>

                  {customFreq === 'WEEKLY' ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {WEEKDAY_CODES_MONDAY_FIRST.map((code) => {
                        const selected = customWeekdays.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => handleToggleWeekday(code)}
                            className={cn(
                              'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {WEEKDAY_SHORT_NAMES[code]}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {computedRrule ? (
                <p className="text-[11px] text-muted-foreground">
                  {formatRruleLabel(computedRrule, startDateKey)}
                </p>
              ) : null}
            </div>

            {/* Category & Subtle Color */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="event-category-select"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Category
                </label>
                <select
                  id="event-category-select"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as EventCategory)
                  }
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  {EVENT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="event-color-select"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Accent color
                </label>
                <select
                  id="event-color-select"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  {EVENT_COLOR_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="event-location-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Location
              </label>
              <input
                id="event-location-input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Room, link, or place (optional)"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="event-desc-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Description
              </label>
              <textarea
                id="event-desc-input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Agenda, notes, or preparation details…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Linked Notes */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Linked Notes
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={creatingNote}
                    onClick={() => void handleCreateNoteForEvent()}
                    className="h-7 px-2 text-[11px]"
                  >
                    <FilePlus2 className="h-3 w-3" aria-hidden="true" />
                    <span>{creatingNote ? 'Creating…' : 'Create note'}</span>
                  </Button>
                  <select
                    aria-label="Link note to event"
                    value={notePickerId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !linkedNoteIds.includes(val)) {
                        setLinkedNoteIds((prev) => [...prev, val]);
                      }
                      setNotePickerId('');
                    }}
                    disabled={availableNotesToLink.length === 0}
                    className="h-7 max-w-[180px] rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">
                      {availableNotesToLink.length > 0
                        ? '+ Link existing note…'
                        : 'No other notes'}
                    </option>
                    {availableNotesToLink.map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {linkedNoteIds.length > 0 ? (
                <div className="space-y-1">
                  {linkedNoteIds.map((noteId) => {
                    const linkedNote = notesById.get(noteId);
                    return (
                      <div
                        key={noteId}
                        className="flex items-center justify-between rounded border border-border bg-background/60 px-2.5 py-1.5 text-xs"
                      >
                        {linkedNote ? (
                          <Link
                            to={`/notes/${linkedNote.id}`}
                            onClick={onClose}
                            className="flex min-w-0 items-center gap-1.5 font-medium text-foreground hover:underline"
                          >
                            <FileText
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="truncate">{linkedNote.title}</span>
                            <ExternalLink
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Deleted note ({noteId.slice(0, 8)}…)
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setLinkedNoteIds((prev) =>
                              prev.filter((id) => id !== noteId),
                            )
                          }
                          aria-label="Unlink note"
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Linked Tasks */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Linked Tasks
                </span>
                <select
                  aria-label="Link task to event"
                  value={taskPickerId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !linkedTaskIds.includes(val)) {
                      setLinkedTaskIds((prev) => [...prev, val]);
                    }
                    setTaskPickerId('');
                  }}
                  disabled={availableTasksToLink.length === 0}
                  className="h-7 max-w-[210px] rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  <option value="">
                    {availableTasksToLink.length > 0
                      ? '+ Link a task…'
                      : 'No other tasks'}
                  </option>
                  {availableTasksToLink.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </div>

              {linkedTaskIds.length > 0 ? (
                <div className="space-y-1">
                  {linkedTaskIds.map((taskId) => {
                    const linkedTask = tasksById.get(taskId);
                    return (
                      <div
                        key={taskId}
                        className="flex items-center justify-between rounded border border-border bg-background/60 px-2.5 py-1.5 text-xs"
                      >
                        {linkedTask ? (
                          <Link
                            to={`/tasks?taskId=${linkedTask.id}`}
                            onClick={onClose}
                            className={cn(
                              'flex min-w-0 items-center gap-1.5 font-medium hover:underline',
                              linkedTask.status === 'done'
                                ? 'text-muted-foreground line-through'
                                : 'text-foreground',
                            )}
                          >
                            <CheckSquare
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="truncate">{linkedTask.title}</span>
                            <ExternalLink
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Deleted task ({taskId.slice(0, 8)}…)
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setLinkedTaskIds((prev) =>
                              prev.filter((id) => id !== taskId),
                            )
                          }
                          aria-label="Unlink task"
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="shrink-0 space-y-3 border-t border-border bg-card px-5 py-3">
            {confirmDelete && event ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Delete &ldquo;{event.title}&rdquo;?
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={submitting}
                    onClick={() => void handleConfirmDelete()}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Confirm delete
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              {event && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {event ? 'Save changes' : 'Create event'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
