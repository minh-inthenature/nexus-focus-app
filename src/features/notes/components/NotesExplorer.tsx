import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  Archive,
  CalendarPlus,
  Clock,
  FileCode2,
  FileText,
  FolderOpen,
  FolderPlus,
  Hash,
  Search,
  Shapes,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { isCanvasNote } from '@/features/notes/utils/canvasNote';
import {
  getCodeLanguageMeta,
  getNoteLanguage,
  isCodeNote,
} from '@/features/notes/utils/codeNote';
import { searchNotes } from '@/features/notes/utils/search';
import {
  buildFolderPathMap,
  exportVaultAsZip,
  type CreateNoteInput,
  type FolderRecord,
} from '@/services';
import { cn } from '@/utils/cn';
import { DeleteFolderDialog } from './DeleteFolderDialog';
import { FolderTree } from './FolderTree';
import { NewNoteMenu } from './NewNoteMenu';

type ExplorerTab = 'files' | 'tags' | 'recent' | 'favorites';

export interface NotesExplorerProps {
  onBeforeSelectNote: () => Promise<void>;
  onCloseMobile?: () => void;
  className?: string;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + trimmed.length);
  const after = text.slice(idx + trimmed.length);

  return (
    <>
      {before}
      <mark className="rounded-xs bg-accent px-0.5 text-foreground underline decoration-ring">
        {match}
      </mark>
      {after}
    </>
  );
}

/**
 * Integrated collapsible explorer pane for the Notes workspace: file tree,
 * offline full-text search, tag explorer, recent notes, favorites, daily notes,
 * and Markdown import/export.
 */
