import { useEffect, useState, type FormEvent } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HABIT_ACCENT_OPTIONS,
  HABIT_CATEGORIES,
  HABIT_FREQUENCIES,
  WEEKDAY_LABELS_MON_FIRST,
} from '@/features/habits/utils/habitUtils';
import type {
  HabitAccentColor,
  HabitCategory,
  HabitFrequency,
  HabitRecord,
} from '@/services';
import { cn } from '@/utils/cn';

export interface HabitEditorDialogProps {
  open: boolean;
  habit: HabitRecord | null;
  onSave: (payload: {
    title: string;
    category: HabitCategory;
    frequency: HabitFrequency;
    targetDays: number[];
    accentColor: HabitAccentColor;
  }) => Promise<void>;
  onToggleArchive?: (habitId: string) => Promise<void>;
  onDelete?: (habitId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Clean modal for creating, editing, archiving, or deleting a Habit.
 */
export function HabitEditorDialog({
  open,
  habit,
  onSave,
  onToggleArchive,
  onDelete,
  onClose,
}: HabitEditorDialogProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HabitCategory>('Personal');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [targetDays, setTargetDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [accentColor, setAccentColor] = useState<HabitAccentColor>('sage');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setErrorMsg(null);
    if (habit) {
      setTitle(habit.title);
      setCategory(habit.category);
      setFrequency(habit.frequency);
      setTargetDays([...habit.targetDays]);
      setAccentColor(habit.accentColor);
    } else {
      setTitle('');
      setCategory('Personal');
      setFrequency('daily');
      setTargetDays([0, 1, 2, 3, 4, 5, 6]);
      setAccentColor('sage');
    }
  }, [open, habit]);

  const toggleDay = (dayIdx: number) => {
    setTargetDays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx],
    );
  };

  const handleFrequencyChange = (next: HabitFrequency) => {
    setFrequency(next);
    if (next === 'daily') setTargetDays([0, 1, 2, 3, 4, 5, 6]);
    else if (next === 'weekdays') setTargetDays([1, 2, 3, 4, 5]);
    else if (targetDays.length === 0 || targetDays.length === 7) {
      setTargetDays([1, 3, 5]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMsg('Habit name is required.');
      return;
    }
    if (frequency === 'custom_days' && targetDays.length === 0) {
      setErrorMsg('Select at least one target day.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        title: trimmed,
        category,
        frequency,
        targetDays,
        accentColor,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save habit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="top-[10%] max-w-md border-border bg-card p-5">
        <div>
          <DialogTitle className="text-sm font-semibold text-foreground">
            {habit ? 'Edit Habit' : 'New Habit'}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            Build consistent daily or weekly rituals synced across devices.
          </DialogDescription>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          {errorMsg ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
            >
              {errorMsg}
            </p>
          ) : null}

          <div className="space-y-1">
            <label
              htmlFor="habit-title-input"
              className="text-xs font-medium text-muted-foreground"
            >
              Habit title
            </label>
            <input
              id="habit-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep Work, Read 20 pages, Run"
              autoFocus
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Category
            </span>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Cadence
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-0.5">
              {HABIT_FREQUENCIES.map((freq) => {
                const active = frequency === freq.id;
                return (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => handleFrequencyChange(freq.id)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-[5px] py-1.5 text-xs font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-accent text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {freq.label}
                  </button>
                );
              })}
            </div>

            {frequency === 'custom_days' ? (
              <div className="flex items-center justify-between gap-1 pt-1">
                {WEEKDAY_LABELS_MON_FIRST.map((day) => {
                  const selected = targetDays.includes(day.dayIndex);
                  return (
                    <button
                      key={day.dayIndex}
                      type="button"
                      onClick={() => toggleDay(day.dayIndex)}
                      aria-pressed={selected}
                      aria-label={day.label}
                      className={cn(
                        'flex h-8 w-9 items-center justify-center rounded-md border text-xs font-medium transition-colors cursor-pointer',
                        selected
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Accent color
            </span>
            <div className="flex items-center gap-2.5">
              {HABIT_ACCENT_OPTIONS.map((opt) => {
                const selected = accentColor === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAccentColor(opt.id)}
                    aria-label={opt.label}
                    aria-pressed={selected}
                    title={opt.label}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full border transition-transform cursor-pointer',
                      selected
                        ? cn('border-foreground scale-105 ring-2', opt.ringClass)
                        : 'border-border/80 hover:scale-105',
                    )}
                  >
                    <span
                      className={cn('h-4 w-4 rounded-full', opt.dotClass)}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {confirmDelete && habit && onDelete ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <p className="font-medium text-foreground">
                Delete &ldquo;{habit.title}&rdquo; and all check-ins?
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
                  size="sm"
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await onDelete(habit.id);
                      onClose();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="bg-destructive text-destructive-foreground"
                >
                  Confirm delete
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-3">
            {habit ? (
              <div className="flex items-center gap-1">
                {onToggleArchive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await onToggleArchive(habit.id);
                        onClose();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>{habit.isArchived ? 'Unarchive' : 'Archive'}</span>
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </Button>
                ) : null}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {habit ? 'Save changes' : 'Create habit'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
