import {
  addDays,
  CATEGORY_LABELS,
  eventOccursOnDate,
  formatEventTimeRangeLabel,
  formatLocalDateKey,
  getEventDateRange,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  isTaskDueToday,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type {
  CalendarEventRecord,
  NoteRecord,
  TaskRecord,
} from '@/services/storage/db';

export interface DashboardMetrics {
  readonly tasksDueTodayCount: number;
  readonly tasksCompletedTodayCount: number;
  readonly overdueTasksCount: number;
  readonly eventsTodayCount: number;
  readonly upcomingDeadlinesCount: number;
}

export interface DashboardTaskBuckets {
  readonly overdue: readonly TaskRecord[];
  readonly dueToday: readonly TaskRecord[];
  readonly upcoming: readonly TaskRecord[];
  readonly recentlyCompleted: readonly TaskRecord[];
}

export type ActivityKind =
  | 'note_created'
  | 'note_updated'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'event_created'
  | 'event_updated';

export interface DashboardActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly entityType: 'note' | 'task' | 'event';
  readonly entityId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly timestamp: string;
  readonly to: string;
}

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note_created: 'Note created',
  note_updated: 'Note updated',
  task_created: 'Task created',
  task_updated: 'Task updated',
  task_completed: 'Task completed',
  event_created: 'Event created',
  event_updated: 'Event updated',
};

function getIsoLocalDateKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return formatLocalDateKey(parsed);
}

/**
 * Computes live dashboard summary metrics directly from local IndexedDB-backed stores.
 */
export function computeDashboardMetrics(
  tasks: readonly TaskRecord[],
  events: readonly CalendarEventRecord[],
  todayKey: string,
): DashboardMetrics {
  const nextWeekEnd = addDays(todayKey, 7);

  let tasksDueTodayCount = 0;
  let tasksCompletedTodayCount = 0;
  let overdueTasksCount = 0;
  let upcomingDeadlinesCount = 0;

  for (const task of tasks) {
    if (task.status === 'done') {
      if (task.completedAt && getIsoLocalDateKey(task.completedAt) === todayKey) {
        tasksCompletedTodayCount += 1;
      }
      continue;
    }

    if (isTaskOverdue(task, todayKey)) {
      overdueTasksCount += 1;
    }
    if (isTaskDueToday(task, todayKey)) {
      tasksDueTodayCount += 1;
    }
    if (
      task.dueDate &&
      task.dueDate > todayKey &&
      task.dueDate <= nextWeekEnd
    ) {
      upcomingDeadlinesCount += 1;
    }
  }

  const eventsTodayCount = events.filter((ev) =>
    eventOccursOnDate(ev, todayKey),
  ).length;

  return {
    tasksDueTodayCount,
    tasksCompletedTodayCount,
    overdueTasksCount,
    eventsTodayCount,
    upcomingDeadlinesCount,
  };
}

/**
 * Returns today's calendar events ordered all-day first, then chronologically.
 */
export function selectTodaysEvents(
  events: readonly CalendarEventRecord[],
  todayKey: string,
): CalendarEventRecord[] {
  return events
    .filter((ev) => eventOccursOnDate(ev, todayKey))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
}

/**
 * Returns upcoming events starting strictly after `todayKey` within `daysAhead`.
 */
