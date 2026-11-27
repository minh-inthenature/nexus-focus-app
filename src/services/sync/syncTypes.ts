import type {
  CodeLanguage,
  EventCategory,
  NoteType,
  TaskPriority,
  TaskStatus,
} from '@/services/storage/db';
import type { EntityId, ISODateString } from '@/types/common';

export type SyncEntityType =
  | 'note'
  | 'folder'
  | 'attachment'
  | 'task'
  | 'calendar_event';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncChangeStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncChange {
  readonly id: EntityId;
  readonly entityType: SyncEntityType;
  readonly entityId: EntityId;
  readonly operation: SyncOperation;
  readonly localRevision: number;
  readonly createdAt: ISODateString;
  readonly status: SyncChangeStatus;
  readonly retryCount: number;
  readonly lastError?: string;
}

export interface RemoteTaskMetadata {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly title: string;
  readonly description?: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly tags: readonly string[];
  readonly category?: string | null;
  readonly groupName?: string | null;
  readonly isBacklog?: boolean;
  readonly linkedNoteIds: readonly EntityId[];
  readonly revision: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly completedAt?: ISODateString | null;
  readonly deletedAt?: ISODateString | null;
}

export interface RemoteCalendarEventMetadata {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly title: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly startAt: ISODateString;
  readonly endAt: ISODateString;
  readonly allDay: boolean;
  readonly timezone?: string | null;
  readonly category: EventCategory;
  readonly color?: string | null;
  readonly linkedNoteIds: readonly EntityId[];
  readonly linkedTaskIds: readonly EntityId[];
  readonly revision: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString | null;
}

export interface SyncConflictRecord {
  readonly id: EntityId;
  readonly entityType: 'note' | 'task' | 'calendar_event';
  readonly entityId: EntityId;
  readonly noteTitle: string;
  readonly driveFileId?: string;
  readonly localRevision: number;
  readonly localUpdatedAt: ISODateString;
  readonly remoteModifiedTime: ISODateString;
  readonly remoteChecksum?: string;
  readonly remoteContent?: string;
  readonly remoteTaskSnapshot?: RemoteTaskMetadata;
  readonly remoteCalendarEventSnapshot?: RemoteCalendarEventMetadata;
  readonly reason: 'both_modified' | 'deleted_remotely';
  readonly createdAt: ISODateString;
}

export type SyncConflictResolution =
  | 'keep_local'
  | 'keep_remote'
  | 'keep_both';

export interface SyncMetaRecord {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: ISODateString;
}

export type SyncTrigger =
  | 'app_start'
  | 'reconnect'
  | 'local_edit'
  | 'manual'
  | 'tab_focus'
  | 'retry';

export type SyncEngineState =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'local_only'
  | 'conflict'
  | 'error';

export interface SyncStatusSnapshot {
  readonly state: SyncEngineState;
  readonly pendingCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
  readonly lastSyncedAt?: ISODateString;
  readonly lastError?: string;
  readonly isOnline: boolean;
  readonly activeTrigger?: SyncTrigger;
}

export interface RemoteFolderMetadata {
  readonly localFolderId: EntityId;
  readonly name: string;
  readonly parentFolderId: EntityId | null;
  readonly revision: number;
  readonly deletedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RemoteNoteMappingMetadata {
  readonly localNoteId: EntityId;
  readonly driveFileId: string;
  readonly driveFolderId: string;
  readonly driveFileName?: string | null;
  readonly title?: string | null;
  readonly localFolderId?: EntityId | null;
  readonly isFavorite: boolean;
  readonly isDaily: boolean;
  readonly dailyDate?: string | null;
  readonly localRevision: number;
  readonly lastKnownModifiedTime?: ISODateString | null;
  readonly lastKnownChecksum?: string | null;
  readonly deletedAt?: ISODateString | null;
  readonly updatedAt: ISODateString;
}

export interface RemoteAttachmentMetadata {
  readonly localAttachmentId: EntityId;
  readonly localNoteId: EntityId;
  readonly driveFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly deletedAt: ISODateString | null;
  readonly updatedAt: ISODateString;
}

export interface RemoteCloudNoteMetadata {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly folderId: EntityId | null;
  readonly title: string;
  readonly content: string;
  readonly type: NoteType;
  readonly language?: CodeLanguage | null;
  readonly isFavorite: boolean;
  readonly isDaily: boolean;
  readonly dailyDate?: string | null;
  readonly revision: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString | null;
}

export type SyncPlanAction =
  | { type: 'push_folder'; folderId: string; changeId?: string }
  | { type: 'delete_remote_folder'; folderId: string; changeId: string }
  | { type: 'pull_remote_folder'; folder: RemoteFolderMetadata }
  | { type: 'delete_local_folder'; folderId: string }
  | { type: 'upload_attachment'; attachmentId: string; changeId: string }
  | { type: 'delete_remote_attachment'; attachmentId: string; driveFileId?: string; changeId: string }
  | { type: 'download_attachment'; attachment: RemoteAttachmentMetadata }
  | { type: 'delete_local_attachment'; attachmentId: string }
  | { type: 'upload_note'; noteId: string; changeId: string }
  | { type: 'update_remote_note'; noteId: string; driveFileId: string; changeId: string }
  | { type: 'delete_remote_note'; noteId: string; driveFileId?: string; changeId: string }
  | { type: 'download_remote_note'; mapping: RemoteNoteMappingMetadata }
  | { type: 'delete_local_note'; noteId: string }
  | { type: 'push_cloud_note'; noteId: string; changeId?: string }
  | { type: 'delete_remote_cloud_note'; noteId: string; changeId?: string }
  | { type: 'pull_remote_cloud_note'; note: RemoteCloudNoteMetadata }
  | { type: 'delete_local_cloud_note'; noteId: string }
  | {
      type: 'record_conflict';
      noteId: string;
      driveFileId: string;
      reason: 'both_modified' | 'deleted_remotely';
      remoteModifiedTime: string;
      remoteChecksum?: string;
    }
  | { type: 'push_task'; taskId: string; changeId: string }
  | { type: 'delete_remote_task'; taskId: string; changeId: string }
  | { type: 'pull_remote_task'; task: RemoteTaskMetadata }
  | { type: 'delete_local_task'; taskId: string }
  | {
      type: 'record_task_conflict';
      taskId: string;
      reason: 'both_modified' | 'deleted_remotely';
      remoteTask: RemoteTaskMetadata;
    }
  | { type: 'push_calendar_event'; eventId: string; changeId: string }
  | { type: 'delete_remote_calendar_event'; eventId: string; changeId: string }
  | { type: 'pull_remote_calendar_event'; event: RemoteCalendarEventMetadata }
  | { type: 'delete_local_calendar_event'; eventId: string }
  | {
      type: 'record_calendar_event_conflict';
      eventId: string;
      reason: 'both_modified' | 'deleted_remotely';
      remoteEvent: RemoteCalendarEventMetadata;
    };

export interface SyncPlan {
  readonly actions: readonly SyncPlanAction[];
}
