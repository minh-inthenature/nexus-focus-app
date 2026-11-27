import { useEffect, useMemo } from 'react';
import { Calendar, Check, CheckCircle2, Clock } from 'lucide-react';
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
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  getTodayDateString,
  isTaskDueToday,
  isTaskInBacklog,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type { TaskPriority } from '@/services';
import { cn } from '@/utils/cn';

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  high: 'border-[#d97757]/40 bg-[#d97757]/15 text-[#f0a287]',
  medium: 'border-[#1E2623] bg-[#161D1A] text-[#9BA8A2]',
  low: 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
};

/**
 * Focused mobile Today view combining today's Calendar schedule blocks
 * and due/overdue active Tasks with large one-tap checkboxes.
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

  useEffect(() => {
    if (!calendarInitialized) void initializeCalendar();
  }, [calendarInitialized, initializeCalendar]);

  useEffect(() => {
    if (!tasksInitialized) void initializeTasks();
  }, [tasksInitialized, initializeTasks]);

  const todayKey = getTodayDateKey();
  const todayTaskDate = getTodayDateString();
  const formattedDay = useMemo(() => formatDayHeaderLabel(todayKey), [todayKey]);

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
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-xl border border-[#1E2623] bg-[#111614] pr-3.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => void toggleCompleted(task.id)}
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
                      {task.status === 'done' && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1 py-1.5">
                    <p className="text-sm font-medium text-[#E4E8E6] leading-snug break-words">
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {overdue && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#d97757]/15 text-[#f0a287] border border-[#d97757]/35">
                          Overdue
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
