import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  addDays,
  addMonths,
  getTodayDateKey,
  isValidDateKey,
} from '@/features/calendar/utils/calendarDateUtils';
import {
  extractIcsFilesFromUploads,
  parseIcsContent,
} from '@/features/calendar/utils/icsCalendar';
import {
  createCalendarEvent as repoCreateEvent,
  deleteCalendarEvent as repoDeleteEvent,
  listCalendarEvents,
  updateCalendarEvent as repoUpdateEvent,
  updateCalendarEventGoogleMeta,
  type CalendarEventRecord,
  type CreateCalendarEventInput,
  type EventCategory,
  type UpdateCalendarEventPatch,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGoogleCalendarStore } from '@/stores/useGoogleCalendarStore';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';
export type CalendarSaveStatus = 'saved' | 'saving' | 'error';

export interface IcsImportSummary {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly cancelled: number;
  readonly fileCount: number;
  readonly warnings: readonly string[];
}

export interface EventDraftDefaults {
  readonly startDateKey?: string;
  readonly endDateKey?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly allDay?: boolean;
  readonly linkedNoteIds?: readonly string[];
  readonly linkedTaskIds?: readonly string[];
}

interface CalendarStoreState {
  events: CalendarEventRecord[];
  initialized: boolean;
  loading: boolean;
  saveStatus: CalendarSaveStatus;
  error: string | null;

  viewMode: CalendarViewMode;
  selectedDate: string;

  searchQuery: string;
  categoryFilter: EventCategory | 'all';
  startDateFilter: string;
  endDateFilter: string;
  linkedNoteIdFilter: string | null;
  linkedTaskIdFilter: string | null;
  showTasks: boolean;
  showCompletedTasks: boolean;

  editorOpen: boolean;
  editingEventId: string | null;
  draftDefaults: EventDraftDefaults | null;

  taskModalDate: string | null;

  initialize: (force?: boolean) => Promise<void>;
  refreshEvents: () => Promise<void>;
  setViewMode: (mode: CalendarViewMode) => void;
  setSelectedDate: (dateKey: string) => void;
  navigatePrev: () => void;
  navigateNext: () => void;
  goToday: () => void;
  goThisWeek: () => void;
  goThisMonth: () => void;

  setSearchQuery: (query: string) => void;
  setCategoryFilter: (cat: EventCategory | 'all') => void;
  setStartDateFilter: (dateKey: string) => void;
  setEndDateFilter: (dateKey: string) => void;
  setLinkedNoteIdFilter: (noteId: string | null) => void;
  setLinkedTaskIdFilter: (taskId: string | null) => void;
  setShowTasks: (show: boolean) => void;
  setShowCompletedTasks: (show: boolean) => void;
  clearFilters: () => void;

  openCreateModal: (defaults?: EventDraftDefaults) => void;
  openEditModal: (eventId: string) => void;
  closeEditor: () => void;

  openCreateTaskForDate: (dateKey: string) => void;
  closeCreateTaskModal: () => void;

  createEvent: (
    input: Omit<CreateCalendarEventInput, 'userId'>,
  ) => Promise<CalendarEventRecord>;
  updateEvent: (
    eventId: string,
    patch: UpdateCalendarEventPatch,
  ) => Promise<CalendarEventRecord>;
  deleteEvent: (eventId: string) => Promise<void>;
  importIcsFiles: (
    files: FileList | readonly File[],
  ) => Promise<IcsImportSummary>;
  clearError: () => void;
}

const CALENDAR_UI_STORAGE_KEY = 'nexus-calendar-ui-store';
let inflightInit: Promise<void> | null = null;

