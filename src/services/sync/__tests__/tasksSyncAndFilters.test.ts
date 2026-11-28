import { describe, expect, it } from 'vitest';
import {
  extendTaskDeadline,
  filterAndSortTasks,
  formatDurationLabel,
  getOffsetDateString,
  getTodayDateString,
  groupTasksByGroup,
  isTaskDueToday,
  isTaskInBacklog,
  isTaskOverdue,
  isTaskUpcoming,
  normalizeTaskTags,
  parseQuickAddTaskInput,
  validateTaskDates,
} from '@/features/tasks/utils/taskFilters';
import type { TaskRecord } from '@/services/storage/db';
import { mapRemoteTaskToLocal } from '../conflictResolver';
import { buildSyncPlan } from '../syncPlanner';
import type { RemoteTaskMetadata, SyncChange } from '../syncTypes';

const TODAY = '2026-11-25';
const YESTERDAY = '2026-11-24';
const TOMORROW = '2026-11-26';
const NOW_ISO = '2026-11-25T10:00:00.000Z';
const LATER_ISO = '2026-11-25T10:15:00.000Z';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    userId: 'user-1',
    title: 'Write Algorithms Report',
    status: 'todo',
    priority: 'medium',
    tags: [],
    linkedNoteIds: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    revision: 1,
    ...overrides,
  };
}

