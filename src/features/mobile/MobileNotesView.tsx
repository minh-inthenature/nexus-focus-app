import { useEffect, useMemo } from 'react';
import { AlignLeft, FileText, Search, Star, X } from 'lucide-react';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { isTextNote } from '@/features/notes/utils/textNote';
import type { NoteRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface MobileNotesViewProps {
  onOpenNote: (noteId: string) => void;
}

function formatUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getPreviewSnippet(note: NoteRecord): string {
  const firstNonEmpty = note.content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return firstNonEmpty || 'Empty note';
}

/**
 * Flat, minimalist mobile Notes browser with Favorites pinned on top,
 * instant search, and compact horizontal folder filter pills.
 */
export function MobileNotesView({ onOpenNote }: MobileNotesViewProps) {
  const notes = useNotesStore((s) => s.notes);
  const folders = useNotesStore((s) => s.folders);
  const initialized = useNotesStore((s) => s.initialized);
  const initialize = useNotesStore((s) => s.initialize);
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery);
  const selectedFolderFilterId = useNotesStore((s) => s.selectedFolderFilterId);
  const setSelectedFolderFilterId = useNotesStore(
    (s) => s.setSelectedFolderFilterId,
  );
  const toggleFavorite = useNotesStore((s) => s.toggleFavorite);
  const setActiveNoteId = useNotesStore((s) => s.setActiveNoteId);

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialized, initialize]);

  const folderNameMap = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders],
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes
      .filter((note) => {
        if (
          selectedFolderFilterId !== null &&
          note.folderId !== selectedFolderFilterId
        ) {
          return false;
        }
        if (q) {
          const titleHit = note.title.toLowerCase().includes(q);
          const contentHit = note.content.toLowerCase().includes(q);
          if (!titleHit && !contentHit) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, selectedFolderFilterId, searchQuery]);

  const favorites = useMemo(
    () => filteredNotes.filter((n) => n.isFavorite),
    [filteredNotes],
  );
  const recent = useMemo(
    () => filteredNotes.filter((n) => !n.isFavorite),
    [filteredNotes],
  );

  const handleOpen = (noteId: string) => {
    void setActiveNoteId(noteId);
    onOpenNote(noteId);
  };

  const renderNoteRow = (note: NoteRecord) => {
    const folderLabel = note.folderId ? folderNameMap.get(note.folderId) : null;
    const isText = isTextNote(note);
    return (
      <div
        key={note.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpen(note.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen(note.id);
          }
        }}
        className="flex items-start gap-2.5 rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-3 active:bg-[#18221E] transition-colors cursor-pointer"
      >
        {isText ? (
          <AlignLeft className="h-4 w-4 mt-0.5 shrink-0 text-[#8AB8A3]" />
        ) : (
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-[#6E7D76]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="text-sm font-medium text-[#E4E8E6] truncate">
                {note.title || 'Untitled note'}
              </p>
              {isText && (
                <span className="shrink-0 rounded border border-[#1E2623] bg-[#161D1A] px-1 py-0.5 font-mono text-[9px] text-[#7E8B85]">
                  TXT
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#7E8B85] shrink-0">
              {formatUpdatedLabel(note.updatedAt)}
            </span>
          </div>
          <p className="text-xs text-[#7E8B85] truncate mt-0.5">
            {getPreviewSnippet(note)}
          </p>
          {folderLabel && (
            <span className="inline-block mt-1.5 rounded px-1.5 py-0.5 text-[10px] bg-[#18221E] text-[#8AB8A3] border border-[#1E2623]">
              {folderLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleFavorite(note.id);
          }}
          aria-label={note.isFavorite ? `Unstar ${note.title}` : `Star ${note.title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6E7D76] active:bg-[#1E2623]"
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              note.isFavorite && 'fill-[#e5a93c] text-[#e5a93c]',
            )}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Search Bar */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#6E7D76]" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          className="h-10 w-full rounded-xl border border-[#1E2623] bg-[#111614] pl-9 pr-9 text-sm text-[#E4E8E6] placeholder:text-[#6E7D76] outline-none focus:border-[#8AB8A3]/60"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear note search"
            className="absolute right-2.5 rounded p-1 text-[#7E8B85]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Compact Folder Filter Pills */}
      {folders.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedFolderFilterId(null)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
              selectedFolderFilterId === null
                ? 'border-[#8AB8A3]/40 bg-[#18221E] text-[#8AB8A3]'
                : 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
            )}
          >
            All Folders
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() =>
                setSelectedFolderFilterId(
                  selectedFolderFilterId === folder.id ? null : folder.id,
                )
              }
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                selectedFolderFilterId === folder.id
                  ? 'border-[#8AB8A3]/40 bg-[#18221E] text-[#8AB8A3]'
                  : 'border-[#1E2623] bg-[#111614] text-[#7E8B85]',
              )}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}

      {/* Favorites Section */}
      {favorites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8B85] flex items-center gap-1.5">
            <Star className="h-3 w-3 fill-[#e5a93c] text-[#e5a93c]" />
            Favorites
          </h2>
          <div className="space-y-2">{favorites.map(renderNoteRow)}</div>
        </section>
      )}

      {/* Recent Section */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8B85]">
          {favorites.length > 0 ? 'Recent' : 'Notes'} ({recent.length})
        </h2>
        {filteredNotes.length === 0 ? (
          <div className="rounded-xl border border-[#1E2623] bg-[#111614] px-3.5 py-6 text-center text-xs text-[#7E8B85]">
            No matching notes. Tap + below to write a quick note.
          </div>
        ) : (
          <div className="space-y-2">{recent.map(renderNoteRow)}</div>
        )}
      </section>
    </div>
  );
}
