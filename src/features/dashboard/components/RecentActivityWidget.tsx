import { Calendar, CheckSquare, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ACTIVITY_LABELS,
  formatRelativeTimestamp,
  type DashboardActivityItem,
} from '@/features/dashboard/utils/dashboardSelectors';

export interface RecentActivityWidgetProps {
  items: readonly DashboardActivityItem[];
}

/**
 * Clean borderless unified activity feed derived from existing Notes, Tasks,
 * and Calendar timestamps with a single compact empty row when empty.
 */
export function RecentActivityWidget({ items }: RecentActivityWidgetProps) {
  return (
    <section className="space-y-3" aria-label="Recent Activity">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Recent Activity
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Notes, Tasks &amp; Calendar
        </span>
      </div>

      <div className="border-t border-border/70">
        {items.length === 0 ? (
          <div className="py-3 text-xs text-muted-foreground">
            No recent activity yet
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {items.map((item) => {
              const Icon =
                item.entityType === 'note'
                  ? FileText
                  : item.entityType === 'task'
                    ? CheckSquare
                    : Calendar;

              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-out hover:bg-accent/55"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="shrink-0 rounded-lg border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {ACTIVITY_LABELS[item.kind]}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      · {item.subtitle}
                    </span>
                  </div>

                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatRelativeTimestamp(item.timestamp)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
