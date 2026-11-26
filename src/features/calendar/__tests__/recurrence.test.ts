import { describe, expect, it } from 'vitest';
import { buildAllDayRange } from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord } from '@/services/storage/db';
import {
  buildRrule,
  expandRecurringEventForWindow,
  expandRecurringEventsForWindow,
  formatRruleLabel,
  parseRrule,
} from '../utils/recurrence';

function makeSeries(
  overrides: Partial<CalendarEventRecord> = {},
): CalendarEventRecord {
  return {
    id: 'series-1',
    userId: 'local',
    title: 'Weekly Sync',
    startAt: '2026-11-03T09:00:00.000Z',
    endAt: '2026-11-03T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    category: 'meeting',
    linkedNoteIds: [],
    linkedTaskIds: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

describe('RFC 5545 recurrence parser, builder & window expansion', () => {
  it('parses, builds, and formats RRULE labels accurately', () => {
    const rrule = buildRrule({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['WE', 'MO'],
      untilDateKey: '2026-12-31',
    });
    expect(rrule).toContain('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=');

    const parsed = parseRrule(rrule);
    expect(parsed?.freq).toBe('WEEKLY');
    expect(parsed?.interval).toBe(2);
    expect(parsed?.byDay?.map((d) => d.weekday)).toEqual(['MO', 'WE']);
    expect(parsed?.untilDateKey).toBe('2026-12-31');

    expect(formatRruleLabel('FREQ=WEEKLY;BYDAY=TU', '2026-11-03')).toBe(
      'Weekly on Tuesday',
    );
    expect(
      formatRruleLabel('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-11-03'),
    ).toBe('Every weekday');
    expect(formatRruleLabel('FREQ=MONTHLY;BYMONTHDAY=26', '2026-11-26')).toBe(
      'Monthly on day 26',
    );
    expect(formatRruleLabel('FREQ=MONTHLY;BYDAY=2TU')).toBe(
      'Monthly on 2nd Tuesday',
    );
  });

  it('expands weekly Tuesday events across multiple weeks and respects EXDATE & COUNT', () => {
    const allDay = buildAllDayRange('2026-11-03', '2026-11-03'); // Tuesday Nov 3
    const weeklyTuesday = makeSeries({
      allDay: true,
      startAt: allDay.startAt,
      endAt: allDay.endAt,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      exdates: ['2026-11-17'],
    });

    const novOccs = expandRecurringEventForWindow(
      weeklyTuesday,
      '2026-11-01',
      '2026-11-30',
    );
    expect(novOccs.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-11-03',
      '2026-11-10',
      // 2026-11-17 excluded via EXDATE
      '2026-11-24',
    ]);
    expect(novOccs.every((e) => e.id === 'series-1')).toBe(true);

    const withCount = makeSeries({
      allDay: true,
      startAt: allDay.startAt,
      endAt: allDay.endAt,
      rrule: 'FREQ=DAILY;COUNT=3',
    });
    const dailyOccs = expandRecurringEventForWindow(
      withCount,
      '2026-11-01',
      '2026-11-30',
    );
    expect(dailyOccs.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
  });

  it('expands biweekly multi-day, monthly ordinal/day, yearly, and UNTIL limits', () => {
    const startRange = buildAllDayRange('2026-11-02', '2026-11-02'); // Monday Nov 2
    const biweekly = makeSeries({
      allDay: true,
      startAt: startRange.startAt,
      endAt: startRange.endAt,
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR',
    });

    const occs = expandRecurringEventForWindow(
      biweekly,
      '2026-11-01',
      '2026-11-30',
    );
    expect(occs.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-11-02',
      '2026-11-06',
      '2026-11-16',
      '2026-11-20',
      '2026-11-30',
    ]);

    const secondTuesday = makeSeries({
      allDay: true,
      startAt: buildAllDayRange('2026-10-13', '2026-10-13').startAt,
      endAt: buildAllDayRange('2026-10-13', '2026-10-13').endAt,
      rrule: 'FREQ=MONTHLY;BYDAY=2TU;UNTIL=20261231',
    });
    const monthlyOccs = expandRecurringEventForWindow(
      secondTuesday,
      '2026-10-01',
      '2027-02-28',
    );
    expect(monthlyOccs.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-10-13',
      '2026-11-10',
      '2026-12-08',
    ]);

    const yearly = makeSeries({
      allDay: true,
      startAt: buildAllDayRange('2026-11-26', '2026-11-26').startAt,
      endAt: buildAllDayRange('2026-11-26', '2026-11-26').endAt,
      rrule: 'FREQ=YEARLY',
    });
    const yearlyOccs = expandRecurringEventsForWindow(
      [yearly],
      '2026-01-01',
      '2028-12-31',
    );
    expect(yearlyOccs.map((e) => e.startAt.slice(0, 10))).toEqual([
      '2026-11-26',
      '2027-11-26',
      '2028-11-26',
    ]);
  });
});
