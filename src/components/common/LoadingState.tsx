import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

/**
 * Minimal accessible loading indicator for route transitions or async setup.
 */
export function LoadingState({
  label = 'Loading workspace…',
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-[200px] items-center justify-center gap-2.5 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
