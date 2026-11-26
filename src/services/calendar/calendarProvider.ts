import type { CalendarEventRecord } from '@/services/storage/db';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventById,
  listCalendarEvents,
  updateCalendarEvent,
} from '@/services/storage/calendarEvents.repository';

/**
 * Provider abstraction allowing external calendar integrations (e.g. Google Calendar)
 * to plug in alongside Nexus's local-first IndexedDB + Supabase calendar store.
 */
export interface CalendarProvider {
  readonly providerId: string;
  getEvents(): Promise<CalendarEventRecord[]>;
  createEvent(event: CalendarEventRecord): Promise<void>;
  updateEvent(event: CalendarEventRecord): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}

/**
 * Default local-first Nexus calendar provider backed by Dexie (`calendar_events`).
 */
export const localCalendarProvider: CalendarProvider = {
  providerId: 'nexus-local',

  async getEvents() {
    return listCalendarEvents();
  },

  async createEvent(event) {
    await createCalendarEvent({
      userId: event.userId,
      title: event.title,
      ...(event.description ? { description: event.description } : {}),
      ...(event.location ? { location: event.location } : {}),
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      ...(event.timezone ? { timezone: event.timezone } : {}),
      category: event.category,
      ...(event.color ? { color: event.color } : {}),
      linkedNoteIds: event.linkedNoteIds,
      linkedTaskIds: event.linkedTaskIds,
    });
  },

  async updateEvent(event) {
    const existing = await getCalendarEventById(event.id);
    if (!existing) {
      await createCalendarEvent(event);
      return;
    }
    await updateCalendarEvent(event.id, {
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      ...(event.timezone ? { timezone: event.timezone } : {}),
      category: event.category,
      color: event.color ?? null,
      linkedNoteIds: event.linkedNoteIds,
      linkedTaskIds: event.linkedTaskIds,
    });
  },

  async deleteEvent(eventId) {
    await deleteCalendarEvent(eventId);
  },
};
