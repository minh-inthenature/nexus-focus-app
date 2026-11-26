import {
  addDays,
  buildAllDayRange,
  formatLocalDateKey,
  getEventDateRange,
  isValidDateKey,
  parseDateKeyToLocal,
} from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord } from '@/services/storage/db';

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RruleByDayRule {
  readonly weekday: WeekdayCode;
  readonly nth?: number;
}

export interface ParsedRrule {
  readonly freq: RecurrenceFreq;
  readonly interval: number;
  readonly byDay?: readonly RruleByDayRule[];
  readonly byMonthDay?: readonly number[];
  readonly count?: number;
  readonly untilDateKey?: string;
  readonly untilMs?: number;
}

export interface BuildRruleOptions {
  readonly freq: RecurrenceFreq;
  readonly interval?: number;
  readonly byDay?: readonly WeekdayCode[];
  readonly byMonthDay?: readonly number[];
  readonly untilDateKey?: string;
  readonly count?: number;
}

export const WEEKDAY_CODES_SUNDAY_FIRST: readonly WeekdayCode[] = [
  'SU',
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
];

export const WEEKDAY_CODES_MONDAY_FIRST: readonly WeekdayCode[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
];

export const WEEKDAY_LONG_NAMES: Record<WeekdayCode, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

export const WEEKDAY_SHORT_NAMES: Record<WeekdayCode, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const VALID_FREQS = new Set<RecurrenceFreq>([
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
]);

const VALID_WEEKDAYS = new Set<WeekdayCode>([
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
]);

const MAX_WINDOW_OCCURRENCES = 500;
const MAX_SERIES_ITERATIONS = 5000;

export function dateKeyToWeekdayCode(dateKey: string): WeekdayCode {
  const local = parseDateKeyToLocal(dateKey);
  return WEEKDAY_CODES_SUNDAY_FIRST[local.getDay()] ?? 'MO';
}

export function dateKeyDayDiff(startKey: string, endKey: string): number {
  const [y1 = 1970, m1 = 1, d1 = 1] = startKey.split('-').map(Number);
  const [y2 = 1970, m2 = 1, d2 = 1] = endKey.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / 86_400_000);
}

function parseUntilToken(raw: string): {
  untilDateKey?: string;
  untilMs?: number;
} {
  const trimmed = raw.trim();
  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const key = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    if (isValidDateKey(key)) {
      const endLocal = parseDateKeyToLocal(key);
      endLocal.setHours(23, 59, 59, 999);
      return { untilDateKey: key, untilMs: endLocal.getTime() };
    }
    return {};
  }

  const dtMatch = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i,
  );
  if (!dtMatch) return {};
  const y = Number(dtMatch[1]);
  const m = Number(dtMatch[2]);
  const d = Number(dtMatch[3]);
  const hh = Number(dtMatch[4]);
  const mm = Number(dtMatch[5]);
  const ss = Number(dtMatch[6]);
  const isUtc = Boolean(dtMatch[7]);

  const instant = isUtc
    ? new Date(Date.UTC(y, m - 1, d, hh, mm, ss, 999))
    : new Date(y, m - 1, d, hh, mm, ss, 999);

  if (Number.isNaN(instant.getTime())) return {};
  return {
    untilDateKey: formatLocalDateKey(instant),
    untilMs: instant.getTime(),
  };
}

/**
 * Parses an RFC 5545 `RRULE` value (e.g. `FREQ=WEEKLY;BYDAY=TU`) into a structured rule.
 */
