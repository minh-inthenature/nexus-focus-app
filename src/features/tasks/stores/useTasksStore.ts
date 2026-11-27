import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  TaskFilterPreset,
  TaskSortBy,
} from '@/features/tasks/utils/taskFilters';
import {
  createTask as repoCreateTask,
  deleteTask as repoDeleteTask,
  listTasks,
  toggleTaskCompleted as repoToggleTaskCompleted,
  updateTask as repoUpdateTask,
  type CreateTaskInput,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
  type UpdateTaskPatch,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';

export type TaskViewMode = 'list' | 'board' | 'schedule';
export type TaskGroupByMode = 'group' | 'none';
export type TaskSaveStatus = 'saved' | 'saving' | 'error';

interface TasksStoreState {
  tasks: TaskRecord[];
  initialized: boolean;
  loading: boolean;
  saveStatus: TaskSaveStatus;
  error: string | null;

  viewMode: TaskViewMode;
  groupBy: TaskGroupByMode;
  preset: TaskFilterPreset;
  statusFilter: TaskStatus | 'all';
  priorityFilter: TaskPriority | 'all';
  tagFilter: string | null;
  categoryFilter: string | null;
  searchQuery: string;
  sortBy: TaskSortBy;

  editorOpen: boolean;
  editingTaskId: string | null;
  prefillLinkedNoteIds: string[];
  prefillGroup: string | null;
  prefillBacklog: boolean;

  initialize: (force?: boolean) => Promise<void>;
  refreshTasks: () => Promise<void>;
  setViewMode: (mode: TaskViewMode) => void;
  setGroupBy: (mode: TaskGroupByMode) => void;
  toggleGroupBy: () => void;
  setPreset: (preset: TaskFilterPreset) => void;
  setStatusFilter: (status: TaskStatus | 'all') => void;
  setPriorityFilter: (priority: TaskPriority | 'all') => void;
  setTagFilter: (tag: string | null) => void;
  setCategoryFilter: (category: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sortBy: TaskSortBy) => void;
  clearFilters: () => void;

  openCreateModal: (
    linkedNoteIds?: string[],
    options?: { group?: string | null; isBacklog?: boolean },
  ) => void;
  openEditModal: (taskId: string) => void;
  closeEditor: () => void;

  createTask: (
    input: Omit<CreateTaskInput, 'userId'>,
  ) => Promise<TaskRecord>;
  updateTask: (taskId: string, patch: UpdateTaskPatch) => Promise<TaskRecord>;
  toggleCompleted: (taskId: string) => Promise<TaskRecord>;
  deleteTask: (taskId: string) => Promise<void>;
  clearError: () => void;
}

const TASKS_UI_STORAGE_KEY = 'nexus-tasks-ui-store';
let inflightInit: Promise<void> | null = null;

export const useTasksStore = create<TasksStoreState>()(
  persist(
    (set, get) => ({
      tasks: [],
      initialized: false,
      loading: false,
      saveStatus: 'saved',
      error: null,

      viewMode: 'list',
      groupBy: 'group',
      preset: 'active',
      statusFilter: 'all',
      priorityFilter: 'all',
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate',

      editorOpen: false,
      editingTaskId: null,
      prefillLinkedNoteIds: [],
      prefillGroup: null,
      prefillBacklog: false,

      initialize: async (force = false) => {
        if (get().initialized && !force) return;
        if (inflightInit && !force) return inflightInit;

        set({ loading: !get().initialized });
        inflightInit = (async () => {
          try {
            await get().refreshTasks();
            set({ initialized: true, loading: false, error: null });
          } catch (err) {
            set({
              loading: false,
              error:
                err instanceof Error
                  ? err.message
                  : 'Failed to load tasks from IndexedDB.',
            });
          } finally {
            inflightInit = null;
          }
        })();

        return inflightInit;
      },

      refreshTasks: async () => {
        const tasks = await listTasks();
        set({ tasks });
      },

      setViewMode: (mode) => set({ viewMode: mode }),
      setGroupBy: (groupBy) => set({ groupBy }),
      toggleGroupBy: () =>
        set((state) => ({
          groupBy: state.groupBy === 'group' ? 'none' : 'group',
        })),
      setPreset: (preset) => set({ preset }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
      setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSortBy: (sortBy) => set({ sortBy }),
      clearFilters: () =>
        set({
          preset: 'active',
          statusFilter: 'all',
          priorityFilter: 'all',
          tagFilter: null,
          categoryFilter: null,
          searchQuery: '',
        }),

      openCreateModal: (linkedNoteIds = [], options) =>
        set({
          editorOpen: true,
          editingTaskId: null,
          prefillLinkedNoteIds: linkedNoteIds,
          prefillGroup: options?.group ?? null,
          prefillBacklog: Boolean(options?.isBacklog),
        }),

      openEditModal: (taskId) =>
        set({
          editorOpen: true,
          editingTaskId: taskId,
          prefillLinkedNoteIds: [],
          prefillGroup: null,
          prefillBacklog: false,
        }),

      closeEditor: () =>
        set({
          editorOpen: false,
          editingTaskId: null,
          prefillLinkedNoteIds: [],
          prefillGroup: null,
          prefillBacklog: false,
        }),

      createTask: async (input) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const userId = useAuthStore.getState().session?.user.id ?? 'local';
          const created = await repoCreateTask({ ...input, userId });
          await get().refreshTasks();
          set({ saveStatus: 'saved' });
          return created;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to create task.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      updateTask: async (taskId, patch) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const updated = await repoUpdateTask(taskId, patch);
          await get().refreshTasks();
          set({ saveStatus: 'saved' });
          return updated;
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to update task.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      toggleCompleted: async (taskId) => {
        set({ saveStatus: 'saving', error: null });
        try {
          const updated = await repoToggleTaskCompleted(taskId);
          await get().refreshTasks();
          set({ saveStatus: 'saved' });
          return updated;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Failed to update task completion.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      deleteTask: async (taskId) => {
        set({ saveStatus: 'saving', error: null });
        try {
          await repoDeleteTask(taskId);
          await get().refreshTasks();
          set({ saveStatus: 'saved' });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to delete task.';
          set({ saveStatus: 'error', error: msg });
          throw err;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: TASKS_UI_STORAGE_KEY,
      partialize: (state) => ({
        viewMode: state.viewMode,
        groupBy: state.groupBy,
      }),
    },
  ),
);
