import { useEffect, useState } from 'react';
import { getLocalTimePosition } from '@/features/calendar/utils/calendarDateUtils';

/**
 * Tracks the current local date key and percentage position across a 24-hour
 * calendar grid, refreshing automatically every minute.
 */
export function useCurrentLocalTime() {
  const [nowPos, setNowPos] = useState(() => getLocalTimePosition());

  useEffect(() => {
    const refresh = () => setNowPos(getLocalTimePosition());
    const intervalId = window.setInterval(refresh, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return nowPos;
}

export interface CurrentTimeLineProps {
  topPercent: number;
}

/**
 * Non-interactive current-time indicator line (`2px` horizontal line + left
 * circular dot) rendered above event blocks on today's column.
 */
export function CurrentTimeLine({ topPercent }: CurrentTimeLineProps) {
  return (
    <div
      data-testid="current-time-indicator"
      aria-hidden="true"
      style={{ top: `${topPercent}%` }}
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
    >
      <span className="-ml-1 h-2 w-2 shrink-0 -translate-y-1/2 rounded-full bg-primary shadow-xs" />
      <div className="h-[2px] w-full -translate-y-1/2 bg-primary" />
    </div>
  );
}
