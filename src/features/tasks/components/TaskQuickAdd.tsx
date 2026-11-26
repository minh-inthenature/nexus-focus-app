import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskPriority } from '@/services';

export interface TaskQuickAddProps {
  onCreate: (input: {
    title: string;
    priority: TaskPriority;
    dueDate?: string;
  }) => Promise<void>;
}

/**
 * Single-line quick task creation bar supporting title-only entry or optional
 * priority and due date selection.
 */
export function TaskQuickAdd({ onCreate }: TaskQuickAddProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await onCreate({
        title: trimmed,
        priority,
        ...(dueDate ? { dueDate } : {}),
      });
      setTitle('');
      setDueDate('');
      setPriority('medium');
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
        placeholder="Quick add a task… (Press Enter)"
        aria-label="Quick add task"
        className="min-w-[180px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex items-center gap-1.5">
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
          onChange={(e) => setDueDate(e.target.value)}
          className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

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