export function selectUpcomingEvents(
  events: readonly CalendarEventRecord[],
  todayKey: string,
  daysAhead = 7,
  limit = 5,
): CalendarEventRecord[] {
  const maxDate = addDays(todayKey, daysAhead);
  return events
    .filter((ev) => {
      const { startDateKey } = getEventDateRange(ev);
      return startDateKey > todayKey && startDateKey <= maxDate;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, limit);
}

/**
 * Splits tasks into capped dashboard sections: overdue, due today, upcoming, and recently completed.
 */
export function selectDashboardTaskBuckets(
  tasks: readonly TaskRecord[],
  todayKey: string,
): DashboardTaskBuckets {
  const overdue: TaskRecord[] = [];
  const dueToday: TaskRecord[] = [];
  const upcoming: TaskRecord[] = [];
  const recentlyCompleted: TaskRecord[] = [];

  for (const task of tasks) {
    if (task.status === 'done') {
      recentlyCompleted.push(task);
      continue;
    }
    if (isTaskOverdue(task, todayKey)) {
      overdue.push(task);
    } else if (isTaskDueToday(task, todayKey)) {
      dueToday.push(task);
    } else if (
      (task.dueDate && task.dueDate > todayKey) ||
      (task.startDate && task.startDate > todayKey)
    ) {
      upcoming.push(task);
    }
  }

  overdue.sort((a, b) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
  );
  dueToday.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  upcoming.sort((a, b) =>
    (a.dueDate ?? a.startDate ?? '').localeCompare(
      b.dueDate ?? b.startDate ?? '',
    ),
  );
  recentlyCompleted.sort((a, b) =>
    (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
  );

  return {
    overdue: overdue.slice(0, 4),
    dueToday: dueToday.slice(0, 4),
    upcoming: upcoming.slice(0, 4),
    recentlyCompleted: recentlyCompleted.slice(0, 3),
  };
}

export function selectRecentNotes(
  notes: readonly NoteRecord[],
  limit = 5,
): NoteRecord[] {
  return [...notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/**
 * Derives a lightweight unified activity stream from existing record timestamps
 * and revisions without introducing an extra event-sourcing table.
 */
export function selectRecentActivity(
  notes: readonly NoteRecord[],
  tasks: readonly TaskRecord[],
  events: readonly CalendarEventRecord[],
  limit = 8,
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [];

  for (const note of notes) {
    const isUpdate =
      note.revision > 1 || note.updatedAt !== note.createdAt;
    items.push({
      id: `note-${note.id}-${note.updatedAt}`,
      kind: isUpdate ? 'note_updated' : 'note_created',
      entityType: 'note',
      entityId: note.id,
      title: note.title,
      subtitle: note.isDaily ? 'Daily note' : 'Markdown note',
      timestamp: note.updatedAt,
      to: `/notes/${note.id}`,
    });
  }

  for (const task of tasks) {
    let kind: ActivityKind;
    let timestamp = task.updatedAt;
    if (task.status === 'done' && task.completedAt) {
      kind = 'task_completed';
      timestamp = task.completedAt;
    } else if (task.revision > 1 || task.updatedAt !== task.createdAt) {
      kind = 'task_updated';
    } else {
      kind = 'task_created';
    }

    items.push({
      id: `task-${task.id}-${timestamp}`,
      kind,
      entityType: 'task',
      entityId: task.id,
      title: task.title,
      subtitle: task.dueDate ? `Due ${task.dueDate}` : `Priority: ${task.priority}`,
      timestamp,
      to: `/tasks?taskId=${task.id}`,
    });
  }

  for (const ev of events) {
    const isUpdate = ev.revision > 1 || ev.updatedAt !== ev.createdAt;
    const { startDateKey } = getEventDateRange(ev);
    items.push({
      id: `event-${ev.id}-${ev.updatedAt}`,
      kind: isUpdate ? 'event_updated' : 'event_created',
      entityType: 'event',
      entityId: ev.id,
      title: ev.title,
      subtitle: `${CATEGORY_LABELS[ev.category]} · ${startDateKey} · ${formatEventTimeRangeLabel(ev)}`,
      timestamp: ev.updatedAt,
      to: `/calendar?date=${startDateKey}&eventId=${ev.id}`,
    });
  }

  return items
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

/**
 * Formats an ISO timestamp into a concise local time or relative date string.
 */
export function formatRelativeTimestamp(
  iso: string,
  now: Date = new Date(),
): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return iso.slice(0, 10);

  const diffMs = now.getTime() - target.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'Just now';
  if (diffMs >= 60_000 && diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  const todayKey = formatLocalDateKey(now);
  const targetKey = formatLocalDateKey(target);
  if (targetKey === todayKey) {
    return target.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return targetKey;
}
