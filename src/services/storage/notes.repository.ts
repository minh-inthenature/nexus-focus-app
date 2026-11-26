import {
  extractTags,
  extractWikiLinks,
  formatDailyNoteDate,
  rewriteWikiLinksForRename,
} from '@/features/notes/utils/markdown';
import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import {
  createUuid,
  db,
  type FolderRecord,
  type NoteLinkRecord,
  type NoteRecord,
  type NoteRevisionRecord,
} from './db';
import { buildFolderPathMap, ensureFolderHierarchy } from './folders.repository';

export interface CreateNoteInput {
  readonly title?: string;
  readonly folderId?: string | null;
  readonly content?: string;
  readonly isDaily?: boolean;
  readonly dailyDate?: string;
}

export interface TagWithCount {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

const MAX_REVISIONS_PER_NOTE = 20;

/**
 * Resolves a wiki-link target string (e.g. `"Deep Learning"` or `"AI/Deep Learning"`)
 * against active notes using folder path disambiguation and prior link UUIDs.
 */
function resolveTargetNoteId(
  targetText: string,
  allNotes: readonly NoteRecord[],
  folderPathMap: ReadonlyMap<string, string>,
  previousTargetId?: string | null,
): string | null {
  const normalized = targetText.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('/')) {
    const pathMatches = allNotes.filter((note) => {
      const folderPath = note.folderId
        ? folderPathMap.get(note.folderId) ?? ''
        : '';
      const qualified = folderPath
        ? `${folderPath}/${note.title}`.toLowerCase()
        : note.title.toLowerCase();
      return qualified === normalized;
    });
    if (pathMatches.length === 1 && pathMatches[0]) {
      return pathMatches[0].id;
    }
  }

  const titleMatches = allNotes.filter(
    (note) => note.title.trim().toLowerCase() === normalized,
  );
  if (titleMatches.length === 1 && titleMatches[0]) {
    return titleMatches[0].id;
  }

  if (titleMatches.length > 1 && previousTargetId) {
    const preserved = titleMatches.find((m) => m.id === previousTargetId);
    if (preserved) return preserved.id;
  }

  return null;
}

async function syncNoteLinksAndTags(
  note: NoteRecord,
  allNotes: readonly NoteRecord[],
  allFolders: readonly FolderRecord[],
): Promise<void> {
  const folderPathMap = buildFolderPathMap(allFolders);
  const previousOutgoing = await db.note_links
    .where('sourceNoteId')
    .equals(note.id)
    .toArray();
  const prevByTarget = new Map<string, string>();
  for (const prev of previousOutgoing) {
    if (prev.targetNoteId) {
      prevByTarget.set(prev.targetTitle.trim().toLowerCase(), prev.targetNoteId);
    }
  }

  await db.note_links.where('sourceNoteId').equals(note.id).delete();

  const parsedLinks = extractWikiLinks(note.content);
  const now = new Date().toISOString();
  const seenLinkKey = new Set<string>();
  const newLinks: NoteLinkRecord[] = [];

  for (const link of parsedLinks) {
    const lowerTarget = link.target.toLowerCase();
    const prevId = prevByTarget.get(lowerTarget) ?? null;
    const targetNoteId = resolveTargetNoteId(
      link.target,
      allNotes,
      folderPathMap,
      prevId,
    );
    const dedupeKey = `${targetNoteId ?? 'unresolved'}::${lowerTarget}`;
    if (seenLinkKey.has(dedupeKey)) continue;
    seenLinkKey.add(dedupeKey);

    newLinks.push({
      id: createUuid(),
      sourceNoteId: note.id,
      targetNoteId,
      targetTitle: link.target,
      rawText: link.raw,
      createdAt: now,
    });
  }

  if (newLinks.length > 0) {
    await db.note_links.bulkAdd(newLinks);
  }

  const extractedTags = extractTags(note.content);
  await db.note_tags.where('noteId').equals(note.id).delete();

  for (const tagName of extractedTags) {
    let tag = await db.tags.where('name').equals(tagName).first();
    if (!tag) {
      tag = {
        id: createUuid(),
        name: tagName,
        createdAt: now,
      };
      await db.tags.add(tag);
    }

    await db.note_tags.add({
      id: createUuid(),
      noteId: note.id,
      tagId: tag.id,
    });
  }

  const allTags = await db.tags.toArray();
  for (const tag of allTags) {
    const count = await db.note_tags.where('tagId').equals(tag.id).count();
    if (count === 0) {
      await db.tags.delete(tag.id);
    }
  }
}

