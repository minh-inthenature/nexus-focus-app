import { AuthError, requireAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  DriveServerError,
  ensureNexusFolders,
  getValidDriveAccessToken,
  sanitizeDriveFilename,
  type DriveConnectionRow,
} from '../_shared/drive.ts';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildBinaryMultipartBody(
  metadata: Record<string, unknown>,
  binaryBytes: Uint8Array,
  mimeType: string,
): { body: Uint8Array; contentType: string } {
  const boundary = `nexus_${crypto.randomUUID().replace(/-/g, '')}`;
  const enc = new TextEncoder();
  const header = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const footer = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(
    header.byteLength + binaryBytes.byteLength + footer.byteLength,
  );
  body.set(header, 0);
  body.set(binaryBytes, header.byteLength);
  body.set(footer, header.byteLength + binaryBytes.byteLength);

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
): { body: Uint8Array; contentType: string } {
  const boundary = `nexus_${crypto.randomUUID().replace(/-/g, '')}`;
  const raw =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  return {
    body: new TextEncoder().encode(raw),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

function validateMarkdownPayload(name: string, content: string): {
  safeFileName: string;
  byteLength: number;
} {
  const trimmed = name.trim();
  const baseName = trimmed.replace(/\.(md|markdown)$/i, '');
  const safeBase = sanitizeDriveFilename(baseName);
  const safeFileName = `${safeBase}.md`;
  const byteLength = new TextEncoder().encode(content).byteLength;

  if (byteLength > MAX_MARKDOWN_BYTES) {
    throw new DriveServerError(
      'VALIDATION_ERROR',
      'Markdown note exceeds the 5 MB upload limit.',
      400,
    );
  }

  return { safeFileName, byteLength };
}

async function getConnectedFolders(
  accessToken: string,
  adminClient: Awaited<ReturnType<typeof requireAuthenticatedUser>>['adminClient'],
  userId: string,
): Promise<DriveConnectionRow & { notes_folder_id: string }> {
  const { data: conn } = await adminClient
    .from('drive_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!conn || conn.status !== 'connected') {
    throw new DriveServerError(
      'NOT_CONNECTED',
      'Google Drive is not connected.',
      403,
    );
  }

  const ensured = await ensureNexusFolders(accessToken, adminClient, userId, conn);
  return {
    ...(conn as DriveConnectionRow),
    root_folder_id: ensured.rootFolderId,
    notes_folder_id: ensured.notesFolderId,
    attachments_folder_id: ensured.attachmentsFolderId,
    backups_folder_id: ensured.backupsFolderId,
  };
}

async function verifyFileInNexusFolders(
  accessToken: string,
  fileId: string,
  allowedParentIds: readonly string[],
): Promise<{
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  md5Checksum?: string;
}> {
  const resp = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,trashed,modifiedTime,md5Checksum,ownedByMe`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (resp.status === 404) {
    throw new DriveServerError(
      'FILE_NOT_FOUND',
      'The requested file was not found in Google Drive.',
      404,
    );
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new DriveServerError(
      'DRIVE_REVOKED',
      'Google Drive permission was revoked or denied.',
      401,
    );
  }
  if (!resp.ok) {
    throw new DriveServerError(
      'DRIVE_API_ERROR',
      'Unable to inspect Google Drive file metadata.',
      502,
    );
  }

  const meta = await resp.json();
  const parents: string[] = Array.isArray(meta.parents) ? meta.parents : [];
  const insideNexus = parents.some((p) => allowedParentIds.includes(p));

  if (meta.trashed || meta.ownedByMe === false || !insideNexus) {
    throw new DriveServerError(
      'FILE_NOT_FOUND',
      'File is inaccessible or outside your Nexus Drive folder.',
      404,
    );
  }

  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    parents,
    modifiedTime: meta.modifiedTime,
    md5Checksum: meta.md5Checksum,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await requireAuthenticatedUser(req);
    const accessToken = await getValidDriveAccessToken(adminClient, user.id);

    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const fnIdx = segments.indexOf('google-drive-api');
    const routeSegments = fnIdx >= 0 ? segments.slice(fnIdx + 1) : [];

    // POST /folders/ensure
    if (
      req.method === 'POST' &&
      routeSegments[0] === 'folders' &&
      routeSegments[1] === 'ensure'
    ) {
      const { data: existingConn } = await adminClient
        .from('drive_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const folders = await ensureNexusFolders(
        accessToken,
        adminClient,
        user.id,
        existingConn,
      );
      return jsonResponse(folders);
    }

    const conn = await getConnectedFolders(accessToken, adminClient, user.id);
    const allowedFolders = [
      conn.notes_folder_id,
      conn.attachments_folder_id,
      conn.backups_folder_id,
    ].filter((id): id is string => Boolean(id));

    // GET /notes
    if (req.method === 'GET' && routeSegments[0] === 'notes' && !routeSegments[1]) {
      const query = [
        `'${conn.notes_folder_id}' in parents`,
        'trashed = false',
        `mimeType != 'application/vnd.google-apps.folder'`,
      ].join(' and ');

      const listResp = await fetch(
        `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents,modifiedTime,md5Checksum,appProperties)&orderBy=modifiedTime desc&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!listResp.ok) {
        return errorResponse(
          'DRIVE_API_ERROR',
          'Failed to list Markdown notes from Google Drive.',
          502,
        );
      }

      const data = await listResp.json();
      await adminClient
        .from('drive_connections')
        .update({ last_operation_at: new Date().toISOString() })
        .eq('user_id', user.id);

      return jsonResponse({
        notesFolderId: conn.notes_folder_id,
        files: data.files ?? [],
      });
    }

    // POST /notes/upload
    if (
      req.method === 'POST' &&
      routeSegments[0] === 'notes' &&
      routeSegments[1] === 'upload'
    ) {
      const body = await req.json().catch(() => null);
      const name: string = body?.name ?? 'Untitled';
      const content: string = body?.content ?? '';
      const localNoteId: string | undefined = body?.localNoteId;

      const { safeFileName } = validateMarkdownPayload(name, content);
      const { body: multipartBody, contentType } = buildMultipartBody(
        {
          name: safeFileName,
          mimeType: 'text/markdown',
          parents: [conn.notes_folder_id],
          appProperties: {
            nexusApp: 'nexus',
            ...(localNoteId ? { nexusLocalNoteId: localNoteId } : {}),
          },
        },
        content,
      );

      const uploadResp = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,md5Checksum`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
          },
          body: multipartBody,
        },
      );

      if (!uploadResp.ok) {
        return errorResponse(
          'DRIVE_API_ERROR',
          'Failed to upload Markdown note to Google Drive.',
          502,
        );
      }

      const uploaded = await uploadResp.json();
      await adminClient
        .from('drive_connections')
        .update({ last_operation_at: new Date().toISOString() })
        .eq('user_id', user.id);

      return jsonResponse({ file: uploaded }, 201);
    }

    // Operations targeting a specific file: /notes/:fileId
    if (routeSegments[0] === 'notes' && routeSegments[1]) {
      const fileId = decodeURIComponent(routeSegments[1]);

      // GET /notes/:fileId
      if (req.method === 'GET') {
        const meta = await verifyFileInNexusFolders(
          accessToken,
          fileId,
          allowedFolders,
        );
        const mediaResp = await fetch(
          `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!mediaResp.ok) {
          return errorResponse(
            'DRIVE_API_ERROR',
            'Failed to download Markdown content from Google Drive.',
            502,
          );
        }

        const content = await mediaResp.text();
        await adminClient
          .from('drive_connections')
          .update({ last_operation_at: new Date().toISOString() })
          .eq('user_id', user.id);

        return jsonResponse({ file: meta, content });
      }

      // PATCH /notes/:fileId (conflict-safe update)
      if (req.method === 'PATCH') {
        const body = await req.json().catch(() => null);
        const name: string = body?.name ?? 'Untitled';
        const content: string = body?.content ?? '';
        const expectedModifiedTime: string | undefined = body?.expectedModifiedTime;
        const expectedChecksum: string | undefined = body?.expectedChecksum;
        const forceOverwrite = Boolean(body?.forceOverwrite);

        const { safeFileName } = validateMarkdownPayload(name, content);
        const currentMeta = await verifyFileInNexusFolders(
          accessToken,
          fileId,
          allowedFolders,
        );

        const modifiedMismatch =
          Boolean(expectedModifiedTime) &&
          currentMeta.modifiedTime !== expectedModifiedTime;
        const checksumMismatch =
          Boolean(expectedChecksum) &&
          Boolean(currentMeta.md5Checksum) &&
          currentMeta.md5Checksum !== expectedChecksum;

        if ((modifiedMismatch || checksumMismatch) && !forceOverwrite) {
          const remoteMediaResp = await fetch(
            `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const remoteContent = remoteMediaResp.ok
            ? await remoteMediaResp.text()
            : undefined;

          return errorResponse(
            'DRIVE_CONFLICT',
            'The file in Google Drive has been modified since your last upload or download.',
            409,
            {
              fileId,
              fileName: currentMeta.name,
              remoteModifiedTime: currentMeta.modifiedTime,
              remoteChecksum: currentMeta.md5Checksum,
              remoteContent,
            },
          );
        }

        const { body: multipartBody, contentType } = buildMultipartBody(
          {
            name: safeFileName,
            mimeType: 'text/markdown',
          },
          content,
        );

        const patchResp = await fetch(
          `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,md5Checksum`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': contentType,
            },
            body: multipartBody,
          },
        );

        if (!patchResp.ok) {
          return errorResponse(
            'DRIVE_API_ERROR',
            'Failed to update Markdown note in Google Drive.',
            502,
          );
        }

        const updated = await patchResp.json();
        await adminClient
          .from('drive_connections')
          .update({ last_operation_at: new Date().toISOString() })
          .eq('user_id', user.id);

        return jsonResponse({ file: updated });
      }

      // DELETE /notes/:fileId
      if (req.method === 'DELETE') {
        await verifyFileInNexusFolders(accessToken, fileId, allowedFolders);
        const deleteResp = await fetch(
          `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (!deleteResp.ok && deleteResp.status !== 204) {
          return errorResponse(
            'DRIVE_API_ERROR',
            'Failed to delete file from Google Drive.',
            502,
          );
        }

        await adminClient
          .from('drive_connections')
          .update({ last_operation_at: new Date().toISOString() })
          .eq('user_id', user.id);

        return jsonResponse({ deleted: true, fileId });
      }
    }

    // POST /attachments/upload
    if (
      req.method === 'POST' &&
      routeSegments[0] === 'attachments' &&
      routeSegments[1] === 'upload'
    ) {
      if (!conn.attachments_folder_id) {
        return errorResponse(
          'DRIVE_FOLDER_ERROR',
          'Nexus/Attachments folder is unavailable.',
          500,
        );
      }

      const body = await req.json().catch(() => null);
      const fileName = sanitizeDriveFilename(String(body?.fileName ?? 'attachment'));
      const mimeType = String(body?.mimeType ?? 'application/octet-stream');
      const base64Data = String(body?.base64Data ?? '');
      const localAttachmentId: string | undefined = body?.localAttachmentId;

      if (!base64Data) {
        return errorResponse('VALIDATION_ERROR', 'Missing attachment content.', 400);
      }

      const binaryBytes = decodeBase64(base64Data);
      if (binaryBytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Attachment exceeds the 10 MB upload limit.',
          400,
        );
      }

      const { body: multipartBody, contentType } = buildBinaryMultipartBody(
        {
          name: fileName,
          mimeType,
          parents: [conn.attachments_folder_id],
          appProperties: {
            nexusApp: 'nexus',
            ...(localAttachmentId
              ? { nexusLocalAttachmentId: localAttachmentId }
              : {}),
          },
        },
        binaryBytes,
        mimeType,
      );

      const uploadResp = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,md5Checksum`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
          },
          body: multipartBody,
        },
      );

      if (!uploadResp.ok) {
        return errorResponse(
          'DRIVE_API_ERROR',
          'Failed to upload attachment to Google Drive.',
          502,
        );
      }

      const uploaded = await uploadResp.json();
      await adminClient
        .from('drive_connections')
        .update({ last_operation_at: new Date().toISOString() })
        .eq('user_id', user.id);

      return jsonResponse({ file: uploaded }, 201);
    }

    // /attachments/:fileId
    if (routeSegments[0] === 'attachments' && routeSegments[1]) {
      const fileId = decodeURIComponent(routeSegments[1]);

      if (req.method === 'GET') {
        const meta = await verifyFileInNexusFolders(
          accessToken,
          fileId,
          allowedFolders,
        );
        const mediaResp = await fetch(
          `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!mediaResp.ok) {
          return errorResponse(
            'DRIVE_API_ERROR',
            'Failed to download attachment from Google Drive.',
            502,
          );
        }

        const buf = new Uint8Array(await mediaResp.arrayBuffer());
        return jsonResponse({
          file: meta,
          base64Data: encodeBase64(buf),
        });
      }

      if (req.method === 'DELETE') {
        await verifyFileInNexusFolders(accessToken, fileId, allowedFolders);
        const deleteResp = await fetch(
          `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (!deleteResp.ok && deleteResp.status !== 204) {
          return errorResponse(
            'DRIVE_API_ERROR',
            'Failed to delete attachment from Google Drive.',
            502,
          );
        }

        return jsonResponse({ deleted: true, fileId });
      }
    }

    return errorResponse('NOT_FOUND', 'Unsupported Google Drive API route.', 404);
  } catch (err) {
    if (err instanceof AuthError || err instanceof DriveServerError) {
      return errorResponse(
        err.code,
        err.message,
        err.status,
        'details' in err ? err.details : undefined,
      );
    }
    return errorResponse(
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Unexpected server error.',
      500,
    );
  }
});
