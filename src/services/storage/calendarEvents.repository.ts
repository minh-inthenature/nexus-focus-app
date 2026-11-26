import {
  getLocalTimezone,
  validateEventRange,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import {
  createUuid,
  db,
  type CalendarEventRecord,
  type EventCategory,
} from './db';

export interface CreateCalendarEventInput {
  readonly userId?: string;
  readonly title: string;
  readonly description?: string;
  readonly location?: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly allDay?: boolean;
  readonly timezone?: string;
  readonly category?: EventCategory;
  readonly color?: string;
  readonly linkedNoteIds?: readonly string[];
  readonly linkedTaskIds?: readonly string[];
  readonly rrule?: string;
  readonly exdates?: readonly string[];
}

export interface UpdateCalendarEventPatch {
  readonly title?: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly allDay?: boolean;
  readonly timezone?: string;
  readonly category?: EventCategory;
  readonly color?: string | null;
  readonly linkedNoteIds?: readonly string[];
  readonly linkedTaskIds?: readonly string[];
  readonly rrule?: string | null;
  readonly exdates?: readonly string[] | null;
}

function dedupeIds(ids: readonly string[] | undefined): string[] {
  if (!ids) return [];
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

/**
 * Lists all active (non-deleted) calendar events sorted chronologically by `startAt`.
 */
export async function listCalendarEvents(): Promise<CalendarEventRecord[]> {
  const all = await db.calendar_events.filter((ev) => !ev.deletedAt).toArray();
  return all.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * Lists all calendar events including deleted tombstones for synchronization planning.
 */
export async function listAllCalendarEventsIncludingDeleted(): Promise<
  CalendarEventRecord[]
> {
  return db.calendar_events.toArray();
}

export async function getCalendarEventById(
  eventId: string,
): Promise<CalendarEventRecord | null> {
  const record = await db.calendar_events.get(eventId);
  if (!record || record.deletedAt) return null;
  return record;
}

/**
 * Lists active calendar events linked to a specific note UUID.
 */
export async function listEventsForNote(
  noteId: string,
): Promise<CalendarEventRecord[]> {
  const all = await db.calendar_events
    .filter((ev) => !ev.deletedAt && ev.linkedNoteIds.includes(noteId))
    .toArray();
  return all.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * Lists active calendar events linked to a specific task UUID.
 */
export async function listEventsForTask(
  taskId: string,
): Promise<CalendarEventRecord[]> {
  const all = await db.calendar_events
    .filter((ev) => !ev.deletedAt && ev.linkedTaskIds.includes(taskId))
    .toArray();
  return all.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * Creates a calendar event in IndexedDB with atomic sync outbox tracking.
 */
export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarEventRecord> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Event title is required.');
  }

  const rangeErr = validateEventRange(input.startAt, input.endAt);
  if (rangeErr) {
    throw new Error(rangeErr);
  }

  const now = new Date().toISOString();
  const description = input.description?.trim() || undefined;
  const location = input.location?.trim() || undefined;
  const color =
    input.color && input.color !== 'default' ? input.color.trim() : undefined;
  const timezone = input.timezone?.trim() || getLocalTimezone();
  const rrule = input.rrule?.trim() || undefined;
  const exdates =
    input.exdates && input.exdates.length > 0
      ? dedupeIds(input.exdates)
      : undefined;

  const record: CalendarEventRecord = {
    id: createUuid(),
    userId: input.userId || 'local',
    title,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: Boolean(input.allDay),
    timezone,
    category: input.category ?? 'personal',
    ...(color ? { color } : {}),
    linkedNoteIds: dedupeIds(input.linkedNoteIds),
    linkedTaskIds: dedupeIds(input.linkedTaskIds),
    ...(rrule ? { rrule } : {}),
    ...(exdates ? { exdates } : {}),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };

  await db.transaction(
    'rw',
    [db.calendar_events, db.sync_changes],
    async () => {
      await db.calendar_events.add(record);
      await enqueueSyncChangeInTx(
        'calendar_event',
        record.id,
        'create',
        record.revision,
      );
    },
  );

  notifySyncQueueMutated();
  return record;
}

/**
 * Updates a calendar event inside a Dexie transaction and queues sync metadata.
 */
export async function updateCalendarEvent(
  eventId: string,
  patch: UpdateCalendarEventPatch,
): Promise<CalendarEventRecord> {
  const updated = await db.transaction(
    'rw',
    [db.calendar_events, db.sync_changes],
    async () => {
      const existing = await db.calendar_events.get(eventId);
      if (!existing || existing.deletedAt) {
        throw new Error('Calendar event not found.');
      }

      const nextTitle =
        patch.title !== undefined ? patch.title.trim() : existing.title;
      if (!nextTitle) {
        throw new Error('Event title cannot be empty.');
      }

      const nextStartAt = patch.startAt ?? existing.startAt;
      const nextEndAt = patch.endAt ?? existing.endAt;
      const rangeErr = validateEventRange(nextStartAt, nextEndAt);
      if (rangeErr) {
        throw new Error(rangeErr);
      }

      const nextDescription =
        patch.description === null
          ? undefined
          : patch.description !== undefined
            ? patch.description.trim() || undefined
            : existing.description;

      const nextLocation =
        patch.location === null
          ? undefined
          : patch.location !== undefined
            ? patch.location.trim() || undefined
            : existing.location;

      const nextColor =
        patch.color === null || patch.color === 'default'
          ? undefined
          : patch.color !== undefined
            ? patch.color.trim() || undefined
            : existing.color;

      const nextTimezone =
        patch.timezone !== undefined
          ? patch.timezone.trim() || getLocalTimezone()
          : existing.timezone ?? getLocalTimezone();

      const nextRrule =
        patch.rrule === null
          ? undefined
          : patch.rrule !== undefined
            ? patch.rrule.trim() || undefined
            : existing.rrule;

      const nextExdates =
        patch.exdates === null
          ? undefined
          : patch.exdates !== undefined
            ? patch.exdates.length > 0
              ? dedupeIds(patch.exdates)
              : undefined
            : existing.exdates;

      const now = new Date().toISOString();

      const cleaned: CalendarEventRecord = {
        id: existing.id,
        userId: existing.userId,
        title: nextTitle,
        startAt: nextStartAt,
        endAt: nextEndAt,
        allDay: patch.allDay ?? existing.allDay,
        timezone: nextTimezone,
        category: patch.category ?? existing.category,
        linkedNoteIds:
          patch.linkedNoteIds !== undefined
            ? dedupeIds(patch.linkedNoteIds)
            : existing.linkedNoteIds,
        linkedTaskIds:
          patch.linkedTaskIds !== undefined
            ? dedupeIds(patch.linkedTaskIds)
            : existing.linkedTaskIds,
        createdAt: existing.createdAt,
        updatedAt: now,
        revision: existing.revision + 1,
        ...(nextDescription ? { description: nextDescription } : {}),
        ...(nextLocation ? { location: nextLocation } : {}),
        ...(nextColor ? { color: nextColor } : {}),
        ...(nextRrule ? { rrule: nextRrule } : {}),
        ...(nextExdates && nextExdates.length > 0 ? { exdates: nextExdates } : {}),
        ...(existing.googleEventId !== undefined
          ? { googleEventId: existing.googleEventId }
          : {}),
        ...(existing.googleCalendarId !== undefined
          ? { googleCalendarId: existing.googleCalendarId }
          : {}),
        ...(existing.googleEtag !== undefined
          ? { googleEtag: existing.googleEtag }
          : {}),
        ...(existing.googleUpdatedAt !== undefined
          ? { googleUpdatedAt: existing.googleUpdatedAt }
          : {}),
        ...(existing.googleSyncedRevision !== undefined
          ? { googleSyncedRevision: existing.googleSyncedRevision }
          : {}),
        ...(existing.lastSyncedRevision !== undefined
          ? { lastSyncedRevision: existing.lastSyncedRevision }
          : {}),
        ...(existing.lastSyncedUpdatedAt !== undefined
          ? { lastSyncedUpdatedAt: existing.lastSyncedUpdatedAt }
          : {}),
      };

      await db.calendar_events.put(cleaned);
      await enqueueSyncChangeInTx(
        'calendar_event',
        cleaned.id,
        'update',
        cleaned.revision,
      );
      return cleaned;
    },
  );

  notifySyncQueueMutated();
  return updated;
}

/**
 * Deletes a calendar event. Preserves a `deletedAt` tombstone for synced events
 * until remote Supabase deletion completes, or deletes immediately if unsynced.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.calendar_events, db.sync_changes],
    async () => {
      const existing = await db.calendar_events.get(eventId);
      if (!existing) return;

      const now = new Date().toISOString();
      const nextRev = existing.revision + 1;
      const res = await enqueueSyncChangeInTx(
        'calendar_event',
        eventId,
        'delete',
        nextRev,
      );

      if (
        res === 'queued' ||
        existing.lastSyncedRevision !== undefined ||
        existing.googleEventId !== undefined
      ) {
        await db.calendar_events.update(eventId, {
          deletedAt: now,
          revision: nextRev,
          updatedAt: now,
        });
      } else {
        await db.calendar_events.delete(eventId);
      }
    },
  );

  notifySyncQueueMutated();
}

/**
 * Looks up a local calendar event (including tombstones) by its synced Google Calendar Event ID.
 */
export async function getCalendarEventByGoogleId(
  googleEventId: string,
): Promise<CalendarEventRecord | null> {
  const match = await db.calendar_events
    .where('googleEventId')
    .equals(googleEventId)
    .first();
  return match ?? null;
}

/**
 * Attaches or updates Google Calendar sync metadata on an existing local event
 * without bumping its local revision or re-enqueuing another outbound change.
 */
export async function updateCalendarEventGoogleMeta(
  eventId: string,
  meta: {
    googleEventId: string;
    googleCalendarId: string;
    googleEtag?: string;
    googleUpdatedAt?: string;
    googleSyncedRevision?: number;
  },
): Promise<void> {
  await db.calendar_events.update(eventId, {
    googleEventId: meta.googleEventId,
    googleCalendarId: meta.googleCalendarId,
    ...(meta.googleEtag !== undefined ? { googleEtag: meta.googleEtag } : {}),
    ...(meta.googleUpdatedAt !== undefined
      ? { googleUpdatedAt: meta.googleUpdatedAt }
      : {}),
    ...(meta.googleSyncedRevision !== undefined
      ? { googleSyncedRevision: meta.googleSyncedRevision }
      : {}),
  });
}

/**
 * Applies a remote calendar event into IndexedDB without enqueuing an outbound sync change.
 */
export async function applyRemoteCalendarEventUpsert(
  event: CalendarEventRecord,
): Promise<void> {
  await db.calendar_events.put(event);
}

/**
 * Purges a locally tombstoned or remotely deleted calendar event from IndexedDB.
 */
export async function purgeDeletedCalendarEventTombstone(
  eventId: string,
): Promise<void> {
  await db.calendar_events.delete(eventId);
}
