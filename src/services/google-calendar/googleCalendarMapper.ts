import {
  addDays,
  buildAllDayRange,
  getEventDateRange,
  getLocalTimezone,
} from '@/features/calendar/utils/calendarDateUtils';
import { createUuid, type CalendarEventRecord, type EventCategory } from '@/services/storage/db';

export type CalendarConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'revoked';

export interface CalendarConnectionInfo {
  readonly status: CalendarConnectionStatus;
  readonly calendarId: string;
  readonly calendarSummary: string | null;
  readonly scope: string | null;
  readonly connectedAt: string | null;
  readonly lastSyncedAt: string | null;
}

export interface GoogleCalendarEventDateTime {
  readonly date?: string;
  readonly dateTime?: string;
  readonly timeZone?: string;
}

export interface GoogleCalendarEventDto {
  readonly id: string;
  readonly status?: 'confirmed' | 'tentative' | 'cancelled' | string;
  readonly etag?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly location?: string;
  readonly start?: GoogleCalendarEventDateTime;
  readonly end?: GoogleCalendarEventDateTime;
  readonly updated?: string;
  readonly created?: string;
  readonly htmlLink?: string;
  readonly extendedProperties?: {
    readonly private?: Record<string, string>;
  };
}

export interface GoogleCalendarEventPayload {
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly start: GoogleCalendarEventDateTime;
  readonly end: GoogleCalendarEventDateTime;
  readonly extendedProperties: {
    readonly private: {
      readonly nexusEventId: string;
      readonly nexusCategory: EventCategory;
    };
  };
}

export interface GoogleCalendarListResponse {
  readonly calendarId: string;
  readonly items: readonly GoogleCalendarEventDto[];
  readonly nextSyncToken: string | null;
  readonly fullSync: boolean;
}

export interface GoogleCalendarSyncPlan {
  readonly pushCreates: readonly CalendarEventRecord[];
  readonly pushUpdates: readonly {
    readonly local: CalendarEventRecord;
    readonly googleEventId: string;
  }[];
  readonly pushDeletes: readonly {
    readonly localId: string;
    readonly googleEventId: string;
  }[];
  readonly pullUpserts: readonly CalendarEventRecord[];
  readonly pullDeletes: readonly string[];
}

const VALID_CATEGORIES: readonly EventCategory[] = [
  'study',
  'work',
  'personal',
  'meeting',
  'other',
];

function parseCategory(raw: string | undefined): EventCategory {
  if (raw && VALID_CATEGORIES.includes(raw as EventCategory)) {
    return raw as EventCategory;
  }
  return 'personal';
}

/**
 * Converts a local Nexus `CalendarEventRecord` into a Google Calendar API v3
 * event payload, mapping inclusive Nexus all-day ranges to Google's exclusive end date.
 */
export function nexusEventToGooglePayload(
  event: CalendarEventRecord,
): GoogleCalendarEventPayload {
  const timeZone = event.timezone || getLocalTimezone();

  let start: GoogleCalendarEventDateTime;
  let end: GoogleCalendarEventDateTime;

  if (event.allDay) {
    const { startDateKey, endDateKey } = getEventDateRange(event);
    const clampedEnd = endDateKey < startDateKey ? startDateKey : endDateKey;
    start = { date: startDateKey };
    end = { date: addDays(clampedEnd, 1) };
  } else {
    start = { dateTime: event.startAt, timeZone };
    end = { dateTime: event.endAt, timeZone };
  }

  return {
    summary: event.title,
    ...(event.description !== undefined ? { description: event.description } : {}),
    ...(event.location !== undefined ? { location: event.location } : {}),
    start,
    end,
    extendedProperties: {
      private: {
        nexusEventId: event.id,
        nexusCategory: event.category,
      },
    },
  };
}

/**
 * Converts a Google Calendar API v3 event DTO into a local `CalendarEventRecord`,
 * preserving Nexus-only metadata (linked Notes/Tasks, local ID, category, color) when updating.
 */
export function googleEventToNexusRecord(
  remote: GoogleCalendarEventDto,
  params: {
    userId: string;
    calendarId: string;
    existing?: CalendarEventRecord;
  },
): CalendarEventRecord | null {
  if (!remote.start || !remote.end) {
    return null;
  }

  const isAllDay = Boolean(remote.start.date);
  let startAt: string;
  let endAt: string;
  let timezone =
    remote.start.timeZone ||
    remote.end.timeZone ||
    params.existing?.timezone ||
    getLocalTimezone();

  if (isAllDay && remote.start.date) {
    const startKey = remote.start.date;
    const exclusiveEnd = remote.end.date || addDays(startKey, 1);
    const inclusiveCandidate = addDays(exclusiveEnd, -1);
    const inclusiveEnd =
      inclusiveCandidate < startKey ? startKey : inclusiveCandidate;
    const range = buildAllDayRange(startKey, inclusiveEnd);
    startAt = range.startAt;
    endAt = range.endAt;
  } else if (remote.start.dateTime && remote.end.dateTime) {
    startAt = new Date(remote.start.dateTime).toISOString();
    endAt = new Date(remote.end.dateTime).toISOString();
    if (Date.parse(endAt) < Date.parse(startAt)) {
      endAt = startAt;
    }
  } else {
    return null;
  }

  const now = new Date().toISOString();
  const remoteUpdated = remote.updated || now;
  const remoteCategory = remote.extendedProperties?.private?.nexusCategory;
  const existing = params.existing;
  const nextRevision = (existing?.revision ?? 0) + 1;
  const description = remote.description?.trim() || undefined;
  const location = remote.location?.trim() || undefined;

  return {
    id: existing?.id ?? createUuid(),
    userId: existing?.userId && existing.userId !== 'local'
      ? existing.userId
      : params.userId,
    title: remote.summary?.trim() || '(No title)',
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    startAt,
    endAt,
    allDay: isAllDay,
    timezone,
    category: existing?.category ?? parseCategory(remoteCategory),
    ...(existing?.color ? { color: existing.color } : {}),
    linkedNoteIds: existing?.linkedNoteIds ?? [],
    linkedTaskIds: existing?.linkedTaskIds ?? [],
    googleEventId: remote.id,
    googleCalendarId: params.calendarId,
    ...(remote.etag ? { googleEtag: remote.etag } : {}),
    googleUpdatedAt: remoteUpdated,
    googleSyncedRevision: nextRevision,
    createdAt: existing?.createdAt ?? remote.created ?? now,
    updatedAt: remoteUpdated,
    revision: nextRevision,
    ...(existing?.lastSyncedRevision !== undefined
      ? { lastSyncedRevision: existing.lastSyncedRevision }
      : {}),
    ...(existing?.lastSyncedUpdatedAt !== undefined
      ? { lastSyncedUpdatedAt: existing.lastSyncedUpdatedAt }
      : {}),
  };
}

