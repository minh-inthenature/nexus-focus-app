import Dexie, { type Table } from 'dexie';
import type { OfflineOperation } from '@/services/storage/storage.service';
import type {
  SyncChange,
  SyncConflictRecord,
  SyncMetaRecord,
} from '@/services/sync/syncTypes';
import type { EntityId, ISODateString } from '@/types/common';

export interface FolderRecord {
  readonly id: EntityId;
  readonly name: string;
  readonly parentId: EntityId | null;
  readonly revision?: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export type NoteType = 'markdown' | 'code' | 'canvas';
export type CodeLanguage =
  | 'cpp'
  | 'python'
  | 'c'
  | 'typescript'
  | 'javascript';

export interface NoteRecord {
  readonly id: EntityId;
  readonly folderId: EntityId | null;
  readonly title: string;
  readonly content: string;
  readonly type?: NoteType;
  readonly language?: CodeLanguage;
  readonly isFavorite: boolean;
  readonly isDaily: boolean;
  readonly dailyDate?: string;
  readonly revision: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export interface NoteLinkRecord {
  readonly id: EntityId;
  readonly sourceNoteId: EntityId;
  readonly targetNoteId: EntityId | null;
  readonly targetTitle: string;
  readonly rawText: string;
  readonly createdAt: ISODateString;
}

export interface TagRecord {
  readonly id: EntityId;
  readonly name: string;
  readonly createdAt: ISODateString;
}

export interface NoteTagRecord {
  readonly id: EntityId;
  readonly noteId: EntityId;
  readonly tagId: EntityId;
}

export interface AttachmentRecord {
  readonly id: EntityId;
  readonly noteId: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly data: Blob;
  readonly createdAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskRecord {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly tags: readonly string[];
  readonly category?: string;
  readonly group?: string;
  readonly isBacklog?: boolean;
  readonly linkedNoteIds: readonly EntityId[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly completedAt?: ISODateString;
  readonly deletedAt?: ISODateString;
  readonly revision: number;
  readonly lastSyncedRevision?: number;
  readonly lastSyncedUpdatedAt?: ISODateString;
}

export type EventCategory =
  | 'study'
  | 'work'
  | 'personal'
  | 'meeting'
  | 'other';

export type EventColor =
  | 'blue'
  | 'sage'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'slate';

export interface CalendarEventRecord {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly title: string;
  readonly description?: string;
  readonly location?: string;
  readonly startAt: ISODateString;
  readonly endAt: ISODateString;
  readonly allDay: boolean;
  readonly timezone?: string;
  readonly category: EventCategory;
  readonly color?: EventColor | string;
  readonly linkedNoteIds: readonly EntityId[];
  readonly linkedTaskIds: readonly EntityId[];
  readonly rrule?: string;
  readonly exdates?: readonly string[];
  readonly googleEventId?: string;
  readonly googleCalendarId?: string;
  readonly googleEtag?: string;
  readonly googleUpdatedAt?: ISODateString;
  readonly googleSyncedRevision?: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
  readonly revision: number;
  readonly lastSyncedRevision?: number;
  readonly lastSyncedUpdatedAt?: ISODateString;
}

export interface NoteRevisionRecord {
  readonly id: EntityId;
  readonly noteId: EntityId;
  readonly title: string;
  readonly content: string;
  readonly revision: number;
  readonly createdAt: ISODateString;
}

export interface DriveNoteMappingRecord {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly localNoteId: EntityId;
  readonly driveFileId: string;
  readonly driveFolderId: string;
  readonly driveFileName?: string;
  readonly lastKnownModifiedTime?: ISODateString;
  readonly lastKnownChecksum?: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * Single local-first IndexedDB database for Nexus powered by Dexie.js.
 * Schema upgrades must increment version numbers rather than recreating stores
 * so existing local data is preserved.
 */
export class NexusDatabase extends Dexie {
  folders!: Table<FolderRecord, EntityId>;
  notes!: Table<NoteRecord, EntityId>;
  note_links!: Table<NoteLinkRecord, EntityId>;
  tags!: Table<TagRecord, EntityId>;
  note_tags!: Table<NoteTagRecord, EntityId>;
  attachments!: Table<AttachmentRecord, EntityId>;
  note_revisions!: Table<NoteRevisionRecord, EntityId>;
  offline_operations!: Table<OfflineOperation, EntityId>;
  drive_note_mappings!: Table<DriveNoteMappingRecord, EntityId>;
  sync_changes!: Table<SyncChange, EntityId>;
  sync_conflicts!: Table<SyncConflictRecord, EntityId>;
  sync_meta!: Table<SyncMetaRecord, string>;
  tasks!: Table<TaskRecord, EntityId>;
  calendar_events!: Table<CalendarEventRecord, EntityId>;

  constructor() {
    super('nexus_db');

    this.version(1).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
    });

    this.version(2).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
      drive_note_mappings: 'id, &localNoteId, driveFileId, userId, updatedAt',
    });

    this.version(3).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt, deletedAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
      drive_note_mappings: 'id, &localNoteId, driveFileId, userId, updatedAt',
      sync_changes: 'id, entityType, entityId, status, createdAt, [entityType+entityId]',
      sync_conflicts: 'id, entityType, entityId, createdAt',
      sync_meta: 'key',
    });

    this.version(4).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt, deletedAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
      drive_note_mappings: 'id, &localNoteId, driveFileId, userId, updatedAt',
      sync_changes: 'id, entityType, entityId, status, createdAt, [entityType+entityId]',
      sync_conflicts: 'id, entityType, entityId, createdAt',
      sync_meta: 'key',
      tasks: 'id, userId, status, priority, dueDate, startDate, category, updatedAt, deletedAt',
    });

    this.version(5).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt, deletedAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
      drive_note_mappings: 'id, &localNoteId, driveFileId, userId, updatedAt',
      sync_changes: 'id, entityType, entityId, status, createdAt, [entityType+entityId]',
      sync_conflicts: 'id, entityType, entityId, createdAt',
      sync_meta: 'key',
      tasks: 'id, userId, status, priority, dueDate, startDate, category, updatedAt, deletedAt',
      calendar_events: 'id, userId, startAt, endAt, allDay, category, updatedAt, deletedAt',
    });

    this.version(6).stores({
      folders: 'id, parentId, name, updatedAt, deletedAt',
      notes: 'id, folderId, title, isFavorite, isDaily, dailyDate, updatedAt, deletedAt',
      note_links: 'id, sourceNoteId, targetNoteId, targetTitle, [sourceNoteId+targetNoteId]',
      tags: 'id, &name',
      note_tags: 'id, noteId, tagId, [noteId+tagId]',
      attachments: 'id, noteId, fileName, mimeType, createdAt, deletedAt',
      note_revisions: 'id, noteId, revision, createdAt',
      offline_operations: 'id, entityType, entityId, queuedAt',
      drive_note_mappings: 'id, &localNoteId, driveFileId, userId, updatedAt',
      sync_changes: 'id, entityType, entityId, status, createdAt, [entityType+entityId]',
      sync_conflicts: 'id, entityType, entityId, createdAt',
      sync_meta: 'key',
      tasks: 'id, userId, status, priority, dueDate, startDate, category, updatedAt, deletedAt',
      calendar_events: 'id, userId, startAt, endAt, allDay, category, googleEventId, updatedAt, deletedAt',
    });
  }
}

export const db = new NexusDatabase();

export function createUuid(): EntityId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122-v4 generator for restricted contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
