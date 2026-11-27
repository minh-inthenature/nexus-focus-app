import type {
  CalendarEventRecord,
  EventCategory,
  EventColor,
} from '@/services/storage/db';

export type EventColorKey = EventColor | 'default' | 'emerald';

export const DEFAULT_EVENT_COLOR: EventColor = 'blue';

export interface CategoryMeta {
  readonly id: EventCategory;
  readonly label: string;
  readonly defaultColor: EventColor;
}

export const EVENT_CATEGORIES: readonly CategoryMeta[] = [
  { id: 'personal', label: 'Personal', defaultColor: 'blue' },
  { id: 'work', label: 'Work', defaultColor: 'violet' },
  { id: 'study', label: 'Study', defaultColor: 'sage' },
  { id: 'meeting', label: 'Meeting', defaultColor: 'amber' },
  { id: 'other', label: 'Other', defaultColor: 'rose' },
];

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  personal: 'Personal',
  work: 'Work',
  study: 'Study',
  meeting: 'Meeting',
  other: 'Other',
};

export interface EventColorOption {
  readonly id: EventColor;
  readonly label: string;
  readonly swatchClass: string;
  readonly surfaceClass: string;
  readonly badgeClass: string;
}

export const EVENT_COLOR_OPTIONS: readonly EventColorOption[] = [
  {
    id: 'blue',
    label: 'Ocean Blue',
    swatchClass: 'bg-sky-400',
    surfaceClass:
      'border-sky-400/35 bg-sky-500/15 text-sky-950 dark:text-sky-100',
    badgeClass:
      'border-sky-400/40 bg-sky-500/20 text-sky-800 dark:text-sky-200',
  },
  {
    id: 'sage',
    label: 'Sage Green',
    swatchClass: 'bg-emerald-400',
    surfaceClass:
      'border-emerald-400/35 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
    badgeClass:
      'border-emerald-400/40 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200',
  },
  {
    id: 'amber',
    label: 'Warm Amber',
    swatchClass: 'bg-amber-400',
    surfaceClass:
      'border-amber-400/35 bg-amber-500/15 text-amber-950 dark:text-amber-100',
    badgeClass:
      'border-amber-400/40 bg-amber-500/20 text-amber-800 dark:text-amber-200',
  },
  {
    id: 'rose',
    label: 'Muted Rose',
    swatchClass: 'bg-rose-400',
    surfaceClass:
      'border-rose-400/35 bg-rose-500/15 text-rose-950 dark:text-rose-100',
    badgeClass:
      'border-rose-400/40 bg-rose-500/20 text-rose-800 dark:text-rose-200',
  },
  {
    id: 'violet',
    label: 'Soft Violet',
    swatchClass: 'bg-violet-400',
    surfaceClass:
      'border-violet-400/35 bg-violet-500/15 text-violet-950 dark:text-violet-100',
    badgeClass:
      'border-violet-400/40 bg-violet-500/20 text-violet-800 dark:text-violet-200',
  },
  {
    id: 'slate',
    label: 'Neutral Slate',
    swatchClass: 'bg-slate-400',
    surfaceClass:
      'border-slate-400/35 bg-slate-500/15 text-slate-900 dark:text-slate-100',
    badgeClass:
      'border-slate-400/40 bg-slate-500/20 text-slate-700 dark:text-slate-200',
  },
];

/**
 * Resolves a stored or legacy event color into one of the canonical dark-mode palette keys.
 */
export function resolveEventColor(
  category: EventCategory,
  color?: string,
): EventColor {
  if (color === 'emerald') return 'sage';
  if (color && EVENT_COLOR_OPTIONS.some((opt) => opt.id === color)) {
    return color as EventColor;
  }
  if (color === undefined || color === 'default') {
    return EVENT_CATEGORIES.find((c) => c.id === category)?.defaultColor ?? DEFAULT_EVENT_COLOR;
  }
  return DEFAULT_EVENT_COLOR;
}

export function getEventAccentClasses(
  category: EventCategory,
  color?: string,
): { surfaceClass: string; badgeClass: string; swatchClass: string } {
  const resolvedKey = resolveEventColor(category, color);
  const option =
    EVENT_COLOR_OPTIONS.find((opt) => opt.id === resolvedKey) ??
    EVENT_COLOR_OPTIONS[0]!;

  return {
    surfaceClass: option.surfaceClass,
    badgeClass: option.badgeClass,
    swatchClass: option.swatchClass,
  };
}

