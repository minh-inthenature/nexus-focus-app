import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSyncStore } from '@/stores/useSyncStore';

/**
 * Dialog displaying unresolved hybrid sync conflicts so the user can choose
 * whether to keep local edits, keep the Drive copy, or save both.
 */
export function SyncConflictsDialog() {
  const open = useSyncStore((state) => state.conflictsDialogOpen);
  const setOpen = useSyncStore((state) => state.setConflictsDialogOpen);
  const conflicts = useSyncStore((state) => state.conflicts);
  const resolvingId = useSyncStore((state) => state.resolvingConflictId);
  const resolveConflict = useSyncStore((state) => state.resolveConflict);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-5">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-amber-500">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Synchronization conflicts ({conflicts.length})
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Both your local device and Google Drive modified these notes since
              the last sync. Local copies remain safely stored in IndexedDB.
            </DialogDescription>
          </div>
        </div>

        <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto">
          {conflicts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No unresolved conflicts remaining.
            </p>
          ) : (
            conflicts.map((conflict) => {
              const busy = resolvingId === conflict.id;
              return (
                <div
                  key={conflict.id}
                  className="space-y-2.5 rounded-md border border-border bg-background/60 p-3.5"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">
                      {conflict.noteTitle}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {conflict.reason === 'deleted_remotely'
                        ? 'Deleted on Drive while modified locally.'
                        : `Local updated ${new Date(conflict.localUpdatedAt).toLocaleString()} · Drive updated ${new Date(conflict.remoteModifiedTime).toLocaleString()}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void resolveConflict(conflict.id, 'keep_local')
                      }
                    >
                      Keep local
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void resolveConflict(conflict.id, 'keep_remote')
                      }
                    >
                      {conflict.reason === 'deleted_remotely'
                        ? 'Accept remote delete'
                        : 'Keep Drive copy'}
                    </Button>
                    {conflict.reason === 'both_modified' ? (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void resolveConflict(conflict.id, 'keep_both')
                        }
                      >
                        Keep both
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
