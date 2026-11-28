import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Plus,
  Star,
} from 'lucide-react';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  filterAndSortTasks,
  formatDurationLabel,
  getTodayDateString,
  groupTasksByGroup,
  isTaskInBacklog,
  isTaskOverdue,
  parseQuickAddTaskInput,
  type TaskFilterPreset,
} from '@/features/tasks/utils/taskFilters';
import type { TaskPriority, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';
import { MobileTaskEditSheet } from './MobileTaskEditSheet';

type MobileTaskTab = 'active' | 'today' | 'backlog' | 'completed';

const MOBILE_TABS: readonly {
  id: MobileTaskTab;
  label: string;
  preset: TaskFilterPreset;
}[] = [
  { id: 'active', label: 'Active', preset: 'active' },
  { id: 'today', label: 'Today', preset: 'today' },
  { id: 'backlog', label: 'Backlog', preset: 'backlog' },
  { id: 'completed', label: 'Done', preset: 'completed' },
];

const PRIORITY_TONE: Record<TaskPriority, string> = {
  high: 'border-[#d97757]/40 bg-[#d97757]/15 text-[#f0a287]',
  medium: 'border-[#1E2623] bg-[#161D1A] text-[#9BA8A2]',
  low: 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
};

/**
 * Minimalist mobile Tasks view with pinned starred tasks on top, collapsible groups,
 * duration pills, inline quick-add (`@Group`), and tap-to-edit bottom sheet.
 */
export function MobileTasksView() {
  const tasks = useTasksStore((s) => s.tasks);
  const initialized = useTasksStore((s) => s.initialized);
  const initialize = useTasksStore((s) => s.initialize);
  const toggleCompleted = useTasksStore((s) => s.toggleCompleted);
  const toggleStarred = useTasksStore((s) => s.toggleStarred);
  const createTask = useTasksStore((s) => s.createTask);
  const updateTask = useTasksStore((s) => s.updateTask);

  const [tab, setTab] = useState<MobileTaskTab>('active');
  const [draftTitle, setDraftTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialized, initialize]);

  const today = getTodayDateString();

  const visibleTasks = useMemo(() => {
    const preset = MOBILE_TABS.find((t) => t.id === tab)?.preset ?? 'active';
    return filterAndSortTasks(tasks, {
      preset,
      statusFilter: 'all',
      priorityFilter: 'all',
      tagFilter: null,
      categoryFilter: null,
      searchQuery: '',
      sortBy: 'dueDate',
      today,
    });
  }, [tasks, tab, today]);

  const buckets = useMemo(() => groupTasksByGroup(visibleTasks), [visibleTasks]);

  const tabCounts = useMemo(
    () => ({
      active: tasks.filter((t) => t.status !== 'done' && !isTaskInBacklog(t))
        .length,
      today: filterAndSortTasks(tasks, {
        preset: 'today',
        statusFilter: 'all',
        priorityFilter: 'all',
        tagFilter: null,
        categoryFilter: null,
        searchQuery: '',
        sortBy: 'dueDate',
        today,
      }).length,
      backlog: tasks.filter((t) => t.status !== 'done' && isTaskInBacklog(t))
        .length,
      completed: tasks.filter((t) => t.status === 'done').length,
    }),
    [tasks, today],
  );

  const editingTask = useMemo(
    () => (editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null),
    [tasks, editingTaskId],
  );

  const handleInlineCreate = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseQuickAddTaskInput(draftTitle);
    if (!parsed.title) return;
    setSubmitting(true);
    try {
      const isBacklog = tab === 'backlog';
      const dueDate = tab === 'today' ? today : undefined;
      await createTask({
        title: parsed.title,
        group: parsed.group,
        dueDate,
        isBacklog,
        priority: 'medium',
      });
      setDraftTitle('');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderTaskRow = (task: TaskRecord) => {
    const overdue = isTaskOverdue(task, today);
    const inBacklog = isTaskInBacklog(task);
    const durationLabel = formatDurationLabel(task.durationMinutes);
    return (
      <div
        key={task.id}
        className="flex items-center gap-1 rounded-xl border border-[#1E2623] bg-[#111614] pr-2 py-1"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleCompleted(task.id);
          }}
          aria-label={`Toggle ${task.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:bg-[#18221E] transition-colors"
        >
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
              task.status === 'done'
                ? 'border-[#d97757] bg-[#d97757] text-[#0A0E0C]'
                : 'border-[#33403A] bg-transparent',
            )}
          >
            {task.status === 'done' && (
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setEditingTaskId(task.id)}
          className="min-w-0 flex-1 py-1.5 text-left"
        >
          <p
            className={cn(
              'text-sm leading-snug break-words',
              task.status === 'done'
                ? 'line-through text-[#6E7D76]'
                : 'font-medium text-[#E4E8E6]',
            )}
          >
            {task.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {task.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border',
                  overdue
                    ? 'border-[#d97757]/40 bg-[#d97757]/15 text-[#f0a287]'
                    : 'border-[#1E2623] bg-[#161D1A] text-[#9BA8A2]',
                )}
              >
                <Calendar className="h-2.5 w-2.5" />
                {task.dueDate === today ? 'Today' : task.dueDate}
                {task.dueTime ? ` · ${task.dueTime}` : ''}
              </span>
            )}
            {!task.dueDate && task.dueTime && (
              <span className="rounded px-1.5 py-0.5 text-[10px] border border-[#1E2623] bg-[#161D1A] text-[#9BA8A2] tabular-nums">
                {task.dueTime}
              </span>
            )}
            {task.priority !== 'medium' && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium border capitalize',
                  PRIORITY_TONE[task.priority],
                )}
              >
                {task.priority}
              </span>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {inBacklog && task.status !== 'done' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void updateTask(task.id, { dueDate: today, isBacklog: false });
              }}
              className="shrink-0 rounded-lg border border-[#d97757]/35 bg-[#d97757]/15 px-2 py-1 text-[11px] font-medium text-[#f0a287] active:bg-[#d97757]/25"
            >
              Today
            </button>
          )}
          {durationLabel && (
            <span className="rounded-md border border-[#1E2623] bg-[#161D1A] px-1.5 py-0.5 text-[10px] font-medium text-[#9BA8A2] tabular-nums">
              {durationLabel}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void toggleStarred(task.id);
            }}
            aria-pressed={Boolean(task.isStarred)}
            aria-label={
              task.isStarred ? `Unstar ${task.title}` : `Star ${task.title}`
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6E7D76] active:bg-[#18221E]"
          >
            <Star
              className={cn(
                'h-4 w-4 transition-colors',
                task.isStarred && 'fill-[#e5a93c] text-[#e5a93c]',
              )}
            />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Compact Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {MOBILE_TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={active}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                active
                  ? 'border-[#d97757]/45 bg-[#d97757]/15 text-[#f0a287]'
                  : 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
              )}
            >
              {item.label}{' '}
              <span className="opacity-75">{tabCounts[item.id]}</span>
            </button>
          );
        })}
      </div>

      {/* Inline Task Creation */}
      {tab !== 'completed' && (
        <form onSubmit={(e) => void handleInlineCreate(e)} className="flex gap-2">
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder={
              tab === 'backlog'
                ? 'Add idea or someday task (@Group)…'
                : 'Add task (@Group)…'
            }
            aria-label="New task title"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#1E2623] bg-[#111614] px-3 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#d97757]/60"
          />
          <button
            type="submit"
            disabled={submitting || !draftTitle.trim()}
            aria-label="Add task"
            className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[#d97757] px-3.5 text-xs font-semibold text-[#0A0E0C] disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </button>
        </form>
      )}

      {/* Grouped Task List */}
      {visibleTasks.length === 0 ? (
        <div className="rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-6 text-center text-xs text-[#7E8B85]">
          No tasks in {MOBILE_TABS.find((t) => t.id === tab)?.label}.
        </div>
      ) : (
        <div className="space-y-4">
          {buckets.map((bucket) => {
            const key = bucket.groupName ?? '__ungrouped__';
            const label = bucket.groupName ?? 'Ungrouped';
            const isCollapsed = !!collapsedGroups[key];
            return (
              <div key={key} className="space-y-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between px-1 py-1 text-left"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#8AB8A3]">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-[#6E7D76]" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-[#6E7D76]" />
                    )}
                    <FolderKanban className="h-3.5 w-3.5 text-[#6E7D76]" />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="text-[11px] text-[#7E8B85]">
                    {bucket.completedCount}/{bucket.totalCount}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {bucket.tasks.map(renderTaskRow)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MobileTaskEditSheet
        task={editingTask}
        onClose={() => setEditingTaskId(null)}
      />
    </div>
  );
}
