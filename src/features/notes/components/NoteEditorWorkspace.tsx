import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Hash, Trash2 } from 'lucide-react';
import type { CodeDiagnosticsSummary } from '@/features/notes/hooks/useCodeDiagnostics';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import {
  getCanvasElementCount,
  isCanvasNote,
  replaceExcalidrawBlockAt,
} from '@/features/notes/utils/canvasNote';
import {
  countLinesAndChars,
  extractCodeTags,
  getCodeLanguageMeta,
  getNoteLanguage,
  isCodeNote,
} from '@/features/notes/utils/codeNote';
import {
  countWordsAndChars,
  extractAttachmentIds,
  extractTags,
} from '@/features/notes/utils/markdown';
import {
  attachmentService,
  exportNoteAsMarkdown,
  type AttachmentRecord,
  type NoteRecord,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDriveStore } from '@/stores/useDriveStore';
import { cn } from '@/utils/cn';
import { BacklinksPanel } from './BacklinksPanel';
import type { CodeNoteEditorHandle } from './CodeNoteEditor';
import { CodeToolbar } from './CodeToolbar';
import { DriveConflictDialog } from './DriveConflictDialog';
import { DrivePanelDialog } from './DrivePanelDialog';
import { DuplicateLinkDialog } from './DuplicateLinkDialog';
import { EditorToolbar } from './EditorToolbar';
import { LinkedEventsPanel } from './LinkedEventsPanel';
import { LinkedTasksPanel } from './LinkedTasksPanel';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteTopBar } from './NoteTopBar';

const LazyCodeNoteEditor = lazy(() =>
  import('./CodeNoteEditor').then((m) => ({ default: m.CodeNoteEditor })),
);

const LazyCanvasNoteEditor = lazy(() =>
  import('./CanvasNoteEditor').then((m) => ({ default: m.CanvasNoteEditor })),
);

const LazyExcalidrawModal = lazy(() =>
  import('./ExcalidrawModal').then((m) => ({ default: m.ExcalidrawModal })),
);

const INITIAL_DIAGNOSTICS: CodeDiagnosticsSummary = {
  diagnostics: [],
  errorCount: 0,
  warningCount: 0,
  status: 'ok',
  source: 'local',
};

type EditingDiagramState =
  | {
      readonly mode: 'edit';
      readonly from: number;
      readonly to: number;
      readonly rawJson: string;
    }
  | {
      readonly mode: 'preview';
      readonly blockIndex: number;
      readonly rawJson: string;
    };

export interface NoteEditorWorkspaceProps {
  note: NoteRecord;
  flushSignalRef: React.MutableRefObject<(() => Promise<void>) | null>;
}

const AUTOSAVE_DEBOUNCE_MS = 450;
const CANVAS_AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Orchestrates the active note editor/preview experience, debounced IndexedDB
 * autosave, attachment management, tag strip, and backlinks traversal.
 */
