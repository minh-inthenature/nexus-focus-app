import type JSZip from 'jszip';
import {
  extractAttachmentIds,
  extractTags,
  extractWikiLinks,
  sanitizeFileName,
} from '@/features/notes/utils/markdown';
import {
  sanitizeAttachmentFileName,
  validateAttachmentFile,
} from './attachment.service';
import { listCalendarEvents } from './calendarEvents.repository';
import {
  createUuid,
  db,
  type AttachmentRecord,
  type CalendarEventRecord,
  type FolderRecord,
  type NoteLinkRecord,
  type NoteRecord,
  type TaskRecord,
} from './db';
import { buildFolderPathMap, listFolders } from './folders.repository';
import { listNotes } from './notes.repository';
import { listTasks } from './tasks.repository';
import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';

export const NEXUS_BACKUP_FORMAT = 'nexus-backup' as const;
export const NEXUS_BACKUP_SCHEMA_VERSION = 1;
export const NEXUS_APP_VERSION = '0.1.0';

export interface BackupManifest {
  readonly format: typeof NEXUS_BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly counts: {
    readonly notes: number;
    readonly folders: number;
    readonly attachments: number;
    readonly tasks: number;
    readonly calendarEvents: number;
  };
}

export interface BackupAttachmentMeta {
  readonly id: string;
  readonly noteId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly archivePath: string;
}

export interface BackupSettingsSnapshot {
  readonly themePreference?: string;
  readonly dashboardStoreRaw?: string;
  readonly tasksStoreRaw?: string;
  readonly calendarStoreRaw?: string;
}

export interface BackupSnapshotInput {
  readonly folders: readonly FolderRecord[];
  readonly notes: readonly NoteRecord[];
  readonly attachments: readonly AttachmentRecord[];
  readonly tasks: readonly TaskRecord[];
  readonly calendarEvents: readonly CalendarEventRecord[];
  readonly settings?: BackupSettingsSnapshot;
}

export interface ParsedBackupInspection {
  readonly manifest: BackupManifest;
  readonly warnings: readonly string[];
  readonly folders: readonly FolderRecord[];
  readonly notes: readonly NoteRecord[];
  readonly attachmentsMeta: readonly BackupAttachmentMeta[];
  readonly tasks: readonly TaskRecord[];
  readonly calendarEvents: readonly CalendarEventRecord[];
  readonly settings: BackupSettingsSnapshot;
  readonly binaryBlobsByAttachmentId: ReadonlyMap<string, Blob>;
}

export type BackupRestoreMode = 'merge' | 'replace';

export interface BackupRestoreSummary {
  readonly mode: BackupRestoreMode;
  readonly foldersRestored: number;
  readonly notesRestored: number;
  readonly attachmentsRestored: number;
  readonly tasksRestored: number;
  readonly calendarEventsRestored: number;
  readonly settingsRestored: boolean;
}

const THEME_STORAGE_KEY = 'nexus-theme';
const DASHBOARD_STORAGE_KEY = 'nexus-dashboard-ui-store';
const TASKS_STORAGE_KEY = 'nexus-tasks-ui-store';
const CALENDAR_STORAGE_KEY = 'nexus-calendar-ui-store';

function readSafeUiSettings(): BackupSettingsSnapshot {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const themePreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    const dashboardStoreRaw = window.localStorage.getItem(
      DASHBOARD_STORAGE_KEY,
    );
    const tasksStoreRaw = window.localStorage.getItem(TASKS_STORAGE_KEY);
    const calendarStoreRaw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);

    return {
      ...(themePreference ? { themePreference } : {}),
      ...(dashboardStoreRaw ? { dashboardStoreRaw } : {}),
      ...(tasksStoreRaw ? { tasksStoreRaw } : {}),
      ...(calendarStoreRaw ? { calendarStoreRaw } : {}),
    };
  } catch {
    return {};
  }
}

