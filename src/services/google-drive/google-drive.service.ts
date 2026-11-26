import { sanitizeFileName } from '@/features/notes/utils/markdown';
import { getSupabaseClient } from '@/services/auth/supabase.client';
import { getPublicEnvConfig } from '@/utils/env';
import {
  DriveError,
  type DriveConflictPayload,
  type DriveConnectionInfo,
  type DriveErrorCode,
  type DriveFileRef,
  type DriveFolderRef,
  type GoogleDriveService,
  type NexusDriveFolderStructure,
} from './drive.service';

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export const DISCONNECTED_DRIVE_INFO: DriveConnectionInfo = {
  status: 'disconnected',
  rootFolderId: null,
  notesFolderId: null,
  attachmentsFolderId: null,
  backupsFolderId: null,
  scope: null,
  connectedAt: null,
  lastOperationAt: null,
};

function sanitizeAndValidateMarkdown(name: string, content: string): string {
  const baseName = name.replace(/\.(md|markdown)$/i, '');
  const safeBase = sanitizeFileName(baseName);
  const safeName = `${safeBase}.md`;

  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_MARKDOWN_BYTES) {
    throw new DriveError(
      'VALIDATION_ERROR',
      'Markdown note exceeds the 5 MB limit for Drive uploads.',
    );
  }

  return safeName;
}

async function getEdgeFunctionAuthHeaders(): Promise<{
  baseUrl: string;
  headers: Record<string, string>;
}> {
  const client = getSupabaseClient();
  const { supabaseUrl, supabaseAnonKey } = getPublicEnvConfig();

  if (!client || !supabaseUrl || !supabaseAnonKey) {
    throw new DriveError(
      'NOT_CONFIGURED',
      'Supabase is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect Google Drive.',
    );
  }

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.access_token) {
    throw new DriveError(
      'UNAUTHORIZED',
      'Sign in with Google before accessing Google Drive.',
    );
  }

  return {
    baseUrl: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
  };
}

function mapServerErrorCode(code: unknown, status: number): DriveErrorCode {
  if (code === 'DRIVE_CONFLICT' || status === 409) return 'DRIVE_CONFLICT';
  if (code === 'DRIVE_REVOKED') return 'DRIVE_REVOKED';
  if (code === 'NOT_CONNECTED') return 'NOT_CONNECTED';
  if (code === 'FILE_NOT_FOUND' || status === 404) return 'FILE_NOT_FOUND';
  if (code === 'UNAUTHORIZED' || status === 401) return 'UNAUTHORIZED';
  if (code === 'VALIDATION_ERROR' || status === 400) return 'VALIDATION_ERROR';
  return 'API_ERROR';
}

async function invokeEdgeJson<T>(
  functionPath: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, headers } = await getEdgeFunctionAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${functionPath}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new DriveError(
      'NETWORK_ERROR',
      'Unable to reach Google Drive integration service. Check your internet connection.',
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = mapServerErrorCode(payload?.code, response.status);
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : 'Google Drive request failed.';
    const conflict: DriveConflictPayload | undefined =
      code === 'DRIVE_CONFLICT'
        ? {
            fileId: String(payload.fileId ?? ''),
            fileName: String(payload.fileName ?? ''),
            remoteModifiedTime: String(payload.remoteModifiedTime ?? ''),
            ...(typeof payload.remoteChecksum === 'string'
              ? { remoteChecksum: payload.remoteChecksum }
              : {}),
            ...(typeof payload.remoteContent === 'string'
              ? { remoteContent: payload.remoteContent }
              : {}),
          }
        : undefined;

    throw new DriveError(code, message, conflict);
  }

  return payload as T;
}

/**
 * Google Drive client backed by Supabase Edge Functions so OAuth client secrets
 * and Drive access/refresh tokens never enter browser memory or localStorage.
 */
export class EdgeGoogleDriveService implements GoogleDriveService {
  public async getConnectionStatus(): Promise<DriveConnectionInfo> {
    const client = getSupabaseClient();
    if (!client) return DISCONNECTED_DRIVE_INFO;

    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) return DISCONNECTED_DRIVE_INFO;

