import { useState, type DragEvent } from 'react';
import { Calendar, Check, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getTodayDateString,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type { NoteRecord, TaskRecord, TaskStatus } from '@/services';
import { cn } from '@/utils/cn';

export interface TaskBoardViewProps {
  tasks: readonly TaskRecord[];
  notesById: ReadonlyMap<string, NoteRecord>;
  onToggleComplete: (taskId: string) => Promise<void>;
  onChangeStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onEditTask: (taskId: string) => void;
}

const COLUMNS: readonly { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

/**
 * Minimal three-column Kanban board supporting both drag-and-drop and
 * accessible status selectors for moving tasks between columns.
 */
export function TaskBoardView({
  tasks,
  notesById,
  onToggleComplete,
  onChangeStatus,
  onEditTask,
}: TaskBoardViewProps) {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const today = getTodayDateString();

  const handleDrop = async (
    event: DragEvent<HTMLElement>,
    targetStatus: TaskStatus,
  ) => {
    event.preventDefault();
    setDragOverColumn(null);
    const taskId = event.dataTransfer.getData('text/nexus-task-id');
    if (taskId) {
      await onChangeStatus(taskId, targetStatus);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        const isDragOver = dragOverColumn === col.id;

        return (
          <section
            key={col.id}
            aria-label={`${col.label} column`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(col.id);
            }}
            onDragLeave={() => {
              if (dragOverColumn === col.id) setDragOverColumn(null);
            }}
            onDrop={(e) => void handleDrop(e, col.id)}
            className={cn(
              'flex min-h-[260px] flex-col rounded-xl border border-border bg-card/60 p-3 transition-colors duration-150',
              isDragOver && 'border-ring bg-accent/30',
            )}
          >
            <header className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {col.label}
              </h2>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {colTasks.length}
              </span>
            </header>

            <div className="flex-1 space-y-2">
              {colTasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground/70">
                  No tasks
                </p>
              ) : (
                colTasks.map((task) => {
                  const overdue = isTaskOverdue(task, today);
                  const isDone = task.status === 'done';
                  const linkedCount = task.linkedNoteIds.filter((id) =>
                    notesById.has(id),
                  ).length;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/nexus-task-id', task.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className="space-y-2 rounded-xl border border-border bg-card p-3 transition-colors duration-150 hover:border-ring/60"
                    >
                      <div className="flex items-start gap-2">
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

                        <button
                          type="button"
                          onClick={() => onEditTask(task.id)}
                          className={cn(
                            'flex-1 text-left text-xs font-medium leading-snug hover:underline cursor-pointer',
                            isDone
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground',
                          )}
                        >
                          {task.title}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                              task.priority === 'high'
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                                : 'border-border bg-muted/50 text-muted-foreground',
                            )}
                          >
                            {task.priority}
                          </span>

                          {task.dueDate ? (
                            <Link
                              to={`/calendar?date=${task.dueDate}`}
                              title={`View ${task.dueDate} in Calendar`}
                              className={cn(
                                'inline-flex items-center gap-1 font-mono text-[10px] hover:underline',
                                overdue
                                  ? 'font-medium text-destructive'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              <Calendar
                                className="h-2.5 w-2.5"
                                aria-hidden="true"
                              />
                              <span>{task.dueDate}</span>
                            </Link>
                          ) : null}

                          {linkedCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <FileText
                                className="h-2.5 w-2.5"
                                aria-hidden="true"
                              />
                              <span>{linkedCount}</span>
                            </span>
                          ) : null}
                        </div>

                        {/* Accessible status move alternative to drag-and-drop */}
                        <select
                          aria-label={`Move "${task.title}" column`}
                          value={task.status}
                          onChange={(e) =>
                            void onChangeStatus(
                              task.id,
                              e.target.value as TaskStatus,
                            )
                          }
                          className="h-6 rounded border border-border bg-background px-1 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
