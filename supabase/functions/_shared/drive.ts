import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { decryptSecret, encryptSecret } from './crypto.ts';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface DriveConnectionRow {
  user_id: string;
  status: 'connected' | 'disconnected' | 'revoked';
  root_folder_id: string | null;
  notes_folder_id: string | null;
  attachments_folder_id: string | null;
  backups_folder_id: string | null;
  scope: string | null;
  connected_at: string | null;
  last_operation_at: string | null;
  updated_at: string;
}

export interface NexusDriveFolders {
  rootFolderId: string;
  notesFolderId: string;
  attachmentsFolderId: string;
  backupsFolderId: string;
}

export class DriveServerError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function sanitizeDriveFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || 'Untitled';
}

export async function getValidDriveAccessToken(
  adminClient: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: tokenRow, error } = await adminClient
    .schema('private')
    .from('google_drive_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !tokenRow) {
    throw new DriveServerError(
      'NOT_CONNECTED',
      'Google Drive is not connected for this account.',
      403,
    );
  }

  const expiresAtMs = new Date(tokenRow.token_expires_at).getTime();
  const refreshBufferMs = 60_000;

  if (expiresAtMs - Date.now() > refreshBufferMs) {
    return decryptSecret(tokenRow.encrypted_access_token);
  }

  if (!tokenRow.encrypted_refresh_token) {
    await adminClient
      .from('drive_connections')
      .update({ status: 'revoked' })
      .eq('user_id', userId);
    throw new DriveServerError(
      'DRIVE_REVOKED',
      'Google Drive authorization expired. Please reconnect Google Drive.',
      401,
    );
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new DriveServerError(
      'SERVER_CONFIG_ERROR',
      'Google OAuth client credentials are not configured on the server.',
      500,
    );
  }

  const refreshToken = await decryptSecret(tokenRow.encrypted_refresh_token);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!tokenResp.ok) {
    const errPayload = await tokenResp.json().catch(() => ({}));
    if (errPayload?.error === 'invalid_grant') {
      await adminClient
        .schema('private')
        .from('google_drive_tokens')
        .delete()
        .eq('user_id', userId);
      await adminClient
        .from('drive_connections')
        .update({ status: 'revoked' })
        .eq('user_id', userId);
      throw new DriveServerError(
        'DRIVE_REVOKED',
        'Google Drive access was revoked or expired. Please reconnect.',
        401,
      );
    }

    throw new DriveServerError(
      'OAUTH_REFRESH_FAILED',
      'Unable to refresh Google Drive authorization.',
      502,
    );
  }

  const refreshed = await tokenResp.json();
  const nextAccessToken: string | undefined = refreshed.access_token;
  if (!nextAccessToken) {
    throw new DriveServerError(
      'OAUTH_REFRESH_FAILED',
      'Google OAuth refresh did not return an access token.',
      502,
    );
  }

  const nextExpiresAt = new Date(
    Date.now() + Number(refreshed.expires_in ?? 3600) * 1000,
  ).toISOString();

  await adminClient
    .schema('private')
    .from('google_drive_tokens')
    .update({
      encrypted_access_token: await encryptSecret(nextAccessToken),
      token_expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return nextAccessToken;
}

async function verifyFolderAccessible(
  accessToken: string,
  folderId: string,
  expectedParentId?: string,
): Promise<boolean> {
  const resp = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(folderId)}?fields=id,mimeType,trashed,parents,ownedByMe`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!resp.ok) return false;
  const meta = await resp.json();
  if (meta.trashed) return false;
  if (meta.mimeType !== 'application/vnd.google-apps.folder') return false;
  if (meta.ownedByMe === false) return false;
  if (
    expectedParentId &&
    (!Array.isArray(meta.parents) || !meta.parents.includes(expectedParentId))
  ) {
    return false;
  }
  return true;
}

async function findOrCreateFolder(
  accessToken: string,
  name: string,
  role: string,
  parentId: string | null,
  knownId?: string | null,
): Promise<string> {
  if (knownId) {
    const ok = await verifyFolderAccessible(
      accessToken,
      knownId,
      parentId ?? undefined,
    );
    if (ok) return knownId;
  }

  const parentFilter = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const escapedName = name.replace(/'/g, "\\'");
  const query = [
    `name = '${escapedName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    'trashed = false',
    parentFilter,
  ].join(' and ');

  const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,ownedByMe,appProperties)&pageSize=5&spaces=drive`;
  const searchResp = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchResp.status === 401 || searchResp.status === 403) {
    throw new DriveServerError(
      'DRIVE_REVOKED',
      'Google Drive authorization was revoked or insufficient.',
      401,
    );
  }

  if (searchResp.ok) {
    const payload = await searchResp.json();
    const files: Array<{
      id: string;
      ownedByMe?: boolean;
      appProperties?: Record<string, string>;
    }> = payload.files ?? [];
    const preferred =
      files.find(
        (f) => f.ownedByMe !== false && f.appProperties?.nexusRole === role,
      ) ?? files.find((f) => f.ownedByMe !== false);
    if (preferred?.id) {
      return preferred.id;
    }
  }

  const createResp = await fetch(`${DRIVE_API_BASE}/files?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
      appProperties: {
        nexusApp: 'nexus',
        nexusRole: role,
      },
    }),
  });

  if (!createResp.ok) {
    throw new DriveServerError(
      'DRIVE_FOLDER_ERROR',
      `Failed to create "${name}" folder in Google Drive.`,
      502,
    );
  }

  const created = await createResp.json();
  return created.id as string;
}

/**
 * Ensures `Nexus/`, `Nexus/Notes/`, `Nexus/Attachments/`, and `Nexus/Backups/`
 * exist without creating duplicates or scanning unrelated user files.
 */
export async function ensureNexusFolders(
  accessToken: string,
  adminClient: SupabaseClient,
  userId: string,
  existing?: Partial<DriveConnectionRow> | null,
): Promise<NexusDriveFolders> {
  const rootFolderId = await findOrCreateFolder(
    accessToken,
    'Nexus',
    'root',
    null,
    existing?.root_folder_id,
  );
  const [notesFolderId, attachmentsFolderId, backupsFolderId] = await Promise.all([
    findOrCreateFolder(
      accessToken,
      'Notes',
      'notes',
      rootFolderId,
      existing?.notes_folder_id,
    ),
    findOrCreateFolder(
      accessToken,
      'Attachments',
      'attachments',
      rootFolderId,
      existing?.attachments_folder_id,
    ),
    findOrCreateFolder(
      accessToken,
      'Backups',
      'backups',
      rootFolderId,
      existing?.backups_folder_id,
    ),
  ]);

  const now = new Date().toISOString();
  await adminClient.from('drive_connections').upsert(
    {
      user_id: userId,
      status: 'connected',
      root_folder_id: rootFolderId,
      notes_folder_id: notesFolderId,
      attachments_folder_id: attachmentsFolderId,
      backups_folder_id: backupsFolderId,
      scope: DRIVE_SCOPE,
      connected_at: existing?.connected_at ?? now,
      last_operation_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );

  return {
    rootFolderId,
    notesFolderId,
    attachmentsFolderId,
    backupsFolderId,
  };
}
