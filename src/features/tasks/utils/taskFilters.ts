import type {
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '@/services/storage/db';

export type TaskFilterPreset =
  | 'active'
  | 'today'
  | 'upcoming'
  | 'overdue'
  | 'completed'
  | 'high_priority'
  | 'all'
  | 'backlog';

export type TaskSortBy = 'dueDate' | 'priority' | 'createdAt' | 'updatedAt';

export interface FilterAndSortTasksOptions {
  readonly preset: TaskFilterPreset;
  readonly statusFilter: TaskStatus | 'all';
  readonly priorityFilter: TaskPriority | 'all';
  readonly tagFilter: string | null;
  readonly categoryFilter: string | null;
  readonly searchQuery: string;
  readonly sortBy: TaskSortBy;
  readonly today?: string;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Formats a Date into local `YYYY-MM-DD`.
 */
export function getTodayDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a local date offset by `offsetDays` from `baseDate` into `YYYY-MM-DD`.
 */
export function getOffsetDateString(
  offsetDays: number,
  baseDate: Date = new Date(),
): string {
  const target = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + offsetDays,
  );
  return getTodayDateString(target);
}

/**
 * Validates optional start/due ISO date strings (`YYYY-MM-DD`).
 */
export function validateTaskDates(
  startDate?: string,
  dueDate?: string,
): string | null {
  const start = startDate?.trim();
  const due = dueDate?.trim();
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return 'Start date must be in YYYY-MM-DD format.';
  }
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return 'Due date must be in YYYY-MM-DD format.';
  }
  if (start && due && start > due) {
    return 'Start date cannot be later than due date.';
  }
  return null;
}

/**
 * Normalizes and deduplicates task tags cleanly.
 */
export function normalizeTaskTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const clean = raw.trim().replace(/^#+/, '').toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      normalized.push(clean);
    }
  }
  return normalized;
}

/**
 * Returns true when an uncompleted task is unscheduled or explicitly marked as Backlog.
 */
export function isTaskInBacklog(task: TaskRecord): boolean {
  if (task.status === 'done') return false;
  if (task.isBacklog === true) return true;
  return !task.dueDate && task.isBacklog !== false;
}

export function isTaskOverdue(
  task: TaskRecord,
  todayStr: string = getTodayDateString(),
): boolean {
  return (
    !isTaskInBacklog(task) &&
    task.status !== 'done' &&
    Boolean(task.dueDate) &&
    (task.dueDate ?? '') < todayStr
  );
}

export function isTaskDueToday(
  task: TaskRecord,
  todayStr: string = getTodayDateString(),
): boolean {
  return task.dueDate === todayStr || task.startDate === todayStr;
}

export function isTaskUpcoming(
  task: TaskRecord,
  todayStr: string = getTodayDateString(),
): boolean {
  if (task.status === 'done' || isTaskInBacklog(task)) return false;
  const dueUpcoming = Boolean(task.dueDate) && (task.dueDate ?? '') >= todayStr;
  const startUpcoming =
    Boolean(task.startDate) && (task.startDate ?? '') >= todayStr;
  return dueUpcoming || startUpcoming;
}