async function resolveUnresolvedLinksToNote(
  note: NoteRecord,
  allNotes: readonly NoteRecord[],
  allFolders: readonly FolderRecord[],
): Promise<void> {
  const folderPathMap = buildFolderPathMap(allFolders);
  const unresolved = await db.note_links
    .filter((link) => link.targetNoteId === null)
    .toArray();

  for (const link of unresolved) {
    const resolvedId = resolveTargetNoteId(
      link.targetTitle,
      allNotes,
      folderPathMap,
    );
    if (resolvedId === note.id) {
      await db.note_links.update(link.id, { targetNoteId: note.id });
    }
  }
}

async function appendRevisionSnapshot(note: NoteRecord): Promise<void> {
  const revisionEntry: NoteRevisionRecord = {
    id: createUuid(),
    noteId: note.id,
    title: note.title,
    content: note.content,
    revision: note.revision,
    createdAt: note.updatedAt,
  };
  await db.note_revisions.add(revisionEntry);

  const revisions = await db.note_revisions
    .where('noteId')
    .equals(note.id)
    .sortBy('revision');
  if (revisions.length > MAX_REVISIONS_PER_NOTE) {
    const excess = revisions.slice(0, revisions.length - MAX_REVISIONS_PER_NOTE);
    for (const old of excess) {
      await db.note_revisions.delete(old.id);
    }
  }
}

/**
 * Lists all active notes sorted alphabetically by title.
 */
