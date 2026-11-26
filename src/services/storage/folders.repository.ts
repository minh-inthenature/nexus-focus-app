import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import { createUuid, db, type FolderRecord, type NoteRecord } from './db';

export interface FolderDescendantStats {
  readonly subfolderCount: number;
  readonly noteCount: number;
}

export type DeleteFolderMode = 'move-to-root' | 'delete-all';

/**
 * Lists all active (non-deleted) folders sorted alphabetically.
 */
export async function listFolders(): Promise<FolderRecord[]> {
  const all = await db.folders.filter((f) => !f.deletedAt).toArray();
  return all.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Lists all folders including soft-deleted tombstones (used by sync planner).
 */
export async function listAllFoldersIncludingDeleted(): Promise<FolderRecord[]> {
  return db.folders.toArray();
}

/**
 * Builds a map of folderId -> full slash-delimited path (e.g. "AI/Vision").
 */
export function buildFolderPathMap(
  folders: readonly FolderRecord[],
): Map<string, string> {
  const byId = new Map<string, FolderRecord>();
  for (const folder of folders) {
    byId.set(folder.id, folder);
  }

  const cache = new Map<string, string>();

  const resolvePath = (folderId: string, seen: Set<string>): string => {
    const cached = cache.get(folderId);
    if (cached !== undefined) return cached;

    const folder = byId.get(folderId);
    if (!folder) return '';
    if (seen.has(folderId)) return folder.name;

    seen.add(folderId);
    const path = folder.parentId
      ? `${resolvePath(folder.parentId, seen)}/${folder.name}`
      : folder.name;
    const normalized = path.replace(/^\/+/, '');
    cache.set(folderId, normalized);
    return normalized;
  };

  for (const folder of folders) {
    resolvePath(folder.id, new Set());
  }

  return cache;
}

/**
 * Creates a new folder under `parentId` (or root when `null`) with atomic
 * sync outbox tracking.
 */
export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<FolderRecord> {
  const trimmed = name.trim() || 'Untitled Folder';
  const now = new Date().toISOString();
  const folder: FolderRecord = {
    id: createUuid(),
    name: trimmed,
    parentId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', [db.folders, db.sync_changes], async () => {
    await db.folders.add(folder);
    await enqueueSyncChangeInTx('folder', folder.id, 'create', 1);
  });

  notifySyncQueueMutated();
  return folder;
}

/**
 * Finds or creates a nested folder hierarchy from path segments (e.g. ["AI", "Notes"]).
 */
export async function ensureFolderHierarchy(
  segments: readonly string[],
): Promise<string | null> {
  if (segments.length === 0) return null;

  let currentParentId: string | null = null;
  const existingFolders = await listFolders();

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const existing = existingFolders.find(
      (f) =>
        f.parentId === currentParentId &&
        f.name.toLowerCase() === segment.toLowerCase(),
    );

    if (existing) {
      currentParentId = existing.id;
    } else {
      const created = await createFolder(segment, currentParentId);
      existingFolders.push(created);
      currentParentId = created.id;
    }
  }

  return currentParentId;
}

/**
 * Renames an existing folder while preserving its UUID and child relationships.
 */
export async function renameFolder(
  folderId: string,
  newName: string,
): Promise<FolderRecord> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Folder name cannot be empty.');
  }

  const updated = await db.transaction(
    'rw',
    [db.folders, db.sync_changes],
    async () => {
      const existing = await db.folders.get(folderId);
      if (!existing || existing.deletedAt) {
        throw new Error('Folder not found.');
      }

      if (existing.name === trimmed) return existing;

      const nextRev = (existing.revision ?? 1) + 1;
      const next: FolderRecord = {
        ...existing,
        name: trimmed,
        revision: nextRev,
        updatedAt: new Date().toISOString(),
      };
      await db.folders.put(next);
      await enqueueSyncChangeInTx('folder', folderId, 'update', nextRev);
      return next;
    },
  );

  notifySyncQueueMutated();
  return updated;
}

