import type { EntityId, ISODateString } from '@/types/common';
import type { OfflineOperationEntity } from '@/services/storage/storage.service';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncConflict {
  readonly entityType: OfflineOperationEntity;
  readonly entityId: EntityId;
  readonly localUpdatedAt: ISODateString;
  readonly remoteUpdatedAt: ISODateString;
}

export interface SyncSummary {
  readonly state: SyncState;
  readonly pendingCount: number;
  readonly lastSyncedAt?: ISODateString;
  readonly conflicts: readonly SyncConflict[];
}

/**
 * Contract for coordinating hybrid synchronization between IndexedDB,
 * Google Drive (Markdown & attachments), and Supabase (structured metadata).
 */
export interface SyncService {
  getStatus(): SyncSummary;
  syncNow(): Promise<SyncSummary>;
  subscribe(listener: (summary: SyncSummary) => void): () => void;
}
