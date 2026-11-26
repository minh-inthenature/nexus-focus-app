import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SidebarSectionProps {
  title: string;
  emptyLabel: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

/**
 * Collapsible sidebar subsection for Favorites, Recent Notes, and Folder
 * Explorer placeholders.
 */
export function SidebarSection({
  title,
  emptyLabel,
  defaultOpen = true,
  children,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section aria-label={title} className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{title}</span>
      </button>

      {open ? (
        <div className={cn('px-2')}>
          {children ?? (
            <p className="rounded-md px-2 py-1.5 text-xs text-muted-foreground/70">
              {emptyLabel}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
