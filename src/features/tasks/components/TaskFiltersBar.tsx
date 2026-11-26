import {
  CalendarDays,
  Kanban,
  List,
  Search,
  X,
} from 'lucide-react';
import type { TaskViewMode } from '@/features/tasks/stores/useTasksStore';
import {
  getTodayDateString,
  isTaskDueToday,
  isTaskOverdue,
  isTaskUpcoming,
  type TaskFilterPreset,
  type TaskSortBy,
} from '@/features/tasks/utils/taskFilters';
import type { TaskPriority, TaskRecord, TaskStatus } from '@/services';
import { cn } from '@/utils/cn';

export interface TaskFiltersBarProps {
  tasks: readonly TaskRecord[];
  viewMode: TaskViewMode;
  preset: TaskFilterPreset;
  statusFilter: TaskStatus | 'all';
  priorityFilter: TaskPriority | 'all';
  tagFilter: string | null;
  categoryFilter: string | null;
  searchQuery: string;
  sortBy: TaskSortBy;
  allTags: readonly string[];
  allCategories: readonly string[];
  onChangeViewMode: (mode: TaskViewMode) => void;
  onChangePreset: (preset: TaskFilterPreset) => void;
  onChangeStatusFilter: (status: TaskStatus | 'all') => void;
  onChangePriorityFilter: (priority: TaskPriority | 'all') => void;
  onChangeTagFilter: (tag: string | null) => void;
  onChangeCategoryFilter: (cat: string | null) => void;
  onChangeSearchQuery: (q: string) => void;
  onChangeSortBy: (sort: TaskSortBy) => void;
  onClearFilters: () => void;
}

/**
 * Filter presets, search bar, attribute filters, sort controls, and
 * List / Board / Schedule view switcher for the Tasks module.
 */
export function TaskFiltersBar({
  tasks,
  viewMode,
  preset,
  statusFilter,
  priorityFilter,
  tagFilter,
  categoryFilter,
  searchQuery,
  sortBy,
  allTags,
  allCategories,
  onChangeViewMode,
  onChangePreset,
  onChangeStatusFilter,
  onChangePriorityFilter,
  onChangeTagFilter,
  onChangeCategoryFilter,
  onChangeSearchQuery,
  onChangeSortBy,
  onClearFilters,
}: TaskFiltersBarProps) {
  const today = getTodayDateString();

  const counts: Record<TaskFilterPreset, number> = {
    active: tasks.filter((t) => t.status !== 'done').length,
    today: tasks.filter((t) => t.status !== 'done' && isTaskDueToday(t, today))
      .length,
    upcoming: tasks.filter((t) => isTaskUpcoming(t, today)).length,
    overdue: tasks.filter((t) => isTaskOverdue(t, today)).length,
    high_priority: tasks.filter(
      (t) => t.status !== 'done' && t.priority === 'high',
    ).length,
    completed: tasks.filter((t) => t.status === 'done').length,
    all: tasks.length,
  };

  const presets: Array<{ id: TaskFilterPreset; label: string }> = [
    { id: 'active', label: 'Active' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'high_priority', label: 'High priority' },
    { id: 'completed', label: 'Completed' },
    { id: 'all', label: 'All' },
  ];

  const hasCustomFilters =
    preset !== 'active' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    tagFilter !== null ||
    categoryFilter !== null ||
    searchQuery.trim() !== '';

  return (
    <div className="space-y-3">
      {/* Preset Pills + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Task filter presets"
          className="flex flex-wrap items-center gap-1"
        >
          {presets.map((item) => {
            const active = preset === item.id;
            const count = counts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangePreset(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    'font-mono text-[10px]',
                    item.id === 'overdue' && count > 0
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Mode Switcher */}
        <div
          role="group"
          aria-label="Task view mode"
          className="inline-flex rounded-md border border-border bg-card p-0.5"
        >
          {(
            [
              { id: 'list', label: 'List', icon: List },
              { id: 'board', label: 'Board', icon: Kanban },
              { id: 'schedule', label: 'Schedule', icon: CalendarDays },
            ] as const
          ).map((mode) => {
            const Icon = mode.icon;
            const selected = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChangeViewMode(mode.id)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  selected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Attribute Filters + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            placeholder="Search tasks by title, description, or #tag…"
            aria-label="Search tasks"
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onChangeSearchQuery('')}
              aria-label="Clear task search"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) =>
            onChangeStatusFilter(e.target.value as TaskStatus | 'all')
          }
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>

        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) =>
            onChangePriorityFilter(e.target.value as TaskPriority | 'all')
          }
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="all">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>

        {allTags.length > 0 ? (
          <select
            aria-label="Filter by tag"
            value={tagFilter ?? ''}
            onChange={(e) => onChangeTagFilter(e.target.value || null)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        ) : null}

        {allCategories.length > 0 ? (
          <select
            aria-label="Filter by category"
            value={categoryFilter ?? ''}
            onChange={(e) => onChangeCategoryFilter(e.target.value || null)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All categories</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        ) : null}

        <select
          aria-label="Sort tasks by"
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as TaskSortBy)}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="dueDate">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="updatedAt">Sort: Updated</option>
          <option value="createdAt">Sort: Created</option>
        </select>

        {hasCustomFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-8 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
