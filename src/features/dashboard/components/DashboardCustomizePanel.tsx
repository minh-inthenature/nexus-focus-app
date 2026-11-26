import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DASHBOARD_SECTION_LABELS,
  type DashboardSectionId,
} from '@/features/dashboard/stores/useDashboardStore';
import { cn } from '@/utils/cn';

export interface DashboardCustomizePanelProps {
  sectionOrder: readonly DashboardSectionId[];
  hiddenSections: readonly DashboardSectionId[];
  onToggleVisibility: (id: DashboardSectionId) => void;
  onMoveSection: (id: DashboardSectionId, direction: 'up' | 'down') => void;
  onReset: () => void;
}

/**
 * Lightweight customization controls allowing users to show, hide, and reorder
 * dashboard sections with persisted preferences.
 */
export function DashboardCustomizePanel({
  sectionOrder,
  hiddenSections,
  onToggleVisibility,
  onMoveSection,
  onReset,
}: DashboardCustomizePanelProps) {
  return (
    <section
      aria-label="Customize dashboard layout"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
            Dashboard Sections
          </h2>
          <p className="text-xs text-muted-foreground">
            Show, hide, or reorder panels. Saved automatically on this device.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReset}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Restore defaults</span>
        </Button>
      </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sectionOrder.map((id, idx) => {
          const isHidden = hiddenSections.includes(id);
          const label = DASHBOARD_SECTION_LABELS[id];
          return (
            <div
              key={id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs transition-colors duration-150',
                isHidden ? 'bg-muted/25 text-muted-foreground' : 'bg-background/60',
              )}
            >
              <button
                type="button"
                aria-pressed={!isHidden}
                onClick={() => onToggleVisibility(id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
              >
                {isHidden ? (
                  <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className={cn('truncate font-medium', isHidden && 'line-through')}>
                  {label}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  aria-label={`Move ${label} up`}
                  onClick={() => onMoveSection(id, 'up')}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={idx === sectionOrder.length - 1}
                  aria-label={`Move ${label} down`}
                  onClick={() => onMoveSection(id, 'down')}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
