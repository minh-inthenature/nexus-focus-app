import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import { cn } from '@/utils/cn';

export interface LinkedTasksPanelProps {
  noteId: string;
}

/**
 * Collapsible panel inside a Note displaying tasks linked to that note UUID,
 * allowing 1-click completion, quick task creation from the note, or opening
 * the task details in the Tasks workspace.
 */
export function LinkedTasksPanel({ noteId }: LinkedTasksPanelProps) {
  const navigate = useNavigate();
  const tasks = useTasksStore((state) => state.tasks);
  const initializeTasks = useTasksStore((state) => state.initialize);
  const createTask = useTasksStore((state) => state.createTask);
  const toggleCompleted = useTasksStore((state) => state.toggleCompleted);
  const openEditModal = useTasksStore((state) => state.openEditModal);

  const [open, setOpen] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void initializeTasks();
  }, [initializeTasks]);

  const linkedTasks = useMemo(
    () => tasks.filter((t) => t.linkedNoteIds.includes(noteId)),
    [tasks, noteId],
  );

  const handleCreateFromNote = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      await createTask({
        title: trimmed,
        linkedNoteIds: [noteId],
      });
      setNewTaskTitle('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label="Linked tasks"
      className="border-t border-border bg-card/20 px-6 py-3 md:px-10"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Linked Tasks</span>
          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px]">
            {linkedTasks.length}
          </span>
        </span>
      </button>

      {open ? (
        <div className="mt-2.5 space-y-2">
          {linkedTasks.length > 0 ? (
            <ul className="space-y-1">
              {linkedTasks.map((task) => {
                const isDone = task.status === 'done';
                return (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent/60"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={
                          isDone
                            ? `Reopen "${task.title}"`
                            : `Complete "${task.title}"`
                        }
                        onClick={() => void toggleCompleted(task.id)}
                        className={cn(
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer',
                          isDone
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:border-foreground/50',
                        )}
                      >
                        {isDone ? (
                          <Check className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          openEditModal(task.id);
                          navigate('/tasks');
                        }}
                        className={cn(
                          'truncate text-left font-medium hover:underline cursor-pointer',
                          isDone
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                        )}
                      >
                        {task.title}
                      </button>
                    </div>

                    {task.dueDate ? (
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {task.dueDate}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form
            onSubmit={(e) => void handleCreateFromNote(e)}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Create a task linked to this note…"
              aria-label="New task from note"
              className="h-7 flex-1 rounded border border-border bg-background/70 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!newTaskTitle.trim() || creating}
              className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>Add task</span>
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