export function extractAllTaskTags(tasks: readonly TaskRecord[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      set.add(tag);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function extractAllTaskCategories(
  tasks: readonly TaskRecord[],
): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    if (task.category?.trim()) {
      set.add(task.category.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function extractAllTaskGroups(tasks: readonly TaskRecord[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    if (task.group?.trim()) {
      set.add(task.group.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export interface TaskGroupBucket {
  readonly groupName: string | null;
  readonly tasks: TaskRecord[];
  readonly completedCount: number;
  readonly totalCount: number;
}

/**
 * Bundles tasks by their `group` name (sorted alphabetically), keeping ungrouped
 * tasks in a final `groupName: null` bucket.
 */
export function groupTasksByGroup(
  tasks: readonly TaskRecord[],
): TaskGroupBucket[] {
  const namedMap = new Map<string, TaskRecord[]>();
  const ungrouped: TaskRecord[] = [];

  for (const task of tasks) {
    const cleanGroup = task.group?.trim();
    if (cleanGroup) {
      const list = namedMap.get(cleanGroup) ?? [];
      list.push(task);
      namedMap.set(cleanGroup, list);
    } else {
      ungrouped.push(task);
    }
  }

  const buckets: TaskGroupBucket[] = Array.from(namedMap.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((groupName) => {
      const items = namedMap.get(groupName) ?? [];
      const completedCount = items.filter((t) => t.status === 'done').length;
      return {
        groupName,
        tasks: items,
        completedCount,
        totalCount: items.length,
      };
    });

  if (ungrouped.length > 0) {
    buckets.push({
      groupName: null,
      tasks: ungrouped,
      completedCount: ungrouped.filter((t) => t.status === 'done').length,
      totalCount: ungrouped.length,
    });
  }

  return buckets;
}

/**
 * Parses `@"Group Name"` or trailing `@Group Name` syntax from quick-add input.
 */
export function parseQuickAddTaskInput(
  rawInput: string,
  explicitGroup?: string,
): { title: string; group?: string } {
  const trimmedExplicit = explicitGroup?.trim();
  let working = rawInput.trim();
  let parsedGroup: string | undefined;

  const quotedMatch = working.match(/(?:^|\s)@"([^"]+)"(?:\s|$)/);
  if (quotedMatch) {
    parsedGroup = quotedMatch[1]?.trim() || undefined;
    working = working.replace(quotedMatch[0], ' ').replace(/\s+/g, ' ').trim();
  } else {
    const trailingMatch = working.match(/\s@([^\s@][^@]*)$/);
    if (trailingMatch) {
      parsedGroup = trailingMatch[1]?.trim() || undefined;
      working = working.slice(0, trailingMatch.index).trim();
    } else {
      const tokenMatch = working.match(/(?:^|\s)@([^\s@]+)(?:\s|$)/);
      if (tokenMatch) {
        parsedGroup = tokenMatch[1]?.trim() || undefined;
        working = working.replace(tokenMatch[0], ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  const resolvedGroup = trimmedExplicit || parsedGroup;
  return {
    title: working || rawInput.trim(),
    ...(resolvedGroup ? { group: resolvedGroup } : {}),
  };
}

export function filterAndSortTasks(
  tasks: readonly TaskRecord[],
  options: FilterAndSortTasksOptions,
): TaskRecord[] {
  const today = options.today ?? getTodayDateString();
  const q = options.searchQuery.trim().toLowerCase();
  const normalizedTag = options.tagFilter?.trim().toLowerCase() || null;
  const normalizedCategory =
    options.categoryFilter?.trim().toLowerCase() || null;

  const filtered = tasks.filter((task) => {
    switch (options.preset) {
      case 'active':
        if (task.status === 'done' || isTaskInBacklog(task)) return false;
        break;
      case 'today':
        if (
          task.status === 'done' ||
          isTaskInBacklog(task) ||
          !isTaskDueToday(task, today)
        ) {
          return false;
        }
        break;
      case 'upcoming':
        if (!isTaskUpcoming(task, today)) return false;
        break;
      case 'overdue':
        if (!isTaskOverdue(task, today)) return false;
        break;
      case 'completed':
        if (task.status !== 'done') return false;
        break;
      case 'high_priority':
        if (task.status === 'done' || task.priority !== 'high') return false;
        break;
      case 'backlog':
        if (!isTaskInBacklog(task)) return false;
        break;
      case 'all':
        break;
    }

    if (
      options.statusFilter !== 'all' &&
      task.status !== options.statusFilter
    ) {
      return false;
    }

    if (
      options.priorityFilter !== 'all' &&
      task.priority !== options.priorityFilter
    ) {
      return false;
    }

    if (normalizedTag && !task.tags.includes(normalizedTag)) {
      return false;
    }

    if (
      normalizedCategory &&
      (task.category?.trim().toLowerCase() ?? '') !== normalizedCategory
    ) {
      return false;
    }

    if (q) {
      const titleMatch = task.title.toLowerCase().includes(q);
      const descMatch = (task.description ?? '').toLowerCase().includes(q);
      const catMatch = (task.category ?? '').toLowerCase().includes(q);
      const groupMatch = (task.group ?? '').toLowerCase().includes(q);
      const tagMatch = task.tags.some((t) => t.includes(q.replace(/^#+/, '')));
      if (!titleMatch && !descMatch && !catMatch && !groupMatch && !tagMatch) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((a, b) => {
    switch (options.sortBy) {
      case 'dueDate': {
        const aDate = a.dueDate ?? a.startDate ?? '';
        const bDate = b.dueDate ?? b.startDate ?? '';
        if (aDate && bDate && aDate !== bDate) {
          return aDate.localeCompare(bDate);
        }
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        const prioDiff =
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        if (prioDiff !== 0) return prioDiff;
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      case 'priority': {
        const prioDiff =
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        if (prioDiff !== 0) return prioDiff;
        const aDate = a.dueDate ?? '';
        const bDate = b.dueDate ?? '';
        if (aDate && bDate && aDate !== bDate) {
          return aDate.localeCompare(bDate);
        }
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      case 'createdAt':
        return b.createdAt.localeCompare(a.createdAt);
      case 'updatedAt':
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
}