export function NotesExplorer({
  onBeforeSelectNote,
  onCloseMobile,
  className,
}: NotesExplorerProps) {
  const {
    notes,
    folders,
    tags,
    noteTagsMap,
    activeNoteId,
    expandedFolderIds,
    searchQuery,
    selectedTag,
    selectedFolderFilterId,
    setActiveNoteId,
    toggleFolderExpanded,
    setSearchQuery,
    setSelectedTag,
    setSelectedFolderFilterId,
    createNote,
    createFolder,
    renameFolder,
    renameNote,
    moveNote,
    toggleFavorite,
    deleteFolder,
    openDailyNote,
    importFiles,
  } = useNotesStore();

  const [activeTab, setActiveTab] = useState<ExplorerTab>('files');
  const [creatingRootFolder, setCreatingRootFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<FolderRecord | null>(
    null,
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const folderPathMap = useMemo(() => buildFolderPathMap(folders), [folders]);

  const isFiltering =
    searchQuery.trim().length > 0 ||
    selectedTag !== null ||
    selectedFolderFilterId !== null;

  const searchResults = useMemo(() => {
    if (!isFiltering) return [];
    return searchNotes({
      notes,
      folders,
      noteTagsMap,
      query: searchQuery,
      tagFilter: selectedTag,
      folderFilterId: selectedFolderFilterId,
    });
  }, [
    isFiltering,
    notes,
    folders,
    noteTagsMap,
    searchQuery,
    selectedTag,
    selectedFolderFilterId,
  ]);

  const recentNotes = useMemo(
    () =>
      [...notes]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 25),
    [notes],
  );

  const favoriteNotes = useMemo(
    () =>
      notes
        .filter((n) => n.isFavorite)
        .sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
        ),
    [notes],
  );

  const handleSelectNote = async (noteId: string) => {
    await onBeforeSelectNote();
    await setActiveNoteId(noteId);
    onCloseMobile?.();
  };

  const handleCreateNote = async (
    inputOrFolderId: CreateNoteInput | string | null = null,
  ) => {
    await onBeforeSelectNote();
    if (typeof inputOrFolderId === 'string' || inputOrFolderId === null) {
      await createNote({ folderId: inputOrFolderId });
      onCloseMobile?.();
      return;
    }
    await createNote(inputOrFolderId);
    onCloseMobile?.();
  };

  const handleOpenToday = async () => {
    await onBeforeSelectNote();
    await openDailyNote();
    onCloseMobile?.();
  };

  const commitRootFolder = async () => {
    const trimmed = newFolderName.trim();
    setCreatingRootFolder(false);
    setNewFolderName('');
    if (trimmed) {
      await createFolder(trimmed, null);
      setActiveTab('files');
    }
  };

  const handleRootFolderKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRootFolder();
    } else if (event.key === 'Escape') {
      setCreatingRootFolder(false);
      setNewFolderName('');
    }
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await onBeforeSelectNote();
    const result = await importFiles(files);
    event.target.value = '';
    setImportStatus(
      `Imported ${result.importedNotes.length} note(s)${
        result.importedAttachmentCount > 0
          ? ` and ${result.importedAttachmentCount} attachment(s)`
          : ''
      }.`,
    );
    window.setTimeout(() => setImportStatus(null), 4000);
  };

  return (
    <aside
      aria-label="Notes explorer"
      className={cn(
        'flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar/40 select-none',
        className,
      )}
    >
      {/* Top Action Strip */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-serif text-[15px] font-medium tracking-[-0.02em] text-foreground">
          Vault
        </span>
        <div className="flex items-center gap-0.5">
          <NewNoteMenu
            onCreateNote={(input) => handleCreateNote(input)}
            align="left"
          />
          <button
            type="button"
            onClick={() => {
              setActiveTab('files');
              setCreatingRootFolder(true);
            }}
            title="New folder"
            aria-label="New folder"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleOpenToday()}
            title="Open today's daily note"
            aria-label="Today's daily note"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Markdown, code, or canvas files"
            aria-label="Import Markdown, code, or canvas files"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            title="Import folder"
            aria-label="Import folder"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void exportVaultAsZip()}
            title="Export all notes as ZIP"
            aria-label="Export vault as ZIP"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              title="Close vault sidebar"
              aria-label="Close vault sidebar"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer md:hidden"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.canvas,.draw,.excalidraw,.cpp,.cc,.c,.h,.hpp,.py,.ts,.tsx,.js,.jsx,image/*"
          onChange={(e) => void handleImportChange(e)}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is a non-standard attribute supported by Chromium/Firefox/Safari
          webkitdirectory=""
          multiple
          onChange={(e) => void handleImportChange(e)}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Offline Search + Filters */}
      <div className="space-y-2 border-b border-border p-2.5">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/70 px-2 py-1">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, #tags…"
            aria-label="Search notes"
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {folders.length > 0 ? (
          <select
            aria-label="Filter by folder"
            value={selectedFolderFilterId ?? ''}
            onChange={(e) =>
              setSelectedFolderFilterId(e.target.value || null)
            }
            className="w-full rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderPathMap.get(f.id) ?? f.name}
              </option>
            ))}
          </select>
        ) : null}

        {selectedTag ? (
          <div className="flex items-center justify-between rounded bg-accent px-2 py-1 text-[11px] text-foreground">
            <span className="truncate font-mono">#{selectedTag}</span>
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              aria-label="Clear tag filter"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {importStatus ? (
          <p className="text-[11px] text-muted-foreground">{importStatus}</p>
        ) : null}
      </div>

      {/* Mode Tabs when not actively searching */}
      {!isFiltering ? (
        <div
          role="tablist"
          aria-label="Explorer views"
          className="grid grid-cols-4 border-b border-border text-[11px]"
        >
          {(
            [
              { id: 'files', label: 'Files' },
              { id: 'tags', label: 'Tags' },
              { id: 'recent', label: 'Recent' },
              { id: 'favorites', label: 'Starred' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'py-1.5 font-medium transition-colors cursor-pointer',
                activeTab === tab.id
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2">
        {isFiltering ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>{searchResults.length} result(s)</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag(null);
                  setSelectedFolderFilterId(null);
                }}
                className="hover:text-foreground cursor-pointer"
              >
                Clear
              </button>
            </div>

            {searchResults.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No matching notes found.
              </p>
            ) : (
              searchResults.map((result) => {
                const isCanvas = isCanvasNote(result.note);
                const codeMeta = isCodeNote(result.note)
                  ? getCodeLanguageMeta(getNoteLanguage(result.note))
                  : null;
                return (
                  <button
                    key={result.note.id}
                    type="button"
                    onClick={() => void handleSelectNote(result.note.id)}
                    className={cn(
                      'w-full rounded-md border border-transparent px-2.5 py-2 text-left transition-colors cursor-pointer',
                      result.note.id === activeNoteId
                        ? 'border-border bg-accent text-accent-foreground'
                        : 'hover:bg-accent/60',
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      {isCanvas ? (
                        <Shapes
                          className="h-3.5 w-3.5 shrink-0 text-primary/85"
                          aria-hidden="true"
                        />
                      ) : codeMeta ? (
                        <FileCode2
                          className="h-3.5 w-3.5 shrink-0 text-primary/85"
                          aria-hidden="true"
                        />
                      ) : (
                        <FileText
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <HighlightMatch
                          text={result.note.title}
                          query={searchQuery}
                        />
                      </span>
                      {isCanvas ? (
                        <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                          CANVAS
                        </span>
                      ) : codeMeta ? (
                        <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                          {codeMeta.badge}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      <HighlightMatch
                        text={isCanvas ? 'Excalidraw visual canvas' : result.snippet}
                        query={searchQuery}
                      />
                    </p>
                  </button>
                );
              })
            )}
          </div>
        ) : activeTab === 'files' ? (
          <div className="space-y-1">
            {creatingRootFolder ? (
              <div className="px-1 pb-1">
                <input
                  type="text"
                  value={newFolderName}
                  placeholder="New folder name…"
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleRootFolderKeyDown}
                  onBlur={() => void commitRootFolder()}
                  autoFocus
                  aria-label="New folder name"
                  className="h-7 w-full rounded border border-ring bg-background px-2 text-xs text-foreground focus:outline-none"
                />
              </div>
            ) : null}

            <FolderTree
              folders={folders}
              notes={notes}
              activeNoteId={activeNoteId}
              expandedFolderIds={expandedFolderIds}
              onToggleFolder={toggleFolderExpanded}
              onSelectNote={(id) => void handleSelectNote(id)}
              onCreateNote={(folderId) => void handleCreateNote(folderId)}
              onCreateSubfolder={async (parentId, name) => {
                await createFolder(name, parentId);
              }}
              onRenameFolder={async (folderId, name) => {
                await renameFolder(folderId, name);
              }}
              onRenameNote={async (noteId, title) => {
                await renameNote(noteId, title);
              }}
              onToggleFavorite={async (noteId) => {
                await toggleFavorite(noteId);
              }}
              onMoveNote={async (noteId, folderId) => {
                await moveNote(noteId, folderId);
              }}
              onRequestDeleteFolder={setFolderToDelete}
            />
          </div>
        ) : activeTab === 'tags' ? (
          <div className="space-y-1">
            {tags.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No #tags found yet. Add #tags in any note to organize topics.
              </p>
            ) : (
              tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTag(tag.name)}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-mono text-foreground">
                    <Hash
                      className="h-3 w-3 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>{tag.name}</span>
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {tag.count}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : activeTab === 'recent' ? (
          <div className="space-y-0.5">
            {recentNotes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No recently modified notes yet.
              </p>
            ) : (
              recentNotes.map((note) => {
                const isCanvas = isCanvasNote(note);
                const codeMeta = isCodeNote(note)
                  ? getCodeLanguageMeta(getNoteLanguage(note))
                  : null;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => void handleSelectNote(note.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                      note.id === activeNoteId
                        ? 'bg-accent text-accent-foreground'
                        : 'text-sidebar-foreground/85 hover:bg-accent/60',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {isCanvas ? (
                        <Shapes
                          className="h-3 w-3 shrink-0 text-primary/85"
                          aria-hidden="true"
                        />
                      ) : codeMeta ? (
                        <FileCode2
                          className="h-3 w-3 shrink-0 text-primary/85"
                          aria-hidden="true"
                        />
                      ) : (
                        <Clock
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{note.title}</span>
                      {isCanvas ? (
                        <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                          CANVAS
                        </span>
                      ) : codeMeta ? (
                        <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                          {codeMeta.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {note.updatedAt.slice(5, 10)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {favoriteNotes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No favorite notes yet.
              </p>
            ) : (
              favoriteNotes.map((note) => {
                const isCanvas = isCanvasNote(note);
                const codeMeta = isCodeNote(note)
                  ? getCodeLanguageMeta(getNoteLanguage(note))
                  : null;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => void handleSelectNote(note.id)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                      note.id === activeNoteId
                        ? 'bg-accent text-accent-foreground'
                        : 'text-sidebar-foreground/85 hover:bg-accent/60',
                    )}
                  >
                    <Star
                      className="h-3 w-3 shrink-0 fill-current text-amber-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{note.title}</span>
                    {isCanvas ? (
                      <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                        CANVAS
                      </span>
                    ) : codeMeta ? (
                      <span className="shrink-0 rounded border border-border/80 bg-background/70 px-1 font-mono text-[9px] text-muted-foreground">
                        {codeMeta.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <DeleteFolderDialog
        folder={folderToDelete}
        onConfirm={async (folderId, mode) => {
          await onBeforeSelectNote();
          await deleteFolder(folderId, mode);
        }}
        onClose={() => setFolderToDelete(null)}
      />
    </aside>
  );
}
