import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Repeat,
  Star,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import {
  eventOccursOnDate,
  formatDayHeaderLabel,
  formatEventTimeRangeLabel,
  getEventAccentClasses,
  getTodayDateKey,
} from '@/features/calendar/utils/calendarDateUtils';
import { expandRecurringEventsForWindow } from '@/features/calendar/utils/recurrence';
import { useHabitsStore } from '@/features/habits/stores/useHabitsStore';
import {
  buildHabitCompletedSetMap,
  getHabitAccentMeta,
  isHabitScheduledOnDate,
} from '@/features/habits/utils/habitUtils';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  formatDurationLabel,
  getTodayDateString,
  isTaskDueToday,
  isTaskInBacklog,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type { TaskPriority } from '@/services';
import { cn } from '@/utils/cn';
import { MobileTaskEditSheet } from './MobileTaskEditSheet';

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  high: 'border-[#d97757]/40 bg-[#d97757]/15 text-[#f0a287]',
  medium: 'border-[#1E2623] bg-[#161D1A] text-[#9BA8A2]',
  low: 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
};

/**
 * Focused mobile Today view combining today's Calendar schedule blocks
 * and due/overdue active Tasks (starred pinned on top) with tap-to-edit sheet support.
 */
export function MobileTodayView() {
  const navigate = useNavigate();

  const events = useCalendarStore((s) => s.events);
  const calendarInitialized = useCalendarStore((s) => s.initialized);
  const initializeCalendar = useCalendarStore((s) => s.initialize);

  const tasks = useTasksStore((s) => s.tasks);
  const tasksInitialized = useTasksStore((s) => s.initialized);
  const initializeTasks = useTasksStore((s) => s.initialize);
  const toggleCompleted = useTasksStore((s) => s.toggleCompleted);
  const toggleStarred = useTasksStore((s) => s.toggleStarred);

  const habits = useHabitsStore((s) => s.habits);
  const habitLogs = useHabitsStore((s) => s.logs);
  const habitsInitialized = useHabitsStore((s) => s.initialized);
  const initializeHabits = useHabitsStore((s) => s.initialize);
  const toggleHabitCompletion = useHabitsStore((s) => s.toggleCompletion);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [habitsExpanded, setHabitsExpanded] = useState(false);

  useEffect(() => {
    if (!calendarInitialized) void initializeCalendar();
  }, [calendarInitialized, initializeCalendar]);

  useEffect(() => {
    if (!tasksInitialized) void initializeTasks();
  }, [tasksInitialized, initializeTasks]);

  useEffect(() => {
    if (!habitsInitialized) void initializeHabits();
  }, [habitsInitialized, initializeHabits]);

  const todayKey = getTodayDateKey();
  const todayTaskDate = getTodayDateString();
  const formattedDay = useMemo(() => formatDayHeaderLabel(todayKey), [todayKey]);

  const habitCompletedMap = useMemo(
    () => buildHabitCompletedSetMap(habitLogs),
    [habitLogs],
  );
  const todayHabits = useMemo(
    () =>
      habits.filter(
        (h) => !h.isArchived && isHabitScheduledOnDate(h, todayKey),
      ),
    [habits, todayKey],
  );
  const todayHabitsDone = useMemo(
    () =>
      todayHabits.filter((h) => habitCompletedMap.get(h.id)?.has(todayKey))
        .length,
    [todayHabits, habitCompletedMap, todayKey],
  );

  const todayEvents = useMemo(() => {
    const expanded = expandRecurringEventsForWindow(events, todayKey, todayKey);
    const matching = expanded.filter((ev) => eventOccursOnDate(ev, todayKey));
    return matching.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
  }, [events, todayKey]);

  const todayTasks = useMemo(() => {
    const dueOrOverdue = tasks.filter(
      (task) =>
        task.status !== 'done' &&
        !isTaskInBacklog(task) &&
        (isTaskOverdue(task, todayTaskDate) || isTaskDueToday(task, todayTaskDate)),
    );
    const weight: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    return dueOrOverdue.sort((a, b) => {
      const starDiff = (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0);
      if (starDiff !== 0) return starDiff;
      const overdueA = isTaskOverdue(a, todayTaskDate) ? 0 : 1;
      const overdueB = isTaskOverdue(b, todayTaskDate) ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      if (weight[a.priority] !== weight[b.priority]) {
        return weight[a.priority] - weight[b.priority];
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [tasks, todayTaskDate]);

  const activeCount = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && !isTaskInBacklog(t)).length,
    [tasks],
  );

  const editingTask = useMemo(
    () => (editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null),
    [tasks, editingTaskId],
  );

  return (
    <div className="px-4 py-4 space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-[#7E8B85] font-medium">
          Today
        </p>
        <h1 className="text-xl font-semibold text-[#E4E8E6] tracking-tight mt-0.5">
          {formattedDay}
        </h1>
      </div>

      {/* Collapsible Today's Habits Progress Pill */}
      {todayHabits.length > 0 && (
        <section
          aria-label="Today's Habits"
          className="rounded-xl border border-[#1E2623] bg-[#111614] overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setHabitsExpanded((prev) => !prev)}
            aria-expanded={habitsExpanded}
            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left active:bg-[#18221E]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Repeat className="h-3.5 w-3.5 shrink-0 text-[#8AB8A3]" />
              <span className="text-xs font-medium text-[#E4E8E6]">
                Today&apos;s Habits
              </span>
              <span className="rounded-full border border-[#1E2623] bg-[#161D1A] px-2 py-0.5 text-[10px] font-medium text-[#8AB8A3] tabular-nums">
                {todayHabitsDone}/{todayHabits.length}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#1E2623]">
                <div
                  className="h-full rounded-full bg-[#74a88e] transition-all"
                  style={{
                    width: `${todayHabits.length > 0 ? Math.round((todayHabitsDone / todayHabits.length) * 100) : 0}%`,
                  }}
                />
              </div>
              {habitsExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-[#7E8B85]" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-[#7E8B85]" />
              )}
            </div>
          </button>

          {habitsExpanded && (
            <div className="border-t border-[#1E2623] divide-y divide-[#1E2623]">
              {todayHabits.map((habit) => {
                const isDone = Boolean(
                  habitCompletedMap.get(habit.id)?.has(todayKey),
                );
                const accent = getHabitAccentMeta(habit.accentColor);
                return (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => void toggleHabitCompletion(habit.id, todayKey)}
                    aria-pressed={isDone}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-[#18221E]"
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                        isDone
                          ? accent.checkedCircleClass
                          : 'border-[#33403A] bg-transparent',
                      )}
                    >
                      {isDone && <Check className="h-3 w-3 stroke-[2.5]" />}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-xs font-medium',
                        isDone ? 'text-[#7E8B85]' : 'text-[#E4E8E6]',
                      )}
                    >
                      {habit.title}
                    </span>
                    <span className="text-[10px] text-[#6E7D76]">
                      {habit.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Upcoming Schedule Blocks */}
      <section aria-label="Today's Schedule" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#7E8B85] flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[#8AB8A3]" />
            Schedule
            <span className="text-[#6E7D76] font-normal">({todayEvents.length})</span>
          </h2>
        </div>

        {todayEvents.length === 0 ? (
          <div className="rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-4 text-xs text-[#7E8B85]">
            No events scheduled for today.
          </div>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((ev) => {
              const accent = getEventAccentClasses(ev.category, ev.color);
              return (
                <div
                  key={`${ev.id}-${ev.startAt}`}
                  className="flex items-start gap-3 rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-3"
                >
                  <span
                    className={cn(
                      'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                      accent.swatchClass,
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#E4E8E6] truncate">
                      {ev.title}
                    </p>
                    <p className="text-xs text-[#7E8B85] flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{formatEventTimeRangeLabel(ev)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Due & Overdue Active Tasks */}
      <section aria-label="Today's Tasks" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#7E8B85] flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#d97757]" />
            Due Today & Overdue
            <span className="text-[#6E7D76] font-normal">({todayTasks.length})</span>
          </h2>
          {activeCount > todayTasks.length && (
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="text-xs text-[#8AB8A3] hover:underline"
            >
              All active ({activeCount})
            </button>
          )}
        </div>

        {todayTasks.length === 0 ? (
          <div className="rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-4 text-xs text-[#7E8B85]">
            You are clear for today. Tap + below to capture a task or note.
          </div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((task) => {
              const overdue = isTaskOverdue(task, todayTaskDate);
              const durationLabel = formatDurationLabel(task.durationMinutes);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-1.5 rounded-xl border border-[#1E2623] bg-[#111614] pr-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleCompleted(task.id);
                    }}
                    aria-label={`Complete ${task.title}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-[#18221E] transition-colors"
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
                        task.status === 'done'
                          ? 'border-[#d97757] bg-[#d97757] text-[#0A0E0C]'
                          : 'border-[#33403A] bg-transparent',
                      )}
                    >
                      {task.status === 'done' && (
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingTaskId(task.id)}
                    className="min-w-0 flex-1 py-1.5 text-left"
                  >
                    <p className="text-sm font-medium text-[#E4E8E6] leading-snug break-words">
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {overdue && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#d97757]/15 text-[#f0a287] border border-[#d97757]/35">
                          Overdue
                        </span>
                      )}
                      {task.dueTime && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] border border-[#1E2623] bg-[#161D1A] text-[#9BA8A2] tabular-nums">
                          {task.dueTime}
                        </span>
                      )}
                      {task.priority !== 'medium' && (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium border capitalize',
                            PRIORITY_BADGE[task.priority],
                          )}
                        >
                          {task.priority}
                        </span>
                      )}
                      {task.group && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] bg-[#18221E] text-[#8AB8A3] border border-[#1E2623]">
                          {task.group}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {durationLabel && (
                      <span className="rounded-md border border-[#1E2623] bg-[#161D1A] px-1.5 py-0.5 text-[10px] font-medium text-[#9BA8A2] tabular-nums">
                        {durationLabel}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleStarred(task.id);
                      }}
                      aria-pressed={Boolean(task.isStarred)}
                      aria-label={
                        task.isStarred
                          ? `Unstar ${task.title}`
                          : `Star ${task.title}`
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6E7D76] active:bg-[#18221E]"
                    >
                      <Star
                        className={cn(
                          'h-4 w-4 transition-colors',
                          task.isStarred && 'fill-[#e5a93c] text-[#e5a93c]',
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <MobileTaskEditSheet
        task={editingTask}
        onClose={() => setEditingTaskId(null)}
      />
    </div>
  );
}
