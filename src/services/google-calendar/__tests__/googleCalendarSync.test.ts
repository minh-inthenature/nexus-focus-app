import { describe, expect, it } from 'vitest';
import { buildAllDayRange } from '@/features/calendar/utils/calendarDateUtils';
import type { CalendarEventRecord } from '@/services/storage/db';
import {
  googleEventToNexusRecord,
  nexusEventToGooglePayload,
  planGoogleCalendarTwoWaySync,
  type GoogleCalendarEventDto,
} from '../googleCalendarMapper';

function makeLocalEvent(
  overrides: Partial<CalendarEventRecord> = {},
): CalendarEventRecord {
  return {
    id: 'local-ev-1',
    userId: 'user-1',
    title: 'Design Review',
    description: 'Review sprint architecture',
    location: 'Studio B',
    startAt: '2026-11-26T09:00:00.000Z',
    endAt: '2026-11-26T10:30:00.000Z',
    allDay: false,
    timezone: 'Asia/Ho_Chi_Minh',
    category: 'meeting',
    color: 'amber',
    linkedNoteIds: ['note-1'],
    linkedTaskIds: ['task-1'],
    createdAt: '2026-11-25T08:00:00.000Z',
    updatedAt: '2026-11-26T08:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

function makeRemoteEvent(
  overrides: Partial<GoogleCalendarEventDto> = {},
): GoogleCalendarEventDto {
  return {
    id: 'g-ev-1',
    status: 'confirmed',
    etag: '"etag-v1"',
    summary: 'Design Review',
    description: 'Review sprint architecture',
    location: 'Studio B',
    start: {
      dateTime: '2026-11-26T09:00:00.000Z',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    end: {
      dateTime: '2026-11-26T10:30:00.000Z',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    created: '2026-11-25T08:00:00.000Z',
    updated: '2026-11-26T08:00:00.000Z',
    ...overrides,
  };
}

describe('Google Calendar two-way mapper & sync planner', () => {
  it('maps inclusive Nexus all-day ranges to exclusive Google end dates and back', () => {
    const range = buildAllDayRange('2026-11-26', '2026-11-28');
    const localAllDay = makeLocalEvent({
      id: 'all-day-1',
      allDay: true,
      startAt: range.startAt,
      endAt: range.endAt,
    });

    const payload = nexusEventToGooglePayload(localAllDay);
    expect(payload.start).toEqual({ date: '2026-11-26' });
    expect(payload.end).toEqual({ date: '2026-11-29' });
    expect(payload.extendedProperties.private).toEqual({
      nexusEventId: 'all-day-1',
      nexusCategory: 'meeting',
    });

    const roundTripped = googleEventToNexusRecord(
      makeRemoteEvent({
        id: 'g-all-day-1',
        start: payload.start,
        end: payload.end,
        summary: localAllDay.title,
      }),
      { userId: 'user-1', calendarId: 'primary', existing: localAllDay },
    );

    expect(roundTripped).not.toBeNull();
    expect(roundTripped?.allDay).toBe(true);
    expect(roundTripped?.startAt).toBe('2026-11-26T00:00:00.000Z');
    expect(roundTripped?.endAt).toBe('2026-11-28T23:59:59.999Z');
    expect(roundTripped?.linkedNoteIds).toEqual(['note-1']);
    expect(roundTripped?.linkedTaskIds).toEqual(['task-1']);
    expect(roundTripped?.color).toBe('amber');
  });

  it('plans all 5 two-way sync operations deterministically', () => {
    // 1. Local only -> pushCreates
    const localNew = makeLocalEvent({ id: 'local-new', revision: 1 });

    // 2. Synced earlier, edited locally -> pushUpdates
    const localEdited = makeLocalEvent({
      id: 'local-edited',
      googleEventId: 'g-edited',
      googleCalendarId: 'primary',
      googleEtag: '"etag-1"',
      googleUpdatedAt: '2026-11-26T08:00:00.000Z',
      googleSyncedRevision: 1,
      revision: 2,
      updatedAt: '2026-11-26T09:15:00.000Z',
      title: 'Updated Local Title',
    });
    const remoteUnchangedForLocalEdit = makeRemoteEvent({
      id: 'g-edited',
      etag: '"etag-1"',
      updated: '2026-11-26T08:00:00.000Z',
    });

    // 3. Synced earlier, edited remotely -> pullUpserts
    const localUnchangedForRemoteEdit = makeLocalEvent({
      id: 'local-remote-edited',
      googleEventId: 'g-remote-edited',
      googleCalendarId: 'primary',
      googleEtag: '"etag-1"',
      googleUpdatedAt: '2026-11-26T08:00:00.000Z',
      googleSyncedRevision: 1,
      revision: 1,
    });
    const remoteUpdated = makeRemoteEvent({
      id: 'g-remote-edited',
      etag: '"etag-2"',
      summary: 'Renamed in Google Calendar',
      updated: '2026-11-26T09:30:00.000Z',
    });

    // 4. Local tombstone -> pushDeletes
    const localDeleted = makeLocalEvent({
      id: 'local-deleted',
      googleEventId: 'g-to-delete',
      googleCalendarId: 'primary',
      deletedAt: '2026-11-26T09:40:00.000Z',
    });
    const remoteForLocalDelete = makeRemoteEvent({ id: 'g-to-delete' });

    // 5. Remote cancelled -> pullDeletes
    const localForRemoteDelete = makeLocalEvent({
      id: 'local-cancelled-remotely',
      googleEventId: 'g-cancelled',
      googleCalendarId: 'primary',
      googleSyncedRevision: 1,
    });
    const remoteCancelled: GoogleCalendarEventDto = {
      id: 'g-cancelled',
      status: 'cancelled',
    };

    // 6. Remote new -> pullUpserts
    const remoteBrandNew = makeRemoteEvent({
      id: 'g-brand-new',
      summary: 'Coffee with Alex',
    });

    // 7. In-sync event -> no-op (immune to clock skew)
    const inSync = makeLocalEvent({
      id: 'local-in-sync',
      googleEventId: 'g-in-sync',
      googleCalendarId: 'primary',
      googleEtag: '"etag-sync"',
      googleUpdatedAt: '2026-11-26T08:00:00.000Z',
      googleSyncedRevision: 3,
      revision: 3,
      updatedAt: '2026-11-26T08:05:00.000Z', // slightly later PC clock
    });
    const remoteInSync = makeRemoteEvent({
      id: 'g-in-sync',
      etag: '"etag-sync"',
      updated: '2026-11-26T08:00:00.000Z',
    });

    const plan = planGoogleCalendarTwoWaySync({
      localEvents: [
        localNew,
        localEdited,
        localUnchangedForRemoteEdit,
        localDeleted,
        localForRemoteDelete,
        inSync,
      ],
      remoteEvents: [
        remoteUnchangedForLocalEdit,
        remoteUpdated,
        remoteForLocalDelete,
        remoteCancelled,
        remoteBrandNew,
        remoteInSync,
      ],
      userId: 'user-1',
      calendarId: 'primary',
    });

    expect(plan.pushCreates.map((e) => e.id)).toEqual(['local-new']);
    expect(plan.pushUpdates.map((u) => u.local.id)).toEqual(['local-edited']);
    expect(plan.pushDeletes).toEqual([
      { localId: 'local-deleted', googleEventId: 'g-to-delete' },
    ]);
    expect(plan.pullDeletes).toEqual(['local-cancelled-remotely']);
    expect(plan.pullUpserts.map((e) => e.googleEventId)).toEqual([
      'g-remote-edited',
      'g-brand-new',
    ]);
    expect(plan.pullUpserts[0]?.title).toBe('Renamed in Google Calendar');
    expect(plan.pullUpserts[0]?.linkedNoteIds).toEqual(['note-1']);
  });
});