/**
 * Returns the current local `YYYY-MM-DD` date key and vertical grid percentage (`0`–`100`).
 */
export function getLocalTimePosition(now: Date = new Date()): {
  dateKey: string;
  hour: number;
  minutesFromMidnight: number;
  topPercent: number;
} {
  const hour = now.getHours();
  const minutesFromMidnight = hour * 60 + now.getMinutes();
  const topPercent = ((hour + now.getMinutes() / 60) / 24) * 100;
  return {
    dateKey: formatLocalDateKey(now),
    hour,
    minutesFromMidnight,
    topPercent,
  };
}

export const WEEKDAY_LABELS: readonly string[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_RE.test(dateKey)) return false;
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y &&
    probe.getMonth() === m - 1 &&
    probe.getDate() === d
  );
}

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKeyToLocal(dateKey: string): Date {
  if (!isValidDateKey(dateKey)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  const [yStr, mStr, dStr] = dateKey.split('-');
  return new Date(Number(yStr), Number(mStr) - 1, Number(dStr), 0, 0, 0, 0);
}

export function getTodayDateKey(): string {
  return formatLocalDateKey(new Date());
}

export function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function addDays(dateKey: string, delta: number): string {
  const local = parseDateKeyToLocal(dateKey);
  local.setDate(local.getDate() + delta);
  return formatLocalDateKey(local);
}

export function addMonths(dateKey: string, delta: number): string {
  const local = parseDateKeyToLocal(dateKey);
  const targetDay = local.getDate();
  const targetMonth = local.getMonth() + delta;
  const firstOfTarget = new Date(local.getFullYear(), targetMonth, 1);
  const lastDayOfTarget = new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth() + 1,
    0,
  ).getDate();
  return formatLocalDateKey(
    new Date(
      firstOfTarget.getFullYear(),
      firstOfTarget.getMonth(),
      Math.min(targetDay, lastDayOfTarget),
    ),
  );
}

/**
 * Returns Monday (`YYYY-MM-DD`) of the week containing `dateKey`.
 */
export function getStartOfWeek(dateKey: string): string {
  const local = parseDateKeyToLocal(dateKey);
  const day = local.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diffToMonday);
  return formatLocalDateKey(local);
}

