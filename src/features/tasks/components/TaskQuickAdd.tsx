import { useEffect, useState, type FormEvent } from 'react';
import { FolderKanban, Inbox, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseQuickAddTaskInput } from '@/features/tasks/utils/taskFilters';
import type { TaskPriority } from '@/services';
import { cn } from '@/utils/cn';

export interface TaskQuickAddProps {
  existingGroups: readonly string[];
  defaultBacklog?: boolean;
  onCreate: (input: {
    title: string;
    priority: TaskPriority;
    dueDate?: string;
    group?: string;
    isBacklog?: boolean;
  }) => Promise<void>;
}

/**
 * Single-line quick task creation bar supporting title-only entry, `@Group`
 * syntax, optional group combobox, Backlog toggle, priority, and due date.
 */
export function TaskQuickAdd({
  existingGroups,
  defaultBacklog = false,
  onCreate,
}: TaskQuickAddProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [group, setGroup] = useState('');
  const [backlogToggle, setBacklogToggle] = useState<boolean>(defaultBacklog);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setBacklogToggle(defaultBacklog);
  }, [defaultBacklog]);

  const effectiveIsBacklog = backlogToggle || !dueDate;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseQuickAddTaskInput(title, group);
    if (!parsed.title || submitting) return;

    setSubmitting(true);
    try {
      await onCreate({
        title: parsed.title,
        priority,
        ...(dueDate && !backlogToggle ? { dueDate } : {}),
        ...(parsed.group ? { group: parsed.group } : {}),
        isBacklog: effectiveIsBacklog,
      });
      setTitle('');
      setDueDate('');
      setGroup('');
      setPriority('medium');
      setBacklogToggle(defaultBacklog);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
    >
      <Plus
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quick add a task… (use @Group or press Enter)"
        aria-label="Quick add task"
        className="min-w-[180px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex items-center">
          <FolderKanban
            className="pointer-events-none absolute left-2 h-3 w-3 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            list="nexus-quick-add-groups"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Group…"
            aria-label="Quick add group"
            className="h-7 w-28 rounded border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-32"
          />
          <datalist id="nexus-quick-add-groups">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <select
          aria-label="Quick add priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <input
          type="date"
          aria-label="Quick add due date"
          value={dueDate}
          onChange={(e) => {
            const val = e.target.value;
            setDueDate(val);
            if (val) {
              setBacklogToggle(false);
            }
          }}
          className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <button
          type="button"
          onClick={() => {
            const next = !backlogToggle;
            setBacklogToggle(next);
            if (next) {
              setDueDate('');
            }
          }}
          aria-pressed={effectiveIsBacklog}
          title="Keep in Backlog (unscheduled)"
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors cursor-pointer',
            effectiveIsBacklog
              ? 'border-primary/50 bg-primary/15 text-primary'
              : 'border-border bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          <Inbox className="h-3 w-3" aria-hidden="true" />
          <span>Backlog</span>
        </button>

        <Button
          type="submit"
          size="sm"
          variant="subtle"
          disabled={!title.trim() || submitting}
        >
          Add
        </Button>
      </div>
    </form>
  );
}
