import { create } from 'zustand';
import {
  listSyncConflicts,
  resolveSyncConflict,
  syncEngine,
  type SyncConflictRecord,
  type SyncConflictResolution,
  type SyncStatusSnapshot,
  type SyncTrigger,
} from '@/services';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { useAuthStore } from './useAuthStore';
import { useDriveStore } from './useDriveStore';

interface SyncStoreState {
  status: SyncStatusSnapshot;
  conflicts: SyncConflictRecord[];
  conflictsDialogOpen: boolean;
  resolvingConflictId: string | null;

  initialize: () => () => void;
  refreshConflicts: () => Promise<void>;
  setConflictsDialogOpen: (open: boolean) => void;
  syncNow: (trigger?: SyncTrigger) => Promise<void>;
  retryFailed: () => Promise<void>;
  resolveConflict: (
    conflictId: string,
    resolution: SyncConflictResolution,
  ) => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  status: syncEngine.getSnapshot(),
  conflicts: [],
  conflictsDialogOpen: false,
  resolvingConflictId: null,

  initialize: () => {
    void get().refreshConflicts();
    return syncEngine.subscribeSnapshot((snapshot) => {
      set({ status: snapshot });
      void get().refreshConflicts();
    });
  },

  refreshConflicts: async () => {
    const conflicts = await listSyncConflicts();
    set({ conflicts });
  },

  setConflictsDialogOpen: (open) => set({ conflictsDialogOpen: open }),

  syncNow: async (trigger = 'manual') => {
    await syncEngine.triggerSync(trigger);
    await get().refreshConflicts();
  },

  retryFailed: async () => {
    await syncEngine.retryFailed();
    await get().refreshConflicts();
  },

  resolveConflict: async (conflictId, resolution) => {
    const userId = useAuthStore.getState().session?.user.id;
    const notesFolderId =
      useDriveStore.getState().connection.notesFolderId ?? '';
    if (!userId) return;

    set({ resolvingConflictId: conflictId });
    try {
      await resolveSyncConflict(conflictId, resolution, userId, notesFolderId);
      await Promise.all([
        useNotesStore.getState().refreshVault(),
        useTasksStore.getState().refreshTasks(),
        useCalendarStore.getState().refreshEvents(),
      ]);
      await syncEngine.refreshStatusOnly();
      await get().refreshConflicts();
    } finally {
      set({ resolvingConflictId: null });
    }
  },
}));
