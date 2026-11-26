import { useCallback, useEffect, useRef } from 'react';
import {
  CalendarPlus,
  FileText,
  PanelLeftOpen,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { NewNoteMenu } from './components/NewNoteMenu';
import { NoteEditorWorkspace } from './components/NoteEditorWorkspace';
import { NotesExplorer } from './components/NotesExplorer';
import { useNotesStore } from './stores/useNotesStore';

/**
 * Obsidian-inspired Notes & Markdown Knowledge Management workspace.
 * Integrates a collapsible file/tag/search explorer with a CodeMirror 6
 * editor and live Markdown preview backed by IndexedDB.
 */
export function NotesPage() {
  const { noteId: routeNoteId } = useParams<{ noteId?: string }>();
  const navigate = useNavigate();

  const {
    notes,
    activeNoteId,
    explorerCollapsed,
    isFullscreen,
    initialized,
    loading,
    initialize,
    setActiveNoteId,
    toggleExplorer,
    createNote,
    openDailyNote,
  } = useNotesStore();

  const flushSignalRef = useRef<(() => Promise<void>) | null>(null);
  const prevRouteNoteIdRef = useRef<string | undefined>(routeNoteId);
  const prevActiveNoteIdRef = useRef<string | null>(activeNoteId);
  const didInitialSyncRef = useRef(false);

  const flushActiveSave = useCallback(async () => {
    if (flushSignalRef.current) {
      await flushSignalRef.current();
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Bidirectional sync between URL `/notes/:noteId` and store `activeNoteId`
  useEffect(() => {
    if (!initialized) return;

    if (!didInitialSyncRef.current) {
      didInitialSyncRef.current = true;
      prevRouteNoteIdRef.current = routeNoteId;
      prevActiveNoteIdRef.current = activeNoteId;

      if (routeNoteId) {
        const exists = notes.some((n) => n.id === routeNoteId);
        if (exists) {
          if (routeNoteId !== activeNoteId) {
            prevActiveNoteIdRef.current = routeNoteId;
            void setActiveNoteId(routeNoteId);
          }
        } else {
          prevRouteNoteIdRef.current = undefined;
          prevActiveNoteIdRef.current = null;
          void setActiveNoteId(null);
          navigate('/notes', { replace: true });
        }
      } else if (activeNoteId && notes.some((n) => n.id === activeNoteId)) {
        prevRouteNoteIdRef.current = activeNoteId;
        navigate(`/notes/${activeNoteId}`, { replace: true });
      }
      return;
    }

    if (routeNoteId !== prevRouteNoteIdRef.current) {
      prevRouteNoteIdRef.current = routeNoteId;
      if (routeNoteId) {
        const exists = notes.some((n) => n.id === routeNoteId);
        if (exists && routeNoteId !== activeNoteId) {
          prevActiveNoteIdRef.current = routeNoteId;
          void flushActiveSave().then(() => setActiveNoteId(routeNoteId));
        } else if (!exists) {
          prevRouteNoteIdRef.current = undefined;
          prevActiveNoteIdRef.current = null;
          navigate('/notes', { replace: true });
        }
      } else if (activeNoteId !== null) {
        prevActiveNoteIdRef.current = null;
        void flushActiveSave().then(() => setActiveNoteId(null));
      }
      return;
    }

    if (activeNoteId !== prevActiveNoteIdRef.current) {
      prevActiveNoteIdRef.current = activeNoteId;
      if (activeNoteId && routeNoteId !== activeNoteId) {
        prevRouteNoteIdRef.current = activeNoteId;
        navigate(`/notes/${activeNoteId}`, { replace: true });
      } else if (!activeNoteId && routeNoteId) {
        prevRouteNoteIdRef.current = undefined;
        navigate('/notes', { replace: true });
      }
    }
  }, [
    initialized,
    routeNoteId,
    activeNoteId,
    notes,
    setActiveNoteId,
    navigate,
    flushActiveSave,
  ]);

  if (loading && !initialized) {
    return <LoadingState label="Loading notes vault…" className="h-full" />;
  }

  const activeNote = activeNoteId
    ? notes.find((n) => n.id === activeNoteId) ?? null
    : null;

  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden bg-background',
        isFullscreen && 'fixed inset-0 z-50',
      )}
    >
      {!explorerCollapsed && !isFullscreen ? (
        <NotesExplorer onBeforeSelectNote={flushActiveSave} />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {activeNote ? (
          <NoteEditorWorkspace
            key={activeNote.id}
            note={activeNote}
            flushSignalRef={flushSignalRef}
          />
        ) : (
          <div className="flex h-full flex-col">
            {explorerCollapsed ? (
              <div className="border-b border-border px-4 py-2.5">
                <button
                  type="button"
                  onClick={toggleExplorer}
                  aria-label="Show notes explorer"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                  <span>Show explorer</span>
                </button>
              </div>
            ) : null}

            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={FileText}
                title={
                  notes.length === 0
                    ? 'Your knowledge vault is empty'
                    : 'Select a note to start writing'
                }
                description="Create a Markdown note, Code File (.cpp, .py, .c, .ts, .js), or Canvas drawing, open today's daily note, or import files from your computer."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <NewNoteMenu
                      variant="button"
                      label="New Note"
                      onCreateNote={(input) => createNote(input)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openDailyNote()}
                    >
                      <CalendarPlus
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span>Today&apos;s Daily Note</span>
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