function collectDescendantIds(
  rootId: string,
  folders: readonly FolderRecord[],
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Counts nested subfolders and notes under `folderId` for safe deletion confirmation.
 */
export async function getFolderDescendantStats(
  folderId: string,
): Promise<FolderDescendantStats> {
  const folders = await listFolders();
  const descendantIds = collectDescendantIds(folderId, folders);
  const subfolderCount = Math.max(0, descendantIds.size - 1);

  const notes = await db.notes
    .filter(
      (n) =>
        !n.deletedAt && n.folderId !== null && descendantIds.has(n.folderId),
    )
    .toArray();

  return {
    subfolderCount,
    noteCount: notes.length,
  };
}

/**
 * Deletes a folder atomically with tombstone preservation for synced entities.
 */
export async function deleteFolder(
  folderId: string,
  mode: DeleteFolderMode,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.folders,
      db.notes,
      db.note_links,
      db.note_tags,
      db.tags,
      db.attachments,
      db.note_revisions,
      db.drive_note_mappings,
      db.sync_changes,
    ],
    async () => {
      const folders = await db.folders.filter((f) => !f.deletedAt).toArray();
      const target = folders.find((f) => f.id === folderId);
      if (!target) return;

      const now = new Date().toISOString();

      if (mode === 'move-to-root') {
        const directSubfolders = folders.filter(
          (f) => f.parentId === folderId,
        );
        for (const sub of directSubfolders) {
          const nextRev = (sub.revision ?? 1) + 1;
          await db.folders.update(sub.id, {
            parentId: target.parentId,
            revision: nextRev,
            updatedAt: now,
          });
          await enqueueSyncChangeInTx('folder', sub.id, 'update', nextRev);
        }

        const directNotes = await db.notes
          .filter((n) => !n.deletedAt && n.folderId === folderId)
          .toArray();
        for (const note of directNotes) {
          const nextRev = note.revision + 1;
          await db.notes.update(note.id, {
            folderId: target.parentId,
            revision: nextRev,
            updatedAt: now,
          });
          await enqueueSyncChangeInTx('note', note.id, 'update', nextRev);
        }

        const nextFolderRev = (target.revision ?? 1) + 1;
        const folderQueueResult = await enqueueSyncChangeInTx(
          'folder',
          folderId,
          'delete',
          nextFolderRev,
        );
        if (folderQueueResult === 'queued') {
          await db.folders.update(folderId, {
            deletedAt: now,
            revision: nextFolderRev,
            updatedAt: now,
          });
        } else {
          await db.folders.delete(folderId);
        }
        return;
      }

      const descendantIds = collectDescendantIds(folderId, folders);
      const affectedNotes: NoteRecord[] = await db.notes
        .filter(
          (n) =>
            !n.deletedAt &&
            n.folderId !== null &&
            descendantIds.has(n.folderId),
        )
        .toArray();

      const deletedNoteIds = new Set(affectedNotes.map((n) => n.id));

      for (const note of affectedNotes) {
        await db.note_links.where('sourceNoteId').equals(note.id).delete();
        const incoming = await db.note_links
          .where('targetNoteId')
          .equals(note.id)
          .toArray();
        for (const link of incoming) {
          if (!deletedNoteIds.has(link.sourceNoteId)) {
            await db.note_links.update(link.id, { targetNoteId: null });
          }
        }
        await db.note_tags.where('noteId').equals(note.id).delete();
        await db.note_revisions.where('noteId').equals(note.id).delete();

        const attachments = await db.attachments
          .where('noteId')
          .equals(note.id)
          .toArray();
        for (const att of attachments) {
          const attRes = await enqueueSyncChangeInTx(
            'attachment',
            att.id,
            'delete',
            1,
          );
          if (attRes === 'queued') {
            await db.attachments.update(att.id, { deletedAt: now });
          } else {
            await db.attachments.delete(att.id);
          }
        }

        const nextRev = note.revision + 1;
        const hasMapping = Boolean(
          await db.drive_note_mappings
            .where('localNoteId')
            .equals(note.id)
            .first(),
        );
        const noteRes = await enqueueSyncChangeInTx(
          'note',
          note.id,
          'delete',
          nextRev,
        );
        if (noteRes === 'queued' || hasMapping) {
          await db.notes.update(note.id, {
            deletedAt: now,
            revision: nextRev,
            updatedAt: now,
          });
        } else {
          await db.notes.delete(note.id);
        }
      }

      for (const id of descendantIds) {
        const folderObj = folders.find((f) => f.id === id);
        const nextRev = (folderObj?.revision ?? 1) + 1;
        const res = await enqueueSyncChangeInTx(
          'folder',
          id,
          'delete',
          nextRev,
        );
        if (res === 'queued') {
          await db.folders.update(id, {
            deletedAt: now,
            revision: nextRev,
            updatedAt: now,
          });
        } else {
          await db.folders.delete(id);
        }
      }

      // Prune orphaned tags
      const allTags = await db.tags.toArray();
      for (const tag of allTags) {
        const count = await db.note_tags.where('tagId').equals(tag.id).count();
        if (count === 0) {
          await db.tags.delete(tag.id);
        }
      }
    },
  );

  notifySyncQueueMutated();
}

/**
 * Applies a remote folder upsert into IndexedDB without creating an outbound
 * sync change (preventing echo loops).
 */
export async function applyRemoteFolderUpsert(
  folder: FolderRecord,
): Promise<void> {
  await db.folders.put(folder);
}

/**
 * Removes a local folder and cleans up tombstone after remote deletion syncs.
 */
export async function purgeDeletedFolderTombstone(
  folderId: string,
): Promise<void> {
  await db.folders.delete(folderId);
}
