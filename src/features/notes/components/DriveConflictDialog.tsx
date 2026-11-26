import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PendingDriveConflict } from '@/stores/useDriveStore';

export interface DriveConflictDialogProps {
  conflictState: PendingDriveConflict | null;
  busy: boolean;
  onCancel: () => void;
  onSaveRemoteCopy: () => Promise<void>;
  onOverwriteDrive: () => Promise<void>;
}

/**
 * Notifies the user when a Google Drive Markdown file changed remotely since
 * the last known upload/download, preventing silent data loss.
 */
export function DriveConflictDialog({
  conflictState,
  busy,
  onCancel,
  onSaveRemoteCopy,
  onOverwriteDrive,
}: DriveConflictDialogProps) {
  if (!conflictState) return null;

  const { localNote, conflict } = conflictState;

  return (
    <Dialog open={Boolean(conflictState)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-amber-500">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Drive version conflict detected
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              &ldquo;{conflict.fileName || localNote.title}&rdquo; was modified
              in Google Drive at{' '}
              <span className="font-mono text-foreground">
                {new Date(conflict.remoteModifiedTime).toLocaleString()}
              </span>
              . Your local IndexedDB copy has been preserved.
            </DialogDescription>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            Keep local only
          </Button>
          {conflict.remoteContent !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onSaveRemoteCopy()}
            >
              Save Drive copy locally
            </Button>
          ) : null}
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy}
            onClick={() => void onOverwriteDrive()}
          >
            Overwrite Drive with local
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
