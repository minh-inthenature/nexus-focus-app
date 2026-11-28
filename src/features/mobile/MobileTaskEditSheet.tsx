import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarClock,
  Clock,
  FolderKanban,
  Inbox,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  extendTaskDeadline,
  extractAllTaskGroups,
  formatDurationLabel,
  getOffsetDateString,
  getTodayDateString,
  isTaskInBacklog,
  isTaskOverdue,
} from '@/features/tasks/utils/taskFilters';
import type { TaskPriority, TaskRecord, TaskStatus } from '@/services';
import { cn } from '@/utils/cn';

export interface MobileTaskEditSheetProps {
  task: TaskRecord | null;
  onClose: () => void;
}

const DURATION_PRESETS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h', minutes: 120 },
] as const;

const STATUS_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

/**
 * Sleek dark bottom sheet (`#0F1412`) for editing mobile tasks:
 * supports Star/Pin to Top, buckets, due date/time, duration (`hrs`/`min` + `30m`/`1h`/`1h 30m`/`2h`),
 * "Extend Deadline by Duration", and delete confirmation.
 */
export function MobileTaskEditSheet({
  task,
  onClose,
}: MobileTaskEditSheetProps) {
  const tasks = useTasksStore((s) => s.tasks);
  const updateTask = useTasksStore((s) => s.updateTask);
  const deleteTask = useTasksStore((s) => s.deleteTask);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [isBacklog, setIsBacklog] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [durationHours, setDurationHours] = useState('0');
  const [durationMins, setDurationMins] = useState('0');
  const [extendedNotice, setExtendedNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setGroup(task.group ?? '');
    setCategory(task.category ?? '');
    setDueDate(task.dueDate ?? '');
    setDueTime(task.dueTime ?? '');
    setIsBacklog(task.status !== 'done' && isTaskInBacklog(task));
    setIsStarred(Boolean(task.isStarred));

    const mins = task.durationMinutes ?? 0;
    setDurationHours(String(Math.floor(mins / 60)));
    setDurationMins(String(mins % 60));
    setExtendedNotice(null);
    setConfirmDelete(false);
    setErrorMsg(null);
  }, [task]);

  const existingGroups = useMemo(() => extractAllTaskGroups(tasks), [tasks]);

  if (!task) return null;

  const todayStr = getTodayDateString();
  const tomorrowStr = getOffsetDateString(1);

  const parsedHours = Math.max(0, Number.parseInt(durationHours || '0', 10) || 0);
  const parsedMins = Math.max(0, Number.parseInt(durationMins || '0', 10) || 0);
  const totalMinutes = parsedHours * 60 + parsedMins;
  const formattedDuration = formatDurationLabel(totalMinutes);

  const isCurrentlyOverdue =
    status !== 'done' &&
    !isBacklog &&
    Boolean(dueDate) &&
    isTaskOverdue({ ...task, status, isBacklog, dueDate }, todayStr);

  const applyPresetMinutes = (minutes: number) => {
    setDurationHours(String(Math.floor(minutes / 60)));
    setDurationMins(String(minutes % 60));
    setExtendedNotice(null);
  };

  const handleExtendDeadline = () => {
    if (totalMinutes <= 0) return;
    const next = extendTaskDeadline(
      isBacklog ? undefined : dueDate || undefined,
      dueTime || undefined,
      totalMinutes,
    );
    setDueDate(next.dueDate);
    setDueTime(next.dueTime);
    setIsBacklog(false);
    setExtendedNotice(`Deadline extended to ${next.dueDate} · ${next.dueTime}`);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMsg('Task title is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateTask(task.id, {
        title: trimmed,
        description,
        status,
        priority,
        group: group.trim() || null,
        category: category.trim() || null,
        dueDate: isBacklog ? null : dueDate || null,
        dueTime: isBacklog ? null : dueTime || null,
        isBacklog,
        isStarred,
        durationMinutes: totalMinutes > 0 ? totalMinutes : null,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save changes.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteTask(task.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[#050706]/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Task"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border-t border-[#1E2623] bg-[#0F1412] text-[#E4E8E6] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle + Header */}
        <div className="shrink-0 px-4 pt-2.5 pb-3 border-b border-[#1E2623]">
          <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#2A332F]" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#E4E8E6]">Edit Task</h2>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsStarred((prev) => !prev)}
                aria-pressed={isStarred}
                aria-label="Pin task to top"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  isStarred
                    ? 'border-[#e5a93c]/45 bg-[#e5a93c]/15 text-[#f3c66b]'
                    : 'border-[#1E2623] bg-[#141A17] text-[#7E8B85]',
                )}
              >
                <Star
                  className={cn(
                    'h-3.5 w-3.5',
                    isStarred && 'fill-[#e5a93c] text-[#e5a93c]',
                  )}
                />
                <span>{isStarred ? 'Pinned' : 'Pin to Top'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close edit sheet"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSave(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-[#d97757]/40 bg-[#d97757]/10 px-3 py-2 text-xs text-[#f0a287]"
              >
                {errorMsg}
              </p>
            )}

            {/* Title & Notes */}
            <div className="space-y-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                aria-label="Task title"
                className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-3 text-sm font-medium text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#d97757]/60"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Notes or description…"
                aria-label="Task description"
                className="w-full resize-none rounded-xl border border-[#1E2623] bg-[#0A0E0C] p-3 text-xs leading-relaxed text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#d97757]/60"
              />
            </div>

            {/* Bucket & High Priority Quick Pills */}
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
                Schedule & Priority
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDueDate(todayStr);
                    setIsBacklog(false);
                    setExtendedNotice(null);
                  }}
                  aria-pressed={!isBacklog && dueDate === todayStr}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    !isBacklog && dueDate === todayStr
                      ? 'border-[#d97757]/50 bg-[#d97757]/15 text-[#f0a287]'
                      : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                  )}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDueDate(tomorrowStr);
                    setIsBacklog(false);
                    setExtendedNotice(null);
                  }}
                  aria-pressed={!isBacklog && dueDate === tomorrowStr}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    !isBacklog && dueDate === tomorrowStr
                      ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3]'
                      : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                  )}
                >
                  Upcoming
                </button>
                {isCurrentlyOverdue && (
                  <span className="rounded-full border border-[#d97757]/40 bg-[#d97757]/15 px-3 py-1.5 text-xs font-medium text-[#f0a287]">
                    Overdue
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsBacklog(true);
                    setDueDate('');
                    setDueTime('');
                    setExtendedNotice(null);
                  }}
                  aria-pressed={isBacklog}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    isBacklog
                      ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3]'
                      : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                  )}
                >
                  <Inbox className="h-3 w-3" />
                  <span>Backlog</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPriority((prev) => (prev === 'high' ? 'medium' : 'high'))
                  }
                  aria-pressed={priority === 'high'}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    priority === 'high'
                      ? 'border-[#d97757]/55 bg-[#d97757] text-[#0A0E0C]'
                      : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                  )}
                >
                  High Priority
                </button>
              </div>
            </div>

            {/* Status Segmented Bar */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
                Status
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#1E2623] bg-[#0A0E0C] p-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    aria-pressed={status === opt.value}
                    className={cn(
                      'rounded-lg py-1.5 text-xs font-medium transition-colors',
                      status === opt.value
                        ? 'bg-[#18221E] text-[#8AB8A3]'
                        : 'text-[#7E8B85]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Group & Category */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="mobile-edit-group"
                    className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]"
                  >
                    <FolderKanban className="h-3 w-3" />
                    Group
                  </label>
                  <input
                    id="mobile-edit-group"
                    type="text"
                    list="mobile-edit-groups"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    placeholder="e.g. Physics 2"
                    className="h-9 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-2.5 text-xs text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
                  />
                  <datalist id="mobile-edit-groups">
                    {existingGroups.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="mobile-edit-category"
                    className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]"
                  >
                    Category
                  </label>
                  <input
                    id="mobile-edit-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Optional category"
                    className="h-9 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-2.5 text-xs text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
                  />
                </div>
              </div>

              {existingGroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {existingGroups.map((g) => {
                    const active = group.trim() === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGroup(active ? '' : g)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                          active
                            ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3] font-medium'
                            : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                        )}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Due Date & Due Time */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="mobile-edit-due-date"
                  className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]"
                >
                  Due Date
                </label>
                <input
                  id="mobile-edit-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDueDate(val);
                    if (val) setIsBacklog(false);
                    setExtendedNotice(null);
                  }}
                  className="h-9 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-2.5 text-xs text-[#E4E8E6] outline-none focus:border-[#d97757]/60"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="mobile-edit-due-time"
                  className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]"
                >
                  Due Time
                </label>
                <input
                  id="mobile-edit-due-time"
                  type="time"
                  value={dueTime}
                  onChange={(e) => {
                    setDueTime(e.target.value);
                    setExtendedNotice(null);
                  }}
                  className="h-9 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-2.5 text-xs text-[#E4E8E6] outline-none focus:border-[#d97757]/60"
                />
              </div>
            </div>

            {/* Duration / Extend Time */}
            <div className="space-y-2.5 rounded-xl border border-[#1E2623] bg-[#0A0E0C] p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
                  <Clock className="h-3.5 w-3.5 text-[#8AB8A3]" />
                  Duration / Extend Time
                </span>
                {formattedDuration && (
                  <button
                    type="button"
                    onClick={() => applyPresetMinutes(0)}
                    className="text-[11px] text-[#8AB8A3] hover:underline"
                  >
                    {formattedDuration} · Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((preset) => {
                  const active = totalMinutes === preset.minutes;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPresetMinutes(preset.minutes)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'border-[#d97757]/55 bg-[#d97757]/15 text-[#f0a287]'
                          : 'border-[#1E2623] bg-[#111614] text-[#9BA8A2]',
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-[#1E2623] bg-[#111614] px-2.5 h-9">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={durationHours}
                    onChange={(e) => {
                      setDurationHours(e.target.value);
                      setExtendedNotice(null);
                    }}
                    aria-label="Duration hours"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#E4E8E6] outline-none tabular-nums"
                  />
                  <span className="text-[11px] text-[#7E8B85]">hrs</span>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#1E2623] bg-[#111614] px-2.5 h-9">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={durationMins}
                    onChange={(e) => {
                      setDurationMins(e.target.value);
                      setExtendedNotice(null);
                    }}
                    aria-label="Duration minutes"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#E4E8E6] outline-none tabular-nums"
                  />
                  <span className="text-[11px] text-[#7E8B85]">min</span>
                </div>
              </div>

              <button
                type="button"
                disabled={totalMinutes <= 0}
                onClick={handleExtendDeadline}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#8AB8A3]/35 bg-[#18221E] px-3 text-xs font-medium text-[#8AB8A3] disabled:opacity-40 active:bg-[#1E2C27]"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                <span>
                  {formattedDuration
                    ? `Extend Deadline by Duration (+${formattedDuration})`
                    : 'Extend Deadline by Duration'}
                </span>
              </button>

              {extendedNotice && (
                <p className="text-[11px] text-[#8AB8A3]">{extendedNotice}</p>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="shrink-0 border-t border-[#1E2623] bg-[#0A0E0C] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {confirmDelete ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#f0a287]">Delete this task?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="h-9 rounded-xl border border-[#1E2623] px-3 text-xs font-medium text-[#9BA8A2]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDelete()}
                    className="h-9 rounded-xl bg-[#d97757] px-3.5 text-xs font-semibold text-[#0A0E0C]"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete task"
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 text-xs font-medium text-[#9BA8A2] active:text-[#f0a287]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="h-10 flex-1 rounded-xl bg-[#d97757] text-xs font-semibold text-[#0A0E0C] disabled:opacity-40 active:scale-[0.99] transition-transform"
                >
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