function makeRemoteTask(
  overrides: Partial<RemoteTaskMetadata> = {},
): RemoteTaskMetadata {
  return {
    id: 'task-1',
    userId: 'user-1',
    title: 'Write Algorithms Report',
    description: null,
    status: 'todo',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    tags: [],
    category: null,
    linkedNoteIds: [],
    revision: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('Task validation, tags, and filter/sort helpers', () => {
  it('validates date ranges and rejects startDate > dueDate', () => {
    expect(validateTaskDates('2026-11-25', '2026-11-26')).toBeNull();
    expect(validateTaskDates('2026-11-25', '2026-11-25')).toBeNull();
    expect(validateTaskDates('2026-11-27', '2026-11-25')).toBe(
      'Start date cannot be later than due date.',
    );
  });

  it('normalizes and deduplicates task tags', () => {
    expect(normalizeTaskTags([' #University ', 'university', 'ML', '#ml'])).toEqual([
      'university',
      'ml',
    ]);
  });

  it('classifies overdue, today, and upcoming tasks accurately', () => {
    const overdue = makeTask({ dueDate: YESTERDAY });
    const dueToday = makeTask({ dueDate: TODAY });
    const doneYesterday = makeTask({ status: 'done', dueDate: YESTERDAY });
    const upcoming = makeTask({ dueDate: TOMORROW });

    expect(isTaskOverdue(overdue, TODAY)).toBe(true);
    expect(isTaskOverdue(doneYesterday, TODAY)).toBe(false);
    expect(isTaskDueToday(dueToday, TODAY)).toBe(true);
    expect(isTaskUpcoming(upcoming, TODAY)).toBe(true);
  });

  it('filters by preset, search, priority, tag, category and sorts deterministically', () => {
    const tasks: TaskRecord[] = [
      makeTask({
        id: 't1',
        title: 'Submit Linear Algebra HW',
        priority: 'high',
        dueDate: YESTERDAY,
        category: 'University',
        tags: ['math'],
      }),
      makeTask({
        id: 't2',
        title: 'Buy groceries',
        priority: 'low',
        dueDate: TODAY,
        category: 'Personal',
        tags: ['errands'],
      }),
      makeTask({
        id: 't3',
        title: 'Review Deep Learning notes',
        status: 'in_progress',
        priority: 'high',
        dueDate: TOMORROW,
        category: 'University',
        tags: ['ml'],
      }),
      makeTask({
        id: 't4',
        title: 'Completed task',
        status: 'done',
        priority: 'medium',
        dueDate: YESTERDAY,
      }),
    ];

    const overdueOnly = filterAndSortTasks(tasks, {
      preset: 'overdue',
      statusFilter: 'all',
      priorityFilter: 'all',
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate',
      today: TODAY,
    });
    expect(overdueOnly.map((t) => t.id)).toEqual(['t1']);

    const uniHighSearch = filterAndSortTasks(tasks, {
      preset: 'active',
      statusFilter: 'all',
      priorityFilter: 'high',
      tagFilter: null,
      categoryFilter: 'University',
      searchQuery: 'deep',
      sortBy: 'priority',
      today: TODAY,
    });
    expect(uniHighSearch.map((t) => t.id)).toEqual(['t3']);

    const sortedByPriority = filterAndSortTasks(tasks, {
      preset: 'active',
      statusFilter: 'all',
      priorityFilter: 'all',
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'priority',
      today: TODAY,
    });
    expect(sortedByPriority.map((t) => t.id)).toEqual(['t1', 't3', 't2']);
  });

  it('computes local YYYY-MM-DD schedule presets without UTC shift and excludes completed tasks', () => {
    const localLateNight = new Date(2026, 10, 27, 23, 45, 0);
    expect(getTodayDateString(localLateNight)).toBe('2026-11-27');
    expect(getOffsetDateString(1, localLateNight)).toBe('2026-11-28');
    expect(getOffsetDateString(7, localLateNight)).toBe('2026-12-04');

    const base = {
      statusFilter: 'all' as const,
      priorityFilter: 'all' as const,
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate' as const,
      today: '2026-11-27',
    };

    const tasks: TaskRecord[] = [
      makeTask({ id: 'active-today', dueDate: '2026-11-27', priority: 'high' }),
      makeTask({ id: 'done-today', status: 'done', dueDate: '2026-11-27', priority: 'high' }),
      makeTask({ id: 'active-upcoming', dueDate: '2026-12-04' }),
      makeTask({ id: 'done-upcoming', status: 'done', dueDate: '2026-12-04' }),
      makeTask({ id: 'active-overdue', dueDate: '2026-11-26' }),
      makeTask({ id: 'done-overdue', status: 'done', dueDate: '2026-11-26' }),
    ];

    expect(filterAndSortTasks(tasks, { ...base, preset: 'today' }).map((t) => t.id)).toEqual([
      'active-today',
    ]);
    expect(filterAndSortTasks(tasks, { ...base, preset: 'upcoming' }).map((t) => t.id)).toEqual([
      'active-today',
      'active-upcoming',
    ]);
    expect(filterAndSortTasks(tasks, { ...base, preset: 'overdue' }).map((t) => t.id)).toEqual([
      'active-overdue',
    ]);
    expect(
      filterAndSortTasks(tasks, { ...base, preset: 'high_priority' }).map((t) => t.id),
    ).toEqual(['active-today']);
  });

  it('separates Backlog tasks from Active/Today/Upcoming/Overdue and bundles Task Groups cleanly', () => {
    const base = {
      statusFilter: 'all' as const,
      priorityFilter: 'all' as const,
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate' as const,
      today: '2026-11-27',
    };

    const tasks: TaskRecord[] = [
      makeTask({
        id: 'backlog-unscheduled',
        title: 'Read Physics Chapter 4',
        group: 'Ôn thi Vật lý 2',
      }),
      makeTask({
        id: 'backlog-explicit',
        title: 'Someday summary',
        dueDate: '2026-11-27',
        isBacklog: true,
        group: 'Ôn thi Vật lý 2',
      }),
      makeTask({
        id: 'active-no-date',
        title: 'Promoted active task',
        isBacklog: false,
      }),
      makeTask({
        id: 'active-today',
        title: 'Finish Lab 2',
        dueDate: '2026-11-27',
        status: 'done',
        group: 'Ôn thi Vật lý 2',
      }),
      makeTask({
        id: 'scheduled-today',
        title: 'Mock Exam',
        dueDate: '2026-11-27',
        group: 'Đề Lý 2',
      }),
    ];

    expect(isTaskInBacklog(tasks[0]!)).toBe(true);
    expect(isTaskInBacklog(tasks[1]!)).toBe(true);
    expect(isTaskInBacklog(tasks[2]!)).toBe(false);
    expect(isTaskInBacklog(tasks[3]!)).toBe(false);

    expect(
      filterAndSortTasks(tasks, { ...base, preset: 'backlog' }).map((t) => t.id),
    ).toEqual(['backlog-explicit', 'backlog-unscheduled']);

    expect(
      filterAndSortTasks(tasks, { ...base, preset: 'today' }).map((t) => t.id),
    ).toEqual(['scheduled-today']);

    expect(
      filterAndSortTasks(tasks, { ...base, preset: 'active' }).map((t) => t.id),
    ).toEqual(['scheduled-today', 'active-no-date']);

    expect(
      filterAndSortTasks(tasks, { ...base, preset: 'all' }),
    ).toHaveLength(5);

    expect(parseQuickAddTaskInput('Giải đề chương 2 @Đề Lý 2')).toEqual({
      title: 'Giải đề chương 2',
      group: 'Đề Lý 2',
    });
    expect(parseQuickAddTaskInput('@"Ôn thi Vật lý 2" Đọc giáo trình')).toEqual({
      title: 'Đọc giáo trình',
      group: 'Ôn thi Vật lý 2',
    });

    const buckets = groupTasksByGroup(tasks);
    expect(
      buckets.map((b) => ({
        groupName: b.groupName,
        completed: b.completedCount,
        total: b.totalCount,
      })),
    ).toEqual([
      { groupName: 'Đề Lý 2', completed: 0, total: 1 },
      { groupName: 'Ôn thi Vật lý 2', completed: 1, total: 3 },
      { groupName: null, completed: 0, total: 1 },
    ]);
  });
});

describe('buildSyncPlan for Tasks (Supabase Hybrid Sync)', () => {
  it('plans task upload even when Google Drive is disconnected (includeDriveSync: false)', () => {
    const task = makeTask();
    const change: SyncChange = {
      id: 'c-task-1',
      entityType: 'task',
      entityId: task.id,
      operation: 'create',
      localRevision: 1,
      createdAt: NOW_ISO,
      status: 'pending',
      retryCount: 0,
    };

    const plan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [change],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      localTasks: [task],
      remoteTasks: [],
      includeDriveSync: false,
    });

    expect(plan.actions).toEqual([
      { type: 'push_task', taskId: 'task-1', changeId: 'c-task-1' },
    ]);
  });

  it('downloads remote tasks onto a second device and stays idempotent when synced', () => {
    const remoteTask = makeRemoteTask({ revision: 2, updatedAt: LATER_ISO });

    // Device B (empty local) pulls remote task
    const pullPlan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      localTasks: [],
      remoteTasks: [remoteTask],
      includeDriveSync: false,
    });
    expect(pullPlan.actions).toEqual([
      { type: 'pull_remote_task', task: remoteTask },
    ]);

    // Once synced locally with matching baseline, steady-state produces zero actions
    const syncedLocal = makeTask({
      revision: 2,
      updatedAt: LATER_ISO,
      lastSyncedRevision: 2,
      lastSyncedUpdatedAt: LATER_ISO,
    });
    const steadyPlan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      localTasks: [syncedLocal],
      remoteTasks: [remoteTask],
      includeDriveSync: false,
    });
    expect(steadyPlan.actions).toEqual([]);
  });

  it('detects concurrent task conflicts and propagates task deletions safely', () => {
    // 1. Both edited offline -> conflict
    const localEdited = makeTask({
      id: 'task-conflict',
      revision: 2,
      lastSyncedRevision: 1,
      updatedAt: LATER_ISO,
    });
    const remoteEdited = makeRemoteTask({
      id: 'task-conflict',
      revision: 2,
      updatedAt: LATER_ISO,
    });

    // 2. Deleted locally -> delete_remote_task
    const localDeleted = makeTask({
      id: 'task-del-local',
      deletedAt: LATER_ISO,
      revision: 2,
      lastSyncedRevision: 1,
    });
    const remoteUnchanged = makeRemoteTask({ id: 'task-del-local', revision: 1 });

    // 3. Deleted remotely while locally clean -> delete_local_task
    const localClean = makeTask({
      id: 'task-del-remote',
      revision: 1,
      lastSyncedRevision: 1,
    });
    const remoteDeleted = makeRemoteTask({
      id: 'task-del-remote',
      revision: 2,
      deletedAt: LATER_ISO,
    });

    const plan = buildSyncPlan({
      localNotes: [],
      localFolders: [],
      localAttachments: [],
      localMappings: [],
      pendingChanges: [
        {
          id: 'c-conf',
          entityType: 'task',
          entityId: 'task-conflict',
          operation: 'update',
          localRevision: 2,
          createdAt: LATER_ISO,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'c-del',
          entityType: 'task',
          entityId: 'task-del-local',
          operation: 'delete',
          localRevision: 2,
          createdAt: LATER_ISO,
          status: 'pending',
          retryCount: 0,
        },
      ],
      remoteFolders: [],
      remoteMappings: [],
      remoteAttachments: [],
      driveFiles: [],
      localTasks: [localEdited, localDeleted, localClean],
      remoteTasks: [remoteEdited, remoteUnchanged, remoteDeleted],
      includeDriveSync: false,
    });

    expect(plan.actions).toEqual([
      {
        type: 'record_task_conflict',
        taskId: 'task-conflict',
        reason: 'both_modified',
        remoteTask: remoteEdited,
      },
      {
        type: 'delete_remote_task',
        taskId: 'task-del-local',
        changeId: 'c-del',
      },
      {
        type: 'delete_local_task',
        taskId: 'task-del-remote',
      },
    ]);
  });

  it('pins starred tasks to top in lists and groups and handles duration/deadline helpers cleanly', () => {
    const tasks: TaskRecord[] = [
      makeTask({
        id: 'p1-unstarred-early',
        title: 'Problem Set 1',
        dueDate: '2026-11-27',
        group: 'Physics 2',
        isStarred: false,
      }),
      makeTask({
        id: 'p1-starred-later',
        title: 'Pinned Mock Exam',
        dueDate: '2026-11-30',
        group: 'Physics 2',
        isStarred: true,
        durationMinutes: 90,
        dueTime: '15:30',
      }),
      makeTask({
        id: 'u1-unstarred',
        title: 'Inbox chore',
        dueDate: '2026-11-27',
        isStarred: false,
      }),
      makeTask({
        id: 'u2-starred',
        title: 'Pinned Top Task',
        dueDate: '2026-12-01',
        isStarred: true,
      }),
    ];

    const sortedAll = filterAndSortTasks(tasks, {
      preset: 'all',
      statusFilter: 'all',
      priorityFilter: 'all',
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate',
      today: '2026-11-27',
    });

    // Both starred tasks come before unstarred ones, preserving dueDate order inside each tier
    expect(sortedAll.map((t) => t.id)).toEqual([
      'p1-starred-later',
      'u2-starred',
      'p1-unstarred-early',
      'u1-unstarred',
    ]);

    const grouped = groupTasksByGroup(tasks);
    expect(grouped.map((b) => b.groupName)).toEqual(['Physics 2', null]);
    expect(grouped[0]!.tasks.map((t) => t.id)).toEqual([
      'p1-starred-later',
      'p1-unstarred-early',
    ]);
    expect(grouped[1]!.tasks.map((t) => t.id)).toEqual([
      'u2-starred',
      'u1-unstarred',
    ]);

    expect(formatDurationLabel(undefined)).toBeNull();
    expect(formatDurationLabel(0)).toBeNull();
    expect(formatDurationLabel(30)).toBe('30m');
    expect(formatDurationLabel(60)).toBe('1h');
    expect(formatDurationLabel(90)).toBe('1h 30m');
    expect(formatDurationLabel(120)).toBe('2h');

    // Same-day deadline extension
    expect(extendTaskDeadline('2026-11-28', '14:00', 90)).toEqual({
      dueDate: '2026-11-28',
      dueTime: '15:30',
    });
    // Rollover across midnight
    expect(extendTaskDeadline('2026-11-28', '23:15', 90)).toEqual({
      dueDate: '2026-11-29',
      dueTime: '00:45',
    });
    // Default missing dueDate/dueTime from `now`
    const mockNow = new Date(2026, 10, 28, 10, 0, 0, 0);
    expect(extendTaskDeadline(undefined, undefined, 90, mockNow)).toEqual({
      dueDate: '2026-11-28',
      dueTime: '11:30',
    });

    // Sync mapper round-trip for isStarred, durationMinutes, dueTime
    const mapped = mapRemoteTaskToLocal(
      makeRemoteTask({
        isStarred: true,
        durationMinutes: 90,
        dueTime: '15:30',
      }),
      'user-1',
    );
    expect(mapped.isStarred).toBe(true);
    expect(mapped.durationMinutes).toBe(90);
    expect(mapped.dueTime).toBe('15:30');
  });
});
