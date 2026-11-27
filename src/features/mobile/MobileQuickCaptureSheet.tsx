import { useEffect, useState, type FormEvent } from 'react';
import { CheckSquare, FileText, X } from 'lucide-react';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  extractAllTaskGroups,
  getOffsetDateString,
  getTodayDateString,
  parseQuickAddTaskInput,
} from '@/features/tasks/utils/taskFilters';
import { cn } from '@/utils/cn';

export interface MobileQuickCaptureSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
}

type CaptureTab = 'note' | 'task';
type QuickScheduleChoice = 'today' | 'tomorrow' | 'backlog';

/**
 * Fast bottom-sheet modal launched from the floating `+` button for zero-friction
 * Quick Note (saved to Inbox or root) and Quick Task capture.
 */
export function MobileQuickCaptureSheet({
  open,
  onClose,
  onOpenNote,
}: MobileQuickCaptureSheetProps) {
  const folders = useNotesStore((s) => s.folders);
  const notesInitialized = useNotesStore((s) => s.initialized);
  const initNotes = useNotesStore((s) => s.initialize);
  const createNote = useNotesStore((s) => s.createNote);

  const tasks = useTasksStore((s) => s.tasks);
  const tasksInitialized = useTasksStore((s) => s.initialized);
  const initTasks = useTasksStore((s) => s.initialize);
  const createTask = useTasksStore((s) => s.createTask);

  const [mode, setMode] = useState<CaptureTab>('note');
  const [saving, setSaving] = useState(false);

  // Quick Note fields
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  // Quick Task fields
  const [taskTitle, setTaskTitle] = useState('');
  const [scheduleChoice, setScheduleChoice] =
    useState<QuickScheduleChoice>('today');
  const [taskGroup, setTaskGroup] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!notesInitialized) void initNotes();
    if (!tasksInitialized) void initTasks();
  }, [open, notesInitialized, initNotes, tasksInitialized, initTasks]);

  if (!open) return null;

  const existingGroups = extractAllTaskGroups(tasks);

  const resetFields = () => {
    setNoteTitle('');
    setNoteBody('');
    setTaskTitle('');
    setTaskGroup('');
    setScheduleChoice('today');
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const saveQuickNote = async (openAfterSave: boolean) => {
    const trimmedTitle = noteTitle.trim();
    const trimmedBody = noteBody.trim();
    if (!trimmedTitle && !trimmedBody) return;

    setSaving(true);
    try {
      const inboxFolder = folders.find(
        (f) => f.name.trim().toLowerCase() === 'inbox',
      );
      const derivedTitle =
        trimmedTitle ||
        trimmedBody.split(/\r?\n/)[0]?.slice(0, 48).trim() ||
        'Quick Note';

      const created = await createNote({
        title: derivedTitle,
        content: trimmedBody,
        folderId: inboxFolder?.id ?? null,
      });
      resetFields();
      if (openAfterSave) {
        onOpenNote(created.id);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTask = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseQuickAddTaskInput(taskTitle);
    if (!parsed.title) return;

    setSaving(true);
    try {
      const today = getTodayDateString();
      const tomorrow = getOffsetDateString(1);
      const dueDate =
        scheduleChoice === 'today'
          ? today
          : scheduleChoice === 'tomorrow'
            ? tomorrow
            : undefined;
      const resolvedGroup = taskGroup.trim() || parsed.group;

      await createTask({
        title: parsed.title,
        dueDate,
        isBacklog: scheduleChoice === 'backlog',
        group: resolvedGroup,
        priority: 'medium',
      });
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[#050706]/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onClick={handleClose}
    >
      <div
        className="w-full rounded-t-2xl border-t border-[#1E2623] bg-[#121715] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#2A332F]" />

        {/* Mode Switcher */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="inline-flex rounded-xl border border-[#1E2623] bg-[#0D1210] p-1">
            <button
              type="button"
              onClick={() => setMode('note')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'note'
                  ? 'bg-[#18221E] text-[#8AB8A3]'
                  : 'text-[#7E8B85]',
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Quick Note
            </button>
            <button
              type="button"
              onClick={() => setMode('task')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'task'
                  ? 'bg-[#d97757]/15 text-[#f0a287]'
                  : 'text-[#7E8B85]',
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Quick Task
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close quick capture"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'note' ? (
          <div className="space-y-3">
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Title (optional)…"
              aria-label="Quick note title"
              className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#0D1210] px-3 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
            />
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write a quick note (auto-saved to Inbox)…"
              aria-label="Quick note body"
              rows={4}
              autoFocus
              className="w-full resize-none rounded-xl border border-[#1E2623] bg-[#0D1210] p-3 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={saving || (!noteTitle.trim() && !noteBody.trim())}
                onClick={() => void saveQuickNote(false)}
                className="flex-1 h-10 rounded-xl border border-[#1E2623] bg-[#18221E] text-xs font-semibold text-[#8AB8A3] disabled:opacity-40"
              >
                Save Note
              </button>
              <button
                type="button"
                disabled={saving || (!noteTitle.trim() && !noteBody.trim())}
                onClick={() => void saveQuickNote(true)}
                className="flex-1 h-10 rounded-xl bg-[#d97757] text-xs font-semibold text-[#0A0E0C] disabled:opacity-40"
              >
                Save & Open
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSaveTask(e)} className="space-y-3">
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs to be done?"
              aria-label="Quick task title"
              autoFocus
              className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#0D1210] px-3 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#d97757]/60"
            />

            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'tomorrow', label: 'Tomorrow' },
                  { id: 'backlog', label: 'Backlog' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScheduleChoice(opt.id)}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                    scheduleChoice === opt.id
                      ? 'border-[#d97757]/50 bg-[#d97757]/15 text-[#f0a287]'
                      : 'border-[#1E2623] bg-[#0D1210] text-[#7E8B85]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <input
                type="text"
                list="mobile-quick-task-groups"
                value={taskGroup}
                onChange={(e) => setTaskGroup(e.target.value)}
                placeholder="Group / category (optional)…"
                aria-label="Task group"
                className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#0D1210] px-3 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#d97757]/60"
              />
              <datalist id="mobile-quick-task-groups">
                {existingGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <button
              type="submit"
              disabled={saving || !taskTitle.trim()}
              className="h-10 w-full rounded-xl bg-[#d97757] text-xs font-semibold text-[#0A0E0C] disabled:opacity-40"
            >
              Add Task
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
