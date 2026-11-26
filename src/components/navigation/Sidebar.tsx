import { useEffect, useMemo } from 'react';
import {
  FileText,
  Folder,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  Trees,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/utils/cn';
import { PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM } from './nav-config';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarSection } from './SidebarSection';
import { SyncStatusWidget } from './SyncStatusWidget';

/**
 * Persistent desktop sidebar and mobile slide-over navigation drawer.
 */
export function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const mobileSidebarOpen = useAppStore((state) => state.mobileSidebarOpen);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setMobileSidebarOpen = useAppStore(
    (state) => state.setMobileSidebarOpen,
  );
  const setCommandPaletteOpen = useAppStore(
    (state) => state.setCommandPaletteOpen,
  );
  const { resolvedTheme, toggleTheme } = useTheme();
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const setSelectedFolderFilterId = useNotesStore(
    (state) => state.setSelectedFolderFilterId,
  );

  useEffect(() => {
    void initializeNotes();
  }, [initializeNotes]);

  const favoriteNotes = useMemo(
    () =>
      notes
        .filter((n) => n.isFavorite)
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 5),
    [notes],
  );

  const recentNotes = useMemo(
    () =>
      [...notes]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [notes],
  );

  const rootFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8),
    [folders],
  );

  const isMac =
    typeof navigator !== 'undefined' &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl K';

  const closeMobile = () => {
    if (mobileSidebarOpen) {
      setMobileSidebarOpen(false);
    }
  };

  const renderSidebarBody = (collapsed: boolean, isMobileDrawer: boolean) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground select-none">
      {/* Header: Brand + Collapse Control */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-sidebar-border px-2.5',
          collapsed ? 'justify-center px-2' : 'justify-between',
        )}
      >
        {!collapsed ? (
          <Link
            to="/"
            onClick={closeMobile}
            className="truncate rounded-lg px-1 py-0.5 font-serif text-[17px] font-medium tracking-[-0.02em] text-sidebar-foreground transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Nexus
          </Link>
        ) : null}

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Search / Command Palette Trigger */}
      <div className="px-2 pt-3 pb-2">
        {collapsed ? (
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                aria-label={`Search (${shortcutLabel})`}
                className="flex h-8 w-full items-center justify-center rounded-xl border border-sidebar-border bg-card/75 text-muted-foreground transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Search ({shortcutLabel})
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => {
              closeMobile();
              setCommandPaletteOpen(true);
            }}
            aria-label="Open search and command palette"
            className="flex h-8 w-full items-center justify-between rounded-xl border border-sidebar-border bg-card/75 px-2.5 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Search…</span>
            </span>
            <Kbd>{shortcutLabel}</Kbd>
          </button>
        )}
      </div>

      {/* Primary Modules Navigation */}
      <nav aria-label="Primary modules" className="space-y-0.5 px-2 py-1">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.id}
            item={item}
            collapsed={collapsed}
            onNavigate={closeMobile}
          />
        ))}
      </nav>

      {/* Workspace Sections (Hidden when collapsed) */}
      {!collapsed ? (
        <div className="mt-2.5 flex-1 space-y-4 overflow-y-auto px-2 py-2">
          <Separator />
          {favoriteNotes.length > 0 ? (
            <SidebarSection title="Favorites" emptyLabel="No favorite items yet">
              <div className="space-y-0.5">
                {favoriteNotes.map((note) => (
                  <Link
                    key={note.id}
                    to={`/notes/${note.id}`}
                    onClick={closeMobile}
                    className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground/80 transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <Star
                      className="h-3 w-3 shrink-0 fill-current text-primary"
                      aria-hidden="true"
                    />
                    <span className="truncate">{note.title}</span>
                  </Link>
                ))}
              </div>
            </SidebarSection>
          ) : null}
          <SidebarSection
            title="Recent Notes"
            emptyLabel="No recent notes yet"
          >
            {recentNotes.length > 0 ? (
              <div className="space-y-0.5">
                {recentNotes.map((note) => (
                  <Link
                    key={note.id}
                    to={`/notes/${note.id}`}
                    onClick={closeMobile}
                    className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground/80 transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <FileText
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{note.title}</span>
                  </Link>
                ))}
              </div>
            ) : undefined}
          </SidebarSection>
          <SidebarSection
            title="Folders"
            emptyLabel="No folders created yet"
          >
            {rootFolders.length > 0 ? (
              <div className="space-y-0.5">
                {rootFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    to="/notes"
                    onClick={() => {
                      setSelectedFolderFilterId(folder.id);
                      closeMobile();
                    }}
                    className="flex h-7 items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground/80 transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <Folder
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{folder.name}</span>
                  </Link>
                ))}
              </div>
            ) : undefined}
          </SidebarSection>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Footer: Row 1 Sync Status, Row 2 Settings + Icon-Only Theme Toggle */}
      <div className="mt-auto space-y-1 border-t border-sidebar-border px-2 py-2">
        <SyncStatusWidget collapsed={collapsed} />
        {collapsed ? (
          <>
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={
                    resolvedTheme === 'forest'
                      ? 'Switch to Warm Charcoal theme'
                      : 'Switch to Forest Focus theme'
                  }
                  className="flex h-8 w-full items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                >
                  {resolvedTheme === 'forest' ? (
                    <Moon className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Trees className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {resolvedTheme === 'forest'
                  ? 'Warm Charcoal mode'
                  : 'Forest Focus mode'}
              </TooltipContent>
            </Tooltip>

            <SidebarNavItem
              item={SETTINGS_NAV_ITEM}
              collapsed
              onNavigate={closeMobile}
            />
          </>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1">
              <SidebarNavItem
                item={SETTINGS_NAV_ITEM}
                collapsed={false}
                onNavigate={closeMobile}
              />
            </div>

            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={
                    resolvedTheme === 'forest'
                      ? 'Switch to Warm Charcoal theme'
                      : 'Switch to Forest Focus theme'
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                >
                  {resolvedTheme === 'forest' ? (
                    <Moon className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <Trees className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {resolvedTheme === 'forest'
                  ? 'Switch to Warm Charcoal mode'
                  : 'Switch to Forest Focus mode'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside
        aria-label="Workspace sidebar"
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border transition-[width] duration-150 ease-out md:flex md:flex-col',
          sidebarCollapsed ? 'w-14' : 'w-60',
        )}
      >
        {renderSidebarBody(sidebarCollapsed, false)}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-64 flex-col border-r border-sidebar-border">
            {renderSidebarBody(false, true)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
