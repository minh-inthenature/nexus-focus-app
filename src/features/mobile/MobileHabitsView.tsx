import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, Flame, Plus } from 'lucide-react';
import {
  getTodayDateKey,
  parseDateKeyToLocal,
} from '@/features/calendar/utils/calendarDateUtils';
import { useHabitsStore } from '@/features/habits/stores/useHabitsStore';
import {
  buildHabitCompletedSetMap,
  calculateHabitStreak,
  getHabitAccentMeta,
  getWeekDateKeys,
  isHabitScheduledOnDate,
  WEEKDAY_LABELS_MON_FIRST,
} from '@/features/habits/utils/habitUtils';
import type { HabitRecord } from '@/services';
import { cn } from '@/utils/cn';
import { MobileHabitSheet } from './MobileHabitSheet';

export interface MobileHabitsViewProps {
  externalCreateOpen?: boolean;
  onCloseExternalCreate?: () => void;
}

/**
 * Thumb-friendly mobile Habits tab featuring a compact M–S week strip,
 * large 44px check circles, streak counters, and Edit/Create bottom sheets.
 */
export function MobileHabitsView({
  externalCreateOpen = false,
  onCloseExternalCreate,
}: MobileHabitsViewProps) {
  const habits = useHabitsStore((s) => s.habits);
  const logs = useHabitsStore((s) => s.logs);
  const initialized = useHabitsStore((s) => s.initialized);
  const initialize = useHabitsStore((s) => s.initialize);
  const toggleCompletion = useHabitsStore((s) => s.toggleCompletion);

  const todayKey = getTodayDateKey();
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [showArchived, setShowArchived] = useState(false);
  const [localCreateOpen, setLocalCreateOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitRecord | null>(null);

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialized, initialize]);

  const weekKeys = useMemo(() => getWeekDateKeys(todayKey), [todayKey]);
  const completedMap = useMemo(() => buildHabitCompletedSetMap(logs), [logs]);

  const activeHabits = useMemo(
    () => habits.filter((h) => !h.isArchived),
    [habits],
  );
  const archivedHabits = useMemo(
    () => habits.filter((h) => h.isArchived),
    [habits],
  );
  const visibleHabits = showArchived ? archivedHabits : activeHabits;

  const daySummary = useMemo(() => {
    const scheduled = activeHabits.filter((h) =>
      isHabitScheduledOnDate(h, selectedDateKey),
    );
    const done = scheduled.filter((h) =>
      completedMap.get(h.id)?.has(selectedDateKey),
    ).length;
    return { done, total: scheduled.length };
  }, [activeHabits, completedMap, selectedDateKey]);

  const sheetOpen = externalCreateOpen || localCreateOpen || editingHabit !== null;

  const handleCloseSheet = () => {
    setLocalCreateOpen(false);
    setEditingHabit(null);
    onCloseExternalCreate?.();
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Compact Week Strip */}
      <div
        className="grid grid-cols-7 gap-1 rounded-xl border border-[#1E2623] bg-[#111614] p-1.5"
        role="tablist"
        aria-label="Habit week strip"
      >
        {weekKeys.map((dateKey, idx) => {
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;
          const dayNum = parseDateKeyToLocal(dateKey).getDate();
          const shortLabel = WEEKDAY_LABELS_MON_FIRST[idx]?.shortLabel ?? '';
          return (
            <button
              key={dateKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedDateKey(dateKey)}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg py-1.5 text-xs transition-colors',
                isSelected
                  ? 'bg-[#18221E] text-[#8AB8A3] font-semibold'
                  : isToday
                    ? 'text-[#d97757]'
                    : 'text-[#7E8B85]',
              )}
            >
              <span className="text-[10px] uppercase">{shortLabel}</span>
              <span className="mt-0.5 text-xs tabular-nums">{dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Summary & Quick Create Trigger */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[#E4E8E6]">
            {selectedDateKey === todayKey ? 'Today' : selectedDateKey} ·{' '}
            <span className="text-[#8AB8A3]">
              {daySummary.done}/{daySummary.total} completed
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {archivedHabits.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium',
                showArchived
                  ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3]'
                  : 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
              )}
            >
              <Archive className="h-3 w-3" />
              <span>{showArchived ? 'Active' : `${archivedHabits.length}`}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocalCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#1E2623] bg-[#18221E] px-2.5 py-1.5 text-xs font-medium text-[#8AB8A3]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Habit</span>
          </button>
        </div>
      </div>

      {/* Tactile Habit Cards */}
      {visibleHabits.length === 0 ? (
        <div className="rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-6 text-center text-xs text-[#7E8B85]">
          {showArchived
            ? 'No archived habits.'
            : 'No habits yet. Tap + below to create your first daily ritual.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleHabits.map((habit) => {
            const accent = getHabitAccentMeta(habit.accentColor);
            const completedSet = completedMap.get(habit.id) ?? new Set<string>();
            const isDone = completedSet.has(selectedDateKey);
            const scheduled = isHabitScheduledOnDate(habit, selectedDateKey);
            const streak = calculateHabitStreak(habit, completedSet, todayKey);

            return (
              <div
                key={habit.id}
                className="flex min-h-[56px] items-center gap-1 rounded-xl border border-[#1E2623] bg-[#111614] pr-3 py-1"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleCompletion(habit.id, selectedDateKey);
                  }}
                  aria-pressed={isDone}
                  aria-label={`Toggle ${habit.title} for ${selectedDateKey}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-[#18221E] transition-colors"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                      isDone
                        ? accent.checkedCircleClass
                        : scheduled
                          ? 'border-[#33403A] bg-transparent'
                          : 'border-dashed border-[#2A332F] opacity-60',
                    )}
                  >
                    {isDone && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingHabit(habit)}
                  className="min-w-0 flex-1 py-1.5 text-left"
                >
                  <p className="text-sm font-medium text-[#E4E8E6] truncate">
                    {habit.title}
                  </p>
                  <p className="text-[11px] text-[#7E8B85]">
                    {habit.category}
                    {!scheduled ? ' · Rest day' : ''}
                  </p>
                </button>

                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                    streak > 0
                      ? accent.pillClass
                      : 'border-[#1E2623] bg-[#141A17] text-[#7E8B85]',
                  )}
                >
                  <Flame className="h-3 w-3" />
                  <span>{streak}d</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <MobileHabitSheet
        open={sheetOpen}
        habit={editingHabit}
        onClose={handleCloseSheet}
      />
    </div>
  );
}
