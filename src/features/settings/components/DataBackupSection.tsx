import { useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalendarStore } from '@/features/calendar/stores/useCalendarStore';
import { useNotesStore } from '@/features/notes/stores/useNotesStore';
import { useTasksStore } from '@/features/tasks/stores/useTasksStore';
import {
  downloadFullBackupZip,
  inspectBackupArchive,
  restoreBackupArchive,
  type BackupRestoreMode,
  type ParsedBackupInspection,
} from '@/services';

/**
 * Full portable ZIP backup and validated restore workflow inside Settings.
 * Requires explicit user confirmation before modifying local IndexedDB stores.
 */
export function DataBackupSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ParsedBackupInspection | null>(
    null,
  );
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownloadBackup = async () => {
    setExporting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const manifest = await downloadFullBackupZip();
      setStatusMessage(
        `Backup exported (${manifest.counts.notes} notes, ${manifest.counts.tasks} tasks, ${manifest.counts.calendarEvents} events, ${manifest.counts.attachments} attachments).`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate backup archive.',
      );
    } finally {
      setExporting(false);
    }
  };

  const handleSelectRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusMessage(null);
    setInspection(null);
    setPendingFile(null);

    try {
      const inspected = await inspectBackupArchive(file);
      setPendingFile(file);
      setInspection(inspected);
      setRestoreMode('merge');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to validate backup archive.',
      );
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingFile || !inspection || restoring) return;
    setRestoring(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const summary = await restoreBackupArchive(pendingFile, restoreMode);
      await Promise.all([
        useNotesStore.getState().initialize(true),
        useTasksStore.getState().initialize(true),
        useCalendarStore.getState().initialize(true),
      ]);
      setPendingFile(null);
      setInspection(null);
      setStatusMessage(
        `Restored backup (${summary.mode}): ${summary.notesRestored} notes, ${summary.foldersRestored} folders, ${summary.tasksRestored} tasks, ${summary.calendarEventsRestored} events, ${summary.attachmentsRestored} attachments.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Restore failed cleanly.',
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Data Backup and Recovery">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          Data Backup &amp; Recovery
        </h2>
        <p className="text-xs text-muted-foreground">
          Export a portable ZIP archive containing all Markdown notes,
          attachments, folders, tasks, calendar events, and preferences. No
          tokens or secrets are ever exported.
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-accent/40 px-3.5 py-2.5 text-xs text-foreground"
        >
          <CheckCircle2
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
            aria-hidden="true"
          />
          <span>{statusMessage}</span>
        </div>
      ) : null}

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Export Full Workspace Backup
            </p>
            <p className="text-xs text-muted-foreground">
              Downloads a versioned `.zip` archive readable both in Nexus and in
              any standard Markdown editor.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void handleDownloadBackup()}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>Download Full Backup (.zip)</span>
          </Button>
        </div>

        <div className="space-y-3 px-4 py-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Restore from Backup Archive
              </p>
              <p className="text-xs text-muted-foreground">
                Validates `manifest.json` and record schemas before applying any
                changes. Requires explicit confirmation.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => void handleSelectRestoreFile(e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={restoring}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Select Backup (.zip)</span>
            </Button>
          </div>

          {inspection ? (
            <div className="space-y-3 rounded-md border border-border bg-background/70 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">
                  Validated Backup · Schema v{inspection.manifest.schemaVersion}
                </p>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Exported {new Date(inspection.manifest.exportedAt).toLocaleString()}
                </span>
              </div>

              <p className="text-muted-foreground">
                Contains{' '}
                <span className="font-mono text-foreground">
                  {inspection.notes.length}
                </span>{' '}
                notes,{' '}
                <span className="font-mono text-foreground">
                  {inspection.folders.length}
                </span>{' '}
                folders,{' '}
                <span className="font-mono text-foreground">
                  {inspection.attachmentsMeta.length}
                </span>{' '}
                attachments,{' '}
                <span className="font-mono text-foreground">
                  {inspection.tasks.length}
                </span>{' '}
                tasks,{' '}
                <span className="font-mono text-foreground">
                  {inspection.calendarEvents.length}
                </span>{' '}
                events.
              </p>

              {inspection.warnings.length > 0 ? (
                <ul className="list-disc pl-5 text-amber-500">
                  {inspection.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="accent-primary"
                  />
                  <span className="text-foreground">
                    Merge with existing data (recommended)
                  </span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="accent-primary"
                  />
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    <span>Replace all local data</span>
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={restoring}
                  onClick={() => {
                    setPendingFile(null);
                    setInspection(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={restoring}
                  onClick={() => void handleConfirmRestore()}
                >
                  {restoring ? 'Restoring…' : 'Confirm restore'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