export function NoteEditorWorkspace({
  note,
  flushSignalRef,
}: NoteEditorWorkspaceProps) {
  const {
    notes,
    folders,
    backlinks,
    saveStatus,
    saveError,
    editorMode,
    isFullscreen,
    explorerCollapsed,
    setSaveStatus,
    setEditorMode,
    toggleEditorMode,
    toggleFullscreen,
    toggleExplorer,
    saveNoteContent,
    renameNote,
    updateNoteLanguage,
    moveNote,
    toggleFavorite,
    deleteNote,
    createNote,
    setActiveNoteId,
    setSelectedTag,
    openDailyNote,
    disambiguateLink,
    resolveWikiLinkTargets,
  } = useNotesStore();

  const [draftContent, setDraftContent] = useState(note.content);
  const [noteAttachments, setNoteAttachments] = useState<AttachmentRecord[]>(
    [],
  );
  const [drivePanelOpen, setDrivePanelOpen] = useState(false);
  const [codeDiagnostics, setCodeDiagnostics] = useState<CodeDiagnosticsSummary>(
    INITIAL_DIAGNOSTICS,
  );
  const [editingDiagram, setEditingDiagram] =
    useState<EditingDiagramState | null>(null);
  const [ambiguousLink, setAmbiguousLink] = useState<{
    targetTitle: string;
    candidates: readonly NoteRecord[];
  } | null>(null);

  const authSession = useAuthStore((state) => state.session);
  const driveConnection = useDriveStore((state) => state.connection);
  const pendingConflict = useDriveStore((state) => state.pendingConflict);
  const driveBusy = useDriveStore((state) => state.busyAction);
  const clearDriveConflict = useDriveStore((state) => state.clearConflict);
  const uploadOrUpdateLocalNote = useDriveStore(
    (state) => state.uploadOrUpdateLocalNote,
  );

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const codeEditorRef = useRef<CodeNoteEditorHandle | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const draftRef = useRef<{
    noteId: string;
    content: string;
    dirty: boolean;
  }>({
    noteId: note.id,
    content: note.content,
    dirty: false,
  });

  const flushPendingSave = useCallback(async () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const current = draftRef.current;
    if (!current.dirty) return;

    const noteIdToSave = current.noteId;
    const contentToSave = current.content;
    try {
      await saveNoteContent(noteIdToSave, contentToSave);
      if (
        draftRef.current.noteId === noteIdToSave &&
        draftRef.current.content === contentToSave
      ) {
        draftRef.current.dirty = false;
      }
    } catch {
      // Save status & error already updated in store; retain dirty flag so user does not lose data
    }
  }, [saveNoteContent]);

  flushSignalRef.current = flushPendingSave;

  // Flush previous note when switching notes and reset local draft cleanly
  useEffect(() => {
    if (draftRef.current.noteId !== note.id) {
      if (draftRef.current.dirty) {
        void saveNoteContent(
          draftRef.current.noteId,
          draftRef.current.content,
        );
      }
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      draftRef.current = {
        noteId: note.id,
        content: note.content,
        dirty: false,
      };
      setDraftContent(note.content);
      setSaveStatus('saved', null);
    } else if (!draftRef.current.dirty && note.content !== draftRef.current.content) {
      // Sync external rewrites (e.g., incoming link rewrite on rename)
      draftRef.current.content = note.content;
      setDraftContent(note.content);
    }
  }, [note.id, note.content, saveNoteContent, setSaveStatus]);

  // Flush on page unload and component unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (draftRef.current.dirty) {
        void saveNoteContent(
          draftRef.current.noteId,
          draftRef.current.content,
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      if (draftRef.current.dirty) {
        void saveNoteContent(
          draftRef.current.noteId,
          draftRef.current.content,
        );
      }
    };
  }, [saveNoteContent]);

  // Load owned attachments for unused-attachment cleanup guard
  const refreshAttachments = useCallback(async () => {
    const list = await attachmentService.listAttachmentsForNote(note.id);
    setNoteAttachments(list);
  }, [note.id]);

  useEffect(() => {
    void refreshAttachments();
  }, [refreshAttachments]);

  const canvasMode = isCanvasNote(note);
  const codeMode = !canvasMode && isCodeNote(note);
  const codeLanguage = getNoteLanguage(note);
  const codeLangMeta = useMemo(
    () => getCodeLanguageMeta(codeLanguage),
    [codeLanguage],
  );

  const handleEditorChange = useCallback(
    (nextValue: string) => {
      setDraftContent(nextValue);
      draftRef.current = {
        noteId: note.id,
        content: nextValue,
        dirty: true,
      };
      setSaveStatus('unsaved', null);

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      const delay = canvasMode
        ? CANVAS_AUTOSAVE_DEBOUNCE_MS
        : AUTOSAVE_DEBOUNCE_MS;
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void flushPendingSave();
      }, delay);
    },
    [note.id, canvasMode, setSaveStatus, flushPendingSave],
  );

  const handleAttachFiles = async (files: FileList) => {
    const snippets: string[] = [];
    for (const file of Array.from(files)) {
      const saved = await attachmentService.saveAttachment(file, note.id);
      const isImage = saved.mimeType.startsWith('image/');
      snippets.push(
        isImage
          ? `![${saved.fileName}](nexus-attachment://${saved.id})`
          : `[${saved.fileName}](nexus-attachment://${saved.id})`,
      );
    }
    if (snippets.length > 0) {
      editorRef.current?.insertText(`\n${snippets.join('\n')}\n`);
      await refreshAttachments();
    }
  };

  const handleOpenWikiLink = async (target: string) => {
    await flushPendingSave();
    const resolution = resolveWikiLinkTargets(target);
    if (resolution.exactMatch) {
      await setActiveNoteId(resolution.exactMatch.id);
      return;
    }

    if (resolution.ambiguousMatches.length > 1) {
      setAmbiguousLink({
        targetTitle: target,
        candidates: resolution.ambiguousMatches,
      });
      return;
    }

    // Create a new note from an unresolved [[link]]
    const cleanTitle = target.includes('/')
      ? target.split('/').pop()?.trim() || target
      : target;
    await createNote({
      title: cleanTitle,
      folderId: note.folderId,
      content: `# ${cleanTitle}\n\n`,
    });
  };

  const handleSwitchMode = async (mode: 'edit' | 'preview') => {
    await flushPendingSave();
    setEditorMode(mode);
  };

  const metrics = useMemo(() => countWordsAndChars(draftContent), [draftContent]);
  const lineMetrics = useMemo(
    () => (codeMode ? countLinesAndChars(draftContent) : null),
    [codeMode, draftContent],
  );
  const canvasElementCount = useMemo(
    () => (canvasMode ? getCanvasElementCount(draftContent) : 0),
    [canvasMode, draftContent],
  );
  const noteTags = useMemo(
    () =>
      canvasMode
        ? []
        : codeMode
          ? extractCodeTags(draftContent)
          : extractTags(draftContent),
    [canvasMode, codeMode, draftContent],
  );

  const unusedAttachments = useMemo(() => {
    if (canvasMode || codeMode || noteAttachments.length === 0) return [];
    const activeIds = new Set(extractAttachmentIds(draftContent));
    return noteAttachments.filter((att) => !activeIds.has(att.id));
  }, [canvasMode, codeMode, noteAttachments, draftContent]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <NoteTopBar
        note={note}
        folders={folders}
        saveStatus={saveStatus}
        saveError={saveError}
        editorMode={editorMode}
        isFullscreen={isFullscreen}
        explorerCollapsed={explorerCollapsed}
        onToggleExplorer={toggleExplorer}
        onRenameNote={async (newTitle) => {
          await flushPendingSave();
          await renameNote(note.id, newTitle);
        }}
        onMoveNote={async (folderId) => {
          await flushPendingSave();
          await moveNote(note.id, folderId);
        }}
        onToggleFavorite={async () => {
          await toggleFavorite(note.id);
        }}
        onSetEditorMode={(mode) => void handleSwitchMode(mode)}
        onToggleFullscreen={toggleFullscreen}
        onExportMarkdown={() => {
          exportNoteAsMarkdown({ ...note, content: draftContent });
        }}
        onOpenDrivePanel={() => setDrivePanelOpen(true)}
        driveConnected={driveConnection.status === 'connected'}
        onDeleteNote={async () => {
          if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current);
          }
          draftRef.current.dirty = false;
          await deleteNote(note.id);
        }}
        onOpenDailyDate={async (dateStr) => {
          await flushPendingSave();
          await openDailyNote(dateStr);
        }}
      />

      {canvasMode ? null : codeMode ? (
        <CodeToolbar
          language={codeLanguage}
          code={draftContent}
          diagnostics={codeDiagnostics}
          onChangeLanguage={(nextLang) => {
            void flushPendingSave().then(() =>
              updateNoteLanguage(note.id, nextLang),
            );
          }}
          onJumpToLocation={(line, column) =>
            codeEditorRef.current?.jumpToLocation(line, column)
          }
        />
      ) : editorMode === 'edit' ? (
        <EditorToolbar
          onFormat={(action) => editorRef.current?.applyFormat(action)}
          onAttachFiles={(files) => void handleAttachFiles(files)}
        />
      ) : null}

      {/* Main Editor / Preview / Canvas Surface */}
      {canvasMode ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background [.dark_&]:bg-[#141414]">
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                Loading canvas editor…
              </div>
            }
          >
            <LazyCanvasNoteEditor
              noteId={note.id}
              value={draftContent}
              onChange={handleEditorChange}
            />
          </Suspense>
        </div>
      ) : (
        <div
          className={cn(
            'flex-1 overflow-y-auto',
            codeMode && '[.dark_&]:bg-[#141414]',
          )}
        >
          <div
            className={cn(
              'flex min-h-full w-full flex-col',
              codeMode
                ? 'px-2 py-2 md:px-4'
                : 'max-w-4xl px-6 py-4 md:pl-12 md:pr-16',
            )}
          >
            {noteTags.length > 0 ? (
              <div
                aria-label="Note tags"
                className={cn(
                  'mb-2 flex flex-wrap items-center gap-1.5',
                  codeMode && 'px-2 pt-1',
                )}
              >
                {noteTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className="inline-flex items-center gap-0.5 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <Hash className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {codeMode ? (
              <Suspense
                fallback={
                  <div className="flex h-[460px] items-center justify-center text-xs text-muted-foreground">
                    Loading code editor…
                  </div>
                }
              >
                <LazyCodeNoteEditor
                  ref={codeEditorRef}
                  noteId={note.id}
                  value={draftContent}
                  language={codeLanguage}
                  onChange={handleEditorChange}
                  onDiagnosticsChange={setCodeDiagnostics}
                />
              </Suspense>
            ) : editorMode === 'edit' ? (
              <MarkdownEditor
                ref={editorRef}
                noteId={note.id}
                value={draftContent}
                notes={notes}
                folders={folders}
                onChange={handleEditorChange}
                onTogglePreview={() => {
                  void flushPendingSave();
                  toggleEditorMode();
                }}
                onEditDiagram={(request) =>
                  setEditingDiagram({ mode: 'edit', ...request })
                }
              />
            ) : (
              <MarkdownPreview
                content={draftContent}
                resolveWikiLink={resolveWikiLinkTargets}
                onOpenWikiLink={(target) => void handleOpenWikiLink(target)}
                onClickTag={(tag) => setSelectedTag(tag)}
                onEditDiagramBlock={(blockIndex, rawJson) =>
                  setEditingDiagram({ mode: 'preview', blockIndex, rawJson })
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Careful unused attachments notice */}
      {unusedAttachments.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground md:px-10">
          <span>
            {unusedAttachments.length} unreferenced local attachment(s)
          </span>
          <button
            type="button"
            onClick={() => {
              const referenced = extractAttachmentIds(draftContent);
              void attachmentService
                .deleteUnusedAttachmentsForNote(note.id, referenced)
                .then(() => refreshAttachments());
            }}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            <span>Remove unused</span>
          </button>
        </div>
      ) : null}

      <LinkedTasksPanel noteId={note.id} />

      <LinkedEventsPanel noteId={note.id} />

      <BacklinksPanel
        backlinks={backlinks}
        folders={folders}
        onOpenNote={(targetId) => {
          void flushPendingSave().then(() => setActiveNoteId(targetId));
        }}
      />

      {/* Footer Metrics */}
      <footer className="flex items-center justify-between border-t border-border bg-background px-6 py-1.5 text-[11px] text-muted-foreground md:px-10">
        <div className="flex items-center gap-4">
          {canvasMode ? (
            <>
              <span>
                {canvasElementCount}{' '}
                {canvasElementCount === 1 ? 'element' : 'elements'}
              </span>
              <span className="font-mono text-muted-foreground/80">Canvas</span>
            </>
          ) : codeMode && lineMetrics ? (
            <>
              <span>{lineMetrics.lines} lines</span>
              <span>{lineMetrics.chars} chars</span>
              <span className="font-mono text-muted-foreground/80">
                {codeLangMeta.label}
              </span>
            </>
          ) : (
            <>
              <span>{metrics.words} words</span>
              <span>{metrics.chars} chars</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono">
          <span>rev {note.revision}</span>
          <span>
            {new Date(note.updatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </footer>

      {editingDiagram ? (
        <Suspense fallback={null}>
          <LazyExcalidrawModal
            open
            initialRawJson={editingDiagram.rawJson}
            onSave={(nextRawJson) => {
              if (editingDiagram.mode === 'edit') {
                const replacement = `\`\`\`excalidraw\n${nextRawJson}\n\`\`\``;
                editorRef.current?.replaceRange(
                  editingDiagram.from,
                  editingDiagram.to,
                  replacement,
                );
              } else {
                const nextDoc = replaceExcalidrawBlockAt(
                  draftContent,
                  editingDiagram.blockIndex,
                  nextRawJson,
                );
                handleEditorChange(nextDoc);
              }
              window.setTimeout(() => void flushPendingSave(), 20);
            }}
            onClose={() => setEditingDiagram(null)}
          />
        </Suspense>
      ) : null}

      <DuplicateLinkDialog
        open={Boolean(ambiguousLink)}
        targetTitle={ambiguousLink?.targetTitle ?? ''}
        candidates={ambiguousLink?.candidates ?? []}
        folders={folders}
        onSelect={(targetNote, qualifyLink) => {
          const oldTarget = ambiguousLink?.targetTitle ?? '';
          setAmbiguousLink(null);
          void (async () => {
            if (qualifyLink && oldTarget) {
              await disambiguateLink(note.id, oldTarget, targetNote.id);
            }
            await setActiveNoteId(targetNote.id);
          })();
        }}
        onClose={() => setAmbiguousLink(null)}
      />

      <DrivePanelDialog
        open={drivePanelOpen}
        activeNote={note}
        onBeforeExport={flushPendingSave}
        onClose={() => setDrivePanelOpen(false)}
      />

      <DriveConflictDialog
        conflictState={pendingConflict}
        busy={Boolean(driveBusy)}
        onCancel={clearDriveConflict}
        onSaveRemoteCopy={async () => {
          if (!pendingConflict?.conflict.remoteContent) return;
          const titleBase =
            pendingConflict.conflict.fileName.replace(/\.(md|markdown)$/i, '') ||
            pendingConflict.localNote.title;
          const remoteContent = pendingConflict.conflict.remoteContent;
          clearDriveConflict();
          await createNote({
            title: `${titleBase} (Drive Copy)`,
            folderId: pendingConflict.localNote.folderId,
            content: remoteContent,
          });
        }}
        onOverwriteDrive={async () => {
          if (!pendingConflict || !authSession?.user.id) return;
          await uploadOrUpdateLocalNote(
            pendingConflict.localNote,
            authSession.user.id,
            true,
          );
        }}
      />
    </div>
  );
}
