import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/navigation/CommandPalette';
import { Sidebar } from '@/components/navigation/Sidebar';
import { SyncConflictsDialog } from '@/components/navigation/SyncConflictsDialog';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useAppStore } from '@/stores/useAppStore';
import { WorkspaceContainer } from './WorkspaceContainer';

/**
 * Persistent two-panel desktop application shell with global keyboard shortcuts.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const toggleCommandPalette = useAppStore(
    (state) => state.toggleCommandPalette,
  );
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setMobileSidebarOpen = useAppStore(
    (state) => state.setMobileSidebarOpen,
  );

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  useKeyboardShortcut(
    { key: 'k', ctrlOrMeta: true, allowInInput: true },
    () => toggleCommandPalette(),
  );

  useKeyboardShortcut({ key: '\\', ctrlOrMeta: true }, () => toggleSidebar());

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <WorkspaceContainer>
        <Outlet />
      </WorkspaceContainer>
      <CommandPalette />
      <SyncConflictsDialog />
    </div>
  );
}
