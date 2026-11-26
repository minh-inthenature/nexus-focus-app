import type { ReactNode } from 'react';
import { Menu, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';

export interface WorkspaceContainerProps {
  children: ReactNode;
}

/**
 * Main workspace panel occupying the remaining viewport beside the sidebar,
 * with a compact mobile top bar and scrollable content region.
 */
export function WorkspaceContainer({ children }: WorkspaceContainerProps) {
  const { pathname } = useLocation();
  const isFullBleed = pathname.startsWith('/notes');
  const isHome = pathname === '/';
  const isTasks = pathname.startsWith('/tasks');
  const isCalendar = pathname.startsWith('/calendar');
  const setMobileSidebarOpen = useAppStore(
    (state) => state.setMobileSidebarOpen,
  );
  const setCommandPaletteOpen = useAppStore(
    (state) => state.setCommandPaletteOpen,
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Compact mobile top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="text-sm font-semibold tracking-tight text-foreground">
          Nexus
        </span>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open search"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {isFullBleed ? (
        <main className="flex-1 overflow-hidden">{children}</main>
      ) : (
        <main className="flex-1 overflow-y-auto">
          <div
            className={
              isCalendar
                ? 'mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10'
                : isTasks || isHome
                  ? 'mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10'
                  : 'mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10'
            }
          >
            {children}
          </div>
        </main>
      )}
    </div>
  );
}
