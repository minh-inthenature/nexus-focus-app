import {
  Calendar,
  Check,
  FileText,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getTodayDateString,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type {
  NoteRecord,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '@/services';
import { cn } from '@/utils/cn';

export interface TaskListViewProps {
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  onToggleComplete: (taskId: string) => Promise<void>;
  onChangeStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onEditTask: (taskId: string) => void;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Compact desktop-first task list showing completion toggle, title, priority,
 * due date (with subtle overdue highlight), status selector, and linked notes.
 */
export function TaskListView({
  tasks,
  notesById,
  onToggleComplete,
  onChangeStatus,
  onEditTask,
}: TaskListViewProps) {
  const today = getTodayDateString();

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {tasks.map((task) => {
        const isDone = task.status === 'done';
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
                  isDone
                    ? `Reopen "${task.title}"`
                    : `Complete "${task.title}"`
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
                    isDone
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground',
                  )}
                >
                  {task.title}
                </button>

                {task.category || task.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
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

            {/* Right: Linked Notes, Priority, Due Date, Status, Edit */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 md:pl-0">
              {task.linkedNoteIds.length > 0 ? (
                linkedNotes[0] ? (
                  <Link
                    to={`/notes/${linkedNotes[0].id}`}
                    title={`Open linked note: ${linkedNotes[0].title}`}
                    className="inline-flex max-w-[140px] items-center gap-1 rounded border border-border bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <FileText
                      className="h-3 w-3 shrink-0"
                      aria-hidden="true"
                    />
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
      })}
    </div>
  );
}