function isLocalDirtySinceGoogleSync(local: CalendarEventRecord): boolean {
  if (local.googleSyncedRevision !== undefined) {
    return local.revision !== local.googleSyncedRevision;
  }
  if (!local.googleUpdatedAt) {
    return true;
  }
  return Date.parse(local.updatedAt) > Date.parse(local.googleUpdatedAt) + 2000;
}

function isRemoteChangedSinceLastSync(
  local: CalendarEventRecord,
  remote: GoogleCalendarEventDto,
): boolean {
  if (remote.etag && local.googleEtag) {
    return remote.etag !== local.googleEtag;
  }
  if (remote.updated && local.googleUpdatedAt) {
    return (
      Date.parse(remote.updated) > Date.parse(local.googleUpdatedAt) + 1000
    );
  }
  return Boolean(remote.updated);
}

/**
 * Computes a deterministic two-way sync plan between local IndexedDB calendar
 * events (including deleted tombstones) and Google Calendar API events.
 */
export function planGoogleCalendarTwoWaySync(input: {
  localEvents: readonly CalendarEventRecord[];
  remoteEvents: readonly GoogleCalendarEventDto[];
  userId: string;
  calendarId: string;
}): GoogleCalendarSyncPlan {
  const pushCreates: CalendarEventRecord[] = [];
  const pushUpdates: { local: CalendarEventRecord; googleEventId: string }[] = [];
  const pushDeletes: { localId: string; googleEventId: string }[] = [];
  const pullUpserts: CalendarEventRecord[] = [];
  const pullDeletes: string[] = [];

  const localById = new Map<string, CalendarEventRecord>();
  const localByGoogleId = new Map<string, CalendarEventRecord>();

  for (const ev of input.localEvents) {
    localById.set(ev.id, ev);
    if (ev.googleEventId) {
      localByGoogleId.set(ev.googleEventId, ev);
    }
  }

  const matchedLocalIds = new Set<string>();

  for (const remote of input.remoteEvents) {
    const taggedNexusId = remote.extendedProperties?.private?.nexusEventId;
    const local =
      localByGoogleId.get(remote.id) ??
      (taggedNexusId ? localById.get(taggedNexusId) : undefined);

    if (local) {
      matchedLocalIds.add(local.id);
    }

    if (remote.status === 'cancelled') {
      if (local) {
        pullDeletes.push(local.id);
      }
      continue;
    }

    if (!local) {
      const createdLocal = googleEventToNexusRecord(remote, {
        userId: input.userId,
        calendarId: input.calendarId,
      });
      if (createdLocal) {
        pullUpserts.push(createdLocal);
      }
      continue;
    }

    // Local deletion takes precedence for tracked Google events
    if (local.deletedAt) {
      if (local.googleEventId) {
        pushDeletes.push({
          localId: local.id,
          googleEventId: local.googleEventId,
        });
      }
      continue;
    }

    const localDirty = isLocalDirtySinceGoogleSync(local);
    const remoteDirty = isRemoteChangedSinceLastSync(local, remote);

    if (localDirty && remoteDirty) {
      const localMs = Date.parse(local.updatedAt) || 0;
      const remoteMs = remote.updated ? Date.parse(remote.updated) || 0 : 0;
      if (localMs >= remoteMs) {
        pushUpdates.push({ local, googleEventId: remote.id });
      } else {
        const merged = googleEventToNexusRecord(remote, {
          userId: input.userId,
          calendarId: input.calendarId,
          existing: local,
        });
        if (merged) {
          pullUpserts.push(merged);
        }
      }
    } else if (localDirty) {
      pushUpdates.push({ local, googleEventId: remote.id });
    } else if (remoteDirty) {
      const merged = googleEventToNexusRecord(remote, {
        userId: input.userId,
        calendarId: input.calendarId,
        existing: local,
      });
      if (merged) {
        pullUpserts.push(merged);
      }
    }
  }

  // Handle unmatched local events & tombstones
  for (const local of input.localEvents) {
    if (matchedLocalIds.has(local.id)) continue;

    if (local.deletedAt) {
      if (local.googleEventId) {
        pushDeletes.push({
          localId: local.id,
          googleEventId: local.googleEventId,
        });
      }
      continue;
    }

    if (!local.googleEventId) {
      pushCreates.push(local);
    } else if (isLocalDirtySinceGoogleSync(local)) {
      pushUpdates.push({ local, googleEventId: local.googleEventId });
    }
  }

  return {
    pushCreates,
    pushUpdates,
    pushDeletes,
    pullUpserts,
    pullDeletes,
  };
}
