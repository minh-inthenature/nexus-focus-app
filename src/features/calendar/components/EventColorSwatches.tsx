import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { EVENT_COLOR_OPTIONS } from '@/features/calendar/utils/calendarDateUtils';
import type { EventColor } from '@/services/storage/db';
import { cn } from '@/utils/cn';

export interface EventColorSwatchesProps {
  value: EventColor;
  onChange: (color: EventColor) => void;
  size?: 'sm' | 'md';
  labelledBy?: string;
}

/**
 * Compact row of circular dark-mode event color swatches used inside both
 * the Event modal and quick right-click context menus.
 */
export function EventColorSwatches({
  value,
  onChange,
  size = 'md',
  labelledBy,
}: EventColorSwatchesProps) {
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const iconDim = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : 'Event color'}
      className="flex flex-wrap items-center gap-2"
    >
      {EVENT_COLOR_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.id)}
            className={cn(
              'inline-flex items-center justify-center rounded-full transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              dim,
              opt.swatchClass,
              selected
                ? 'scale-105 ring-2 ring-foreground/85 ring-offset-2 ring-offset-card'
                : 'opacity-80 hover:scale-105 hover:opacity-100',
            )}
          >
            {selected ? (
              <Check
                className={cn('stroke-[2.5] text-zinc-950', iconDim)}
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface EventColorContextMenuState {
  readonly eventId: string;
  readonly title: string;
  readonly currentColor: EventColor;
  readonly x: number;
  readonly y: number;
}

export interface EventColorContextMenuProps {
  menu: EventColorContextMenuState | null;
  onSelectColor: (eventId: string, color: EventColor) => void;
  onClose: () => void;
}

/**
 * Floating dark-mode popover opened on event right-click to recolor an event
 * in one click.
 */
export function EventColorContextMenu({
  menu,
  onSelectColor,
  onClose,
}: EventColorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const left =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(menu.x, window.innerWidth - 212))
      : menu.x;
  const top =
    typeof window !== 'undefined'
      ? Math.max(8, Math.min(menu.y, window.innerHeight - 92))
      : menu.y;

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label={`Color options for ${menu.title}`}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 w-50 rounded-lg border border-border bg-popover p-2.5 shadow-xl"
    >
      <p className="mb-2 truncate text-[11px] font-medium text-muted-foreground">
        {menu.title}
      </p>
      <EventColorSwatches
        value={menu.currentColor}
        size="sm"
        onChange={(color) => {
          onSelectColor(menu.eventId, color);
          onClose();
        }}
      />
    </div>
  );
}
