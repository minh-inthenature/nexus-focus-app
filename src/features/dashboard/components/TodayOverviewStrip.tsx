import { Link } from 'react-router-dom';
import type { DashboardMetrics } from '@/features/dashboard/utils/dashboardSelectors';
import { cn } from '@/utils/cn';

export interface TodayOverviewStripProps {
  metrics: DashboardMetrics;
  todayKey: string;
}

/**
 * Flattened, borderless horizontal stat strip separated by subtle vertical
 * dividers, dimming zero counts so active numbers stand out immediately.
 */
export function TodayOverviewStrip({
  metrics,
  todayKey,
}: TodayOverviewStripProps) {
  const items = [
    {
      id: 'due-today',
      label: 'Due today',
      value: metrics.tasksDueTodayCount,
      to: '/tasks?preset=today',
      alert: false,
    },
    {
      id: 'completed-today',
      label: 'Completed today',
      value: metrics.tasksCompletedTodayCount,
      to: '/tasks?preset=completed',
      alert: false,
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: metrics.overdueTasksCount,
      to: '/tasks?preset=overdue',
      alert: metrics.overdueTasksCount > 0,
    },
    {
      id: 'events-today',
      label: 'Events today',
      value: metrics.eventsTodayCount,
      to: `/calendar?date=${todayKey}&view=day`,
      alert: false,
    },
    {
      id: 'upcoming-deadlines',
      label: 'Upcoming (7d)',
      value: metrics.upcomingDeadlinesCount,
      to: '/tasks?preset=upcoming',
      alert: false,
    },
  ];

  return (
    <section aria-label="Today's overview" className="space-y-2.5">
      <h2 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Today&apos;s Overview
      </h2>
      <div className="grid grid-cols-2 gap-y-2 border-t border-border pt-3 sm:grid-cols-5 sm:divide-x sm:divide-border">
        {items.map((item) => {
          const isZero = item.value === 0;
          const isCompletedPositive =
            item.id === 'completed-today' && item.value > 0;
          return (
            <Link
              key={item.id}
              to={item.to}
              className="flex flex-col justify-between rounded-lg px-3 py-1.5 transition-colors duration-150 ease-out hover:bg-accent/55 sm:px-5 sm:first:pl-2"
            >
              <span className="text-xs text-muted-foreground">
                {item.label}
              </span>
              <span
                className={cn(
                  'mt-1 text-lg font-medium tabular-nums',
                  item.alert
                    ? 'text-destructive'
                    : isCompletedPositive
                      ? 'text-focus-accent'
                      : isZero
                        ? 'text-subtle-foreground'
                        : 'text-foreground',
                )}
              >
                {item.value}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
