import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Grid2x2,
  MoreHorizontal,
  Plus,
  Repeat,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import {
  addDays,
  getTodayDateKey,
  parseDateKeyToLocal,
} from '@/features/calendar/utils/calendarDateUtils';
import { HabitEditorDialog } from './components/HabitEditorDialog';
import { useHabitsStore } from './stores/useHabitsStore';
import {
  buildHabitCompletedSetMap,
  calculateHabitCompletionRate,
  calculateHabitStreak,
  formatShortHabitWeekRange,
  getHabitAccentMeta,
  getLast30DateKeys,
  getWeekDateKeys,
  isHabitScheduledOnDate,
  WEEKDAY_LABELS_MON_FIRST,
} from './utils/habitUtils';
import type { HabitRecord } from '@/services';
import { cn } from '@/utils/cn';

const EMPTY_COMPLETED_DATES: ReadonlySet<string> = new Set();

interface HabitMatrixCardProps {
  habit: HabitRecord;
  completedSet: ReadonlySet<string>;
  weekKeys: readonly string[];
  last30Keys: readonly string[];
  todayKey: string;
  heatmapExpanded: boolean;
  onEdit: (habitId: string) => void;
  onToggleCompletion: (habitId: string, dateKey: string) => Promise<void>;
  onToggleHeatmap: (habitId: string) => void;
}

