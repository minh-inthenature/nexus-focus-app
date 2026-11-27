import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { CommandPalette } from '@/components/navigation/CommandPalette';
import { Sidebar } from '@/components/navigation/Sidebar';
import { SyncConflictsDialog } from '@/components/navigation/SyncConflictsDialog';
import { useIsMobileShell } from '@/hooks/useIsMobileShell';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useAppStore } from '@/stores/useAppStore';
import { WorkspaceContainer } from './WorkspaceContainer';

const MobileAppShell = lazy(() =>
  import('@/features/mobile/MobileAppShell').then((m) => ({
    default: m.MobileAppShell,
  })),
);

/**
 * Persistent two-panel desktop application shell with global keyboard shortcuts,
 * isolated from the minimalist mobile shell rendered below 768px or on Capacitor.
 */
export function AppShell() {
  const isMobileShell = useIsMobileShell();
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

  if (isMobileShell) {
    return (
      <>
        <Suspense fallback={<LoadingState label="Loading Nexus…" />}>
          <MobileAppShell />
        </Suspense>
        <SyncConflictsDialog />
      </>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <WorkspaceContainer>
        <Outlet />
      </WorkspaceContainer>
      <CommandPalette />
      <SyncConflictsDialog />
    </div>
  );
}