export async function listNotes(): Promise<NoteRecord[]> {
  const notes = await db.notes.filter((n) => !n.deletedAt).toArray();
  return notes.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Lists all notes including soft-deleted tombstones (used by sync planner).
 */
export async function listAllNotesIncludingDeleted(): Promise<NoteRecord[]> {
  return db.notes.toArray();
}

/**
 * Fetches a single active note by UUID.
 */
export async function getNoteById(noteId: string): Promise<NoteRecord | null> {
  const note = await db.notes.get(noteId);
  if (!note || note.deletedAt) return null;
  return note;
}

/**
 * Creates a new note with UUID identity, syncing links, tags, initial revision,
 * and transactional sync outbox entry.
 */
export async function createNote(
  input: CreateNoteInput = {},
): Promise<NoteRecord> {
  const created = await db.transaction(
    'rw',
    [
      db.notes,
      db.folders,
      db.note_links,
      db.tags,
      db.note_tags,
      db.note_revisions,
      db.sync_changes,
    ],
    async () => {
      const now = new Date().toISOString();
      const note: NoteRecord = {
        id: createUuid(),
        folderId: input.folderId ?? null,
        title: input.title?.trim() || 'Untitled Note',
        content: input.content ?? '',
        isFavorite: false,
        isDaily: Boolean(input.isDaily),
        ...(input.dailyDate ? { dailyDate: input.dailyDate } : {}),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };

      await db.notes.add(note);
      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();

      await syncNoteLinksAndTags(note, allNotes, allFolders);
      await resolveUnresolvedLinksToNote(note, allNotes, allFolders);
      await appendRevisionSnapshot(note);
      await enqueueSyncChangeInTx('note', note.id, 'create', note.revision);

      return note;
    },
  );

  notifySyncQueueMutated();
  return created;
}

/**
 * Updates note Markdown content inside an atomic transaction, avoiding redundant
 * writes when content is unchanged.
 */
export async function updateNoteContent(
  noteId: string,
  content: string,
): Promise<NoteRecord> {
  let didWrite = false;

  const updated = await db.transaction(
    'rw',
    [
      db.notes,
      db.folders,
      db.note_links,
      db.tags,
      db.note_tags,
      db.note_revisions,
      db.sync_changes,
    ],
    async () => {
      const existing = await db.notes.get(noteId);
      if (!existing || existing.deletedAt) {
        throw new Error('Note not found.');
      }

      if (existing.content === content) {
        return existing;
      }

      const next: NoteRecord = {
        ...existing,
        content,
        revision: existing.revision + 1,
        updatedAt: new Date().toISOString(),
      };

      await db.notes.put(next);
      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();

      await syncNoteLinksAndTags(next, allNotes, allFolders);
      await appendRevisionSnapshot(next);
      await enqueueSyncChangeInTx('note', next.id, 'update', next.revision);
      didWrite = true;

      return next;
    },
  );

  if (didWrite) {
    notifySyncQueueMutated();
  }
  return updated;
}

/**
 * Renames a note by UUID and updates incoming `[[Old Title]]` Markdown links
 * across referencing notes, enqueuing sync updates for all modified notes.
 */
export async function renameNote(
  noteId: string,
  newTitle: string,
): Promise<NoteRecord> {
  const trimmed = newTitle.trim();
  if (!trimmed) {
    throw new Error('Note title cannot be empty.');
  }

  let didWrite = false;

  const updatedTarget = await db.transaction(
    'rw',
    [
      db.notes,
      db.folders,
      db.note_links,
      db.tags,
      db.note_tags,
      db.note_revisions,
      db.sync_changes,
    ],
    async () => {
      const existing = await db.notes.get(noteId);
      if (!existing || existing.deletedAt) {
        throw new Error('Note not found.');
      }

      if (existing.title === trimmed) {
        return existing;
      }

      const oldTitle = existing.title;
      const now = new Date().toISOString();
      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();
      const folderPathMap = buildFolderPathMap(allFolders);
      const targetFolderPath = existing.folderId
        ? folderPathMap.get(existing.folderId)
        : undefined;

      const incomingLinks = await db.note_links
        .where('targetNoteId')
        .equals(noteId)
        .toArray();
      const sourceIds = new Set(incomingLinks.map((l) => l.sourceNoteId));

      let updatedSelfContent = existing.content;
      for (const sourceId of sourceIds) {
        const sourceNote = await db.notes.get(sourceId);
        if (!sourceNote || sourceNote.deletedAt) continue;

        const rewritten = rewriteWikiLinksForRename(
          sourceNote.content,
          oldTitle,
          trimmed,
          targetFolderPath,
        );

        if (rewritten !== sourceNote.content) {
          if (sourceId === noteId) {
            updatedSelfContent = rewritten;
          } else {
            const nextSource: NoteRecord = {
              ...sourceNote,
              content: rewritten,
              revision: sourceNote.revision + 1,
              updatedAt: now,
            };
            await db.notes.put(nextSource);
            await appendRevisionSnapshot(nextSource);
            await enqueueSyncChangeInTx(
              'note',
              nextSource.id,
              'update',
              nextSource.revision,
            );
          }
        }
      }

      const nextTarget: NoteRecord = {
        ...existing,
        title: trimmed,
        content: updatedSelfContent,
        revision: existing.revision + 1,
        updatedAt: now,
      };
      await db.notes.put(nextTarget);

      for (const link of incomingLinks) {
        const nextTitle =
          link.targetTitle.includes('/') && targetFolderPath
            ? `${targetFolderPath}/${trimmed}`
            : trimmed;
        await db.note_links.update(link.id, {
          targetTitle: nextTitle,
          rawText: `[[${nextTitle}]]`,
        });
      }

      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      await resolveUnresolvedLinksToNote(nextTarget, allNotes, allFolders);
      await appendRevisionSnapshot(nextTarget);
      await enqueueSyncChangeInTx(
        'note',
        nextTarget.id,
        'update',
        nextTarget.revision,
      );
      didWrite = true;

      return nextTarget;
    },
  );

  if (didWrite) {
    notifySyncQueueMutated();
  }
  return updatedTarget;
}

/**
 * Moves a note to a different folder (`null` for root) with outbox tracking.
 */
export async function moveNote(
  noteId: string,
  folderId: string | null,
): Promise<NoteRecord> {
  let didWrite = false;

  const updated = await db.transaction(
    'rw',
    [db.notes, db.sync_changes],
    async () => {
      const existing = await db.notes.get(noteId);
      if (!existing || existing.deletedAt) {
        throw new Error('Note not found.');
      }

      if (existing.folderId === folderId) return existing;

      const next: NoteRecord = {
        ...existing,
        folderId,
        revision: existing.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await db.notes.put(next);
      await enqueueSyncChangeInTx('note', next.id, 'update', next.revision);
      didWrite = true;
      return next;
    },
  );

  if (didWrite) {
    notifySyncQueueMutated();
  }
  return updated;
}

/**
 * Toggles the favorite flag on a note with outbox tracking.
 */
export async function toggleFavoriteNote(noteId: string): Promise<NoteRecord> {
  const updated = await db.transaction(
    'rw',
    [db.notes, db.sync_changes],
    async () => {
      const existing = await db.notes.get(noteId);
      if (!existing || existing.deletedAt) {
        throw new Error('Note not found.');
      }

      const next: NoteRecord = {
        ...existing,
        isFavorite: !existing.isFavorite,
        revision: existing.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await db.notes.put(next);
      await enqueueSyncChangeInTx('note', next.id, 'update', next.revision);
      return next;
    },
  );

  notifySyncQueueMutated();
  return updated;
}

/**
 * Deletes a note. If the note has been synced previously (or has no pending
 * create), preserves a `deletedAt` tombstone until remote deletion succeeds.
 */
export async function deleteNote(noteId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.notes,
      db.note_links,
      db.tags,
      db.note_tags,
      db.attachments,
      db.note_revisions,
      db.drive_note_mappings,
      db.sync_changes,
    ],
    async () => {
      const existing = await db.notes.get(noteId);
      if (!existing) return;

      const now = new Date().toISOString();

      await db.note_links.where('sourceNoteId').equals(noteId).delete();

      const incoming = await db.note_links
        .where('targetNoteId')
        .equals(noteId)
        .toArray();
      for (const link of incoming) {
        await db.note_links.update(link.id, { targetNoteId: null });
      }

      await db.note_tags.where('noteId').equals(noteId).delete();
      await db.note_revisions.where('noteId').equals(noteId).delete();

      const attachments = await db.attachments
        .where('noteId')
        .equals(noteId)
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

      const nextRev = existing.revision + 1;
      const hasMapping = Boolean(
        await db.drive_note_mappings
          .where('localNoteId')
          .equals(noteId)
          .first(),
      );
      const noteRes = await enqueueSyncChangeInTx(
        'note',
        noteId,
        'delete',
        nextRev,
      );

      if (noteRes === 'queued' || hasMapping) {
        await db.notes.update(noteId, {
          deletedAt: now,
          revision: nextRev,
          updatedAt: now,
        });
      } else {
        await db.notes.delete(noteId);
      }

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
 * Purges a locally tombstoned note once remote deletion has succeeded.
 */
export async function purgeDeletedNoteTombstone(noteId: string): Promise<void> {
  await db.notes.delete(noteId);
}

/**
 * Applies a remote note state into IndexedDB without enqueuing an outbound
 * sync change, preserving wiki-links, tags, and revision history.
 */
export async function applyRemoteNoteUpsert(note: NoteRecord): Promise<void> {
  await db.transaction(
    'rw',
    [db.notes, db.folders, db.note_links, db.tags, db.note_tags, db.note_revisions],
    async () => {
      await db.notes.put(note);
      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();
      await syncNoteLinksAndTags(note, allNotes, allFolders);
      await resolveUnresolvedLinksToNote(note, allNotes, allFolders);
      await appendRevisionSnapshot(note);
    },
  );
}

/**
 * Applies a remote note deletion locally without creating an outbound sync change.
 */
export async function applyRemoteNoteDelete(noteId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.notes, db.note_links, db.tags, db.note_tags, db.attachments, db.note_revisions],
    async () => {
      await db.note_links.where('sourceNoteId').equals(noteId).delete();
      const incoming = await db.note_links
        .where('targetNoteId')
        .equals(noteId)
        .toArray();
      for (const link of incoming) {
        await db.note_links.update(link.id, { targetNoteId: null });
      }
      await db.note_tags.where('noteId').equals(noteId).delete();
      await db.note_revisions.where('noteId').equals(noteId).delete();
      await db.attachments.where('noteId').equals(noteId).delete();
      await db.notes.delete(noteId);

      const allTags = await db.tags.toArray();
      for (const tag of allTags) {
        const count = await db.note_tags.where('tagId').equals(tag.id).count();
        if (count === 0) {
          await db.tags.delete(tag.id);
        }
      }
    },
  );
}

/**
 * Resolves an ambiguous `[[Duplicate Title]]` wiki-link in `sourceNoteId`.
 */
export async function disambiguateWikiLink(
  sourceNoteId: string,
  oldTargetText: string,
  targetNoteId: string,
): Promise<NoteRecord> {
  const updated = await db.transaction(
    'rw',
    [
      db.notes,
      db.folders,
      db.note_links,
      db.tags,
      db.note_tags,
      db.note_revisions,
      db.sync_changes,
    ],
    async () => {
      const sourceNote = await db.notes.get(sourceNoteId);
      const targetNote = await db.notes.get(targetNoteId);
      if (!sourceNote || !targetNote) {
        throw new Error('Source or target note not found.');
      }

      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();
      const folderPathMap = buildFolderPathMap(allFolders);
      const folderPath = targetNote.folderId
        ? folderPathMap.get(targetNote.folderId)
        : undefined;
      const qualifiedTarget = folderPath
        ? `${folderPath}/${targetNote.title}`
        : targetNote.title;

      let nextContent = sourceNote.content;
      if (qualifiedTarget !== oldTargetText) {
        nextContent = rewriteWikiLinksForRename(
          sourceNote.content,
          oldTargetText,
          qualifiedTarget,
        );
      }

      const next: NoteRecord = {
        ...sourceNote,
        content: nextContent,
        revision:
          nextContent !== sourceNote.content
            ? sourceNote.revision + 1
            : sourceNote.revision,
        updatedAt: new Date().toISOString(),
      };
      await db.notes.put(next);

      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      await syncNoteLinksAndTags(next, allNotes, allFolders);

      const rows = await db.note_links
        .where('sourceNoteId')
        .equals(sourceNoteId)
        .toArray();
      for (const row of rows) {
        if (
          row.targetTitle.trim().toLowerCase() ===
          qualifiedTarget.trim().toLowerCase()
        ) {
          await db.note_links.update(row.id, { targetNoteId });
        }
      }

      if (next.revision !== sourceNote.revision) {
        await enqueueSyncChangeInTx('note', next.id, 'update', next.revision);
      }

      return next;
    },
  );

  notifySyncQueueMutated();
  return updated;
}

/**
 * Returns source notes that link to `noteId` via `note_links`.
 */
export async function getBacklinks(noteId: string): Promise<NoteRecord[]> {
  const incoming = await db.note_links
    .where('targetNoteId')
    .equals(noteId)
    .toArray();
  const sourceIds = Array.from(
    new Set(
      incoming
        .map((l) => l.sourceNoteId)
        .filter((sourceId) => sourceId !== noteId),
    ),
  );
  if (sourceIds.length === 0) return [];

  const sourceNotes = await db.notes.bulkGet(sourceIds);
  return sourceNotes
    .filter((n): n is NoteRecord => Boolean(n && !n.deletedAt))
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    );
}

/**
 * Lists all unique tags with usage counts and a map of `noteId -> tagName[]`.
 */
export async function listTagsAndMappings(): Promise<{
  tags: TagWithCount[];
  noteTagsMap: Map<string, string[]>;
}> {
  const [allTags, allMappings, activeNotes] = await Promise.all([
    db.tags.toArray(),
    db.note_tags.toArray(),
    db.notes.filter((n) => !n.deletedAt).toArray(),
  ]);

  const activeNoteIds = new Set(activeNotes.map((n) => n.id));
  const tagById = new Map(allTags.map((t) => [t.id, t]));
  const counts = new Map<string, number>();
  const noteTagsMap = new Map<string, string[]>();

  for (const mapping of allMappings) {
    if (!activeNoteIds.has(mapping.noteId)) continue;
    const tag = tagById.get(mapping.tagId);
    if (!tag) continue;

    counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
    const list = noteTagsMap.get(mapping.noteId) ?? [];
    list.push(tag.name);
    noteTagsMap.set(mapping.noteId, list);
  }

  const tags: TagWithCount[] = allTags
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: counts.get(tag.id) ?? 0,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { tags, noteTagsMap };
}

/**
 * Returns or creates the single Daily Note for `dateStr` (`YYYY-MM-DD`).
 */
export async function getOrCreateDailyNote(
  dateStr: string = formatDailyNoteDate(),
): Promise<NoteRecord> {
  const existing = await db.notes
    .filter((n) => !n.deletedAt && n.isDaily && n.dailyDate === dateStr)
    .first();
  if (existing) return existing;

  const dailyFolderId = await ensureFolderHierarchy(['Daily Notes']);
  let createdNew = false;

  const note = await db.transaction(
    'rw',
    [
      db.notes,
      db.folders,
      db.note_links,
      db.tags,
      db.note_tags,
      db.note_revisions,
      db.sync_changes,
    ],
    async () => {
      const recheck = await db.notes
        .filter((n) => !n.deletedAt && n.isDaily && n.dailyDate === dateStr)
        .first();
      if (recheck) return recheck;

      const now = new Date().toISOString();
      const created: NoteRecord = {
        id: createUuid(),
        folderId: dailyFolderId,
        title: dateStr,
        content: `# ${dateStr}\n\n#daily-note\n\n## Notes\n\n\n## Tasks\n- [ ] \n`,
        isFavorite: false,
        isDaily: true,
        dailyDate: dateStr,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };

      await db.notes.add(created);
      const allNotes = await db.notes.filter((n) => !n.deletedAt).toArray();
      const allFolders = await db.folders.filter((f) => !f.deletedAt).toArray();

      await syncNoteLinksAndTags(created, allNotes, allFolders);
      await resolveUnresolvedLinksToNote(created, allNotes, allFolders);
      await appendRevisionSnapshot(created);
      await enqueueSyncChangeInTx('note', created.id, 'create', created.revision);
      createdNew = true;

      return created;
    },
  );

  if (createdNew) {
    notifySyncQueueMutated();
  }
  return note;
}

/**
 * Finds adjacent existing daily notes relative to `dailyDate`, if any.
 */
export async function getAdjacentDailyNotes(dailyDate: string): Promise<{
  prev: NoteRecord | null;
  next: NoteRecord | null;
}> {
  const dailyNotes = await db.notes
    .filter((n) => !n.deletedAt && n.isDaily && Boolean(n.dailyDate))
    .toArray();
  const sorted = dailyNotes.sort((a, b) =>
    (a.dailyDate ?? '').localeCompare(b.dailyDate ?? ''),
  );

  let prev: NoteRecord | null = null;
  let next: NoteRecord | null = null;
  for (const note of sorted) {
    const date = note.dailyDate ?? '';
    if (date < dailyDate) {
      prev = note;
    } else if (date > dailyDate && !next) {
      next = note;
    }
  }

  return { prev, next };
}