export const useCalendarStore = create<CalendarStoreState>()(
  persist(
    (set, get) => ({
      events: [],
      initialized: false,
      loading: false,
      saveStatus: 'saved',
      error: null,

      viewMode: 'month',
      selectedDate: getTodayDateKey(),

      searchQuery: '',
      categoryFilter: 'all',
      startDateFilter: '',
      endDateFilter: '',
      linkedNoteIdFilter: null,
      linkedTaskIdFilter: null,
      showTasks: true,
      showCompletedTasks: true,

      editorOpen: false,
      editingEventId: null,
      draftDefaults: null,

      taskModalDate: null,

      initialize: async (force = false) => {
        if (get().initialized && !force) return;
        if (inflightInit && !force) return inflightInit;

        set({ loading: !get().initialized });
        inflightInit = (async () => {
          try {
            await get().refreshEvents();
            set({ initialized: true, loading: false, error: null });
          } catch (err) {
            set({
              loading: false,
              error:
                err instanceof Error
                  ? err.message
                  : 'Failed to load calendar events from IndexedDB.',
            });
          } finally {
            inflightInit = null;
          }
        })();

        return inflightInit;
      },

      refreshEvents: async () => {
        const events = await listCalendarEvents();
        set({ events });
      },

      setViewMode: (viewMode) => set({ viewMode }),

      setSelectedDate: (dateKey) => {
        if (isValidDateKey(dateKey)) {
          set({ selectedDate: dateKey });
        }
      },

      navigatePrev: () => {
        const { viewMode, selectedDate } = get();
        if (viewMode === 'month') {
          set({ selectedDate: addMonths(selectedDate, -1) });
        } else if (viewMode === 'day') {
          set({ selectedDate: addDays(selectedDate, -1) });
        } else {
          set({ selectedDate: addDays(selectedDate, -7) });
        }
      },

      navigateNext: () => {
        const { viewMode, selectedDate } = get();
        if (viewMode === 'month') {
          set({ selectedDate: addMonths(selectedDate, 1) });
        } else if (viewMode === 'day') {
          set({ selectedDate: addDays(selectedDate, 1) });
        } else {
          set({ selectedDate: addDays(selectedDate, 7) });
        }
      },

      goToday: () => set({ selectedDate: getTodayDateKey() }),
      goThisWeek: () =>
        set({ selectedDate: getTodayDateKey(), viewMode: 'week' }),
      goThisMonth: () =>
        set({ selectedDate: getTodayDateKey(), viewMode: 'month' }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
      setStartDateFilter: (startDateFilter) => set({ startDateFilter }),
      setEndDateFilter: (endDateFilter) => set({ endDateFilter }),
      setLinkedNoteIdFilter: (linkedNoteIdFilter) =>
        set({ linkedNoteIdFilter }),
      setLinkedTaskIdFilter: (linkedTaskIdFilter) =>
        set({ linkedTaskIdFilter }),
      setShowTasks: (showTasks) => set({ showTasks }),
      setShowCompletedTasks: (showCompletedTasks) =>
        set({ showCompletedTasks }),

      clearFilters: () =>
        set({
          searchQuery: '',
          categoryFilter: 'all',
          startDateFilter: '',
          endDateFilter: '',
          linkedNoteIdFilter: null,
          linkedTaskIdFilter: null,
        }),

      openCreateModal: (defaults) =>
        set({
          editorOpen: true,
          editingEventId: null,
          draftDefaults: defaults ?? null,
        }),

      openEditModal: (eventId) =>
        set({
          editorOpen: true,
          editingEventId: eventId,
          draftDefaults: null,
        }),

      closeEditor: () =>
        set({
          editorOpen: false,
          editingEventId: null,
          draftDefaults: null,
        }),

      openCreateTaskForDate: (dateKey) => set({ taskModalDate: dateKey }),
      closeCreateTaskModal: () => set({ taskModalDate: null }),

      createEvent: async (input) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const userId = useAuthStore.getState().session?.user.id ?? 'local';
          const created = await repoCreateEvent({ ...input, userId });
          await get().refreshEvents();
          set({ saveStatus: 'saved' });
          if (
            useGoogleCalendarStore.getState().connection.status === 'connected'
          ) {
            void useGoogleCalendarStore.getState().syncNow();
          }
          return created;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to create event.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      updateEvent: async (eventId, patch) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const updated = await repoUpdateEvent(eventId, patch);
          await get().refreshEvents();
          set({ saveStatus: 'saved' });
          if (
            useGoogleCalendarStore.getState().connection.status === 'connected'
          ) {
            void useGoogleCalendarStore.getState().syncNow();
          }
          return updated;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to update event.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      deleteEvent: async (eventId) => {
        set({ saveStatus: 'saving', error: null });
        try {
          await repoDeleteEvent(eventId);
          await get().refreshEvents();
          set({ saveStatus: 'saved' });
          if (
            useGoogleCalendarStore.getState().connection.status === 'connected'
          ) {
            void useGoogleCalendarStore.getState().syncNow();
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to delete event.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      importIcsFiles: async (files) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const userId = useAuthStore.getState().session?.user.id ?? 'local';
          const extracted = await extractIcsFilesFromUploads(files);
          if (extracted.contents.length === 0) {
            throw new Error(
              extracted.warnings[0] ??
                'No .ics calendar events found in the selected file(s).',
            );
          }

          const existingEvents = await listCalendarEvents();
          const byUid = new Map<string, CalendarEventRecord>();
          const bySignature = new Map<string, CalendarEventRecord>();

          const makeSig = (ev: {
            title: string;
            startAt: string;
            endAt: string;
            allDay: boolean;
          }) =>
            `${ev.title.trim().toLowerCase()}|${ev.startAt}|${ev.endAt}|${ev.allDay}`;

          for (const ev of existingEvents) {
            if (ev.googleEventId) {
              const rawUid = ev.googleEventId.startsWith('ics:')
                ? ev.googleEventId.slice(4)
                : ev.googleEventId;
              byUid.set(rawUid, ev);
            }
            bySignature.set(makeSig(ev), ev);
          }

          let imported = 0;
          let updated = 0;
          let skipped = 0;
          let cancelled = 0;
          const allWarnings = [...extracted.warnings];

          for (const item of extracted.contents) {
            const parsed = parseIcsContent(item.text);
            cancelled += parsed.skippedCancelled;
            allWarnings.push(...parsed.warnings);

            for (const ev of parsed.events) {
              const uidMatch = ev.uid ? byUid.get(ev.uid) : undefined;
              const sigMatch = bySignature.get(makeSig(ev));

              if (uidMatch) {
                const unchanged =
                  uidMatch.title === ev.title &&
                  uidMatch.startAt === ev.startAt &&
                  uidMatch.endAt === ev.endAt &&
                  uidMatch.allDay === ev.allDay &&
                  (uidMatch.description ?? '') === (ev.description ?? '') &&
                  (uidMatch.location ?? '') === (ev.location ?? '') &&
                  (uidMatch.rrule ?? '') === (ev.rrule ?? '') &&
                  JSON.stringify(uidMatch.exdates ?? []) ===
                    JSON.stringify(ev.exdates ?? []);

                if (unchanged) {
                  skipped += 1;
                } else {
                  const patched = await repoUpdateEvent(uidMatch.id, {
                    title: ev.title,
                    description: ev.description ?? null,
                    location: ev.location ?? null,
                    startAt: ev.startAt,
                    endAt: ev.endAt,
                    allDay: ev.allDay,
                    ...(ev.timezone ? { timezone: ev.timezone } : {}),
                    rrule: ev.rrule ?? null,
                    exdates: ev.exdates ? [...ev.exdates] : null,
                  });
                  if (ev.uid) byUid.set(ev.uid, patched);
                  bySignature.set(makeSig(patched), patched);
                  updated += 1;
                }
                continue;
              }

              if (sigMatch) {
                if (
                  ev.rrule &&
                  ((sigMatch.rrule ?? '') !== ev.rrule ||
                    JSON.stringify(sigMatch.exdates ?? []) !==
                      JSON.stringify(ev.exdates ?? []))
                ) {
                  const upgraded = await repoUpdateEvent(sigMatch.id, {
                    rrule: ev.rrule,
                    exdates: ev.exdates ? [...ev.exdates] : null,
                  });
                  bySignature.set(makeSig(upgraded), upgraded);
                  updated += 1;
                } else {
                  skipped += 1;
                }
                continue;
              }

              const created = await repoCreateEvent({
                userId,
                title: ev.title,
                ...(ev.description ? { description: ev.description } : {}),
                ...(ev.location ? { location: ev.location } : {}),
                startAt: ev.startAt,
                endAt: ev.endAt,
                allDay: ev.allDay,
                ...(ev.timezone ? { timezone: ev.timezone } : {}),
                category: ev.category,
                ...(ev.rrule ? { rrule: ev.rrule } : {}),
                ...(ev.exdates ? { exdates: [...ev.exdates] } : {}),
              });

              if (ev.uid) {
                const icsTag = `ics:${ev.uid}`;
                await updateCalendarEventGoogleMeta(created.id, {
                  googleEventId: icsTag,
                  googleCalendarId: 'ics-import',
                });
                byUid.set(ev.uid, { ...created, googleEventId: icsTag });
              }
              bySignature.set(makeSig(created), created);
              imported += 1;
            }
          }

          await get().refreshEvents();
          set({ saveStatus: 'saved' });

          return {
            imported,
            updated,
            skipped,
            cancelled,
            fileCount: extracted.contents.length,
            warnings: allWarnings,
          };
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to import .ics calendar file.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: CALENDAR_UI_STORAGE_KEY,
      partialize: (state) => ({
        viewMode: state.viewMode,
        showTasks: state.showTasks,
        showCompletedTasks: state.showCompletedTasks,
      }),
    },
  ),
);
