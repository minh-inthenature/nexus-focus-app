import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Link2 } from 'lucide-react';
import { buildFolderPathMap, type FolderRecord, type NoteRecord } from '@/services';

export interface BacklinksPanelProps {
  backlinks: readonly NoteRecord[];
  folders: readonly FolderRecord[];
  onOpenNote: (noteId: string) => void;
}

/**
 * Collapsible panel displaying incoming `[[links]]` from other notes so users
 * can traverse bidirectional knowledge relationships.
 */
export function BacklinksPanel({
  backlinks,
  folders,
  onOpenNote,
}: BacklinksPanelProps) {
  const [open, setOpen] = useState(true);
  const folderPathMap = buildFolderPathMap(folders);

  return (
    <section
      aria-label="Backlinks"
      className="border-t border-border bg-card/30 px-6 py-3 md:px-10"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Backlinks</span>
          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px]">
            {backlinks.length}
          </span>
        </span>
      </button>

      {open ? (
        <div className="mt-2.5">
          {backlinks.length === 0 ? (
            <p className="text-xs text-muted-foreground/75">
              No other notes link to this note yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((source) => {
                const folderPath = source.folderId
                  ? folderPathMap.get(source.folderId)
                  : undefined;
                return (
                  <li key={source.id}>
                    <button
                      type="button"
                      onClick={() => onOpenNote(source.id)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent cursor-pointer"
                    >
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <FileText
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>{source.title}</span>
                      </span>
                      {folderPath ? (
                        <span className="truncate pl-4 text-[11px] text-muted-foreground">
                          {folderPath}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