function writeSafeUiSettings(settings: BackupSettingsSnapshot): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  let wroteAny = false;
  try {
    if (
      settings.themePreference &&
      ['light', 'dark', 'forest', 'system'].includes(settings.themePreference)
    ) {
      window.localStorage.setItem(THEME_STORAGE_KEY, settings.themePreference);
      wroteAny = true;
    }
    if (settings.dashboardStoreRaw) {
      JSON.parse(settings.dashboardStoreRaw);
      window.localStorage.setItem(
        DASHBOARD_STORAGE_KEY,
        settings.dashboardStoreRaw,
      );
      wroteAny = true;
    }
    if (settings.tasksStoreRaw) {
      JSON.parse(settings.tasksStoreRaw);
      window.localStorage.setItem(TASKS_STORAGE_KEY, settings.tasksStoreRaw);
      wroteAny = true;
    }
    if (settings.calendarStoreRaw) {
      JSON.parse(settings.calendarStoreRaw);
      window.localStorage.setItem(
        CALENDAR_STORAGE_KEY,
        settings.calendarStoreRaw,
      );
      wroteAny = true;
    }
  } catch {
    // Ignore malformed optional UI preference entries
  }
  return wroteAny;
}

function getUniquePath(candidate: string, used: Set<string>): string {
  if (!used.has(candidate.toLowerCase())) {
    used.add(candidate.toLowerCase());
    return candidate;
  }
  const dotIdx = candidate.lastIndexOf('.');
  const slashIdx = candidate.lastIndexOf('/');
  const hasExt = dotIdx > slashIdx;
  const base = hasExt ? candidate.slice(0, dotIdx) : candidate;
  const ext = hasExt ? candidate.slice(dotIdx) : '';
  let n = 2;
  while (used.has(`${base} (${n})${ext}`.toLowerCase())) {
    n += 1;
  }
  const unique = `${base} (${n})${ext}`;
  used.add(unique.toLowerCase());
  return unique;
}

/**
 * Generates a portable full-workspace ZIP archive containing:
 * - `manifest.json` describing format & counts
 * - Human-browseable `notes/.../*.md` with relative `./attachments/...` links
 * - Binary `attachments/...` files
 * - Structured JSON snapshots in `data/` (folders, notes, attachments, tasks, calendar_events, non-sensitive UI settings)
 */
export async function buildFullBackupZipBlob(
  inputSnapshot?: BackupSnapshotInput,
): Promise<{ blob: Blob; manifest: BackupManifest }> {
  const snapshot: BackupSnapshotInput = inputSnapshot ?? {
    folders: await listFolders(),
    notes: await listNotes(),
    attachments: await db.attachments.filter((a) => !a.deletedAt).toArray(),
    tasks: await listTasks(),
    calendarEvents: await listCalendarEvents(),
    settings: readSafeUiSettings(),
  };

  const { default: JSZipCtor } = await import('jszip');
  const zip = new JSZipCtor();
  const folderPathMap = buildFolderPathMap(snapshot.folders);
  const usedPortablePaths = new Set<string>();
  const attachmentPaths = new Map<string, string>();
  const attachmentsMeta: BackupAttachmentMeta[] = [];

  for (const att of snapshot.attachments) {
    const safeName = sanitizeAttachmentFileName(att.fileName);
    const archivePath = getUniquePath(
      `attachments/${att.id}-${safeName}`,
      usedPortablePaths,
    );
    attachmentPaths.set(att.id, archivePath);
    attachmentsMeta.push({
      id: att.id,
      noteId: att.noteId,
      fileName: safeName,
      mimeType: att.mimeType,
      size: att.size,
      createdAt: att.createdAt,
      archivePath,
    });
    zip.file(archivePath, att.data);
  }

  for (const note of snapshot.notes) {
    const folderSegments = note.folderId
      ? (folderPathMap.get(note.folderId) ?? '')
          .split('/')
          .filter(Boolean)
          .map((s) => sanitizeFileName(s))
      : [];
    const safeTitle = sanitizeFileName(note.title);
    const rawRelPath =
      folderSegments.length > 0
        ? `notes/${folderSegments.join('/')}/${safeTitle}.md`
        : `notes/${safeTitle}.md`;
    const uniqueNotePath = getUniquePath(rawRelPath, usedPortablePaths);

    const depth = folderSegments.length + 1; // nested under `notes/`
    const prefix = '../'.repeat(depth);
    let markdown = note.content;
    for (const attId of extractAttachmentIds(markdown)) {
      const archivePath = attachmentPaths.get(attId);
      if (archivePath) {
        markdown = markdown.replaceAll(
          `nexus-attachment://${attId}`,
          `${prefix}${archivePath}`,
        );
      }
    }
    zip.file(uniqueNotePath, markdown);
  }

  const manifest: BackupManifest = {
    format: NEXUS_BACKUP_FORMAT,
    schemaVersion: NEXUS_BACKUP_SCHEMA_VERSION,
    appVersion: NEXUS_APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      notes: snapshot.notes.length,
      folders: snapshot.folders.length,
      attachments: snapshot.attachments.length,
      tasks: snapshot.tasks.length,
      calendarEvents: snapshot.calendarEvents.length,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'README.txt',
    [
      'Nexus Full Workspace Backup Archive',
      `Exported: ${manifest.exportedAt}`,
      `Schema Version: ${manifest.schemaVersion}`,
      '',
      '- Browse `notes/` with any Markdown editor.',
      '- Referenced attachments reside in `attachments/`.',
      '- `data/` contains lossless JSON records for Nexus restore (Settings -> Data Backup & Recovery).',
      '- Authentication tokens, credentials, and encryption keys are never included in backups.',
    ].join('\n'),
  );

  // Strip sync revision/token internals except core domain fields
  zip.file('data/folders.json', JSON.stringify(snapshot.folders, null, 2));
  zip.file('data/notes.json', JSON.stringify(snapshot.notes, null, 2));
  zip.file('data/attachments.json', JSON.stringify(attachmentsMeta, null, 2));
  zip.file('data/tasks.json', JSON.stringify(snapshot.tasks, null, 2));
  zip.file(
    'data/calendar_events.json',
    JSON.stringify(snapshot.calendarEvents, null, 2),
  );
  zip.file(
    'data/settings.json',
    JSON.stringify(snapshot.settings ?? {}, null, 2),
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, manifest };
}

