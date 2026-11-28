import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildAllDayRange,
  buildTimedRange,
  EVENT_COLOR_OPTIONS,
  eventOccursOnDate,
  filterCalendarEvents,
  getEventAccentClasses,
  getEventDateRange,
  getLocalTimePosition,
  getMonthGridDates,
  getWeekDates,
  layoutOverlappingTimedEvents,
  resolveEventColor,
  validateEventRange,
} from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord } from '@/services/storage/db';
import { buildSyncPlan } from '../syncPlanner';
import type { RemoteCalendarEventMetadata, SyncChange } from '../syncTypes';

const NOW_ISO = '2026-11-25T10:00:00.000Z';
const LATER_ISO = '2026-11-25T12:00:00.000Z';

function makeEvent(
  overrides: Partial<CalendarEventRecord> = {},
): CalendarEventRecord {
  return {
    id: 'ev-1',
    userId: 'user-1',
    title: 'Algorithms Lecture',
    startAt: '2026-11-25T09:00:00.000Z',
    endAt: '2026-11-25T10:00:00.000Z',
    allDay: false,
    category: 'study',
    linkedNoteIds: [],
    linkedTaskIds: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    revision: 1,
    ...overrides,
  };
}

function makeRemoteEvent(
  overrides: Partial<RemoteCalendarEventMetadata> = {},
): RemoteCalendarEventMetadata {
  return {
    id: 'ev-1',
    userId: 'user-1',
    title: 'Algorithms Lecture',
    description: null,
    location: null,
    startAt: '2026-11-25T09:00:00.000Z',
    endAt: '2026-11-25T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    category: 'study',
    color: null,
    linkedNoteIds: [],
    linkedTaskIds: [],
    revision: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null,
    ...overrides,
  };
}

