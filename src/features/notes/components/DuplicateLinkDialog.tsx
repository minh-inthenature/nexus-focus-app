import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildFolderPathMap, type FolderRecord, type NoteRecord } from '@/services';

export interface DuplicateLinkDialogProps {
  open: boolean;
  targetTitle: string;
  candidates: readonly NoteRecord[];
  folders: readonly FolderRecord[];
  onSelect: (note: NoteRecord, qualifyLink: boolean) => void;
  onClose: () => void;
}

/**
 * Disambiguation modal shown when clicking an internal `[[Note]]` link whose
 * title matches multiple notes across different folders.
 */
export function DuplicateLinkDialog({
  open,
  targetTitle,
  candidates,
  folders,
  onSelect,
  onClose,
}: DuplicateLinkDialogProps) {
  const folderPathMap = buildFolderPathMap(folders);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="p-5">
        <DialogTitle className="text-sm font-semibold text-foreground">
          Multiple notes match &ldquo;{targetTitle}&rdquo;
        </DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">
          Choose which note to open. Selecting &ldquo;Open &amp; Link&rdquo;
          updates the link with its folder path so it resolves directly next time.
        </DialogDescription>

        <div className="mt-4 max-h-60 space-y-1.5 overflow-y-auto">
          {candidates.map((candidate) => {
            const folderPath = candidate.folderId
              ? folderPathMap.get(candidate.folderId) ?? 'Root'
              : 'Root';
            return (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <FileText
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="truncate">{candidate.title}</span>
                  </div>
                  <p className="truncate pl-5 text-[11px] text-muted-foreground">
                    Folder: {folderPath}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(candidate, false)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(candidate, true)}
                  >
                    Open &amp; Link
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
