import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ExternalLink,
  FileText,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getOffsetDateString,
  getTodayDateString,
  normalizeTaskTags,
  validateTaskDates,
} from '@/features/tasks/utils/taskFilters';
import type {
  NoteRecord,
  TaskPriority,
  TaskRecord,
  TaskStatus,
} from '@/services';
import { cn } from '@/utils/cn';

export interface TaskEditorDialogProps {
  open: boolean;
  task: TaskRecord | null;
  prefillLinkedNoteIds: readonly string[];
  prefillDueDate?: string;
  notes: readonly NoteRecord[];
  existingCategories: readonly string[];
  onSave: (payload: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    startDate: string;
    dueDate: string;
    category: string;
    tags: string[];
    linkedNoteIds: string[];
  }) => Promise<void>;
  onDelete?: (taskId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Full task creation and editing dialog supporting all task attributes,
 * date validation, tags, UUID-based note links, and safe deletion confirmation.
 */
export function TaskEditorDialog({
  open,
  task,
  prefillLinkedNoteIds,
  prefillDueDate = '',
  notes,
  existingCategories,
  onSave,
  onDelete,
  onClose,
}: TaskEditorDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([]);
  const [notePickerId, setNotePickerId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setConfirmDelete(false);
    setTagDraft('');
    setNotePickerId('');

    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setStatus(task.status);
      setPriority(task.priority);
      setStartDate(task.startDate ?? '');
      setDueDate(task.dueDate ?? '');
      setCategory(task.category ?? '');
      setTags([...task.tags]);
      setLinkedNoteIds([...task.linkedNoteIds]);
    } else {
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setStartDate('');
      setDueDate(prefillDueDate);
      setCategory('');
      setTags([]);
      setLinkedNoteIds([...prefillLinkedNoteIds]);
    }
  }, [open, task, prefillLinkedNoteIds, prefillDueDate]);

  const todayStr = getTodayDateString();
  const tomorrowStr = getOffsetDateString(1);
  const nextWeekStr = getOffsetDateString(7);

  const dueDatePresets = [
    { label: 'Today', value: todayStr },
    { label: 'Tomorrow', value: tomorrowStr },
    { label: 'Next Week', value: nextWeekStr },
    { label: 'No Date', value: '' },
  ] as const;

  const priorityOptions: ReadonlyArray<{ value: TaskPriority; label: string }> = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const notesById = new Map(notes.map((n) => [n.id, n]));
  const availableNotesToLink = notes.filter(
    (n) => !linkedNoteIds.includes(n.id),
  );

  const commitTagDraft = () => {
    const cleaned = normalizeTaskTags(tagDraft.split(','));
    if (cleaned.length > 0) {
      setTags((prev) => normalizeTaskTags([...prev, ...cleaned]));
    }
    setTagDraft('');
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitTagDraft();
    }
  };

  const handleAddNoteLink = (selectedId: string) => {
    if (!selectedId || linkedNoteIds.includes(selectedId)) return;
    setLinkedNoteIds((prev) => [...prev, selectedId]);
    setNotePickerId('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationError('Task title is required.');
      return;
    }

    const dateErr = validateTaskDates(
      startDate || undefined,
      dueDate || undefined,
    );
    if (dateErr) {
      setValidationError(dateErr);
      return;
    }

    const finalTags = tagDraft.trim()
      ? normalizeTaskTags([...tags, ...tagDraft.split(',')])
      : tags;

    setSubmitting(true);
    setValidationError(null);
    try {
      await onSave({
        title: trimmedTitle,
        description,
        status,
        priority,
        startDate,
        dueDate,
        category,
        tags: finalTags,
        linkedNoteIds,
      });
      onClose();
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to save task.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!task || !onDelete) return;
    setSubmitting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="top-[6%] flex max-h-[88vh] max-w-lg flex-col overflow-hidden p-0">
        <div className="shrink-0 px-5 pt-5 pb-3">
          <DialogTitle className="text-sm font-semibold text-foreground">
            {task ? 'Edit Task' : 'New Task'}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            {task
              ? 'Update task details, dates, tags, or linked Markdown notes.'
              : 'Create a task saved locally in IndexedDB and synced with Supabase.'}
          </DialogDescription>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-4">
          {validationError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
            >
              {validationError}
            </p>
          ) : null}

          <div className="space-y-1">
            <label
              htmlFor="task-title-input"
              className="text-xs font-medium text-muted-foreground"
            >
              Title
            </label>
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="task-desc-input"
              className="text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <textarea
              id="task-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes, context, or acceptance criteria…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="task-status-select"
                className="text-xs font-medium text-muted-foreground"
              >
                Status
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="space-y-1">
              <span
                id="task-priority-label"
                className="text-xs font-medium text-muted-foreground"
              >
                Priority
              </span>
              <div
                role="group"
                aria-labelledby="task-priority-label"
                className="grid h-8 w-full grid-cols-3 gap-0.5 rounded-md border border-border bg-background p-0.5"
              >
                {priorityOptions.map((option) => {
                  const active = priority === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPriority(option.value)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-[5px] px-2 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        active
                          ? option.value === 'high'
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-accent text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="task-start-date"
                className="text-xs font-medium text-muted-foreground"
              >
                Start date
              </label>
              <input
                id="task-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="task-due-date"
                className="text-xs font-medium text-muted-foreground"
              >
                Due date
              </label>
              <input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div
                role="group"
                aria-label="Due date quick presets"
                className="flex flex-wrap gap-1"
              >
                {dueDatePresets.map((preset) => {
                  const active = dueDate === preset.value;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDueDate(preset.value)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="task-category-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Category
              </label>
              <input
                id="task-category-input"
                type="text"
                list="nexus-task-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. University, Personal"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <datalist id="nexus-task-categories">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="task-tag-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Tags
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="task-tag-input"
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add tag + Enter"
                  className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={commitTagDraft}
                  aria-label="Add tag"
                  className="h-8 w-8 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() =>
                      setTags((prev) => prev.filter((t) => t !== tag))
                    }
                    aria-label={`Remove tag ${tag}`}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {/* Linked Notes (by stable UUID) */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Linked Notes
              </span>
              <select
                aria-label="Link note to task"
                value={notePickerId}
                onChange={(e) => handleAddNoteLink(e.target.value)}
                disabled={availableNotesToLink.length === 0}
                className="h-7 max-w-[220px] rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="">
                  {availableNotesToLink.length > 0
                    ? '+ Link an existing note…'
                    : 'No other notes to link'}
                </option>
                {availableNotesToLink.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.title}
                  </option>
                ))}
              </select>
            </div>

            {linkedNoteIds.length > 0 ? (
              <div className="space-y-1">
                {linkedNoteIds.map((noteId) => {
                  const linkedNote = notesById.get(noteId);
                  return (
                    <div
                      key={noteId}
                      className="flex items-center justify-between rounded border border-border bg-background/60 px-2.5 py-1.5 text-xs"
                    >
                      {linkedNote ? (
                        <Link
                          to={`/notes/${linkedNote.id}`}
                          onClick={onClose}
                          className="flex min-w-0 items-center gap-1.5 font-medium text-foreground hover:underline"
                        >
                          <FileText
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">{linkedNote.title}</span>
                          <ExternalLink
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">
                          Deleted note ({noteId.slice(0, 8)}…)
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setLinkedNoteIds((prev) =>
                            prev.filter((id) => id !== noteId),
                          )
                        }
                        aria-label="Unlink note"
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-border bg-card px-5 py-3">
            {confirmDelete && task ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Delete &ldquo;{task.title}&rdquo;?
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={submitting}
                    onClick={() => void handleConfirmDelete()}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Confirm delete
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              {task && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {task ? 'Save changes' : 'Create task'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