    return invokeEdgeJson<DriveConnectionInfo>('google-drive-oauth/status');
  }

  public async startOAuthAuthorization(): Promise<string> {
    const redirectUri = `${window.location.origin}/auth/google-drive/callback`;
    const result = await invokeEdgeJson<{ url: string }>(
      'google-drive-oauth/auth-url',
      {
        method: 'POST',
        body: { redirectUri },
      },
    );
    return result.url;
  }

  public async completeOAuthAuthorization(
    code: string,
    state: string,
  ): Promise<DriveConnectionInfo> {
    const redirectUri = `${window.location.origin}/auth/google-drive/callback`;
    return invokeEdgeJson<DriveConnectionInfo>('google-drive-oauth/exchange', {
      method: 'POST',
      body: { code, state, redirectUri },
    });
  }

  public async disconnect(): Promise<void> {
    await invokeEdgeJson<{ status: string }>('google-drive-oauth/disconnect', {
      method: 'POST',
    });
  }

  public async ensureWorkspaceFolders(): Promise<NexusDriveFolderStructure> {
    return invokeEdgeJson<NexusDriveFolderStructure>(
      'google-drive-api/folders/ensure',
      { method: 'POST' },
    );
  }

  public async ensureWorkspaceRootFolder(): Promise<DriveFolderRef> {
    const folders = await this.ensureWorkspaceFolders();
    return {
      id: folders.rootFolderId,
      name: 'Nexus',
    };
  }

  public async listMarkdownFiles(): Promise<DriveFileRef[]> {
    const result = await invokeEdgeJson<{ files: DriveFileRef[] }>(
      'google-drive-api/notes',
    );
    return result.files;
  }

  public async readMarkdownFile(
    fileId: string,
  ): Promise<{ file: DriveFileRef; content: string }> {
    return invokeEdgeJson<{ file: DriveFileRef; content: string }>(
      `google-drive-api/notes/${encodeURIComponent(fileId)}`,
    );
  }

  public async uploadMarkdownFile(params: {
    localNoteId?: string;
    name: string;
    content: string;
  }): Promise<DriveFileRef> {
    const safeName = sanitizeAndValidateMarkdown(params.name, params.content);
    const result = await invokeEdgeJson<{ file: DriveFileRef }>(
      'google-drive-api/notes/upload',
      {
        method: 'POST',
        body: {
          localNoteId: params.localNoteId,
          name: safeName,
          content: params.content,
        },
      },
    );
    return result.file;
  }

  public async updateMarkdownFile(params: {
    fileId: string;
    name: string;
    content: string;
    expectedModifiedTime?: string;
    expectedChecksum?: string;
    forceOverwrite?: boolean;
  }): Promise<DriveFileRef> {
    const safeName = sanitizeAndValidateMarkdown(params.name, params.content);
    const result = await invokeEdgeJson<{ file: DriveFileRef }>(
      `google-drive-api/notes/${encodeURIComponent(params.fileId)}`,
      {
        method: 'PATCH',
        body: {
          name: safeName,
          content: params.content,
          expectedModifiedTime: params.expectedModifiedTime,
          expectedChecksum: params.expectedChecksum,
          forceOverwrite: params.forceOverwrite,
        },
      },
    );
    return result.file;
  }

  public async upsertMarkdownFile(params: {
    fileId?: string;
    name: string;
    parentId: string;
    content: string;
  }): Promise<DriveFileRef> {
    if (params.fileId) {
      return this.updateMarkdownFile({
        fileId: params.fileId,
        name: params.name,
        content: params.content,
      });
    }
    return this.uploadMarkdownFile({
      name: params.name,
      content: params.content,
    });
  }

  public async deleteFile(fileId: string): Promise<void> {
    await invokeEdgeJson<{ deleted: boolean }>(
      `google-drive-api/notes/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
    );
  }

  public async uploadAttachmentFile(params: {
    localAttachmentId: string;
    fileName: string;
    mimeType: string;
    data: Blob;
  }): Promise<DriveFileRef> {
    if (params.data.size > MAX_ATTACHMENT_BYTES) {
      throw new DriveError(
        'VALIDATION_ERROR',
        'Attachment exceeds the 10 MB limit for Drive uploads.',
      );
    }

    const safeFileName = sanitizeFileName(params.fileName);
    const base64Data = await blobToBase64(params.data);
    const result = await invokeEdgeJson<{ file: DriveFileRef }>(
      'google-drive-api/attachments/upload',
      {
        method: 'POST',
        body: {
          localAttachmentId: params.localAttachmentId,
          fileName: safeFileName,
          mimeType: params.mimeType || 'application/octet-stream',
          base64Data,
        },
      },
    );
    return result.file;
  }

  public async downloadAttachmentFile(
    fileId: string,
  ): Promise<{ file: DriveFileRef; data: Blob }> {
    const result = await invokeEdgeJson<{
      file: DriveFileRef;
      base64Data: string;
    }>(`google-drive-api/attachments/${encodeURIComponent(fileId)}`);

    return {
      file: result.file,
      data: base64ToBlob(
        result.base64Data,
        result.file.mimeType || 'application/octet-stream',
      ),
    };
  }

  public async deleteAttachmentFile(fileId: string): Promise<void> {
    await invokeEdgeJson<{ deleted: boolean }>(
      `google-drive-api/attachments/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
    );
  }
}

export const googleDriveService = new EdgeGoogleDriveService();
