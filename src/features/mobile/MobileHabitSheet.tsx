import { useEffect, useState, type FormEvent } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
import { useHabitsStore } from '@/features/habits/stores/useHabitsStore';
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

export interface MobileHabitSheetProps {
  open: boolean;
  habit: HabitRecord | null;
  onClose: () => void;
}

/**
 * Sleek dark bottom sheet (`#0F1412`) for creating, editing, archiving,
 * or deleting a Habit on mobile screens.
 */
export function MobileHabitSheet({
  open,
  habit,
  onClose,
}: MobileHabitSheetProps) {
  const createHabit = useHabitsStore((s) => s.createHabit);
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const toggleArchiveHabit = useHabitsStore((s) => s.toggleArchiveHabit);
  const deleteHabit = useHabitsStore((s) => s.deleteHabit);

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

  if (!open) return null;

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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMsg('Habit title is required.');
      return;
    }
    if (frequency === 'custom_days' && targetDays.length === 0) {
      setErrorMsg('Select at least one day.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (habit) {
        await updateHabit(habit.id, {
          title: trimmed,
          category,
          frequency,
          targetDays,
          accentColor,
        });
      } else {
        await createHabit({
          title: trimmed,
          category,
          frequency,
          targetDays,
          accentColor,
        });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save habit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-[#050706]/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={habit ? 'Edit Habit' : 'New Habit'}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border-t border-[#1E2623] bg-[#0F1412] text-[#E4E8E6] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[#1E2623] px-4 pt-2.5 pb-3">
          <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#2A332F]" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E4E8E6]">
              {habit ? 'Edit Habit' : 'New Habit'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close habit sheet"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
            >
              <X className="h-4 w-4" />
            </button>
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

            <div className="space-y-1.5">
              <label
                htmlFor="mobile-habit-title"
                className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]"
              >
                Title
              </label>
              <input
                id="mobile-habit-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deep Work, Read 20 pages, Run"
                autoFocus
                className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#0A0E0C] px-3 text-sm font-medium text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
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
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3]'
                          : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                      )}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
                Frequency
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#1E2623] bg-[#0A0E0C] p-1">
                {HABIT_FREQUENCIES.map((freq) => {
                  const active = frequency === freq.id;
                  return (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => handleFrequencyChange(freq.id)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-lg py-1.5 text-xs font-medium transition-colors',
                        active
                          ? 'bg-[#18221E] text-[#8AB8A3]'
                          : 'text-[#7E8B85]',
                      )}
                    >
                      {freq.label}
                    </button>
                  );
                })}
              </div>

              {frequency === 'custom_days' && (
                <div className="grid grid-cols-7 gap-1 pt-1">
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
                          'h-9 rounded-lg border text-xs font-medium transition-colors',
                          selected
                            ? 'border-[#8AB8A3]/45 bg-[#18221E] text-[#8AB8A3]'
                            : 'border-[#1E2623] bg-[#0A0E0C] text-[#7E8B85]',
                        )}
                      >
                        {day.shortLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#7E8B85]">
                Accent Color
              </span>
              <div className="flex items-center gap-3">
                {HABIT_ACCENT_OPTIONS.map((opt) => {
                  const selected = accentColor === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAccentColor(opt.id)}
                      aria-label={opt.label}
                      aria-pressed={selected}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border transition-transform',
                        selected
                          ? cn('border-[#E4E8E6] scale-105 ring-2', opt.ringClass)
                          : 'border-[#1E2623]',
                      )}
                    >
                      <span
                        className={cn('h-4.5 w-4.5 rounded-full', opt.dotClass)}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#1E2623] bg-[#0A0E0C] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {confirmDelete && habit ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#f0a287]">Delete this habit?</span>
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
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await deleteHabit(habit.id);
                        onClose();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="h-9 rounded-xl bg-[#d97757] px-3.5 text-xs font-semibold text-[#0A0E0C]"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                {habit ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await toggleArchiveHabit(habit.id);
                          onClose();
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      aria-label={
                        habit.isArchived ? 'Unarchive habit' : 'Archive habit'
                      }
                      className="flex h-10 items-center gap-1 rounded-xl border border-[#1E2623] bg-[#111614] px-3 text-xs font-medium text-[#9BA8A2]"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>{habit.isArchived ? 'Restore' : 'Archive'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Delete habit"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1E2623] bg-[#111614] text-[#9BA8A2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="h-10 flex-1 rounded-xl bg-[#d97757] text-xs font-semibold text-[#0A0E0C] disabled:opacity-40"
                >
                  {submitting
                    ? 'Saving…'
                    : habit
                      ? 'Save Changes'
                      : 'Create Habit'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