export function parseRrule(rrule: string): ParsedRrule | null {
  const normalized = rrule.trim().replace(/^RRULE:/i, '');
  if (!normalized) return null;

  let freq: RecurrenceFreq | null = null;
  let interval = 1;
  let byDay: RruleByDayRule[] | undefined;
  let byMonthDay: number[] | undefined;
  let count: number | undefined;
  let untilDateKey: string | undefined;
  let untilMs: number | undefined;

  for (const part of normalized.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim().toUpperCase();
    const val = part.slice(eqIdx + 1).trim();
    if (!val) continue;

    switch (key) {
      case 'FREQ': {
        const upper = val.toUpperCase() as RecurrenceFreq;
        if (VALID_FREQS.has(upper)) {
          freq = upper;
        }
        break;
      }
      case 'INTERVAL': {
        const parsed = Number.parseInt(val, 10);
        if (Number.isFinite(parsed) && parsed >= 1) {
          interval = parsed;
        }
        break;
      }
      case 'BYDAY': {
        const entries: RruleByDayRule[] = [];
        for (const token of val.split(',')) {
          const m = token.trim().toUpperCase().match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
          if (m && VALID_WEEKDAYS.has(m[2] as WeekdayCode)) {
            const nth = m[1] ? Number.parseInt(m[1], 10) : undefined;
            entries.push({
              weekday: m[2] as WeekdayCode,
              ...(nth !== undefined && Number.isFinite(nth) ? { nth } : {}),
            });
          }
        }
        if (entries.length > 0) {
          byDay = entries;
        }
        break;
      }
      case 'BYMONTHDAY': {
        const nums = val
          .split(',')
          .map((t) => Number.parseInt(t.trim(), 10))
          .filter((n) => Number.isFinite(n) && n !== 0 && n >= -31 && n <= 31);
        if (nums.length > 0) {
          byMonthDay = nums;
        }
        break;
      }
      case 'COUNT': {
        const parsed = Number.parseInt(val, 10);
        if (Number.isFinite(parsed) && parsed >= 1) {
          count = parsed;
        }
        break;
      }
      case 'UNTIL': {
        const parsedUntil = parseUntilToken(val);
        untilDateKey = parsedUntil.untilDateKey;
        untilMs = parsedUntil.untilMs;
        break;
      }
      default:
        break;
    }
  }

  if (!freq) return null;

  return {
    freq,
    interval,
    ...(byDay ? { byDay } : {}),
    ...(byMonthDay ? { byMonthDay } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(untilDateKey ? { untilDateKey } : {}),
    ...(untilMs !== undefined ? { untilMs } : {}),
  };
}

/**
 * Serializes structured recurrence choices into a canonical RFC 5545 `RRULE` string.
 */
export function buildRrule(options: BuildRruleOptions): string {
  const parts: string[] = [`FREQ=${options.freq}`];
  const interval = Math.max(1, Math.floor(options.interval ?? 1));
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }
  if (options.byDay && options.byDay.length > 0) {
    const ordered = WEEKDAY_CODES_MONDAY_FIRST.filter((code) =>
      options.byDay!.includes(code),
    );
    if (ordered.length > 0) {
      parts.push(`BYDAY=${ordered.join(',')}`);
    }
  }
  if (options.byMonthDay && options.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${options.byMonthDay.join(',')}`);
  }
  if (options.count !== undefined && options.count >= 1) {
    parts.push(`COUNT=${Math.floor(options.count)}`);
  } else if (options.untilDateKey && isValidDateKey(options.untilDateKey)) {
    const endLocal = parseDateKeyToLocal(options.untilDateKey);
    endLocal.setHours(23, 59, 59, 0);
    const y = endLocal.getUTCFullYear();
    const m = String(endLocal.getUTCMonth() + 1).padStart(2, '0');
    const d = String(endLocal.getUTCDate()).padStart(2, '0');
    const hh = String(endLocal.getUTCHours()).padStart(2, '0');
    const mm = String(endLocal.getUTCMinutes()).padStart(2, '0');
    const ss = String(endLocal.getUTCSeconds()).padStart(2, '0');
    parts.push(`UNTIL=${y}${m}${d}T${hh}${mm}${ss}Z`);
  }
  return parts.join(';');
}

/**
 * Returns a concise human-readable description of an `RRULE` string.
 */
export function formatRruleLabel(
  rrule: string | undefined,
  startDateKey?: string,
): string {
  if (!rrule) return 'Does not repeat';
  const parsed = parseRrule(rrule);
  if (!parsed) return 'Repeats';

  let base = '';
  if (parsed.freq === 'DAILY') {
    base = parsed.interval === 1 ? 'Daily' : `Every ${parsed.interval} days`;
  } else if (parsed.freq === 'WEEKLY') {
    const days = parsed.byDay?.map((d) => d.weekday) ?? [];
    const weekdaysSet = days.join(',');
    if (parsed.interval === 1 && weekdaysSet === 'MO,TU,WE,TH,FR') {
      base = 'Every weekday';
    } else if (days.length === 1 && days[0]) {
      const name = WEEKDAY_LONG_NAMES[days[0]];
      base =
        parsed.interval === 1
          ? `Weekly on ${name}`
          : `Every ${parsed.interval} weeks on ${name}`;
    } else if (days.length > 1) {
      const shortList = days.map((d) => WEEKDAY_SHORT_NAMES[d]).join(', ');
      base =
        parsed.interval === 1
          ? `Weekly on ${shortList}`
          : `Every ${parsed.interval} weeks on ${shortList}`;
    } else if (startDateKey && isValidDateKey(startDateKey)) {
      const name = WEEKDAY_LONG_NAMES[dateKeyToWeekdayCode(startDateKey)];
      base =
        parsed.interval === 1
          ? `Weekly on ${name}`
          : `Every ${parsed.interval} weeks on ${name}`;
    } else {
      base =
        parsed.interval === 1 ? 'Weekly' : `Every ${parsed.interval} weeks`;
    }
  } else if (parsed.freq === 'MONTHLY') {
    const dayNum =
      parsed.byMonthDay?.[0] ??
      (startDateKey && isValidDateKey(startDateKey)
        ? Number(startDateKey.slice(8, 10))
        : undefined);
    const ordinalByDay = parsed.byDay?.[0];
    if (ordinalByDay?.nth !== undefined) {
      const nthLabel =
        ordinalByDay.nth === -1
          ? 'last'
          : `${ordinalByDay.nth}${ordinalByDay.nth === 1 ? 'st' : ordinalByDay.nth === 2 ? 'nd' : ordinalByDay.nth === 3 ? 'rd' : 'th'}`;
      base =
        parsed.interval === 1
          ? `Monthly on ${nthLabel} ${WEEKDAY_LONG_NAMES[ordinalByDay.weekday]}`
          : `Every ${parsed.interval} months`;
    } else if (dayNum !== undefined) {
      base =
        parsed.interval === 1
          ? `Monthly on day ${dayNum}`
          : `Every ${parsed.interval} months on day ${dayNum}`;
    } else {
      base =
        parsed.interval === 1 ? 'Monthly' : `Every ${parsed.interval} months`;
    }
  } else {
    base =
      parsed.interval === 1 ? 'Annually' : `Every ${parsed.interval} years`;
  }

  if (parsed.untilDateKey) {
    return `${base} · until ${parsed.untilDateKey}`;
  }
  if (parsed.count !== undefined) {
    return `${base} · ${parsed.count} times`;
  }
  return base;
}

function getMondayKey(dateKey: string): string {
  const local = parseDateKeyToLocal(dateKey);
  const day = local.getDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  return addDays(dateKey, diffToMon);
}

function resolveMonthCandidates(
  year: number,
  monthZeroBased: number,
  parsed: ParsedRrule,
  defaultDay: number,
): string[] {
  const daysInMonth = new Date(year, monthZeroBased + 1, 0).getDate();
  const monthPrefix = `${String(year).padStart(4, '0')}-${String(monthZeroBased + 1).padStart(2, '0')}`;

  if (parsed.byDay && parsed.byDay.length > 0) {
    const results = new Set<string>();
    for (const rule of parsed.byDay) {
      const matchingDays: number[] = [];
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = `${monthPrefix}-${String(d).padStart(2, '0')}`;
        if (dateKeyToWeekdayCode(key) === rule.weekday) {
          matchingDays.push(d);
        }
      }
      if (rule.nth === undefined) {
        for (const d of matchingDays) {
          results.add(`${monthPrefix}-${String(d).padStart(2, '0')}`);
        }
      } else if (rule.nth > 0) {
        const picked = matchingDays[rule.nth - 1];
        if (picked !== undefined) {
          results.add(`${monthPrefix}-${String(picked).padStart(2, '0')}`);
        }
      } else if (rule.nth < 0) {
        const picked = matchingDays[matchingDays.length + rule.nth];
        if (picked !== undefined) {
          results.add(`${monthPrefix}-${String(picked).padStart(2, '0')}`);
        }
      }
    }
    return Array.from(results).sort();
  }

  const targetDays = parsed.byMonthDay ?? [defaultDay];
  const results = new Set<string>();
  for (const rawDay of targetDays) {
    const day = rawDay > 0 ? rawDay : daysInMonth + 1 + rawDay;
    if (day >= 1 && day <= daysInMonth) {
      results.add(`${monthPrefix}-${String(day).padStart(2, '0')}`);
    }
  }
  return Array.from(results).sort();
}

function buildOccurrenceRecord(
  template: CalendarEventRecord,
  occStartKey: string,
  spanDays: number,
  timedClock: {
    hours: number;
    minutes: number;
    seconds: number;
    ms: number;
    durationMs: number;
  },
): CalendarEventRecord {
  const occEndKey = spanDays > 0 ? addDays(occStartKey, spanDays) : occStartKey;

  if (template.allDay) {
    const range = buildAllDayRange(occStartKey, occEndKey);
    return {
      ...template,
      startAt: range.startAt,
      endAt: range.endAt,
    };
  }

  const occStartLocal = parseDateKeyToLocal(occStartKey);
  occStartLocal.setHours(
    timedClock.hours,
    timedClock.minutes,
    timedClock.seconds,
    timedClock.ms,
  );
  const startAt = occStartLocal.toISOString();
  const endAt = new Date(
    occStartLocal.getTime() + timedClock.durationMs,
  ).toISOString();

  return {
    ...template,
    startAt,
    endAt,
  };
}

/**
 * Expands a single event into all occurrences intersecting `[windowStartKey, windowEndKey]`
 * while preserving the original `event.id` so editing opens the series cleanly.
 */
export function expandRecurringEventForWindow(
  event: CalendarEventRecord,
  windowStartKey: string,
  windowEndKey: string,
): CalendarEventRecord[] {
  if (!event.rrule) {
    return [event];
  }

  const parsed = parseRrule(event.rrule);
  if (!parsed) {
    return [event];
  }

  const { startDateKey: seriesStartKey, endDateKey: seriesEndKey } =
    getEventDateRange(event);
  const spanDays = Math.max(0, dateKeyDayDiff(seriesStartKey, seriesEndKey));
  const exdateSet = new Set(event.exdates ?? []);

  const rawStartMs = Date.parse(event.startAt);
  const rawEndMs = Date.parse(event.endAt);
  const startLocal = new Date(rawStartMs);
  const timedClock = {
    hours: Number.isNaN(startLocal.getTime()) ? 9 : startLocal.getHours(),
    minutes: Number.isNaN(startLocal.getTime()) ? 0 : startLocal.getMinutes(),
    seconds: Number.isNaN(startLocal.getTime()) ? 0 : startLocal.getSeconds(),
    ms: Number.isNaN(startLocal.getTime()) ? 0 : startLocal.getMilliseconds(),
    durationMs:
      !Number.isNaN(rawStartMs) && !Number.isNaN(rawEndMs)
        ? Math.max(0, rawEndMs - rawStartMs)
        : 60 * 60 * 1000,
  };

  const effectiveMaxKey =
    parsed.untilDateKey && parsed.untilDateKey < windowEndKey
      ? parsed.untilDateKey
      : windowEndKey;

  if (effectiveMaxKey < seriesStartKey) {
    return [];
  }

  const expanded: CalendarEventRecord[] = [];
  let emittedRuleCount = 0;
  let iterations = 0;

  const tryEmit = (occStartKey: string): 'stop' | 'continue' => {
    if (occStartKey < seriesStartKey) return 'continue';
    if (occStartKey > effectiveMaxKey) return 'stop';

    if (parsed.untilMs !== undefined && !event.allDay) {
      const occStartLocal = parseDateKeyToLocal(occStartKey);
      occStartLocal.setHours(
        timedClock.hours,
        timedClock.minutes,
        timedClock.seconds,
        timedClock.ms,
      );
      if (occStartLocal.getTime() > parsed.untilMs) {
        return 'stop';
      }
    }

    emittedRuleCount += 1;
    if (parsed.count !== undefined && emittedRuleCount > parsed.count) {
      return 'stop';
    }

    if (!exdateSet.has(occStartKey)) {
      const occEndKey =
        spanDays > 0 ? addDays(occStartKey, spanDays) : occStartKey;
      if (occEndKey >= windowStartKey && occStartKey <= windowEndKey) {
        expanded.push(
          buildOccurrenceRecord(event, occStartKey, spanDays, timedClock),
        );
        if (expanded.length >= MAX_WINDOW_OCCURRENCES) {
          return 'stop';
        }
      }
    }

    return 'continue';
  };

  const windowEarliestRelevant = addDays(windowStartKey, -spanDays);

  if (parsed.freq === 'DAILY') {
    let step = 0;
    if (parsed.count === undefined && windowEarliestRelevant > seriesStartKey) {
      const diff = dateKeyDayDiff(seriesStartKey, windowEarliestRelevant);
      step = Math.max(0, Math.floor(diff / parsed.interval) * parsed.interval);
    }

    while (iterations < MAX_SERIES_ITERATIONS) {
      iterations += 1;
      const candidate = addDays(seriesStartKey, step);
      if (tryEmit(candidate) === 'stop') break;
      step += parsed.interval;
    }
  } else if (parsed.freq === 'WEEKLY') {
    const startMonday = getMondayKey(seriesStartKey);
    const targetDays =
      parsed.byDay && parsed.byDay.length > 0
        ? WEEKDAY_CODES_MONDAY_FIRST.filter((code) =>
            parsed.byDay!.some((d) => d.weekday === code),
          )
        : [dateKeyToWeekdayCode(seriesStartKey)];

    let weekIdx = 0;
    if (parsed.count === undefined && windowEarliestRelevant > startMonday) {
      const dayDiff = dateKeyDayDiff(startMonday, windowEarliestRelevant);
      const weekDiff = Math.floor(dayDiff / 7);
      weekIdx = Math.max(
        0,
        Math.floor(weekDiff / parsed.interval) * parsed.interval,
      );
    }

    outerWeekly: while (iterations < MAX_SERIES_ITERATIONS) {
      iterations += 1;
      const weekMonday = addDays(startMonday, weekIdx * 7);
      if (weekMonday > effectiveMaxKey) break;

      for (const code of targetDays) {
        const offset = WEEKDAY_CODES_MONDAY_FIRST.indexOf(code);
        const candidate = addDays(weekMonday, offset);
        if (tryEmit(candidate) === 'stop') break outerWeekly;
      }

      weekIdx += parsed.interval;
    }
  } else if (parsed.freq === 'MONTHLY') {
    const [startY = 2026, startM = 1, startD = 1] = seriesStartKey
      .split('-')
      .map(Number);
    const baseTotalMonths = startY * 12 + (startM - 1);

    let monthStep = 0;
    if (parsed.count === undefined && windowEarliestRelevant > seriesStartKey) {
      const [winY = startY, winM = startM] = windowEarliestRelevant
        .split('-')
        .map(Number);
      const winTotalMonths = winY * 12 + (winM - 1);
      const monthDiff = Math.max(0, winTotalMonths - baseTotalMonths);
      monthStep = Math.floor(monthDiff / parsed.interval) * parsed.interval;
    }

    outerMonthly: while (iterations < MAX_SERIES_ITERATIONS) {
      iterations += 1;
      const total = baseTotalMonths + monthStep;
      const y = Math.floor(total / 12);
      const m0 = total % 12;
      const firstOfMonth = `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}-01`;
      if (firstOfMonth > effectiveMaxKey) break;

      const candidates = resolveMonthCandidates(y, m0, parsed, startD);
      for (const candidate of candidates) {
        if (tryEmit(candidate) === 'stop') break outerMonthly;
      }

      monthStep += parsed.interval;
    }
  } else if (parsed.freq === 'YEARLY') {
    const [startY = 2026, startM = 1, startD = 1] = seriesStartKey
      .split('-')
      .map(Number);

    let yearStep = 0;
    if (parsed.count === undefined && windowEarliestRelevant > seriesStartKey) {
      const winY = Number(windowEarliestRelevant.slice(0, 4));
      const yearDiff = Math.max(0, winY - startY);
      yearStep = Math.floor(yearDiff / parsed.interval) * parsed.interval;
    }

    while (iterations < MAX_SERIES_ITERATIONS) {
      iterations += 1;
      const y = startY + yearStep;
      const candidate = `${String(y).padStart(4, '0')}-${String(startM).padStart(2, '0')}-${String(startD).padStart(2, '0')}`;
      if (candidate > effectiveMaxKey) break;
      if (isValidDateKey(candidate)) {
        if (tryEmit(candidate) === 'stop') break;
      }
      yearStep += parsed.interval;
    }
  }

  return expanded;
}

/**
 * Expands all events (non-recurring passed through as-is, recurring expanded
 * within `[windowStartKey, windowEndKey]`) sorted chronologically by `startAt`.
 */
export function expandRecurringEventsForWindow(
  events: readonly CalendarEventRecord[],
  windowStartKey: string,
  windowEndKey: string,
): CalendarEventRecord[] {
  const result: CalendarEventRecord[] = [];
  for (const ev of events) {
    if (!ev.rrule) {
      result.push(ev);
    } else {
      result.push(...expandRecurringEventForWindow(ev, windowStartKey, windowEndKey));
    }
  }
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
