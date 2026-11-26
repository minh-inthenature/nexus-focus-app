import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Cloud,
  CloudDownload,
  CloudOff,
  CloudUpload,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import {
  getMappingByDriveFileId,
  type DriveFileRef,
  type NoteRecord,
} from '@/services';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDriveStore } from '@/stores/useDriveStore';

export interface DrivePanelDialogProps {
  open: boolean;
  activeNote: NoteRecord;
  onBeforeExport: () => Promise<void>;
  onClose: () => void;
}

/**
 * Manual Google Drive operations drawer/modal for the active note and
 * `Nexus/Notes/` cloud files. Local IndexedDB notes always remain intact.
 */
export function DrivePanelDialog({
  open,
  activeNote,
  onBeforeExport,
  onClose,
}: DrivePanelDialogProps) {
  const navigate = useNavigate();
  const authStatus = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const exitLocalMode = useAuthStore((state) => state.exitLocalMode);

  const connection = useDriveStore((state) => state.connection);
  const remoteFiles = useDriveStore((state) => state.remoteFiles);
  const mappingsByLocalNoteId = useDriveStore(
    (state) => state.mappingsByLocalNoteId,
  );
  const busyAction = useDriveStore((state) => state.busyAction);
  const error = useDriveStore((state) => state.error);
  const listRemoteNotes = useDriveStore((state) => state.listRemoteNotes);
  const uploadOrUpdateLocalNote = useDriveStore(
    (state) => state.uploadOrUpdateLocalNote,
  );
  const readRemoteNote = useDriveStore((state) => state.readRemoteNote);
  const recordMapping = useDriveStore((state) => state.recordMapping);
  const deleteRemoteFile = useDriveStore((state) => state.deleteRemoteFile);
  const connectDrive = useDriveStore((state) => state.connectDrive);
  const clearError = useDriveStore((state) => state.clearError);

  const createNote = useNotesStore((state) => state.createNote);
  const saveNoteContent = useNotesStore((state) => state.saveNoteContent);
  const setActiveNoteId = useNotesStore((state) => state.setActiveNoteId);
  const notes = useNotesStore((state) => state.notes);

  const [filePendingDelete, setFilePendingDelete] =
    useState<DriveFileRef | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isAuthenticated = authStatus === 'authenticated' && Boolean(session);
  const isConnected = isAuthenticated && connection.status === 'connected';
  const currentMapping = mappingsByLocalNoteId[activeNote.id];

  useEffect(() => {
    if (open) {
      setFeedback(null);
      setFilePendingDelete(null);
      clearError();
      if (isConnected) {
        void listRemoteNotes();
      }
    }
  }, [open, isConnected, listRemoteNotes, clearError]);

  const handleUploadOrUpdate = async () => {
    if (!session?.user.id) return;
    setFeedback(null);
    await onBeforeExport();
    const latest =
      useNotesStore.getState().notes.find((n) => n.id === activeNote.id) ??
      activeNote;
    const uploaded = await uploadOrUpdateLocalNote(latest, session.user.id);
    if (uploaded) {
      setFeedback(`Saved "${uploaded.name}" to Nexus/Notes in Google Drive.`);
    }
  };

  const handleDownloadRemote = async (file: DriveFileRef) => {
    if (!session?.user.id) return;
    setFeedback(null);
    const { file: freshMeta, content } = await readRemoteNote(file.id);
    const existingMapping = await getMappingByDriveFileId(
      freshMeta.id,
      session.user.id,
    );
    const existingLocal = existingMapping
      ? notes.find((n) => n.id === existingMapping.localNoteId)
      : undefined;

    if (existingLocal) {
      await saveNoteContent(existingLocal.id, content);
      await recordMapping({
        userId: session.user.id,
        localNoteId: existingLocal.id,
        file: freshMeta,
        folderId: connection.notesFolderId ?? freshMeta.parentId ?? '',
      });
      await setActiveNoteId(existingLocal.id);
      setFeedback(`Updated local note "${existingLocal.title}" from Drive.`);
      onClose();
      return;
    }

    const baseTitle = freshMeta.name.replace(/\.(md|markdown)$/i, '').trim() || 'Drive Note';
    const created = await createNote({
      title: baseTitle,
      content,
    });
    await recordMapping({
      userId: session.user.id,
      localNoteId: created.id,
      file: freshMeta,
      folderId: connection.notesFolderId ?? freshMeta.parentId ?? '',
    });
    setFeedback(`Downloaded "${freshMeta.name}" into local Notes.`);
    onClose();
  };

  const handleConfirmDeleteRemote = async () => {
    if (!filePendingDelete) return;
    const target = filePendingDelete;
    setFilePendingDelete(null);
    await deleteRemoteFile(target.id);
    setFeedback(`Deleted "${target.name}" from Google Drive. Local notes remain intact.`);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>Google Drive (Nexus/Notes)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Explicit cloud operations for Markdown notes. IndexedDB stays your
              local source of truth.
            </DialogDescription>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        {feedback ? (
          <div className="mt-3 rounded-md border border-border bg-accent/60 px-3 py-2 text-xs text-foreground">
            {feedback}
          </div>
        ) : null}

        {!isAuthenticated ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CloudOff
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>Google account not signed in</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You are currently working offline in Local Mode. Sign in with
              Google and authorize <code className="font-mono">drive.file</code>{' '}
              access when you want to export or import Markdown notes with
              Google Drive.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  exitLocalMode();
                  navigate('/login');
                }}
              >
                Go to Sign In
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Continue locally
              </Button>
            </div>
          </div>
        ) : !isConnected ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CloudOff
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                {connection.status === 'revoked'
                  ? 'Google Drive permission revoked'
                  : 'Google Drive not connected'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connect Google Drive separately with narrow{' '}
              <code className="font-mono">drive.file</code> permission to store
              notes inside <code className="font-mono">Nexus/Notes/</code>.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={Boolean(busyAction)}
                onClick={() => void connectDrive()}
              >
                {busyAction ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Connect Google Drive</span>
              </Button>
              <Button variant="ghost" size="sm" asChild onClick={onClose}>
                <Link to="/settings">Manage in Settings</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Active Note Card */}
            <div className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-xs font-medium text-foreground">
                  Current note: {activeNote.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {currentMapping
                    ? `Linked to Drive (${currentMapping.driveFileName ?? currentMapping.driveFileId})`
                    : 'Not yet uploaded to Nexus/Notes'}
                </p>
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={Boolean(busyAction)}
                onClick={() => void handleUploadOrUpdate()}
              >
                {busyAction ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {currentMapping ? 'Update on Drive' : 'Upload to Drive'}
                </span>
              </Button>
            </div>

            {/* Remote Notes List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Files in Nexus/Notes ({remoteFiles.length})
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busyAction)}
                  onClick={() => void listRemoteNotes()}
                >
                  <RefreshCw
                    className={busyAction ? 'h-3 w-3 animate-spin' : 'h-3 w-3'}
                    aria-hidden="true"
                  />
                  <span>Refresh</span>
                </Button>
              </div>

              {filePendingDelete ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <p className="font-medium text-foreground">
                    Delete &ldquo;{filePendingDelete.name}&rdquo; from Google
                    Drive?
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Your local IndexedDB copy (if any) will not be deleted.
                  </p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilePendingDelete(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => void handleConfirmDeleteRemote()}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Confirm Drive delete
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {remoteFiles.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No Markdown files in Nexus/Notes yet.
                  </p>
                ) : (
                  remoteFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <FileText
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <p className="pl-5 text-[10px] text-muted-foreground">
                          Modified{' '}
                          {new Date(file.modifiedTime).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={Boolean(busyAction)}
                          onClick={() => void handleDownloadRemote(file)}
                        >
                          <CloudDownload
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          <span>Open</span>
                        </Button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => setFilePendingDelete(file)}
                          title="Delete file from Drive"
                          aria-label={`Delete ${file.name} from Drive`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
