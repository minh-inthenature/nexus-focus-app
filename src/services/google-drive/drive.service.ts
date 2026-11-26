import type { ISODateString } from '@/types/common';

export interface DriveFolderRef {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
}

export interface DriveFileRef {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parentId?: string;
  readonly modifiedTime: ISODateString;
  readonly md5Checksum?: string;
  readonly appProperties?: Record<string, string>;
}

export type DriveConnectionStatus = 'connected' | 'disconnected' | 'revoked';

export interface DriveConnectionInfo {
  readonly status: DriveConnectionStatus;
  readonly rootFolderId: string | null;
  readonly notesFolderId: string | null;
  readonly attachmentsFolderId: string | null;
  readonly backupsFolderId: string | null;
  readonly scope: string | null;
  readonly connectedAt: ISODateString | null;
  readonly lastOperationAt: ISODateString | null;
}

export interface NexusDriveFolderStructure {
  readonly rootFolderId: string;
  readonly notesFolderId: string;
  readonly attachmentsFolderId: string;
  readonly backupsFolderId: string;
}

export interface DriveConflictPayload {
  readonly fileId: string;
  readonly fileName: string;
  readonly remoteModifiedTime: ISODateString;
  readonly remoteChecksum?: string;
  readonly remoteContent?: string;
}

export type DriveErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'NOT_CONNECTED'
  | 'CONSENT_CANCELLED'
  | 'DRIVE_REVOKED'
  | 'DRIVE_CONFLICT'
  | 'FILE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'API_ERROR';

export class DriveError extends Error {
  readonly code: DriveErrorCode;
  readonly conflict?: DriveConflictPayload;

  constructor(
    code: DriveErrorCode,
    message: string,
    conflict?: DriveConflictPayload,
  ) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    if (conflict) {
      this.conflict = conflict;
    }
  }
}

/**
 * Contract for cloud Markdown storage in Google Drive.
 * Note editor and UI components interact via `useDriveStore` / `GoogleDriveService`
 * and never couple directly to Google REST endpoints or secrets.
 */
export interface GoogleDriveService {
  getConnectionStatus(): Promise<DriveConnectionInfo>;
  startOAuthAuthorization(): Promise<string>;
  completeOAuthAuthorization(
    code: string,
    state: string,
  ): Promise<DriveConnectionInfo>;
  disconnect(): Promise<void>;
  ensureWorkspaceFolders(): Promise<NexusDriveFolderStructure>;
  ensureWorkspaceRootFolder(): Promise<DriveFolderRef>;
  listMarkdownFiles(folderId?: string): Promise<DriveFileRef[]>;
  readMarkdownFile(
    fileId: string,
  ): Promise<{ file: DriveFileRef; content: string }>;
  uploadMarkdownFile(params: {
    localNoteId?: string;
    name: string;
    content: string;
  }): Promise<DriveFileRef>;
  updateMarkdownFile(params: {
    fileId: string;
    name: string;
    content: string;
    expectedModifiedTime?: string;
    expectedChecksum?: string;
    forceOverwrite?: boolean;
  }): Promise<DriveFileRef>;
  upsertMarkdownFile(params: {
    fileId?: string;
    name: string;
    parentId: string;
    content: string;
  }): Promise<DriveFileRef>;
  deleteFile(fileId: string): Promise<void>;
  uploadAttachmentFile(params: {
    localAttachmentId: string;
    fileName: string;
    mimeType: string;
    data: Blob;
  }): Promise<DriveFileRef>;
  downloadAttachmentFile(
    fileId: string,
  ): Promise<{ file: DriveFileRef; data: Blob }>;
  deleteAttachmentFile(fileId: string): Promise<void>;
}
