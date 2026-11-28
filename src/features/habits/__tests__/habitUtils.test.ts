import { describe, expect, it } from 'vitest';
import {
  calculateHabitCompletionRate,
  calculateHabitStreak,
  getLast30DateKeys,
  getWeekDateKeys,
  isHabitScheduledOnDate,
} from '../utils/habitUtils';

describe('habitUtils streak, schedule, and consistency helpers', () => {
  it('computes Monday-Sunday local week keys and 30-day trailing keys accurately', () => {
    // 2026-11-28 is a Saturday
    const week = getWeekDateKeys('2026-11-28');
    expect(week).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);

    const last30 = getLast30DateKeys('2026-11-28');
    expect(last30).toHaveLength(30);
    expect(last30[0]).toBe('2026-10-30');
    expect(last30[29]).toBe('2026-11-28');
  });

  it('respects daily, weekdays, and custom_days schedules', () => {
    const daily = { frequency: 'daily' as const, targetDays: [0, 1, 2, 3, 4, 5, 6] };
    const weekdays = { frequency: 'weekdays' as const, targetDays: [1, 2, 3, 4, 5] };
    const monWedFri = { frequency: 'custom_days' as const, targetDays: [1, 3, 5] };

    // 2026-11-28 = Saturday (6), 2026-11-27 = Friday (5)
    expect(isHabitScheduledOnDate(daily, '2026-11-28')).toBe(true);
    expect(isHabitScheduledOnDate(weekdays, '2026-11-28')).toBe(false);
    expect(isHabitScheduledOnDate(weekdays, '2026-11-27')).toBe(true);
    expect(isHabitScheduledOnDate(monWedFri, '2026-11-27')).toBe(true);
    expect(isHabitScheduledOnDate(monWedFri, '2026-11-26')).toBe(false); // Thu
  });

  it('calculates streaks keeping yesterday active when today is pending and skipping rest days', () => {
    const daily = { frequency: 'daily' as const, targetDays: [0, 1, 2, 3, 4, 5, 6] };
    // Checked Thu + Fri, today Sat still unchecked -> streak = 2
    expect(
      calculateHabitStreak(
        daily,
        new Set(['2026-11-26', '2026-11-27']),
        '2026-11-28',
      ),
    ).toBe(2);

    // Checked Thu + Fri + Sat -> streak = 3
    expect(
      calculateHabitStreak(
        daily,
        new Set(['2026-11-26', '2026-11-27', '2026-11-28']),
        '2026-11-28',
      ),
    ).toBe(3);

    // Weekdays habit completed Thu + Fri; evaluated on Sunday (2026-11-29): Saturday rest day skipped -> streak = 2
    const weekdays = { frequency: 'weekdays' as const, targetDays: [1, 2, 3, 4, 5] };
    expect(
      calculateHabitStreak(
        weekdays,
        new Set(['2026-11-26', '2026-11-27']),
        '2026-11-29',
      ),
    ).toBe(2);

    // Missing a scheduled weekday resets the streak before Friday
    expect(
      calculateHabitStreak(
        weekdays,
        new Set(['2026-11-25', '2026-11-27']),
        '2026-11-29',
      ),
    ).toBe(1);
  });

  it('calculates trailing 30-day scheduled completion rate cleanly', () => {
    const daily = { frequency: 'daily' as const, targetDays: [0, 1, 2, 3, 4, 5, 6] };
    const completed = new Set(['2026-11-26', '2026-11-27', '2026-11-28']);
    expect(
      calculateHabitCompletionRate(daily, completed, '2026-11-28', 3),
    ).toBe(100);
    expect(
      calculateHabitCompletionRate(daily, completed, '2026-11-28', 30),
    ).toBe(10); // 3 / 30 = 10%
  });
});
