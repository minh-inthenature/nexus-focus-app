import type { EntityId, ISODateString } from '@/types/common';

export interface LocalNoteRecord {
  readonly id: EntityId;
  readonly title: string;
  readonly folderPath: string;
  readonly markdown: string;
  readonly driveFileId?: string;
  readonly isFavorite: boolean;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export interface LocalTaskRecord {
  readonly id: EntityId;
  readonly title: string;
  readonly completed: boolean;
  readonly dueAt?: ISODateString;
  readonly priority?: 'low' | 'medium' | 'high';
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export interface LocalCalendarEventRecord {
  readonly id: EntityId;
  readonly title: string;
  readonly startsAt: ISODateString;
  readonly endsAt: ISODateString;
  readonly allDay: boolean;
  readonly description?: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly deletedAt?: ISODateString;
}

export type OfflineOperationEntity = 'note' | 'task' | 'calendar_event';
export type OfflineOperationKind = 'create' | 'update' | 'delete';

export interface OfflineOperation {
  readonly id: EntityId;
  readonly entityType: OfflineOperationEntity;
  readonly entityId: EntityId;
  readonly operation: OfflineOperationKind;
  readonly queuedAt: ISODateString;
  readonly retryCount: number;
}

/**
 * Contract for local-first IndexedDB persistence (planned for Dexie.js).
 * UI components must interact with domain stores/hooks rather than concrete
 * storage implementations.
 */
export interface LocalStorageService {
  initialize(): Promise<void>;
  listNotes(): Promise<LocalNoteRecord[]>;
  getNote(id: EntityId): Promise<LocalNoteRecord | null>;
  saveNote(note: LocalNoteRecord): Promise<void>;
  listTasks(): Promise<LocalTaskRecord[]>;
  saveTask(task: LocalTaskRecord): Promise<void>;
  listCalendarEvents(): Promise<LocalCalendarEventRecord[]>;
  saveCalendarEvent(event: LocalCalendarEventRecord): Promise<void>;
  listPendingOperations(): Promise<OfflineOperation[]>;
  enqueueOperation(operation: OfflineOperation): Promise<void>;
  clearCompletedOperations(operationIds: readonly EntityId[]): Promise<void>;
}
