import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getFolderDescendantStats,
  type DeleteFolderMode,
  type FolderDescendantStats,
  type FolderRecord,
} from '@/services';

export interface DeleteFolderDialogProps {
  folder: FolderRecord | null;
  onConfirm: (folderId: string, mode: DeleteFolderMode) => Promise<void>;
  onClose: () => void;
}

/**
 * Confirmation modal preventing accidental loss when deleting a folder that
 * contains nested subfolders or notes.
 */
export function DeleteFolderDialog({
  folder,
  onConfirm,
  onClose,
}: DeleteFolderDialogProps) {
  const [stats, setStats] = useState<FolderDescendantStats>({
    subfolderCount: 0,
    noteCount: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!folder) return;
    let active = true;
    void getFolderDescendantStats(folder.id).then((result) => {
      if (active) setStats(result);
    });
    return () => {
      active = false;
    };
  }, [folder]);

  if (!folder) return null;

  const hasContents = stats.subfolderCount > 0 || stats.noteCount > 0;

  const handleAction = async (mode: DeleteFolderMode) => {
    setSubmitting(true);
    try {
      await onConfirm(folder.id, mode);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(folder)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Delete folder &ldquo;{folder.name}&rdquo;?
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              {hasContents
                ? `This folder contains ${stats.noteCount} note(s) and ${stats.subfolderCount} subfolder(s). Choose whether to preserve its contents or delete everything.`
                : 'This folder is currently empty and can be safely removed.'}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>

          {hasContents ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => void handleAction('move-to-root')}
              >
                Delete folder &amp; keep contents
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={submitting}
                onClick={() => void handleAction('delete-all')}
                className="bg-destructive text-destructive-foreground"
              >
                Delete folder &amp; all contents
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              disabled={submitting}
              onClick={() => void handleAction('delete-all')}
            >
              Delete folder
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
