import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Eye,
  FolderInput,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EditorMode, SaveStatus } from '@/features/notes/stores/useNotesStore';
import { isCanvasNote } from '@/features/notes/utils/canvasNote';
import { isCodeNote } from '@/features/notes/utils/codeNote';
import { shiftDailyDate } from '@/features/notes/utils/markdown';
import { buildFolderPathMap, type FolderRecord, type NoteRecord } from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { cn } from '@/utils/cn';

export interface NoteTopBarProps {
  note: NoteRecord;
  folders: readonly FolderRecord[];
  saveStatus: SaveStatus;
  saveError: string | null;
  editorMode: EditorMode;
  isFullscreen: boolean;
  explorerCollapsed: boolean;
  onToggleExplorer: () => void;
  onRenameNote: (newTitle: string) => Promise<void>;
  onMoveNote: (folderId: string | null) => Promise<void>;
  onToggleFavorite: () => Promise<void>;
  onSetEditorMode: (mode: EditorMode) => void;
  onToggleFullscreen: () => void;
  onExportMarkdown: () => void;
  onOpenDrivePanel: () => void;
  driveConnected?: boolean;
  onDeleteNote: () => Promise<void>;
  onOpenDailyDate: (dateStr: string) => Promise<void>;
}

/**
 * Top workspace bar for the active note: explorer toggle, inline title rename,
 * folder move selector, daily note prev/next navigation, save indicator, mode
 * switch, favorite, export, fullscreen, and delete.
 */
