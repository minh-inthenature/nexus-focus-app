import { create } from 'zustand';
import {
  createHabit as repoCreateHabit,
  deleteHabit as repoDeleteHabit,
  deleteHabitFromSupabase,
  listHabitLogs,
  listHabits,
  pushHabitLogToggleToSupabase,
  pushHabitToSupabase,
  syncHabitsWithSupabase,
  toggleHabitLog as repoToggleHabitLog,
  updateHabit as repoUpdateHabit,
  type CreateHabitInput,
  type HabitLogRecord,
  type HabitRecord,
  type UpdateHabitPatch,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';

interface HabitsStoreState {
  habits: HabitRecord[];
  logs: HabitLogRecord[];
  initialized: boolean;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  showArchived: boolean;
  editorOpen: boolean;
  editingHabitId: string | null;

  initialize: (force?: boolean) => Promise<void>;
  refreshHabits: () => Promise<void>;
  syncWithCloud: () => Promise<void>;
  setShowArchived: (show: boolean) => void;
  openCreateModal: () => void;
  openEditModal: (habitId: string) => void;
  closeEditor: () => void;

  createHabit: (input: Omit<CreateHabitInput, 'userId'>) => Promise<HabitRecord>;
  updateHabit: (habitId: string, patch: UpdateHabitPatch) => Promise<HabitRecord>;
  toggleArchiveHabit: (habitId: string) => Promise<HabitRecord>;
  deleteHabit: (habitId: string) => Promise<void>;
  toggleCompletion: (habitId: string, dateKey: string) => Promise<void>;
}

let inflightInit: Promise<void> | null = null;

export const useHabitsStore = create<HabitsStoreState>((set, get) => ({
  habits: [],
  logs: [],
  initialized: false,
  loading: false,
  syncing: false,
  error: null,
  showArchived: false,
  editorOpen: false,
  editingHabitId: null,

  initialize: async (force = false) => {
    if (get().initialized && !force) return;
    if (inflightInit && !force) return inflightInit;

    set({ loading: !get().initialized });
    inflightInit = (async () => {
      try {
        await get().refreshHabits();
        set({ initialized: true, loading: false, error: null });
        const userId = useAuthStore.getState().session?.user.id;
        if (userId) {
          void get().syncWithCloud();
        }
      } catch (err) {
        set({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load habits from IndexedDB.',
        });
      } finally {
        inflightInit = null;
      }
    })();

    return inflightInit;
  },

  refreshHabits: async () => {
    const [habits, logs] = await Promise.all([listHabits(), listHabitLogs()]);
    set({ habits, logs });
  },

  syncWithCloud: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    set({ syncing: true });
    try {
      await syncHabitsWithSupabase(userId);
      await get().refreshHabits();
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to sync habits.',
      });
    } finally {
      set({ syncing: false });
    }
  },

  setShowArchived: (showArchived) => set({ showArchived }),

  openCreateModal: () => set({ editorOpen: true, editingHabitId: null }),
  openEditModal: (habitId) =>
    set({ editorOpen: true, editingHabitId: habitId }),
  closeEditor: () => set({ editorOpen: false, editingHabitId: null }),

  createHabit: async (input) => {
    const userId = useAuthStore.getState().session?.user.id ?? 'local';
    const created = await repoCreateHabit({ ...input, userId });
    await get().refreshHabits();
    if (userId !== 'local') {
      void pushHabitToSupabase(created, userId).catch(() => undefined);
    }
    return created;
  },

  updateHabit: async (habitId, patch) => {
    const updated = await repoUpdateHabit(habitId, patch);
    await get().refreshHabits();
    const userId = useAuthStore.getState().session?.user.id;
    if (userId) {
      void pushHabitToSupabase(updated, userId).catch(() => undefined);
    }
    return updated;
  },

  toggleArchiveHabit: async (habitId) => {
    const existing = get().habits.find((h) => h.id === habitId);
    if (!existing) throw new Error('Habit not found.');
    return get().updateHabit(habitId, { isArchived: !existing.isArchived });
  },

  deleteHabit: async (habitId) => {
    await repoDeleteHabit(habitId);
    await get().refreshHabits();
    const userId = useAuthStore.getState().session?.user.id;
    if (userId) {
      void deleteHabitFromSupabase(habitId, userId).catch(() => undefined);
    }
  },

  toggleCompletion: async (habitId, dateKey) => {
    const userId = useAuthStore.getState().session?.user.id ?? 'local';
    const previousLogs = get().logs;
    const existingIdx = previousLogs.findIndex(
      (l) => l.habitId === habitId && l.completedDate === dateKey,
    );

    // Optimistic immediate UI update
    if (existingIdx >= 0) {
      set({
        logs: previousLogs.filter((_, i) => i !== existingIdx),
        error: null,
      });
    } else {
      const optimisticLog: HabitLogRecord = {
        id: `optimistic-${habitId}-${dateKey}`,
        habitId,
        userId,
        completedDate: dateKey,
        createdAt: new Date().toISOString(),
      };
      set({ logs: [...previousLogs, optimisticLog], error: null });
    }

    try {
      const result = await repoToggleHabitLog(habitId, dateKey, userId);
      await get().refreshHabits();
      if (userId !== 'local') {
        const habit = get().habits.find((h) => h.id === habitId);
        void pushHabitLogToggleToSupabase(
          habit,
          habitId,
          dateKey,
          result.completed,
          result.log,
          userId,
        ).catch(() => undefined);
      }
    } catch (err) {
      set({
        logs: previousLogs,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update habit completion.',
      });
    }
  },
}));
