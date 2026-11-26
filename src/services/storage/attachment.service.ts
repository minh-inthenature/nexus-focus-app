import { sanitizeFileName } from '@/features/notes/utils/markdown';
import {
  enqueueSyncChangeInTx,
  notifySyncQueueMutated,
} from '@/services/sync/syncQueue';
import { createUuid, db, type AttachmentRecord } from './db';

export const MAX_LOCAL_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const BLOCKED_ATTACHMENT_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-sh',
]);

const BLOCKED_ATTACHMENT_EXTENSIONS_RE =
  /\.(html?|xhtml|js|mjs|cjs|exe|bat|cmd|sh|ps1|vbs)$/i;

/**
 * Strips directory components and OS-unsafe characters from an uploaded filename.
 */
export function sanitizeAttachmentFileName(rawName: string): string {
  const leaf = rawName.split(/[/\\]/).pop() ?? '';
  const sanitized = sanitizeFileName(leaf);
  return sanitized || 'attachment';
}

/**
 * Validates size limits and rejects executable/script upload payloads.
 */
export function validateAttachmentFile(
  file: Pick<Blob, 'size' | 'type'>,
  resolvedName: string,
): void {
  if (file.size <= 0) {
    throw new Error('Cannot attach an empty file.');
  }
  if (file.size > MAX_LOCAL_ATTACHMENT_BYTES) {
    throw new Error('Attachment exceeds the 10 MB local size limit.');
  }
  const normalizedMime = file.type.trim().toLowerCase();
  if (BLOCKED_ATTACHMENT_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`File type "${normalizedMime}" is not permitted as an attachment.`);
  }
  if (BLOCKED_ATTACHMENT_EXTENSIONS_RE.test(resolvedName)) {
    throw new Error('Executable or script file types are not permitted as attachments.');
  }
}

/**
 * Storage adapter contract for note attachments.
 * Local reads/writes happen directly in IndexedDB; outbound/inbound Google Drive
 * attachment sync is coordinated by `syncEngine`.
 */
export interface AttachmentStorageAdapter {
  saveAttachment(file: File | Blob, noteId: string, fileName?: string): Promise<AttachmentRecord>;
  getAttachment(id: string): Promise<AttachmentRecord | null>;
  listAttachmentsForNote(noteId: string): Promise<AttachmentRecord[]>;
  deleteAttachment(id: string): Promise<void>;
  deleteUnusedAttachmentsForNote(
    noteId: string,
    referencedIds: readonly string[],
  ): Promise<number>;
}

export class IndexedDBAttachmentService implements AttachmentStorageAdapter {
  public async saveAttachment(
    file: File | Blob,
    noteId: string,
    fileName?: string,
  ): Promise<AttachmentRecord> {
    const rawName =
      fileName ?? (file instanceof File ? file.name : 'attachment');
    const resolvedName = sanitizeAttachmentFileName(rawName);
    validateAttachmentFile(file, resolvedName);
    const record: AttachmentRecord = {
      id: createUuid(),
      noteId,
      fileName: resolvedName,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data: file,
      createdAt: new Date().toISOString(),
    };

    await db.transaction('rw', [db.attachments, db.sync_changes], async () => {
      await db.attachments.add(record);
      await enqueueSyncChangeInTx('attachment', record.id, 'create', 1);
    });

    notifySyncQueueMutated();
    return record;
  }

  public async getAttachment(id: string): Promise<AttachmentRecord | null> {
    const record = await db.attachments.get(id);
    if (!record || record.deletedAt) return null;
    return record;
  }

  public async listAttachmentsForNote(
    noteId: string,
  ): Promise<AttachmentRecord[]> {
    const rows = await db.attachments.where('noteId').equals(noteId).toArray();
    return rows.filter((r) => !r.deletedAt);
  }

  public async deleteAttachment(id: string): Promise<void> {
    await db.transaction('rw', [db.attachments, db.sync_changes], async () => {
      const existing = await db.attachments.get(id);
      if (!existing) return;

      const res = await enqueueSyncChangeInTx('attachment', id, 'delete', 1);
      if (res === 'queued') {
        await db.attachments.update(id, {
          deletedAt: new Date().toISOString(),
        });
      } else {
        await db.attachments.delete(id);
      }
    });

    notifySyncQueueMutated();
  }

  public async deleteUnusedAttachmentsForNote(
    noteId: string,
    referencedIds: readonly string[],
  ): Promise<number> {
    const keep = new Set(referencedIds);
    let deleted = 0;

    await db.transaction('rw', [db.attachments, db.sync_changes], async () => {
      const existing = await db.attachments
        .where('noteId')
        .equals(noteId)
        .filter((a) => !a.deletedAt)
        .toArray();
      const now = new Date().toISOString();

      for (const attachment of existing) {
        if (!keep.has(attachment.id)) {
          const res = await enqueueSyncChangeInTx(
            'attachment',
            attachment.id,
            'delete',
            1,
          );
          if (res === 'queued') {
            await db.attachments.update(attachment.id, { deletedAt: now });
          } else {
            await db.attachments.delete(attachment.id);
          }
          deleted += 1;
        }
      }
    });

    if (deleted > 0) {
      notifySyncQueueMutated();
    }
    return deleted;
  }
}

export async function applyRemoteAttachmentUpsert(
  attachment: AttachmentRecord,
): Promise<void> {
  await db.attachments.put(attachment);
}

export async function purgeDeletedAttachmentTombstone(
  attachmentId: string,
): Promise<void> {
  await db.attachments.delete(attachmentId);
}

export const attachmentService: AttachmentStorageAdapter =
  new IndexedDBAttachmentService();