export function getWeekDates(dateKey: string): string[] {
  const monday = getStartOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Returns a 6x7 (42-day) Monday-first grid covering the month containing `dateKey`.
 */
export function getMonthGridDates(dateKey: string): string[] {
  const local = parseDateKeyToLocal(dateKey);
  const firstOfMonth = formatLocalDateKey(
    new Date(local.getFullYear(), local.getMonth(), 1),
  );
  const gridStart = getStartOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function formatMonthYearLabel(dateKey: string): string {
  return parseDateKeyToLocal(dateKey).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function formatDayHeaderLabel(dateKey: string): string {
  return parseDateKeyToLocal(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDateLabel(dateKey: string): string {
  return parseDateKeyToLocal(dateKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatWeekRangeLabel(weekDates: readonly string[]): string {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  if (!first || !last) return '';
  const d1 = parseDateKeyToLocal(first);
  const d2 = parseDateKeyToLocal(last);
  const startText = d1.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endText = d2.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startText} – ${endText}`;
}

export function formatLocalTimeHHMM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '09:00';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatTimeDisplay(iso: string): string {
  return formatLocalTimeHHMM(iso);
}

export function formatEventTimeRangeLabel(
  event: Pick<CalendarEventRecord, 'allDay' | 'startAt' | 'endAt'>,
): string {
  if (event.allDay) {
    const startKey = event.startAt.slice(0, 10);
    const endKey = event.endAt.slice(0, 10);
    return startKey === endKey ? 'All day' : `All day (${startKey} → ${endKey})`;
  }
  return `${formatTimeDisplay(event.startAt)} – ${formatTimeDisplay(event.endAt)}`;
}

/**
 * Canonical UTC boundary builder for all-day events.
 * Preserves exact calendar date keys regardless of the viewer's local timezone or DST.
 */
export function buildAllDayRange(
  startDateKey: string,
  endDateKey: string,
): { startAt: string; endAt: string } {
  return {
    startAt: `${startDateKey}T00:00:00.000Z`,
    endAt: `${endDateKey}T23:59:59.999Z`,
  };
}

/**
 * Converts local wall-clock date keys (`YYYY-MM-DD`) and times (`HH:mm`) into UTC ISO 8601.
 */
export function buildTimedRange(
  startDateKey: string,
  startTimeHHMM: string,
  endDateKey: string,
  endTimeHHMM: string,
): { startAt: string; endAt: string } {
  const startBase = parseDateKeyToLocal(startDateKey);
  const [shStr = '09', smStr = '00'] = startTimeHHMM.split(':');
  startBase.setHours(Number(shStr), Number(smStr), 0, 0);

  const endBase = parseDateKeyToLocal(endDateKey);
  const [ehStr = '10', emStr = '00'] = endTimeHHMM.split(':');
  endBase.setHours(Number(ehStr), Number(emStr), 0, 0);

  return {
    startAt: startBase.toISOString(),
    endAt: endBase.toISOString(),
  };
}

export function addOneHourHHMM(timeHHMM: string): {
  time: string;
  dayOffset: number;
} {
  const [hStr = '09', mStr = '00'] = timeHHMM.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const nextH = (h + 1) % 24;
  const dayOffset = h + 1 >= 24 ? 1 : 0;
  return {
    time: `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    dayOffset,
  };
}

export function validateEventRange(
  startAt: string,
  endAt: string,
): string | null {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 'Please provide valid start and end date/times.';
  }
  if (endMs < startMs) {
    return 'Event end time cannot be earlier than start time.';
  }
  return null;
}

export function getEventDateRange(
  event: Pick<CalendarEventRecord, 'allDay' | 'startAt' | 'endAt'>,
): { startDateKey: string; endDateKey: string } {
  if (event.allDay) {
    return {
      startDateKey: event.startAt.slice(0, 10),
      endDateKey: event.endAt.slice(0, 10),
    };
  }
  const startLocal = new Date(event.startAt);
  const endLocal = new Date(event.endAt);
  const startKey = formatLocalDateKey(startLocal);
  let endKey = formatLocalDateKey(endLocal);
  // Treat an exact midnight end (00:00:00.000) on a later day as ending on the previous day
  if (
    endKey > startKey &&
    endLocal.getHours() === 0 &&
    endLocal.getMinutes() === 0 &&
    endLocal.getSeconds() === 0
  ) {
    endKey = addDays(endKey, -1);
  }
  return { startDateKey: startKey, endDateKey: endKey };
}

export function eventOccursOnDate(
  event: Pick<CalendarEventRecord, 'allDay' | 'startAt' | 'endAt'>,
  dateKey: string,
): boolean {
  if (event.allDay) {
    const startKey = event.startAt.slice(0, 10);
    const endKey = event.endAt.slice(0, 10);
    return startKey <= dateKey && dateKey <= endKey;
  }

  const dayStart = parseDateKeyToLocal(dateKey);
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  if (startMs === endMs) {
    return startMs >= dayStartMs && startMs < dayEndMs;
  }
  return startMs < dayEndMs && endMs > dayStartMs;
}

export interface TimedEventSlotMetrics {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly topPercent: number;
  readonly heightPercent: number;
}

export function getTimedEventSlotMetrics(
  event: Pick<CalendarEventRecord, 'startAt' | 'endAt'>,
  dateKey: string,
): TimedEventSlotMetrics {
  const dayStart = parseDateKeyToLocal(dateKey);
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const totalDayMs = Math.max(1, dayEndMs - dayStartMs);

  const clampedStartMs = Math.max(dayStartMs, Date.parse(event.startAt));
  const clampedEndMs = Math.min(dayEndMs, Date.parse(event.endAt));

  const startMinute = Math.max(
    0,
    Math.min(1410, Math.round(((clampedStartMs - dayStartMs) / totalDayMs) * 1440)),
  );
  const rawEndMinute = Math.round(
    ((clampedEndMs - dayStartMs) / totalDayMs) * 1440,
  );
  const endMinute = Math.min(1440, Math.max(startMinute + 30, rawEndMinute));

  return {
    startMinute,
    endMinute,
    topPercent: (startMinute / 1440) * 100,
    heightPercent: ((endMinute - startMinute) / 1440) * 100,
  };
}

export interface TimedEventLayoutItem {
  readonly event: CalendarEventRecord;
  readonly metrics: TimedEventSlotMetrics;
  readonly column: number;
  readonly totalColumns: number;
}

/**
 * Assigns non-overlapping horizontal columns to concurrent timed events on a given date.
 */
export function layoutOverlappingTimedEvents(
  events: readonly CalendarEventRecord[],
  dateKey: string,
): TimedEventLayoutItem[] {
  const timed = events
    .filter((ev) => !ev.allDay && eventOccursOnDate(ev, dateKey))
    .map((event) => ({
      event,
      metrics: getTimedEventSlotMetrics(event, dateKey),
    }))
    .sort((a, b) => {
      if (a.metrics.startMinute !== b.metrics.startMinute) {
        return a.metrics.startMinute - b.metrics.startMinute;
      }
      return b.metrics.endMinute - a.metrics.endMinute;
    });

  if (timed.length === 0) return [];

  // Partition into overlap clusters
  const clusters: (typeof timed)[] = [];
  let currentCluster: typeof timed = [];
  let clusterMaxEnd = -1;

  for (const item of timed) {
    if (currentCluster.length === 0 || item.metrics.startMinute < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.metrics.endMinute);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.metrics.endMinute;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const laidOut: TimedEventLayoutItem[] = [];

  for (const cluster of clusters) {
    const columnEndTimes: number[] = [];
    const assigned: {
      event: CalendarEventRecord;
      metrics: TimedEventSlotMetrics;
      column: number;
    }[] = [];

    for (const item of cluster) {
      let assignedCol = -1;
      for (let col = 0; col < columnEndTimes.length; col += 1) {
        if ((columnEndTimes[col] ?? 0) <= item.metrics.startMinute) {
          assignedCol = col;
          columnEndTimes[col] = item.metrics.endMinute;
          break;
        }
      }
      if (assignedCol === -1) {
        assignedCol = columnEndTimes.length;
        columnEndTimes.push(item.metrics.endMinute);
      }
      assigned.push({
        event: item.event,
        metrics: item.metrics,
        column: assignedCol,
      });
    }

    const totalColumns = Math.max(1, columnEndTimes.length);
    for (const entry of assigned) {
      laidOut.push({
        event: entry.event,
        metrics: entry.metrics,
        column: entry.column,
        totalColumns,
      });
    }
  }

  return laidOut;
}

export interface CalendarFilterOptions {
  readonly searchQuery?: string;
  readonly categoryFilter?: EventCategory | 'all';
  readonly startDateFilter?: string;
  readonly endDateFilter?: string;
  readonly linkedNoteId?: string | null;
  readonly linkedTaskId?: string | null;
}

export function filterCalendarEvents(
  events: readonly CalendarEventRecord[],
  options: CalendarFilterOptions,
): CalendarEventRecord[] {
  const query = options.searchQuery?.trim().toLowerCase() ?? '';
  const cat = options.categoryFilter ?? 'all';
  const startBound = options.startDateFilter?.trim() || '';
  const endBound = options.endDateFilter?.trim() || '';
  const linkedNoteId = options.linkedNoteId || null;
  const linkedTaskId = options.linkedTaskId || null;

  return events
    .filter((ev) => {
      if (cat !== 'all' && ev.category !== cat) return false;
      if (linkedNoteId && !ev.linkedNoteIds.includes(linkedNoteId)) {
        return false;
      }
      if (linkedTaskId && !ev.linkedTaskIds.includes(linkedTaskId)) {
        return false;
      }

      if (query) {
        const titleMatch = ev.title.toLowerCase().includes(query);
        const descMatch = ev.description?.toLowerCase().includes(query) ?? false;
        const locMatch = ev.location?.toLowerCase().includes(query) ?? false;
        if (!titleMatch && !descMatch && !locMatch) return false;
      }

      if (startBound || endBound) {
        const range = getEventDateRange(ev);
        if (startBound && range.endDateKey < startBound) return false;
        if (endBound && range.startDateKey > endBound) return false;
      }

      return true;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