describe('Calendar date/timezone, layout, and filter utilities', () => {
  it('handles canonical all-day UTC boundaries without timezone day shifts', () => {
    const range = buildAllDayRange('2026-11-25', '2026-11-26');
    expect(range).toEqual({
      startAt: '2026-11-25T00:00:00.000Z',
      endAt: '2026-11-26T23:59:59.999Z',
    });

    const allDayEvent = makeEvent({
      allDay: true,
      startAt: range.startAt,
      endAt: range.endAt,
    });

    expect(getEventDateRange(allDayEvent)).toEqual({
      startDateKey: '2026-11-25',
      endDateKey: '2026-11-26',
    });
    expect(eventOccursOnDate(allDayEvent, '2026-11-24')).toBe(false);
    expect(eventOccursOnDate(allDayEvent, '2026-11-25')).toBe(true);
    expect(eventOccursOnDate(allDayEvent, '2026-11-26')).toBe(true);
    expect(eventOccursOnDate(allDayEvent, '2026-11-27')).toBe(false);
  });

  it('validates event time ranges and handles exact local midnight boundaries', () => {
    const valid = buildTimedRange('2026-11-25', '09:00', '2026-11-25', '10:30');
    expect(validateEventRange(valid.startAt, valid.endAt)).toBeNull();
    expect(validateEventRange(valid.endAt, valid.startAt)).toBe(
      'Event end time cannot be earlier than start time.',
    );

    const lateNight = buildTimedRange(
      '2026-11-25',
      '22:00',
      '2026-11-26',
      '00:00',
    );
    const midnightEvent = makeEvent({
      startAt: lateNight.startAt,
      endAt: lateNight.endAt,
    });
    expect(eventOccursOnDate(midnightEvent, '2026-11-25')).toBe(true);
    expect(eventOccursOnDate(midnightEvent, '2026-11-26')).toBe(false);
  });

  it('lays out concurrent timed events into non-overlapping columns', () => {
    const r1 = buildTimedRange('2026-11-25', '09:00', '2026-11-25', '10:30');
    const r2 = buildTimedRange('2026-11-25', '10:00', '2026-11-25', '11:00');
    const r3 = buildTimedRange('2026-11-25', '14:00', '2026-11-25', '15:00');

    const laidOut = layoutOverlappingTimedEvents(
      [
        makeEvent({ id: 'a', startAt: r1.startAt, endAt: r1.endAt }),
        makeEvent({ id: 'b', startAt: r2.startAt, endAt: r2.endAt }),
        makeEvent({ id: 'c', startAt: r3.startAt, endAt: r3.endAt }),
      ],
      '2026-11-25',
    );

    const a = laidOut.find((i) => i.event.id === 'a');
    const b = laidOut.find((i) => i.event.id === 'b');
    const c = laidOut.find((i) => i.event.id === 'c');

    expect(a?.totalColumns).toBe(2);
    expect(b?.totalColumns).toBe(2);
    expect(a?.column).not.toBe(b?.column);
    expect(c?.totalColumns).toBe(1);
    expect(c?.column).toBe(0);
  });

  it('builds 42-day month grids, 7-day weeks, and clamps end-of-month jumps', () => {
    expect(getMonthGridDates('2026-11-25')).toHaveLength(42);
    expect(getWeekDates('2026-11-25')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('filters calendar events by search text, category, date range, and note/task links', () => {
    const events: CalendarEventRecord[] = [
      makeEvent({
        id: 'ev-a',
        title: 'Thesis Review',
        description: 'With advisor',
        location: 'Room 304',
        category: 'study',
        linkedNoteIds: ['note-algo'],
        linkedTaskIds: ['task-1'],
        ...buildAllDayRange('2026-11-25', '2026-11-25'),
        allDay: true,
      }),
      makeEvent({
        id: 'ev-b',
        title: 'Doctor Appointment',
        category: 'personal',
        ...buildAllDayRange('2026-11-28', '2026-11-28'),
        allDay: true,
      }),
    ];

    expect(
      filterCalendarEvents(events, { searchQuery: 'room 304' }).map(
        (e) => e.id,
      ),
    ).toEqual(['ev-a']);
    expect(
      filterCalendarEvents(events, { categoryFilter: 'personal' }).map(
        (e) => e.id,
      ),
    ).toEqual(['ev-b']);
    expect(
      filterCalendarEvents(events, {
        linkedNoteId: 'note-algo',
        linkedTaskId: 'task-1',
      }).map((e) => e.id),
    ).toEqual(['ev-a']);
    expect(
      filterCalendarEvents(events, {
        startDateFilter: '2026-11-27',
        endDateFilter: '2026-11-30',
      }).map((e) => e.id),
    ).toEqual(['ev-b']);
  });

  it('resolves dark-mode event color palette options and calculates local time grid positions', () => {
    expect(EVENT_COLOR_OPTIONS.map((o) => o.id)).toEqual([
      'sage',
      'terracotta',
      'blue',
      'amber',
      'rose',
      'violet',
      'slate',
    ]);

    expect(resolveEventColor('personal', 'sage')).toBe('sage');
    expect(resolveEventColor('personal', 'emerald')).toBe('sage');
    expect(resolveEventColor('personal', undefined)).toBe('sage');
    expect(resolveEventColor('personal', 'slate')).toBe('slate');
    expect(resolveEventColor('study', undefined)).toBe('blue');
    expect(getEventAccentClasses('personal', undefined).swatchClass).toBe(
      'bg-[#6E9E88]',
    );
    expect(getEventAccentClasses('personal', 'amber').surfaceClass).toContain(
      'bg-[rgba(201,162,94,0.12)]',
    );
    expect(getEventAccentClasses('personal', 'slate').surfaceClass).toContain(
      'bg-[rgba(126,139,133,0.12)]',
    );

    const morningPos = getLocalTimePosition(new Date(2026, 10, 27, 10, 30, 0));
    expect(morningPos.dateKey).toBe('2026-11-27');
    expect(morningPos.hour).toBe(10);
    expect(morningPos.minutesFromMidnight).toBe(630);
    expect(morningPos.topPercent).toBeCloseTo(43.75, 5);
  });
});

describe('buildSyncPlan for Calendar Events (Supabase Hybrid Sync)', () => {
  it('plans calendar event push even when Google Drive is disconnected (includeDriveSync: false)', () => {
    const ev = makeEvent();
    const change: SyncChange = {
      id: 'c-ev-1',
      entityType: 'calendar_event',
      entityId: ev.id,
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
      localCalendarEvents: [ev],
      remoteCalendarEvents: [],
      includeDriveSync: false,
    });

    expect(plan.actions).toEqual([
      {
        type: 'push_calendar_event',
        eventId: 'ev-1',
        changeId: 'c-ev-1',
      },
    ]);
  });

  it('pulls remote calendar events onto a second device and stays idempotent when synced', () => {
    const remoteEv = makeRemoteEvent({ revision: 2, updatedAt: LATER_ISO });

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
      localCalendarEvents: [],
      remoteCalendarEvents: [remoteEv],
      includeDriveSync: false,
    });

    expect(pullPlan.actions).toEqual([
      { type: 'pull_remote_calendar_event', event: remoteEv },
    ]);

    const syncedLocal = makeEvent({
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
      localCalendarEvents: [syncedLocal],
      remoteCalendarEvents: [remoteEv],
      includeDriveSync: false,
    });

    expect(steadyPlan.actions).toEqual([]);
  });

  it('detects concurrent calendar event conflicts and propagates deletions safely', () => {
    const localConflict = makeEvent({
      id: 'ev-conflict',
      revision: 2,
      lastSyncedRevision: 1,
      updatedAt: LATER_ISO,
    });
    const remoteConflict = makeRemoteEvent({
      id: 'ev-conflict',
      revision: 2,
      updatedAt: LATER_ISO,
    });
    const localDeleted = makeEvent({
      id: 'ev-del-local',
      deletedAt: LATER_ISO,
      revision: 2,
    });
    const remoteActive = makeRemoteEvent({
      id: 'ev-del-local',
      revision: 1,
    });
    const localSyncedForRemoteDel = makeEvent({
      id: 'ev-del-remote',
      revision: 1,
      lastSyncedRevision: 1,
    });
    const remoteDeleted = makeRemoteEvent({
      id: 'ev-del-remote',
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
          entityType: 'calendar_event',
          entityId: 'ev-conflict',
          operation: 'update',
          localRevision: 2,
          createdAt: LATER_ISO,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'c-del',
          entityType: 'calendar_event',
          entityId: 'ev-del-local',
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
      localCalendarEvents: [
        localConflict,
        localDeleted,
        localSyncedForRemoteDel,
      ],
      remoteCalendarEvents: [remoteConflict, remoteActive, remoteDeleted],
      includeDriveSync: false,
    });

    expect(plan.actions).toEqual([
      {
        type: 'record_calendar_event_conflict',
        eventId: 'ev-conflict',
        reason: 'both_modified',
        remoteEvent: remoteConflict,
      },
      {
        type: 'delete_remote_calendar_event',
        eventId: 'ev-del-local',
        changeId: 'c-del',
      },
      {
        type: 'delete_local_calendar_event',
        eventId: 'ev-del-remote',
      },
    ]);
  });
});
