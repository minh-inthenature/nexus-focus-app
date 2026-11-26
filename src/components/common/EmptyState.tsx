import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/**
 * Restrained empty-state container used across placeholder modules and
 * unpopulated workspace sections.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/45 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-16',
        className,
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <h2 className="font-serif text-base font-medium tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      {hint ? (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
