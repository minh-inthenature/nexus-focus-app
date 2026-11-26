import { create } from 'zustand';
import {
  applyRemoteCalendarEventUpsert,
  DISCONNECTED_CALENDAR_INFO,
  googleCalendarService,
  listAllCalendarEventsIncludingDeleted,
  nexusEventToGooglePayload,
  planGoogleCalendarTwoWaySync,
  purgeDeletedCalendarEventTombstone,
  updateCalendarEventGoogleMeta,
  type CalendarConnectionInfo,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';

interface GoogleCalendarStoreState {
  connection: CalendarConnectionInfo;
  loadingStatus: boolean;
  syncing: boolean;
  busyAction: string | null;
  error: string | null;
  lastSyncSummary: string | null;

  refreshStatus: () => Promise<void>;
  connectCalendar: () => Promise<void>;
  completeOAuthCallback: (
    code: string,
    state: string,
  ) => Promise<CalendarConnectionInfo>;
  disconnectCalendar: () => Promise<void>;
  syncNow: (options?: { forceFullSync?: boolean }) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function getCallbackRedirectUri(): string {
  return `${window.location.origin}/auth/google-calendar/callback`;
}

let inflightSync: Promise<void> | null = null;
let resyncRequested = false;

export const useGoogleCalendarStore = create<GoogleCalendarStoreState>(
  (set, get) => ({
    connection: DISCONNECTED_CALENDAR_INFO,
    loadingStatus: false,
    syncing: false,
    busyAction: null,
    error: null,
    lastSyncSummary: null,

    refreshStatus: async () => {
      set({ loadingStatus: true, error: null });
      try {
        const connection = await googleCalendarService.getConnectionStatus();
        set({ connection, loadingStatus: false });
      } catch (err) {
        set({
          loadingStatus: false,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to check Google Calendar connection status.',
        });
      }
    },

    connectCalendar: async () => {
      set({ busyAction: 'connect', error: null });
      try {
        const authUrl = await googleCalendarService.createConnectAuthUrl(
          getCallbackRedirectUri(),
        );
        window.location.assign(authUrl);
      } catch (err) {
        set({
          busyAction: null,
          error:
            err instanceof Error
              ? err.message
              : 'Unable to start Google Calendar authorization.',
        });
      }
    },

    completeOAuthCallback: async (code, state) => {
      set({ busyAction: 'exchange', error: null });
      try {
        const connection = await googleCalendarService.exchangeOAuthCode(
          code,
          state,
          getCallbackRedirectUri(),
        );
        set({
          connection,
          busyAction: null,
          lastSyncSummary: 'Google Calendar connected.',
        });
        return connection;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to complete Google Calendar authorization.';
        set({ busyAction: null, error: msg });
        throw err;
      }
    },

    disconnectCalendar: async () => {
      set({ busyAction: 'disconnect', error: null });
      try {
        await googleCalendarService.disconnect();
        set({
          connection: DISCONNECTED_CALENDAR_INFO,
          busyAction: null,
          lastSyncSummary: 'Google Calendar disconnected.',
        });
      } catch (err) {
        set({
          busyAction: null,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to disconnect Google Calendar.',
        });
      }
    },

    syncNow: async (options) => {
      if (get().connection.status !== 'connected') {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        set({
          error:
            'You are currently offline. Local calendar changes will sync when reconnected.',
        });
        return;
      }

      if (inflightSync) {
        resyncRequested = true;
        return inflightSync;
      }

      const runPass = async (forceFullSync: boolean): Promise<void> => {
        const userId = useAuthStore.getState().session?.user.id;
        if (!userId) return;

        const listResult = await googleCalendarService.listEvents({
          forceFullSync,
        });
        const localEvents = await listAllCalendarEventsIncludingDeleted();

        const plan = planGoogleCalendarTwoWaySync({
          localEvents,
          remoteEvents: listResult.items,
          userId,
          calendarId: listResult.calendarId,
        });

        let pushedCount = 0;
        let pulledCount = 0;

        // 1. Push local deletes first
        for (const del of plan.pushDeletes) {
          await googleCalendarService.deleteEvent(del.googleEventId);
          await purgeDeletedCalendarEventTombstone(del.localId);
          pushedCount += 1;
        }

        // 2. Push new local events -> save returned Google event ID & etag
        for (const ev of plan.pushCreates) {
          const payload = nexusEventToGooglePayload(ev);
          const created = await googleCalendarService.createEvent(payload);
          await updateCalendarEventGoogleMeta(ev.id, {
            googleEventId: created.id,
            googleCalendarId: listResult.calendarId,
            ...(created.etag ? { googleEtag: created.etag } : {}),
            ...(created.updated ? { googleUpdatedAt: created.updated } : {}),
            googleSyncedRevision: ev.revision,
          });
          pushedCount += 1;
        }

        // 3. Push modified local events -> recreate if remotely missing (404)
        for (const upd of plan.pushUpdates) {
          const payload = nexusEventToGooglePayload(upd.local);
          let syncedDto;
          try {
            syncedDto = await googleCalendarService.updateEvent(
              upd.googleEventId,
              payload,
            );
          } catch (patchErr) {
            if (
              patchErr instanceof Error &&
              'code' in patchErr &&
              patchErr.code === 'EVENT_NOT_FOUND'
            ) {
              syncedDto = await googleCalendarService.createEvent(payload);
            } else {
              throw patchErr;
            }
          }

          await updateCalendarEventGoogleMeta(upd.local.id, {
            googleEventId: syncedDto.id,
            googleCalendarId: listResult.calendarId,
            ...(syncedDto.etag ? { googleEtag: syncedDto.etag } : {}),
            ...(syncedDto.updated ? { googleUpdatedAt: syncedDto.updated } : {}),
            googleSyncedRevision: upd.local.revision,
          });
          pushedCount += 1;
        }

        // 4. Apply remote cancellations locally
        for (const localId of plan.pullDeletes) {
          await purgeDeletedCalendarEventTombstone(localId);
          pulledCount += 1;
        }

        // 5. Apply remote creations & updates locally
        for (const remoteEv of plan.pullUpserts) {
          await applyRemoteCalendarEventUpsert(remoteEv);
          pulledCount += 1;
        }

        // Refresh UI store cleanly without triggering recursive writes
        const { useCalendarStore } = await import(
          '@/features/calendar/stores/useCalendarStore'
        );
        await useCalendarStore.getState().refreshEvents();

        const now = new Date().toISOString();
        const prevConn = get().connection;
        set({
          connection: {
            ...prevConn,
            lastSyncedAt: now,
          },
          lastSyncSummary:
            pushedCount === 0 && pulledCount === 0
              ? 'Google Calendar up to date'
              : `Synced with Google Calendar (${pulledCount} pulled, ${pushedCount} pushed)`,
        });
      };

      set({ syncing: true, error: null });
      inflightSync = (async () => {
        try {
          await runPass(Boolean(options?.forceFullSync));
          while (resyncRequested) {
            resyncRequested = false;
            await runPass(false);
          }
          set({ syncing: false });
        } catch (err) {
          resyncRequested = false;
          const msg =
            err instanceof Error
              ? err.message
              : 'Google Calendar synchronization failed.';
          if (
            err instanceof Error &&
            'code' in err &&
            err.code === 'CALENDAR_REVOKED'
          ) {
            set({
              syncing: false,
              error: msg,
              connection: { ...get().connection, status: 'revoked' },
            });
          } else {
            set({ syncing: false, error: msg });
          }
        } finally {
          inflightSync = null;
        }
      })();

      return inflightSync;
    },

    clearError: () => set({ error: null }),

    reset: () => {
      resyncRequested = false;
      set({
        connection: DISCONNECTED_CALENDAR_INFO,
        loadingStatus: false,
        syncing: false,
        busyAction: null,
        error: null,
        lastSyncSummary: null,
      });
    },
  }),
);
