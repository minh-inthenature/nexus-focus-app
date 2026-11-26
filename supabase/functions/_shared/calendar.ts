import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { decryptSecret, encryptSecret } from './crypto.ts';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface CalendarConnectionRow {
  user_id: string;
  status: 'connected' | 'disconnected' | 'revoked';
  calendar_id: string;
  calendar_summary: string | null;
  scope: string | null;
  sync_token: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  updated_at: string;
}

export class CalendarServerError extends Error {
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

export async function getValidCalendarAccessToken(
  adminClient: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: tokenRow, error } = await adminClient
    .schema('private')
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !tokenRow) {
    throw new CalendarServerError(
      'NOT_CONNECTED',
      'Google Calendar is not connected for this account.',
      403,
    );
  }

  const expiresAtMs = new Date(tokenRow.token_expires_at).getTime();
  const refreshBufferMs = 90_000;

  if (expiresAtMs - Date.now() > refreshBufferMs) {
    return decryptSecret(tokenRow.encrypted_access_token);
  }

  if (!tokenRow.encrypted_refresh_token) {
    await adminClient
      .from('google_calendar_connections')
      .update({ status: 'revoked' })
      .eq('user_id', userId);
    throw new CalendarServerError(
      'CALENDAR_REVOKED',
      'Google Calendar authorization expired. Please reconnect Google Calendar.',
      401,
    );
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new CalendarServerError(
      'SERVER_CONFIG_ERROR',
      'Google OAuth client credentials are not configured on the server.',
      500,
    );
  }

  const refreshToken = await decryptSecret(tokenRow.encrypted_refresh_token);
  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResp.ok) {
    const errPayload = await tokenResp.json().catch(() => ({}));
    if (errPayload?.error === 'invalid_grant') {
      await adminClient
        .schema('private')
        .from('google_calendar_tokens')
        .delete()
        .eq('user_id', userId);
      await adminClient
        .from('google_calendar_connections')
        .update({ status: 'revoked', sync_token: null })
        .eq('user_id', userId);
      throw new CalendarServerError(
        'CALENDAR_REVOKED',
        'Google Calendar access was revoked or expired. Please reconnect.',
        401,
      );
    }

    throw new CalendarServerError(
      'OAUTH_REFRESH_FAILED',
      'Unable to refresh Google Calendar authorization.',
      502,
    );
  }

  const refreshed = await tokenResp.json();
  const nextAccessToken: string | undefined = refreshed.access_token;
  if (!nextAccessToken) {
    throw new CalendarServerError(
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
    .from('google_calendar_tokens')
    .update({
      encrypted_access_token: await encryptSecret(nextAccessToken),
      token_expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return nextAccessToken;
}

export async function googleCalendarFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith('https://') ? path : `${CALENDAR_API_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}