const HabitMatrixCard = memo(function HabitMatrixCard({
  habit,
  completedSet,
  weekKeys,
  last30Keys,
  todayKey,
  heatmapExpanded,
  onEdit,
  onToggleCompletion,
  onToggleHeatmap,
}: HabitMatrixCardProps) {
  const accent = getHabitAccentMeta(habit.accentColor);
  const streak = calculateHabitStreak(habit, completedSet, todayKey);
  const rate = calculateHabitCompletionRate(habit, completedSet, todayKey, 30);

  return (
    <article className="rounded-xl border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-ring/40">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_316px_64px] md:items-center">
        {/* Left: Habit Identity, Category & Streak */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  accent.dotClass,
                )}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => onEdit(habit.id)}
                className="truncate text-left text-sm font-medium text-foreground hover:underline cursor-pointer"
              >
                {habit.title}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4.5">
              <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {habit.category}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                  streak > 0
                    ? accent.pillClass
                    : 'border-border bg-background/50 text-muted-foreground',
                )}
              >
                <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                <span>{streak}d streak</span>
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {rate}% (30d)
              </span>
            </div>
          </div>
        </div>

        {/* Center: 7-Day Interactive Check-In Matrix */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekKeys.map((dateKey, idx) => {
            const isDone = completedSet.has(dateKey);
            const scheduled = isHabitScheduledOnDate(habit, dateKey);
            const isToday = dateKey === todayKey;
            const dayLabel = WEEKDAY_LABELS_MON_FIRST[idx]?.label ?? dateKey;

            return (
              <div
                key={dateKey}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    'text-[10px] md:hidden',
                    isToday
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {dayLabel}
                </span>
                <button
                  type="button"
                  onClick={() => void onToggleCompletion(habit.id, dateKey)}
                  aria-pressed={isDone}
                  aria-label={`${habit.title} on ${dateKey}`}
                  title={`${dateKey}${!scheduled ? ' (Rest day)' : ''}`}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border transition-all cursor-pointer',
                    isDone
                      ? accent.checkedCircleClass
                      : scheduled
                        ? isToday
                          ? 'border-primary/60 bg-background hover:bg-accent/60'
                          : 'border-border bg-background hover:border-foreground/35'
                        : 'border-dashed border-border/60 bg-transparent opacity-50 hover:opacity-85',
                  )}
                >
                  {isDone ? (
                    <Check
                      className="h-3.5 w-3.5 stroke-[2.5]"
                      aria-hidden="true"
                    />
                  ) : isToday ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>

        {/* Right: 30-Day Grid Toggle + Edit */}
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onToggleHeatmap(habit.id)}
            aria-expanded={heatmapExpanded}
            aria-label={`Toggle 30-day consistency grid for ${habit.title}`}
            title="30-day consistency grid"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer',
              heatmapExpanded && 'border-border bg-accent text-foreground',
            )}
          >
            <Grid2x2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(habit.id)}
            aria-label={`Edit ${habit.title}`}
            title="Edit habit"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Collapsible 30-Day Consistency Strip */}
      {heatmapExpanded ? (
        <div
          className="mt-3 border-t border-border/70 pt-2.5"
          data-testid={`habit-heatmap-${habit.id}`}
        >
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Last 30 days consistency</span>
            <span className="tabular-nums">{rate}% scheduled days</span>
          </div>
          <div className="grid grid-cols-15 sm:grid-cols-30 gap-1">
            {last30Keys.map((dayKey) => {
              const isDone = completedSet.has(dayKey);
              const scheduled = isHabitScheduledOnDate(habit, dayKey);
              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => void onToggleCompletion(habit.id, dayKey)}
                  title={`${dayKey}${isDone ? ' · Completed' : scheduled ? ' · Missed' : ' · Rest day'}`}
                  aria-label={`${habit.title} ${dayKey}`}
                  className={cn(
                    'h-3 w-full rounded-[3px] border transition-colors cursor-pointer',
                    isDone
                      ? accent.heatTileClass
                      : scheduled
                        ? 'border-border bg-background/80 hover:border-foreground/30'
                        : 'border-border/40 bg-transparent opacity-45',
                  )}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
});

/**
 * Minimalist desktop Habit Tracker featuring a 7-day interactive check-in matrix,
 * streak & completion stats, collapsible 30-day consistency heatmaps, and CRUD modal.
 */
export function HabitsPage() {
  const {
    habits,
    logs,
    initialized,
    loading,
    showArchived,
    editorOpen,
    editingHabitId,
    initialize,
    setShowArchived,
    openCreateModal,
    openEditModal,
    closeEditor,
    createHabit,
    updateHabit,
    toggleArchiveHabit,
    deleteHabit,
    toggleCompletion,
  } = useHabitsStore();

  const todayKey = getTodayDateKey();
  const [weekAnchorKey, setWeekAnchorKey] = useState(todayKey);
  const [expandedHeatmaps, setExpandedHeatmaps] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialized, initialize]);

  const weekKeys = useMemo(
    () => getWeekDateKeys(weekAnchorKey),
    [weekAnchorKey],
  );
  const weekRangeLabel = useMemo(
    () => formatShortHabitWeekRange(weekKeys),
    [weekKeys],
  );
  const last30Keys = useMemo(() => getLast30DateKeys(todayKey), [todayKey]);

  const completedMap = useMemo(() => buildHabitCompletedSetMap(logs), [logs]);

  const activeHabits = useMemo(
    () => habits.filter((h) => !h.isArchived),
    [habits],
  );
  const visibleHabits = useMemo(
    () => habits.filter((h) => (showArchived ? h.isArchived : !h.isArchived)),
    [habits, showArchived],
  );
  const archivedCount = useMemo(
    () => habits.filter((h) => h.isArchived).length,
    [habits],
  );

  const todaySummary = useMemo(() => {
    const scheduledToday = activeHabits.filter((h) =>
      isHabitScheduledOnDate(h, todayKey),
    );
    const doneToday = scheduledToday.filter((h) =>
      completedMap.get(h.id)?.has(todayKey),
    ).length;
    return {
      done: doneToday,
      total: scheduledToday.length,
    };
  }, [activeHabits, completedMap, todayKey]);

  const editingHabit = useMemo(
    () =>
      editingHabitId ? habits.find((h) => h.id === editingHabitId) ?? null : null,
    [habits, editingHabitId],
  );

  const toggleHeatmap = useCallback((habitId: string) => {
    setExpandedHeatmaps((prev) => ({
      ...prev,
      [habitId]: !prev[habitId],
    }));
  }, []);

  if (loading && !initialized) {
    return <LoadingState label="Loading Habits…" />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Habits"
        subtitle={
          activeHabits.length > 0
            ? `${weekRangeLabel} · ${todaySummary.done}/${todaySummary.total} completed today`
            : `${weekRangeLabel} · Daily & weekly consistency tracker`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setWeekAnchorKey((k) => addDays(k, -7))}
                aria-label="Previous week"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setWeekAnchorKey(todayKey)}
                className="px-2.5 text-xs font-medium text-foreground hover:text-primary cursor-pointer"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setWeekAnchorKey((k) => addDays(k, 7))}
                aria-label="Next week"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {archivedCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant={showArchived ? 'subtle' : 'outline'}
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>
                  {showArchived ? 'Active' : `Archived (${archivedCount})`}
                </span>
              </Button>
            ) : null}

            <Button type="button" size="sm" onClick={openCreateModal}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Habit</span>
            </Button>
          </div>
        }
      />

      {visibleHabits.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={showArchived ? 'No archived habits' : 'No habits yet'}
          description={
            showArchived
              ? 'Archived habits appear here so your past streaks stay intact.'
              : 'Create a daily or weekday ritual and track your consistency cleanly.'
          }
          action={
            showArchived ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowArchived(false)}
              >
                Back to Active Habits
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openCreateModal}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Create first habit</span>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3" data-testid="habits-matrix">
          {/* 7-Day Column Header Row */}
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_316px_64px] items-center gap-3 px-4 text-[11px] font-medium text-muted-foreground">
            <span>Habit</span>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {weekKeys.map((dateKey, idx) => {
                const isToday = dateKey === todayKey;
                const dayNum = parseDateKeyToLocal(dateKey).getDate();
                const dayLabel = WEEKDAY_LABELS_MON_FIRST[idx]?.label ?? '';
                return (
                  <div
                    key={dateKey}
                    className={cn(
                      'flex flex-col items-center rounded-md py-1',
                      isToday && 'bg-primary/10 text-primary font-semibold',
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-wider">
                      {dayLabel}
                    </span>
                    <span className="text-[11px] tabular-nums">{dayNum}</span>
                  </div>
                );
              })}
            </div>
            <span className="text-right">Details</span>
          </div>

          {visibleHabits.map((habit) => (
            <HabitMatrixCard
              key={habit.id}
              habit={habit}
              completedSet={completedMap.get(habit.id) ?? EMPTY_COMPLETED_DATES}
              weekKeys={weekKeys}
              last30Keys={last30Keys}
              todayKey={todayKey}
              heatmapExpanded={Boolean(expandedHeatmaps[habit.id])}
              onEdit={openEditModal}
              onToggleCompletion={toggleCompletion}
              onToggleHeatmap={toggleHeatmap}
            />
          ))}
        </div>
      )}

      <HabitEditorDialog
        open={editorOpen}
        habit={editingHabit}
        onSave={async (payload) => {
          if (editingHabit) {
            await updateHabit(editingHabit.id, payload);
          } else {
            await createHabit(payload);
          }
        }}
        onToggleArchive={async (id) => {
          await toggleArchiveHabit(id);
        }}
        onDelete={deleteHabit}
        onClose={closeEditor}
      />
    </div>
  );
}
