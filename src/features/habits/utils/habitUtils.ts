import {
  addDays,
  formatLocalDateKey,
  getTodayDateKey,
  parseDateKeyToLocal,
} from '@/features/calendar/utils/calendarDateUtils';
import type {
  HabitAccentColor,
  HabitCategory,
  HabitFrequency,
  HabitLogRecord,
  HabitRecord,
} from '@/services';

export const HABIT_CATEGORIES: readonly HabitCategory[] = [
  'Study',
  'Health',
  'Focus',
  'Personal',
];

export const HABIT_FREQUENCIES: readonly {
  id: HabitFrequency;
  label: string;
}[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'custom_days', label: 'Custom' },
];

export const WEEKDAY_LABELS_MON_FIRST: readonly {
  dayIndex: number;
  label: string;
  shortLabel: string;
}[] = [
  { dayIndex: 1, label: 'Mon', shortLabel: 'M' },
  { dayIndex: 2, label: 'Tue', shortLabel: 'T' },
  { dayIndex: 3, label: 'Wed', shortLabel: 'W' },
  { dayIndex: 4, label: 'Thu', shortLabel: 'T' },
  { dayIndex: 5, label: 'Fri', shortLabel: 'F' },
  { dayIndex: 6, label: 'Sat', shortLabel: 'S' },
  { dayIndex: 0, label: 'Sun', shortLabel: 'S' },
];

export interface HabitAccentMeta {
  readonly id: HabitAccentColor;
  readonly label: string;
  readonly dotClass: string;
  readonly ringClass: string;
  readonly checkedCircleClass: string;
  readonly heatTileClass: string;
  readonly pillClass: string;
}

export const HABIT_ACCENT_OPTIONS: readonly HabitAccentMeta[] = [
  {
    id: 'sage',
    label: 'Sage',
    dotClass: 'bg-[#74a88e]',
    ringClass: 'ring-[#74a88e]/45',
    checkedCircleClass:
      'border-[#74a88e]/65 bg-[#74a88e]/20 text-[#9ad0b5]',
    heatTileClass: 'bg-[#74a88e]/65 border-[#74a88e]/45',
    pillClass: 'border-[#74a88e]/35 bg-[#74a88e]/15 text-[#9ad0b5]',
  },
  {
    id: 'amber',
    label: 'Amber',
    dotClass: 'bg-[#d9a04e]',
    ringClass: 'ring-[#d9a04e]/45',
    checkedCircleClass:
      'border-[#d9a04e]/65 bg-[#d9a04e]/20 text-[#f0c27b]',
    heatTileClass: 'bg-[#d9a04e]/65 border-[#d9a04e]/45',
    pillClass: 'border-[#d9a04e]/35 bg-[#d9a04e]/15 text-[#f0c27b]',
  },
  {
    id: 'blue',
    label: 'Blue',
    dotClass: 'bg-[#5c9cc4]',
    ringClass: 'ring-[#5c9cc4]/45',
    checkedCircleClass:
      'border-[#5c9cc4]/65 bg-[#5c9cc4]/20 text-[#96cae8]',
    heatTileClass: 'bg-[#5c9cc4]/65 border-[#5c9cc4]/45',
    pillClass: 'border-[#5c9cc4]/35 bg-[#5c9cc4]/15 text-[#96cae8]',
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    dotClass: 'bg-[#d97757]',
    ringClass: 'ring-[#d97757]/45',
    checkedCircleClass:
      'border-[#d97757]/65 bg-[#d97757]/20 text-[#f0a287]',
    heatTileClass: 'bg-[#d97757]/65 border-[#d97757]/45',
    pillClass: 'border-[#d97757]/35 bg-[#d97757]/15 text-[#f0a287]',
  },
  {
    id: 'violet',
    label: 'Violet',
    dotClass: 'bg-[#9480c9]',
    ringClass: 'ring-[#9480c9]/45',
    checkedCircleClass:
      'border-[#9480c9]/65 bg-[#9480c9]/20 text-[#bfb2e6]',
    heatTileClass: 'bg-[#9480c9]/65 border-[#9480c9]/45',
    pillClass: 'border-[#9480c9]/35 bg-[#9480c9]/15 text-[#bfb2e6]',
  },
];

