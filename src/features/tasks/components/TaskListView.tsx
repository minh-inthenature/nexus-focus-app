import { useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  Check,
  FileText,
  FolderKanban,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TaskGroupByMode } from '@/features/tasks/stores/useTasksStore';
import {
  getTodayDateString,
  groupTasksByGroup,
  isTaskInBacklog,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type {
  NoteRecord,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '@/services';
import { cn } from '@/utils/cn';
import { TaskGroupHeader } from './TaskGroupHeader';

export interface TaskListViewProps {
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  groupBy: TaskGroupByMode;
  onToggleComplete: (taskId: string) => Promise<void>;
  onChangeStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onEditTask: (taskId: string) => void;
  onMoveToActive: (taskId: string) => Promise<void>;
  onScheduleToday: (taskId: string) => Promise<void>;
  onAddTaskToGroup: (groupName: string) => void;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Compact desktop-first task list supporting optional collapsible Task Group
 * containers with progress indicators, plus 1-click Backlog scheduling actions.
 */
export function TaskListView({
  tasks,
  notesById,
  groupBy,
  onToggleComplete,
  onChangeStatus,
  onEditTask,
  onMoveToActive,
  onScheduleToday,
  onAddTaskToGroup,
}: TaskListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const today = getTodayDateString();
  const hasAnyGroups = tasks.some((t) => Boolean(t.group?.trim()));
  const showGrouped = groupBy === 'group' && hasAnyGroups;

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderTaskRow = (task: TaskRecord) => {
    const isDone = task.status === 'done';
    const inBacklog = isTaskInBacklog(task);
    const overdue = isTaskOverdue(task, today);
    const linkedNotes = task.linkedNoteIds
      .map((id) => notesById.get(id))
      .filter((n): n is NoteRecord => Boolean(n));

    return (
      <div
        key={task.id}
        className="group flex flex-col gap-2 px-3.5 py-2.5 transition-colors duration-150 ease-out hover:bg-accent/55 md:flex-row md:items-center md:justify-between"
      >
        {/* Left: Checkbox + Title + Tags/Category */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={
              isDone ? `Reopen "${task.title}"` : `Complete "${task.title}"`
            }
            onClick={() => void onToggleComplete(task.id)}
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 cursor-pointer',
              isDone
                ? 'border-focus-accent/60 bg-focus-surface text-focus-foreground'
                : 'border-border bg-background hover:border-primary/70',
            )}
          >
            {isDone ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : null}
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onEditTask(task.id)}
              className={cn(
                'block break-words text-left text-sm font-medium leading-snug transition-colors hover:underline cursor-pointer',
                isDone ? 'text-muted-foreground line-through' : 'text-foreground',
              )}
            >
              {task.title}
            </button>

            {(!showGrouped && task.group) ||
            task.category ||
            task.tags.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {!showGrouped && task.group ? (
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground/85">
                    <FolderKanban
                      className="h-2.5 w-2.5 text-primary/85"
                      aria-hidden="true"
                    />
                    <span>{task.group}</span>
                  </span>
                ) : null}

                {task.category ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {task.category}
                  </span>
                ) : null}

                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[11px] text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: Quick Backlog Actions, Linked Notes, Priority, Due Date, Status, Edit */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 md:pl-0">
          {inBacklog ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void onScheduleToday(task.id)}
                title="Schedule for Today and move out of Backlog"
                className="inline-flex h-6 items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 cursor-pointer"
              >
                <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
                <span>Today</span>
              </button>
              <button
                type="button"
                onClick={() => void onMoveToActive(task.id)}
                title="Move to Active tasks"
                className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                <span>Move to Active</span>
              </button>
            </div>
          ) : null}

          {task.linkedNoteIds.length > 0 ? (
            linkedNotes[0] ? (
              <Link
                to={`/notes/${linkedNotes[0].id}`}
                title={`Open linked note: ${linkedNotes[0].title}`}
                className="inline-flex max-w-[140px] items-center gap-1 rounded border border-border bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{linkedNotes[0].title}</span>
                {task.linkedNoteIds.length > 1 ? (
                  <span className="font-mono text-[10px]">
                    +{task.linkedNoteIds.length - 1}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span>{task.linkedNoteIds.length} linked</span>
              </span>
            )
          ) : null}

          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[10px] font-medium',
              task.priority === 'high'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : task.priority === 'medium'
                  ? 'border-border bg-muted/60 text-foreground/80'
                  : 'border-border bg-transparent text-muted-foreground',
            )}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>

          {task.dueDate ? (
            <Link
              to={`/calendar?date=${task.dueDate}`}
              title={`View ${task.dueDate} in Calendar`}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] tabular-nums hover:underline',
                overdue
                  ? 'font-medium text-destructive'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <span>{task.dueDate}</span>
              {overdue ? <span>(Overdue)</span> : null}
            </Link>
          ) : null}

          <select
            aria-label={`Status for ${task.title}`}
            value={task.status}
            onChange={(e) =>
              void onChangeStatus(task.id, e.target.value as TaskStatus)
            }
            className="h-6 rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>

          <button
            type="button"
            onClick={() => onEditTask(task.id)}
            aria-label={`Edit "${task.title}"`}
            title="Edit task"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  if (showGrouped) {
    const buckets = groupTasksByGroup(tasks);
    return (
      <div className="space-y-3" data-testid="grouped-task-list">
        {buckets.map((bucket) => {
          const key = bucket.groupName ?? '__ungrouped__';
          const collapsed = Boolean(collapsedGroups[key]);
          return (
            <section
              key={key}
              aria-label={bucket.groupName ?? 'Ungrouped tasks'}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <TaskGroupHeader
                groupName={bucket.groupName}
                completedCount={bucket.completedCount}
                totalCount={bucket.totalCount}
                collapsed={collapsed}
                onToggleCollapse={() => toggleGroupCollapsed(key)}
                onAddTaskToGroup={onAddTaskToGroup}
              />
              {!collapsed ? (
                <div className="divide-y divide-border border-t border-border">
                  {bucket.tasks.map(renderTaskRow)}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {tasks.map(renderTaskRow)}
    </div>
  );
}
