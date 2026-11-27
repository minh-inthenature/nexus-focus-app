import { useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Check,
  CheckSquare,
  Loader2,
  Plus,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { TaskBoardView } from './components/TaskBoardView';
import { TaskEditorDialog } from './components/TaskEditorDialog';
import { TaskFiltersBar } from './components/TaskFiltersBar';
import { TaskListView } from './components/TaskListView';
import { TaskQuickAdd } from './components/TaskQuickAdd';
import { TaskScheduleView } from './components/TaskScheduleView';
import { useTasksStore } from './stores/useTasksStore';
import type { TaskFilterPreset } from './utils/taskFilters';
import {
  extractAllTaskCategories,
  extractAllTaskGroups,
  extractAllTaskTags,
  filterAndSortTasks,
  getTodayDateString,
  isTaskInBacklog,
} from './utils/taskFilters';

const VALID_TASK_PRESETS: readonly TaskFilterPreset[] = [
  'active',
  'today',
  'upcoming',
  'overdue',
  'high_priority',
  'completed',
  'all',
  'backlog',
];

/**
 * Local-first Tasks Management workspace supporting List, Kanban Board, and
 * chronological Schedule views, note linking, and Supabase sync.
 */
export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    tasks,
    initialized,
    loading,
    saveStatus,
    error,
    viewMode,
    groupBy,
    preset,
    statusFilter,
    priorityFilter,
    tagFilter,
    categoryFilter,
    searchQuery,
    sortBy,
    editorOpen,
    editingTaskId,
    prefillLinkedNoteIds,
    prefillGroup,
    prefillBacklog,
    initialize,
    setViewMode,
    toggleGroupBy,
    setPreset,
    setStatusFilter,
    setPriorityFilter,
    setTagFilter,
    setCategoryFilter,
    setSearchQuery,
    setSortBy,
    clearFilters,
    openCreateModal,
    openEditModal,
    closeEditor,
    createTask,
    updateTask,
    toggleCompleted,
    deleteTask,
  } = useTasksStore();

  const notes = useNotesStore((state) => state.notes);
  const initializeNotes = useNotesStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
    void initializeNotes();
  }, [initialize, initializeNotes]);

  useEffect(() => {
    const presetParam = searchParams.get('preset');
    const taskIdParam = searchParams.get('taskId');
    let dirty = false;
    const next = new URLSearchParams(searchParams);

    if (
      presetParam &&
      VALID_TASK_PRESETS.includes(presetParam as TaskFilterPreset)
    ) {
      setPreset(presetParam as TaskFilterPreset);
      next.delete('preset');
      dirty = true;
    }

    if (taskIdParam && initialized) {
      if (tasks.some((t) => t.id === taskIdParam)) {
        openEditModal(taskIdParam);
      }
      next.delete('taskId');
      dirty = true;
    }

    if (dirty) {
      setSearchParams(next, { replace: true });
    }
  }, [
    searchParams,
    setSearchParams,
    initialized,
    tasks,
    setPreset,
    openEditModal,
  ]);

  useKeyboardShortcut({ key: 'n', shift: true, ctrlOrMeta: true }, () =>
    openCreateModal(),
  );

  const notesById = useMemo(
    () => new Map(notes.map((n) => [n.id, n])),
    [notes],
  );
  const allTags = useMemo(() => extractAllTaskTags(tasks), [tasks]);
  const allCategories = useMemo(
    () => extractAllTaskCategories(tasks),
    [tasks],
  );
  const allGroups = useMemo(() => extractAllTaskGroups(tasks), [tasks]);

  const visibleTasks = useMemo(
    () =>
      filterAndSortTasks(tasks, {
        preset,
        statusFilter,
        priorityFilter,
        tagFilter,
        categoryFilter,
        searchQuery,
        sortBy,
      }),
    [
      tasks,
      preset,
      statusFilter,
      priorityFilter,
      tagFilter,
      categoryFilter,
      searchQuery,
      sortBy,
    ],
  );

  const activeCount = useMemo(
    () =>
      tasks.filter((t) => t.status !== 'done' && !isTaskInBacklog(t)).length,
    [tasks],
  );

  const editingTask = editingTaskId
    ? tasks.find((t) => t.id === editingTaskId) ?? null
    : null;

  if (loading && !initialized) {
    return <LoadingState label="Loading tasks…" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        subtitle={`${activeCount} active task${activeCount === 1 ? '' : 's'}`}
        actions={
          <div className="flex items-center gap-2.5">
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            >
              {saveStatus === 'saving' ? (
                <>
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />
                  <span>Saving…</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle
                    className="h-3 w-3 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="text-destructive">Save error</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span>Saved</span>
                </>
              )}
            </span>

            <Button
              type="button"
              size="sm"
              onClick={() =>
                openCreateModal([], { isBacklog: preset === 'backlog' })
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Task</span>
            </Button>
          </div>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
        >
          <AlertCircle
            className="h-3.5 w-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      ) : null}

      <TaskQuickAdd
        existingGroups={allGroups}
        defaultBacklog={preset === 'backlog'}
        onCreate={async (input) => {
          await createTask(input);
        }}
      />

      <TaskFiltersBar
        tasks={tasks}
        viewMode={viewMode}
        groupBy={groupBy}
        preset={preset}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        tagFilter={tagFilter}
        categoryFilter={categoryFilter}
        searchQuery={searchQuery}
        sortBy={sortBy}
        allTags={allTags}
        allCategories={allCategories}
        onChangeViewMode={setViewMode}
        onToggleGroupBy={toggleGroupBy}
        onChangePreset={setPreset}
        onChangeStatusFilter={setStatusFilter}
        onChangePriorityFilter={setPriorityFilter}
        onChangeTagFilter={setTagFilter}
        onChangeCategoryFilter={setCategoryFilter}
        onChangeSearchQuery={setSearchQuery}
        onChangeSortBy={setSortBy}
        onClearFilters={clearFilters}
      />

      {visibleTasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={
            tasks.length === 0
              ? 'No tasks yet'
              : 'No tasks match the current filter'
          }
          description={
            tasks.length === 0
              ? 'Use the quick-add bar above or click New Task to create your first task.'
              : 'Try adjusting your search query or clearing active filters.'
          }
          action={
            tasks.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCreateModal()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Create first task</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : viewMode === 'list' ? (
        <TaskListView
          tasks={visibleTasks}
          notesById={notesById}
          groupBy={groupBy}
          onToggleComplete={async (id) => {
            await toggleCompleted(id);
          }}
          onChangeStatus={async (id, status) => {
            await updateTask(id, { status });
          }}
          onEditTask={openEditModal}
          onMoveToActive={async (id) => {
            await updateTask(id, { isBacklog: false });
          }}
          onScheduleToday={async (id) => {
            await updateTask(id, {
              dueDate: getTodayDateString(),
              isBacklog: false,
            });
          }}
          onAddTaskToGroup={(groupName) =>
            openCreateModal([], {
              group: groupName,
              isBacklog: preset === 'backlog',
            })
          }
        />
      ) : viewMode === 'board' ? (
        <TaskBoardView
          tasks={visibleTasks}
          notesById={notesById}
          groupBy={groupBy}
          onToggleComplete={async (id) => {
            await toggleCompleted(id);
          }}
          onChangeStatus={async (id, status) => {
            await updateTask(id, { status });
          }}
          onEditTask={openEditModal}
          onMoveToActive={async (id) => {
            await updateTask(id, { isBacklog: false });
          }}
          onScheduleToday={async (id) => {
            await updateTask(id, {
              dueDate: getTodayDateString(),
              isBacklog: false,
            });
          }}
          onAddTaskToGroup={(groupName) =>
            openCreateModal([], {
              group: groupName,
              isBacklog: preset === 'backlog',
            })
          }
        />
      ) : (
        <TaskScheduleView
          tasks={visibleTasks}
          notesById={notesById}
          onToggleComplete={async (id) => {
            await toggleCompleted(id);
          }}
          onEditTask={openEditModal}
        />
      )}

      <TaskEditorDialog
        open={editorOpen}
        task={editingTask}
        prefillLinkedNoteIds={prefillLinkedNoteIds}
        prefillGroup={prefillGroup}
        prefillBacklog={prefillBacklog}
        notes={notes}
        existingCategories={allCategories}
        existingGroups={allGroups}
        onSave={async (payload) => {
          if (editingTask) {
            await updateTask(editingTask.id, {
              title: payload.title,
              description: payload.description,
              status: payload.status,
              priority: payload.priority,
              startDate: payload.startDate || null,
              dueDate: payload.dueDate || null,
              category: payload.category || null,
              group: payload.group || null,
              isBacklog: payload.isBacklog,
              tags: payload.tags,
              linkedNoteIds: payload.linkedNoteIds,
            });
          } else {
            await createTask({
              title: payload.title,
              description: payload.description,
              status: payload.status,
              priority: payload.priority,
              ...(payload.startDate ? { startDate: payload.startDate } : {}),
              ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
              ...(payload.category ? { category: payload.category } : {}),
              ...(payload.group ? { group: payload.group } : {}),
              isBacklog: payload.isBacklog,
              tags: payload.tags,
              linkedNoteIds: payload.linkedNoteIds,
            });
          }
        }}
        onDelete={deleteTask}
        onClose={closeEditor}
      />
    </div>
  );
}