export function getHabitAccentMeta(accent: HabitAccentColor): HabitAccentMeta {
  return (
    HABIT_ACCENT_OPTIONS.find((opt) => opt.id === accent) ??
    HABIT_ACCENT_OPTIONS[0]!
  );
}

/**
 * Returns 7 local `YYYY-MM-DD` keys ordered Monday through Sunday containing `anchorDateKey`.
 */
export function getWeekDateKeys(
  anchorDateKey: string = getTodayDateKey(),
): string[] {
  const anchor = parseDateKeyToLocal(anchorDateKey);
  const dayOfWeek = anchor.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + diffToMonday,
  );
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + i,
    );
    return formatLocalDateKey(d);
  });
}

/**
 * Returns the last 30 local `YYYY-MM-DD` date keys ending on `todayKey` (oldest -> newest).
 */
export function getLast30DateKeys(
  todayKey: string = getTodayDateKey(),
): string[] {
  return Array.from({ length: 30 }, (_, idx) => addDays(todayKey, idx - 29));
}

export function isHabitScheduledOnDate(
  habit: Pick<HabitRecord, 'frequency' | 'targetDays'>,
  dateKey: string,
): boolean {
  const dayIdx = parseDateKeyToLocal(dateKey).getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return dayIdx >= 1 && dayIdx <= 5;
  return habit.targetDays.includes(dayIdx);
}

export function buildHabitCompletedSetMap(
  logs: readonly HabitLogRecord[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const log of logs) {
    let set = map.get(log.habitId);
    if (!set) {
      set = new Set<string>();
      map.set(log.habitId, set);
    }
    set.add(log.completedDate);
  }
  return map;
}

/**
 * Computes consecutive completed scheduled days up to `todayKey`.
 * Leaving `todayKey` unchecked keeps a streak active through yesterday; missing a
 * prior scheduled day breaks the streak, while non-scheduled rest days are skipped.
 */
export function calculateHabitStreak(
  habit: Pick<HabitRecord, 'frequency' | 'targetDays'>,
  completedDates: ReadonlySet<string>,
  todayKey: string = getTodayDateKey(),
): number {
  if (completedDates.size === 0) return 0;

  let streak = 0;
  let cursor = todayKey;

  if (completedDates.has(todayKey)) {
    streak = 1;
    cursor = addDays(todayKey, -1);
  } else {
    cursor = addDays(todayKey, -1);
  }

  for (let steps = 0; steps < 3650; steps += 1) {
    if (completedDates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isHabitScheduledOnDate(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  return streak;
}

/**
 * Computes scheduled completion percentage (`0`–`100`) over the trailing `windowDays` window.
 */
export function calculateHabitCompletionRate(
  habit: Pick<HabitRecord, 'frequency' | 'targetDays'>,
  completedDates: ReadonlySet<string>,
  todayKey: string = getTodayDateKey(),
  windowDays = 30,
): number {
  let scheduledCount = 0;
  let completedCount = 0;

  for (let i = 0; i < windowDays; i += 1) {
    const key = addDays(todayKey, -i);
    if (isHabitScheduledOnDate(habit, key)) {
      scheduledCount += 1;
      if (completedDates.has(key)) {
        completedCount += 1;
      }
    }
  }

  if (scheduledCount === 0) return 0;
  return Math.min(100, Math.round((completedCount / scheduledCount) * 100));
}

export function formatShortHabitWeekRange(weekKeys: readonly string[]): string {
  if (weekKeys.length === 0) return '';
  const first = parseDateKeyToLocal(weekKeys[0]!);
  const last = parseDateKeyToLocal(weekKeys[weekKeys.length - 1]!);
  const startLabel = first.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = last.toLocaleDateString(undefined, {
    month: first.getMonth() === last.getMonth() ? undefined : 'short',
    day: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}