export function NoteTopBar({
  note,
  folders,
  saveStatus,
  saveError,
  editorMode,
  isFullscreen,
  explorerCollapsed,
  onToggleExplorer,
  onRenameNote,
  onMoveNote,
  onToggleFavorite,
  onSetEditorMode,
  onToggleFullscreen,
  onExportMarkdown,
  onOpenDrivePanel,
  driveConnected = false,
  onDeleteNote,
  onOpenDailyDate,
}: NoteTopBarProps) {
  const [titleDraft, setTitleDraft] = useState(note.title);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [cloudPopoverOpen, setCloudPopoverOpen] = useState(false);
  const cloudPopoverRef = useRef<HTMLDivElement | null>(null);

  const authStatus = useAuthStore((state) => state.status);
  const exitLocalMode = useAuthStore((state) => state.exitLocalMode);
  const syncStatus = useSyncStore((state) => state.status);
  const syncNow = useSyncStore((state) => state.syncNow);
  const retryFailed = useSyncStore((state) => state.retryFailed);

  useEffect(() => {
    setTitleDraft(note.title);
  }, [note.id, note.title]);

  useEffect(() => {
    if (!cloudPopoverOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        cloudPopoverRef.current &&
        !cloudPopoverRef.current.contains(event.target as Node)
      ) {
        setCloudPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [cloudPopoverOpen]);

  const folderPathMap = buildFolderPathMap(folders);
  const sortedFolders = [...folders].sort((a, b) =>
    (folderPathMap.get(a.id) ?? a.name).localeCompare(
      folderPathMap.get(b.id) ?? b.name,
      undefined,
      { sensitivity: 'base' },
    ),
  );

  const commitTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(note.title);
      return;
    }
    if (trimmed !== note.title) {
      await onRenameNote(trimmed);
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setTitleDraft(note.title);
      event.currentTarget.blur();
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-2.5">
        {/* Left: Explorer toggle + Title + Folder Selector */}
        <div className="flex min-w-[200px] flex-1 items-center gap-2 overflow-hidden">
          {!isFullscreen ? (
            <button
              type="button"
              onClick={onToggleExplorer}
              title={explorerCollapsed ? 'Show explorer' : 'Hide explorer'}
              aria-label={
                explorerCollapsed ? 'Show notes explorer' : 'Hide notes explorer'
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {explorerCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          ) : null}

          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={handleTitleKeyDown}
            aria-label="Note title"
            className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-0.5 font-serif text-base font-medium tracking-[-0.02em] text-foreground transition-colors duration-150 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none"
          />

          {/* Move folder selector */}
          <label className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <FolderInput className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <select
              aria-label="Move note to folder"
              value={note.folderId ?? ''}
              onChange={(e) => void onMoveNote(e.target.value || null)}
              className="max-w-[110px] truncate rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="">Root</option>
              {sortedFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folderPathMap.get(folder.id) ?? folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Right: Daily nav + Save status + Mode + Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {note.isDaily && note.dailyDate ? (
            <div className="mr-1 flex items-center rounded-md border border-border bg-card">
              <button
                type="button"
                onClick={() =>
                  void onOpenDailyDate(shiftDailyDate(note.dailyDate!, -1))
                }
                title="Previous daily note"
                aria-label="Previous daily note"
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="border-x border-border px-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                {note.dailyDate}
              </span>
              <button
                type="button"
                onClick={() =>
                  void onOpenDailyDate(shiftDailyDate(note.dailyDate!, 1))
                }
                title="Next daily note"
                aria-label="Next daily note"
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {/* Save status */}
          <span
            role="status"
            aria-live="polite"
            title={saveError ?? undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium select-none',
              saveStatus === 'error'
                ? 'text-destructive'
                : saveStatus === 'unsaved'
                  ? 'text-amber-500'
                  : 'text-muted-foreground',
            )}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>Saving…</span>
              </>
            ) : saveStatus === 'unsaved' ? (
              <span>Unsaved changes</span>
            ) : saveStatus === 'error' ? (
              <>
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>Save error</span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3" aria-hidden="true" />
                <span>Saved</span>
              </>
            )}
          </span>

          {/* Edit / Preview switcher (Markdown notes only) */}
          {!isCodeNote(note) && !isCanvasNote(note) ? (
            <div
              role="group"
              aria-label="Editor mode"
              className="inline-flex rounded-md border border-border bg-card p-0.5"
            >
              <button
                type="button"
                onClick={() => onSetEditorMode('edit')}
                aria-pressed={editorMode === 'edit'}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                  editorMode === 'edit'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => onSetEditorMode('preview')}
                aria-pressed={editorMode === 'preview'}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                  editorMode === 'preview'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>Preview</span>
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void onToggleFavorite()}
            title={
              note.isFavorite ? 'Remove from favorites' : 'Add to favorites'
            }
            aria-label={
              note.isFavorite ? 'Remove from favorites' : 'Add to favorites'
            }
            aria-pressed={note.isFavorite}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                note.isFavorite && 'fill-current text-amber-500',
              )}
              aria-hidden="true"
            />
          </button>

          {(() => {
            const isSignedIn = authStatus === 'authenticated';
            const isOffline =
              !syncStatus.isOnline || syncStatus.state === 'offline';
            const isSyncing = syncStatus.state === 'syncing';
            const hasSyncError =
              isSignedIn &&
              (syncStatus.state === 'error' ||
                syncStatus.failedCount > 0 ||
                Boolean(syncStatus.lastError));
            const pendingCount =
              syncStatus.pendingCount + syncStatus.failedCount;

            let cloudTitle =
              'Saved locally only — sign in with Google to sync across devices';
            let statusHeadline = 'Saved locally only';
            let statusDetail =
              'Notes are stored locally in IndexedDB. Sign in with your Google account to sync Notes, Recent, Starred, and folders across devices.';
            let dotClass = 'bg-muted-foreground/60';

            if (!isSignedIn) {
              // Keep local-only defaults above
            } else if (isOffline) {
              cloudTitle = 'Offline — changes saved locally';
              statusHeadline = 'Offline';
              statusDetail =
                'Changes are queued locally and will sync automatically when you reconnect.';
              dotClass = 'bg-amber-500';
            } else if (isSyncing) {
              cloudTitle = 'Syncing notes with cloud…';
              statusHeadline = 'Syncing with cloud…';
              statusDetail = 'Synchronizing your notes across devices.';
              dotClass = 'bg-foreground';
            } else if (hasSyncError) {
              cloudTitle = `Cloud sync error: ${syncStatus.lastError ?? 'Failed to sync'}`;
              statusHeadline = 'Cloud sync error';
              statusDetail =
                syncStatus.lastError ??
                'Unable to reach cloud sync. Retry or inspect permissions.';
              dotClass = 'bg-destructive';
            } else if (pendingCount > 0) {
              cloudTitle = `${pendingCount} change(s) pending cloud sync`;
              statusHeadline = `${pendingCount} change(s) pending`;
              statusDetail =
                'Background cloud sync runs automatically shortly after edits.';
              dotClass = 'bg-amber-500';
            } else {
              cloudTitle = 'Synced with cloud across devices';
              statusHeadline = 'Synced with cloud';
              statusDetail =
                'Your notes, Recent, Starred, and folders stay up to date automatically across devices.';
              dotClass = 'bg-focus-accent';
            }

            return (
              <div ref={cloudPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCloudPopoverOpen((prev) => !prev)}
                  title={cloudTitle}
                  aria-label={cloudTitle}
                  aria-expanded={cloudPopoverOpen}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground cursor-pointer',
                    cloudPopoverOpen && 'bg-accent text-foreground',
                  )}
                >
                  {isSyncing ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin text-foreground"
                      aria-hidden="true"
                    />
                  ) : hasSyncError ? (
                    <AlertCircle
                      className="h-3.5 w-3.5 text-destructive"
                      aria-hidden="true"
                    />
                  ) : !isSignedIn ? (
                    <CloudOff
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : isOffline || pendingCount > 0 ? (
                    <Cloud
                      className="h-3.5 w-3.5 text-amber-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <Cloud
                      className="h-3.5 w-3.5 text-focus-accent"
                      aria-hidden="true"
                    />
                  )}
                </button>

                {cloudPopoverOpen ? (
                  <div
                    role="region"
                    aria-label="Cloud sync status"
                    className="absolute right-0 top-8 z-50 w-72 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            dotClass,
                          )}
                          aria-hidden="true"
                        />
                        <span>{statusHeadline}</span>
                      </span>
                      {syncStatus.lastSyncedAt ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(syncStatus.lastSyncedAt).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {statusDetail}
                    </p>

                    {hasSyncError && syncStatus.lastError ? (
                      <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                        {syncStatus.lastError}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {isSignedIn ? (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={isSyncing || isOffline}
                          onClick={() => {
                            void (hasSyncError
                              ? retryFailed()
                              : syncNow('manual'));
                          }}
                          className="h-7 flex-1 text-xs"
                        >
                          <RefreshCw
                            className={cn(
                              'h-3 w-3',
                              isSyncing && 'animate-spin',
                            )}
                            aria-hidden="true"
                          />
                          <span>
                            {isSyncing
                              ? 'Syncing…'
                              : hasSyncError
                                ? 'Retry sync'
                                : 'Sync now'}
                          </span>
                        </Button>
                      ) : (
                        <Link
                          to="/login"
                          onClick={() => {
                            setCloudPopoverOpen(false);
                            exitLocalMode();
                          }}
                          className="inline-flex h-7 flex-1 items-center justify-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          Sign in to sync
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setCloudPopoverOpen(false);
                          onOpenDrivePanel();
                        }}
                        className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                      >
                        {driveConnected
                          ? 'Drive backup (On)'
                          : 'Google Drive backup…'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}

          <button
            type="button"
            onClick={onExportMarkdown}
            title={
              isCanvasNote(note)
                ? 'Export canvas (.canvas)'
                : isCodeNote(note)
                  ? 'Download code file'
                  : 'Export note as Markdown (.md)'
            }
            aria-label={
              isCanvasNote(note)
                ? 'Export canvas'
                : isCodeNote(note)
                  ? 'Download code file'
                  : 'Export note as Markdown'
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen writing mode'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            title="Delete note"
            aria-label="Delete note"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="p-5">
          <DialogTitle className="text-sm font-semibold text-foreground">
            Delete note &ldquo;{note.title}&rdquo;?
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            This permanently deletes the note and its local attachments from
            IndexedDB. Incoming wiki-links in other notes will remain as
            unresolved links.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setConfirmDeleteOpen(false);
                void onDeleteNote();
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Delete note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