/**
 * Generates and downloads a complete Nexus backup ZIP archive cleanly.
 */
export async function downloadFullBackupZip(): Promise<BackupManifest> {
  const { blob, manifest } = await buildFullBackupZipBlob();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nexus-backup-${dateStamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return manifest;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonFromZip<T>(
  zip: JSZip,
  path: string,
  required = true,
): Promise<T | null> {
  const file = zip.file(path);
  if (!file) {
    if (required) {
      throw new Error(`Invalid backup archive: missing "${path}".`);
    }
    return null;
  }
  const text = await file.async('string');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid backup archive: "${path}" contains malformed JSON.`);
  }
}

function validateArrayField<T>(
  raw: unknown,
  label: string,
  predicate: (item: Record<string, unknown>) => boolean,
): T[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid backup archive: "${label}" must be a JSON array.`);
  }
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!isObjectRecord(entry) || !predicate(entry)) {
      throw new Error(
        `Invalid backup archive: malformed record in "${label}" at index ${i}.`,
      );
    }
  }
  return raw as T[];
}

/**
 * Parses and strictly validates a Nexus backup ZIP archive before touching
 * any existing local IndexedDB records.
 */
export async function inspectBackupArchive(
  archive: Blob | ArrayBuffer | Uint8Array,
): Promise<ParsedBackupInspection> {
  let zip: JSZip;
  try {
    const { default: JSZipCtor } = await import('jszip');
    zip = await JSZipCtor.loadAsync(archive);
  } catch {
    throw new Error('Selected file is not a readable ZIP archive.');
  }

  const rawManifest = await readJsonFromZip<Record<string, unknown>>(
    zip,
    'manifest.json',
    true,
  );
  if (
    !isObjectRecord(rawManifest) ||
    rawManifest.format !== NEXUS_BACKUP_FORMAT ||
    typeof rawManifest.schemaVersion !== 'number'
  ) {
    throw new Error('Invalid backup archive: unrecognized manifest format.');
  }
  if (rawManifest.schemaVersion > NEXUS_BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup schema version (${rawManifest.schemaVersion}). Please upgrade Nexus before restoring.`,
    );
  }

  const manifest = rawManifest as unknown as BackupManifest;
  const warnings: string[] = [];

  const rawFolders = await readJsonFromZip<unknown>(
    zip,
    'data/folders.json',
    true,
  );
  const folders = validateArrayField<FolderRecord>(
    rawFolders,
    'data/folders.json',
    (item) => typeof item.id === 'string' && typeof item.name === 'string',
  );

  const rawNotes = await readJsonFromZip<unknown>(zip, 'data/notes.json', true);
  const notes = validateArrayField<NoteRecord>(
    rawNotes,
    'data/notes.json',
    (item) =>
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.content === 'string',
  );

  const rawTasks = await readJsonFromZip<unknown>(zip, 'data/tasks.json', true);
  const tasks = validateArrayField<TaskRecord>(
    rawTasks,
    'data/tasks.json',
    (item) => typeof item.id === 'string' && typeof item.title === 'string',
  );

  const rawEvents = await readJsonFromZip<unknown>(
    zip,
    'data/calendar_events.json',
    true,
  );
  const calendarEvents = validateArrayField<CalendarEventRecord>(
    rawEvents,
    'data/calendar_events.json',
    (item) =>
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.startAt === 'string' &&
      typeof item.endAt === 'string' &&
      !Number.isNaN(Date.parse(item.startAt)) &&
      !Number.isNaN(Date.parse(item.endAt)) &&
      Date.parse(item.endAt) >= Date.parse(item.startAt),
  );

  const rawAttachments = await readJsonFromZip<unknown>(
    zip,
    'data/attachments.json',
    true,
  );
  const attachmentsMeta = validateArrayField<BackupAttachmentMeta>(
    rawAttachments,
    'data/attachments.json',
    (item) =>
      typeof item.id === 'string' &&
      typeof item.noteId === 'string' &&
      typeof item.fileName === 'string' &&
      typeof item.archivePath === 'string',
  );

  const binaryBlobsByAttachmentId = new Map<string, Blob>();
  for (const meta of attachmentsMeta) {
    const entry = zip.file(meta.archivePath);
    if (!entry) {
      warnings.push(
        `Missing binary attachment "${meta.fileName}" (${meta.archivePath}).`,
      );
      continue;
    }
    const bytes = await entry.async('uint8array');
    const safeBytes = new Uint8Array(bytes.byteLength);
    safeBytes.set(bytes);
    const blob = new Blob([safeBytes], {
      type: meta.mimeType || 'application/octet-stream',
    });
    const safeName = sanitizeAttachmentFileName(meta.fileName);
    validateAttachmentFile(blob, safeName);
    binaryBlobsByAttachmentId.set(meta.id, blob);
  }

  const rawSettings = await readJsonFromZip<BackupSettingsSnapshot>(
    zip,
    'data/settings.json',
    false,
  );

  return {
    manifest,
    warnings,
    folders,
    notes,
    attachmentsMeta,
    tasks,
    calendarEvents,
    settings: isObjectRecord(rawSettings)
      ? (rawSettings as BackupSettingsSnapshot)
      : {},
    binaryBlobsByAttachmentId,
  };
}

/**
 * Validates and restores a Nexus backup archive into IndexedDB using either
 * `'merge'` (upsert without removing existing records) or `'replace'`
 * (clears existing local workspace tables after explicit user confirmation).
 */
export async function restoreBackupArchive(
  archive: Blob | ArrayBuffer | Uint8Array,
  mode: BackupRestoreMode,
): Promise<BackupRestoreSummary> {
  const inspected = await inspectBackupArchive(archive);
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [
      db.folders,
      db.notes,
      db.note_links,
      db.tags,
      db.note_tags,
      db.attachments,
      db.tasks,
      db.calendar_events,
      db.sync_changes,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.folders.clear(),
          db.notes.clear(),
          db.note_links.clear(),
          db.tags.clear(),
          db.note_tags.clear(),
          db.attachments.clear(),
          db.tasks.clear(),
          db.calendar_events.clear(),
          db.sync_changes.clear(),
        ]);
      }

      // 1. Folders
      for (const folder of inspected.folders) {
        const existing = await db.folders.get(folder.id);
        const rev = existing
          ? Math.max(existing.revision ?? 1, folder.revision ?? 1) + 1
          : (folder.revision ?? 1);
        await db.folders.put({
          ...folder,
          revision: rev,
          updatedAt: now,
        });
        await enqueueSyncChangeInTx(
          'folder',
          folder.id,
          existing ? 'update' : 'create',
          rev,
        );
      }

      // 2. Notes
      for (const note of inspected.notes) {
        const existing = await db.notes.get(note.id);
        const rev = existing
          ? Math.max(existing.revision, note.revision ?? 1) + 1
          : (note.revision ?? 1);
        await db.notes.put({
          ...note,
          revision: rev,
          updatedAt: now,
        });
        await enqueueSyncChangeInTx(
          'note',
          note.id,
          existing ? 'update' : 'create',
          rev,
        );
      }

      // 3. Rebuild links & tags across active notes
      const allActiveNotes = await db.notes
        .filter((n) => !n.deletedAt)
        .toArray();
      const allActiveFolders = await db.folders
        .filter((f) => !f.deletedAt)
        .toArray();
      const folderPathMap = buildFolderPathMap(allActiveFolders);

      await db.note_links.clear();
      await db.note_tags.clear();

      for (const note of allActiveNotes) {
        const parsedLinks = extractWikiLinks(note.content);
        const seen = new Set<string>();
        const newLinks: NoteLinkRecord[] = [];
        for (const link of parsedLinks) {
          const lower = link.target.trim().toLowerCase();
          if (!lower) continue;
          const match = allActiveNotes.find((candidate) => {
            if (lower.includes('/')) {
              const fp = candidate.folderId
                ? folderPathMap.get(candidate.folderId) ?? ''
                : '';
              const qualified = fp
                ? `${fp}/${candidate.title}`.toLowerCase()
                : candidate.title.toLowerCase();
              return qualified === lower;
            }
            return candidate.title.trim().toLowerCase() === lower;
          });
          const key = `${match?.id ?? 'unresolved'}::${lower}`;
          if (seen.has(key)) continue;
          seen.add(key);
          newLinks.push({
            id: createUuid(),
            sourceNoteId: note.id,
            targetNoteId: match?.id ?? null,
            targetTitle: link.target,
            rawText: link.raw,
            createdAt: now,
          });
        }
        if (newLinks.length > 0) {
          await db.note_links.bulkAdd(newLinks);
        }

        for (const tagName of extractTags(note.content)) {
          let tag = await db.tags.where('name').equals(tagName).first();
          if (!tag) {
            tag = { id: createUuid(), name: tagName, createdAt: now };
            await db.tags.add(tag);
          }
          await db.note_tags.add({
            id: createUuid(),
            noteId: note.id,
            tagId: tag.id,
          });
        }
      }

      // 4. Attachments
      let restoredAttCount = 0;
      for (const meta of inspected.attachmentsMeta) {
        const blob = inspected.binaryBlobsByAttachmentId.get(meta.id);
        if (!blob) continue;
        const safeName = sanitizeAttachmentFileName(meta.fileName);
        await db.attachments.put({
          id: meta.id,
          noteId: meta.noteId,
          fileName: safeName,
          mimeType: meta.mimeType,
          size: blob.size,
          data: blob,
          createdAt: meta.createdAt || now,
        });
        await enqueueSyncChangeInTx('attachment', meta.id, 'create', 1);
        restoredAttCount += 1;
      }
      void restoredAttCount;

      // 5. Tasks
      for (const task of inspected.tasks) {
        const existing = await db.tasks.get(task.id);
        const rev = existing
          ? Math.max(existing.revision, task.revision ?? 1) + 1
          : (task.revision ?? 1);
        await db.tasks.put({
          ...task,
          revision: rev,
          updatedAt: now,
        });
        await enqueueSyncChangeInTx(
          'task',
          task.id,
          existing ? 'update' : 'create',
          rev,
        );
      }

      // 6. Calendar Events
      for (const ev of inspected.calendarEvents) {
        const existing = await db.calendar_events.get(ev.id);
        const rev = existing
          ? Math.max(existing.revision, ev.revision ?? 1) + 1
          : (ev.revision ?? 1);
        await db.calendar_events.put({
          ...ev,
          revision: rev,
          updatedAt: now,
        });
        await enqueueSyncChangeInTx(
          'calendar_event',
          ev.id,
          existing ? 'update' : 'create',
          rev,
        );
      }
    },
  );

  notifySyncQueueMutated();
  const settingsRestored = writeSafeUiSettings(inspected.settings);

  return {
    mode,
    foldersRestored: inspected.folders.length,
    notesRestored: inspected.notes.length,
    attachmentsRestored: inspected.binaryBlobsByAttachmentId.size,
    tasksRestored: inspected.tasks.length,
    calendarEventsRestored: inspected.calendarEvents.length,
    settingsRestored,
  };
}
