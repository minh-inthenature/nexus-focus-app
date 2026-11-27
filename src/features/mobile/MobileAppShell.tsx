import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  FileText,
  Plus,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { cn } from '@/utils/cn';
import { MobileNoteEditor } from './MobileNoteEditor';
import { MobileNotesView } from './MobileNotesView';
import { MobileQuickCaptureSheet } from './MobileQuickCaptureSheet';
import { MobileTasksView } from './MobileTasksView';
import { MobileTodayView } from './MobileTodayView';

type MobileTab = 'today' | 'notes' | 'tasks';

function resolveTabFromPath(pathname: string): MobileTab {
  if (pathname.startsWith('/notes')) return 'notes';
  if (pathname.startsWith('/tasks')) return 'tasks';
  return 'today';
}

/**
 * Isolated, thumb-friendly mobile shell (`< 768px` or native Capacitor).
 * Renders a 3-tab bottom bar (Today, Notes, Tasks), floating `+` quick capture,
 * and a full-screen note editor without altering any desktop layout components.
 */
export function MobileAppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const notes = useNotesStore((s) => s.notes);
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery);
  const syncStatus = useSyncStore((s) => s.status);
  const syncNow = useSyncStore((s) => s.syncNow);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  const isSettingsRoute = pathname.startsWith('/settings');
  const activeTab = resolveTabFromPath(pathname);

  useEffect(() => {
    if (!pathname.startsWith('/notes')) {
      setEditingNoteId(null);
    }
  }, [pathname]);

  const editingNote = editingNoteId
    ? notes.find((n) => n.id === editingNoteId) ?? null
    : null;

  if (editingNote) {
    return (
      <MobileNoteEditor
        note={editingNote}
        onBack={() => setEditingNoteId(null)}
        onSelectNote={(nextId) => setEditingNoteId(nextId)}
        onFilterByTag={(tagName) => {
          setSearchQuery(`#${tagName}`);
        }}
      />
    );
  }

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden bg-[#0D1210] text-[#E4E8E6]"
      data-testid="mobile-app-shell"
    >
      {/* Safe-Area Mobile Top Header */}
      <header className="shrink-0 border-b border-[#1E2623] bg-[#0A0E0C] pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center justify-between px-4">
          {isSettingsRoute ? (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm font-medium text-[#8AB8A3]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md bg-[#F3F3F1]"
                aria-hidden="true"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#0B0B0C] ring-1 ring-[#0B0B0C]/20" />
              </span>
              <span className="text-base font-medium tracking-tight text-[#E4E8E6] lowercase">
                nexus
              </span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void syncNow('manual')}
              aria-label="Sync now"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  syncStatus.state === 'syncing' && 'animate-spin text-[#8AB8A3]',
                )}
              />
            </button>
            {!isSettingsRoute && (
              <button
                type="button"
                onClick={() => navigate('/settings')}
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#7E8B85] active:bg-[#18221E]"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable Tab Body */}
      <main className="flex-1 min-h-0 overflow-y-auto pb-28">
        {isSettingsRoute ? (
          <div className="px-4 py-4">
            <Outlet />
          </div>
        ) : activeTab === 'notes' ? (
          <MobileNotesView onOpenNote={(noteId) => setEditingNoteId(noteId)} />
        ) : activeTab === 'tasks' ? (
          <MobileTasksView />
        ) : (
          <MobileTodayView />
        )}
      </main>

      {/* Floating Quick-Capture Button (+) */}
      {!isSettingsRoute && (
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          aria-label="Quick capture"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#d97757] text-[#0A0E0C] shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6 stroke-[2.25]" />
        </button>
      )}

      {/* Translucent Dark Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[#1E2623] bg-[#0A0E0C]/92 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 h-14">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-current={!isSettingsRoute && activeTab === 'today' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
              !isSettingsRoute && activeTab === 'today'
                ? 'text-[#d97757]'
                : 'text-[#7E8B85]',
            )}
          >
            <CalendarDays className="h-5 w-5" />
            <span>Today</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/notes')}
            aria-current={!isSettingsRoute && activeTab === 'notes' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
              !isSettingsRoute && activeTab === 'notes'
                ? 'text-[#8AB8A3]'
                : 'text-[#7E8B85]',
            )}
          >
            <FileText className="h-5 w-5" />
            <span>Notes</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/tasks')}
            aria-current={!isSettingsRoute && activeTab === 'tasks' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
              !isSettingsRoute && activeTab === 'tasks'
                ? 'text-[#d97757]'
                : 'text-[#7E8B85]',
            )}
          >
            <CheckSquare className="h-5 w-5" />
            <span>Tasks</span>
          </button>
        </div>
      </nav>

      <MobileQuickCaptureSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onOpenNote={(noteId) => {
          setCaptureOpen(false);
          navigate('/notes');
          setEditingNoteId(noteId);
        }}
      />
    </div>
  );
}
