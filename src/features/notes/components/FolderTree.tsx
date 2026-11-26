import { useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import type { FolderRecord, NoteRecord } from '@/services';
import { cn } from '@/utils/cn';

export interface FolderTreeProps {
  folders: readonly FolderRecord[];
  notes: readonly NoteRecord[];
  activeNoteId: string | null;
  expandedFolderIds: readonly string[];
  onToggleFolder: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateSubfolder: (parentId: string | null, name: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onRenameNote: (noteId: string, title: string) => Promise<void>;
  onMoveNote: (noteId: string, targetFolderId: string | null) => Promise<void>;
  onRequestDeleteFolder: (folder: FolderRecord) => void;
}

type EditingTarget =
  | { kind: 'rename-folder'; id: string; value: string }
  | { kind: 'rename-note'; id: string; value: string }
  | { kind: 'new-subfolder'; parentId: string; value: string }
  | null;

function sortByName<T extends { name?: string; title?: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const aLabel = a.name ?? a.title ?? '';
    const bLabel = b.name ?? b.title ?? '';
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
  });
}

/**
 * Recursive Obsidian-inspired folder and note tree supporting nested folders,
 * alphabetical sorting, inline rename, drag-and-drop moves, and UUID identity.
 */
export function FolderTree({
  folders,
  notes,
  activeNoteId,
  expandedFolderIds,
  onToggleFolder,
  onSelectNote,
  onCreateNote,
  onCreateSubfolder,
  onRenameFolder,
  onRenameNote,
  onMoveNote,
  onRequestDeleteFolder,
}: FolderTreeProps) {
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | 'root' | null>(
    null,
  );

  const commitEditing = async () => {
    if (!editing) return;
    const trimmed = editing.value.trim();
    const current = editing;
    setEditing(null);

    if (!trimmed) return;
    if (current.kind === 'rename-folder') {
      await onRenameFolder(current.id, trimmed);
    } else if (current.kind === 'rename-note') {
      await onRenameNote(current.id, trimmed);
    } else if (current.kind === 'new-subfolder') {
      await onCreateSubfolder(current.parentId, trimmed);
    }
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitEditing();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
    }
  };

  const handleDropOnFolder = async (
    event: DragEvent,
    targetFolderId: string | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFolderId(null);
    const draggedNoteId = event.dataTransfer.getData('text/nexus-note-id');
    if (draggedNoteId) {
      await onMoveNote(draggedNoteId, targetFolderId);
    }
  };

  const renderNoteRow = (note: NoteRecord, depth: number) => {
    const isActive = note.id === activeNoteId;
    const isRenaming =
      editing?.kind === 'rename-note' && editing.id === note.id;

    return (
      <div
        key={note.id}
        draggable={!isRenaming}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/nexus-note-id', note.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={cn(
          'group flex h-7 items-center justify-between gap-1 rounded-md pr-1.5 text-[13px] transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-sidebar-foreground/85 hover:bg-accent/60 hover:text-accent-foreground',
        )}
      >
        {isRenaming ? (
          <input
            type="text"
            value={editing.value}
            onChange={(e) =>
              setEditing({ ...editing, value: e.target.value })
            }
            onKeyDown={handleEditKeyDown}
            onBlur={() => void commitEditing()}
            autoFocus
            aria-label="Rename note"
            className="h-6 w-full rounded border border-ring bg-background px-1.5 text-xs text-foreground focus:outline-none"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelectNote(note.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
            >
              {note.isDaily ? (
                <Calendar
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <FileText
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{note.title}</span>
              {note.isFavorite ? (
                <Star
                  className="h-3 w-3 shrink-0 fill-current text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing({
                  kind: 'rename-note',
                  id: note.id,
                  value: note.title,
                });
              }}
              aria-label={`Rename ${note.title}`}
              title="Rename note"
              className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground group-hover:flex hover:bg-background/60 hover:text-foreground cursor-pointer"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    );
  };

  const renderBranch = (parentId: string | null, depth: number) => {
    const childFolders = sortByName(
      folders.filter((f) => f.parentId === parentId),
    );
    const childNotes = sortByName(
      notes.filter((n) => n.folderId === parentId),
    );

    return (
      <>
        {childFolders.map((folder) => {
          const isExpanded = expandedFolderIds.includes(folder.id);
          const isRenaming =
            editing?.kind === 'rename-folder' && editing.id === folder.id;
          const isAddingSubfolder =
            editing?.kind === 'new-subfolder' &&
            editing.parentId === folder.id;
          const isDragTarget = dragOverFolderId === folder.id;

          return (
            <div key={folder.id}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(folder.id);
                }}
                onDragLeave={() => {
                  if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                }}
                onDrop={(e) => void handleDropOnFolder(e, folder.id)}
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
                className={cn(
                  'group flex h-7 items-center justify-between gap-1 rounded-md pr-1 text-[13px] text-sidebar-foreground/90 transition-colors hover:bg-accent/60',
                  isDragTarget && 'bg-accent ring-1 ring-ring',
                )}
              >
                {isRenaming ? (
                  <input
                    type="text"
                    value={editing.value}
                    onChange={(e) =>
                      setEditing({ ...editing, value: e.target.value })
                    }
                    onKeyDown={handleEditKeyDown}
                    onBlur={() => void commitEditing()}
                    autoFocus
                    aria-label="Rename folder"
                    className="h-6 w-full rounded border border-ring bg-background px-1.5 text-xs text-foreground focus:outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onToggleFolder(folder.id)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      {isExpanded ? (
                        <FolderOpen
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : (
                        <Folder
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        onClick={() => onCreateNote(folder.id)}
                        title="New note in folder"
                        aria-label={`New note in ${folder.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground cursor-pointer"
                      >
                        <FilePlus2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isExpanded) onToggleFolder(folder.id);
                          setEditing({
                            kind: 'new-subfolder',
                            parentId: folder.id,
                            value: '',
                          });
                        }}
                        title="New subfolder"
                        aria-label={`New subfolder in ${folder.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground cursor-pointer"
                      >
                        <FolderPlus className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            kind: 'rename-folder',
                            id: folder.id,
                            value: folder.name,
                          })
                        }
                        title="Rename folder"
                        aria-label={`Rename ${folder.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDeleteFolder(folder)}
                        title="Delete folder"
                        aria-label={`Delete ${folder.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isExpanded ? (
                <div>
                  {isAddingSubfolder ? (
                    <div
                      style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
                      className="py-1 pr-1"
                    >
                      <input
                        type="text"
                        value={editing.value}
                        placeholder="Subfolder name…"
                        onChange={(e) =>
                          setEditing({ ...editing, value: e.target.value })
                        }
                        onKeyDown={handleEditKeyDown}
                        onBlur={() => void commitEditing()}
                        autoFocus
                        aria-label="New subfolder name"
                        className="h-6 w-full rounded border border-ring bg-background px-1.5 text-xs text-foreground focus:outline-none"
                      />
                    </div>
                  ) : null}
                  {renderBranch(folder.id, depth + 1)}
                </div>
              ) : null}
            </div>
          );
        })}

        {childNotes.map((note) => renderNoteRow(note, depth))}
      </>
    );
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverFolderId('root');
      }}
      onDragLeave={() => {
        if (dragOverFolderId === 'root') setDragOverFolderId(null);
      }}
      onDrop={(e) => void handleDropOnFolder(e, null)}
      className={cn(
        'min-h-[120px] space-y-0.5 rounded-md',
        dragOverFolderId === 'root' && 'ring-1 ring-border',
      )}
    >
      {folders.length === 0 && notes.length === 0 ? (
        <p className="px-2 py-4 text-xs text-muted-foreground">
          No notes or folders yet.
        </p>
      ) : (
        renderBranch(null, 0)
      )}
    </div>
  );
}
