import { useEffect, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { syncEngine } from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDriveStore } from '@/stores/useDriveStore';
import { useGoogleCalendarStore } from '@/stores/useGoogleCalendarStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { ErrorBoundary } from './ErrorBoundary';
import { ThemeProvider } from './ThemeProvider';

export interface AppProvidersProps {
  children: ReactNode;
}

function AuthAndDriveBoot({ children }: { children: ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const userId = useAuthStore((state) => state.session?.user.id);
  const driveStatus = useDriveStore((state) => state.connection.status);
  const notesFolderId = useDriveStore(
    (state) => state.connection.notesFolderId,
  );
  const refreshDriveStatus = useDriveStore((state) => state.refreshStatus);
  const resetDrive = useDriveStore((state) => state.reset);
  const calendarStatus = useGoogleCalendarStore(
    (state) => state.connection.status,
  );
  const refreshCalendarStatus = useGoogleCalendarStore(
    (state) => state.refreshStatus,
  );
  const syncGoogleCalendar = useGoogleCalendarStore((state) => state.syncNow);
  const resetCalendar = useGoogleCalendarStore((state) => state.reset);
  const initializeSyncStore = useSyncStore((state) => state.initialize);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    syncEngine.configure({
      getContext: () => ({
        userId: useAuthStore.getState().session?.user.id ?? null,
        isDriveConnected:
          useDriveStore.getState().connection.status === 'connected',
        notesFolderId:
          useDriveStore.getState().connection.notesFolderId ?? null,
      }),
      onRemoteChangesApplied: async () => {
        await Promise.all([
          useNotesStore.getState().refreshVault(),
          useTasksStore.getState().refreshTasks(),
          useCalendarStore.getState().refreshEvents(),
        ]);
      },
    });

    const unsubStore = initializeSyncStore();
    void syncEngine.start();

    return () => {
      unsubStore();
      syncEngine.stop();
    };
  }, [initializeSyncStore]);

  useEffect(() => {
    if (userId) {
      void refreshDriveStatus(userId);
      void refreshCalendarStatus();
    } else {
      resetDrive();
      resetCalendar();
      void syncEngine.refreshStatusOnly();
    }
  }, [
    userId,
    refreshDriveStatus,
    resetDrive,
    refreshCalendarStatus,
    resetCalendar,
  ]);

  useEffect(() => {
    if (userId && calendarStatus === 'connected') {
      void syncGoogleCalendar();
    }
  }, [userId, calendarStatus, syncGoogleCalendar]);

  useEffect(() => {
    if (userId) {
      void syncEngine.triggerSync('app_start');
    } else {
      void syncEngine.refreshStatusOnly();
    }
  }, [userId, driveStatus, notesFolderId]);

  return <>{children}</>;
}

/**
 * Composes application-wide context providers, error handling, auth/Drive
 * session hydration, and theme sync.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthAndDriveBoot>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthAndDriveBoot>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
