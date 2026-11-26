import { CheckSquare, Search, X } from 'lucide-react';
import {
  EVENT_CATEGORIES,
  getEventAccentClasses,
} from '@/features/calendar/utils/calendarDateUtils';
import type { EventCategory, NoteRecord, TaskRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface CalendarFiltersBarProps {
  searchQuery: string;
  categoryFilter: EventCategory | 'all';
  startDateFilter: string;
  endDateFilter: string;
  linkedNoteIdFilter: string | null;
  linkedTaskIdFilter: string | null;
  showTasks: boolean;
  showCompletedTasks: boolean;
  notes: readonly NoteRecord[];
  tasks: readonly TaskRecord[];
  onChangeSearchQuery: (q: string) => void;
  onChangeCategoryFilter: (cat: EventCategory | 'all') => void;
  onChangeStartDateFilter: (dateKey: string) => void;
  onChangeEndDateFilter: (dateKey: string) => void;
  onChangeLinkedNoteIdFilter: (noteId: string | null) => void;
  onChangeLinkedTaskIdFilter: (taskId: string | null) => void;
  onChangeShowTasks: (show: boolean) => void;
  onChangeShowCompletedTasks: (show: boolean) => void;
  onClearFilters: () => void;
}

/**
 * Search, category legend & filters, linked entity selectors, and task visibility controls.
 */
export function CalendarFiltersBar({
  searchQuery,
  categoryFilter,
  startDateFilter,
  endDateFilter,
  linkedNoteIdFilter,
  linkedTaskIdFilter,
  showTasks,
  showCompletedTasks,
  notes,
  tasks,
  onChangeSearchQuery,
  onChangeCategoryFilter,
  onChangeStartDateFilter,
  onChangeEndDateFilter,
  onChangeLinkedNoteIdFilter,
  onChangeLinkedTaskIdFilter,
  onChangeShowTasks,
  onChangeShowCompletedTasks,
  onClearFilters,
}: CalendarFiltersBarProps) {
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    categoryFilter !== 'all' ||
    startDateFilter !== '' ||
    endDateFilter !== '' ||
    linkedNoteIdFilter !== null ||
    linkedTaskIdFilter !== null;

  return (
    <div className="space-y-2.5">
      {/* Row 1: Category Legend / Filter Pills + Task Visibility Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Event category filter and legend"
          className="flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            aria-pressed={categoryFilter === 'all'}
            onClick={() => onChangeCategoryFilter('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              categoryFilter === 'all'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            All categories
          </button>

          {EVENT_CATEGORIES.map((cat) => {
            const active = categoryFilter === cat.id;
            const accent = getEventAccentClasses(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChangeCategoryFilter(active ? 'all' : cat.id)
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? accent.badgeClass
                    : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span
                  className={cn('h-2 w-2 rounded-full', accent.swatchClass)}
                  aria-hidden="true"
                />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={showTasks}
            onClick={() => onChangeShowTasks(!showTasks)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
              showTasks
                ? 'border-border bg-accent text-accent-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{showTasks ? 'Tasks shown' : 'Tasks hidden'}</span>
          </button>

          {showTasks ? (
            <button
              type="button"
              aria-pressed={showCompletedTasks}
              onClick={() => onChangeShowCompletedTasks(!showCompletedTasks)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                showCompletedTasks
                  ? 'border-border bg-card text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {showCompletedTasks ? 'Completed shown' : 'Completed hidden'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Row 2: Search, Date Range, Linked Note & Task Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            placeholder="Search events by title, description, or location…"
            aria-label="Search calendar events"
            className="h-8 w-full rounded-md border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <input
          type="date"
          aria-label="Filter from date"
          title="Filter from date"
          value={startDateFilter}
          onChange={(e) => onChangeStartDateFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          –
        </span>
        <input
          type="date"
          aria-label="Filter to date"
          title="Filter to date"
          value={endDateFilter}
          onChange={(e) => onChangeEndDateFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <select
          aria-label="Filter by linked note"
          value={linkedNoteIdFilter ?? ''}
          onChange={(e) =>
            onChangeLinkedNoteIdFilter(e.target.value || null)
          }
          className="h-8 max-w-[170px] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="">All linked notes</option>
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              Note: {n.title}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by linked task"
          value={linkedTaskIdFilter ?? ''}
          onChange={(e) =>
            onChangeLinkedTaskIdFilter(e.target.value || null)
          }
          className="h-8 max-w-[170px] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="">All linked tasks</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              Task: {t.title}
            </option>
          ))}
        </select>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
