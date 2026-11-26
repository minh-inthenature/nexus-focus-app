import { describe, expect, it } from 'vitest';
import {
  buildAllDayRange,
  buildTimedRange,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  highlightMatchSegments,
  searchWorkspace,
} from '@/features/search/utils/globalSearch';
import type {
  CalendarEventRecord,
  FolderRecord,
  NoteRecord,
  TaskRecord,
} from '@/services/storage/db';
import {
  computeDashboardMetrics,
  selectDashboardTaskBuckets,
  selectRecentActivity,
  selectRecentNotes,
  selectTodaysEvents,
  selectUpcomingEvents,
} from '../utils/dashboardSelectors';

const TODAY = '2026-11-25';
const YESTERDAY = '2026-11-24';
const TOMORROW = '2026-11-26';

function makeNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: 'n-1',
    folderId: null,
    title: 'Distributed Systems Notes',
    content: '# Consensus\nRaft and Paxos trade-offs.',
    isFavorite: false,
    isDaily: false,
    revision: 1,
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-1',
    userId: 'u-1',
    title: 'Finish Lab Report',
    status: 'todo',
    priority: 'medium',
    tags: [],
    linkedNoteIds: [],
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<CalendarEventRecord> = {},
): CalendarEventRecord {
  const timed = buildTimedRange(TODAY, '10:00', TODAY, '11:00');
  return {
    id: 'e-1',
    userId: 'u-1',
    title: 'Design Sync',
    startAt: timed.startAt,
    endAt: timed.endAt,
    allDay: false,
    category: 'meeting',
    linkedNoteIds: [],
    linkedTaskIds: [],
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

describe('Dashboard selectors and metrics', () => {
  it('computes accurate overview metrics matching tasks and events', () => {
    const completedTodayLocal = new Date(2026, 10, 25, 14, 30, 0).toISOString();
    const tasks: TaskRecord[] = [
      makeTask({ id: 'overdue', dueDate: YESTERDAY }),
      makeTask({ id: 'today', dueDate: TODAY }),
      makeTask({ id: 'upcoming', dueDate: TOMORROW }),
      makeTask({ id: 'far-future', dueDate: '2026-12-20' }),
      makeTask({
        id: 'done-today',
        status: 'done',
        dueDate: TODAY,
        completedAt: completedTodayLocal,
      }),
    ];

    const events: CalendarEventRecord[] = [
      makeEvent({ id: 'ev-today' }),
      makeEvent({
        id: 'ev-allday-today',
        allDay: true,
        ...buildAllDayRange(TODAY, TODAY),
      }),
      makeEvent({
        id: 'ev-tomorrow',
        allDay: true,
        ...buildAllDayRange(TOMORROW, TOMORROW),
      }),
    ];

    expect(computeDashboardMetrics(tasks, events, TODAY)).toEqual({
      tasksDueTodayCount: 1,
      tasksCompletedTodayCount: 1,
      overdueTasksCount: 1,
      eventsTodayCount: 2,
      upcomingDeadlinesCount: 1,
    });
  });

  it('orders today events (all-day first), selects upcoming events, buckets tasks, and recent notes', () => {
    const afternoon = buildTimedRange(TODAY, '15:00', TODAY, '16:00');
    const morning = buildTimedRange(TODAY, '09:00', TODAY, '10:00');

    const events = [
      makeEvent({ id: 'afternoon', startAt: afternoon.startAt, endAt: afternoon.endAt }),
      makeEvent({ id: 'morning', startAt: morning.startAt, endAt: morning.endAt }),
      makeEvent({
        id: 'allday',
        allDay: true,
        ...buildAllDayRange(TODAY, TODAY),
      }),
      makeEvent({
        id: 'upcoming-1',
        allDay: true,
        ...buildAllDayRange(TOMORROW, TOMORROW),
      }),
      makeEvent({
        id: 'too-far',
        allDay: true,
        ...buildAllDayRange('2026-12-20', '2026-12-20'),
      }),
    ];

    expect(selectTodaysEvents(events, TODAY).map((e) => e.id)).toEqual([
      'allday',
      'morning',
      'afternoon',
    ]);
    expect(selectUpcomingEvents(events, TODAY, 7, 5).map((e) => e.id)).toEqual([
      'upcoming-1',
    ]);

    const buckets = selectDashboardTaskBuckets(
      [
        makeTask({ id: 'ov', dueDate: YESTERDAY }),
        makeTask({ id: 'td', dueDate: TODAY }),
        makeTask({ id: 'up', dueDate: TOMORROW }),
        makeTask({
          id: 'dn',
          status: 'done',
          completedAt: '2026-11-25T11:00:00.000Z',
        }),
      ],
      TODAY,
    );
    expect(buckets.overdue.map((t) => t.id)).toEqual(['ov']);
    expect(buckets.dueToday.map((t) => t.id)).toEqual(['td']);
    expect(buckets.upcoming.map((t) => t.id)).toEqual(['up']);
    expect(buckets.recentlyCompleted.map((t) => t.id)).toEqual(['dn']);

    const notes = selectRecentNotes([
      makeNote({ id: 'old', updatedAt: '2026-11-24T10:00:00.000Z' }),
      makeNote({ id: 'new', updatedAt: '2026-11-25T12:00:00.000Z' }),
    ]);
    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('derives unified chronological activity across notes, tasks, and events', () => {
    const activity = selectRecentActivity(
      [
        makeNote({
          id: 'n1',
          revision: 2,
          createdAt: '2026-11-25T08:00:00.000Z',
          updatedAt: '2026-11-25T09:00:00.000Z',
        }),
      ],
      [
        makeTask({
          id: 't1',
          status: 'done',
          completedAt: '2026-11-25T11:00:00.000Z',
        }),
      ],
      [
        makeEvent({
          id: 'e1',
          createdAt: '2026-11-25T10:00:00.000Z',
          updatedAt: '2026-11-25T10:00:00.000Z',
        }),
      ],
    );

    expect(activity.map((a) => `${a.kind}:${a.to}`)).toEqual([
      'task_completed:/tasks?taskId=t1',
      `event_created:/calendar?date=${TODAY}&eventId=e1`,
      'note_updated:/notes/n1',
    ]);
  });
});

describe('Offline workspace global search', () => {
  it('searches across note title/content/tags, task title/description, and event title/description/location', () => {
    const folders: FolderRecord[] = [
      {
        id: 'f-1',
        name: 'Research',
        parentId: null,
        createdAt: '2026-11-25T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
      },
    ];
    const notes: NoteRecord[] = [
      makeNote({
        id: 'n-title',
        folderId: 'f-1',
        title: 'Algorithms Paper',
        content: 'Overview of amortized complexity.',
      }),
      makeNote({
        id: 'n-tag',
        title: 'Study Checklist',
        content: 'Random body #algorithms tag inside content',
      }),
    ];
    const noteTagsMap = new Map<string, string[]>([
      ['n-tag', ['algorithms']],
    ]);

    const tasks: TaskRecord[] = [
      makeTask({
        id: 't-desc',
        title: 'Proofread Draft',
        description: 'Check algorithms benchmark table',
      }),
    ];

    const events: CalendarEventRecord[] = [
      makeEvent({
        id: 'e-loc',
        title: 'Seminar Talk',
        description: 'Weekly group session',
        location: 'Algorithms Lab 204',
      }),
    ];

    const results = searchWorkspace({
      query: 'algorithms',
      notes,
      folders,
      noteTagsMap,
      tasks,
      events,
    });

    expect(results.notes.map((r) => r.entityId)).toEqual(['n-title', 'n-tag']);
    expect(results.notes[0]?.context).toContain('Research');
    expect(results.tasks.map((r) => r.entityId)).toEqual(['t-desc']);
    expect(results.events.map((r) => r.entityId)).toEqual(['e-loc']);
    expect(results.totalCount).toBe(4);

    expect(
      searchWorkspace({
        query: '   ',
        notes,
        tasks,
        events,
      }).totalCount,
    ).toBe(0);

    expect(highlightMatchSegments('Algorithms Spec', 'algo')).toEqual([
      { text: 'Algo', matched: true },
      { text: 'rithms Spec', matched: false },
    ]);
  });
});
