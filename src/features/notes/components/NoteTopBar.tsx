import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  Eye,
  FolderInput,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EditorMode, SaveStatus } from '@/features/notes/stores/useNotesStore';
import { shiftDailyDate } from '@/features/notes/utils/markdown';
import { buildFolderPathMap, type FolderRecord, type NoteRecord } from '@/services';
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

  useEffect(() => {
    setTitleDraft(note.title);
  }, [note.id, note.title]);

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
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
            className="min-w-[140px] flex-1 rounded-lg bg-transparent px-1.5 py-0.5 font-serif text-base font-medium tracking-[-0.02em] text-foreground transition-colors duration-150 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none"
          />

          {/* Move folder selector */}
          <label className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <FolderInput className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <select
              aria-label="Move note to folder"
              value={note.folderId ?? ''}
              onChange={(e) => void onMoveNote(e.target.value || null)}
              className="max-w-[140px] truncate rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
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
        <div className="flex flex-wrap items-center gap-1.5">
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

          {/* Edit / Preview switcher */}
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

          <button
            type="button"
            onClick={onOpenDrivePanel}
            title="Google Drive (Nexus/Notes)"
            aria-label="Google Drive options"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground cursor-pointer',
              driveConnected ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onExportMarkdown}
            title="Export note as Markdown (.md)"
            aria-label="Export note as Markdown"
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
