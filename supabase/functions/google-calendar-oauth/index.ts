import { AuthError, requireAuthenticatedUser } from '../_shared/auth.ts';
import {
  CALENDAR_SCOPE,
  CalendarServerError,
  googleCalendarFetch,
} from '../_shared/calendar.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  createPkceChallenge,
  decryptSecret,
  encryptSecret,
  generateRandomToken,
} from '../_shared/crypto.ts';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function resolveRedirectUri(requested?: string): string {
  const configured = Deno.env.get('GOOGLE_CALENDAR_REDIRECT_URI')?.trim();
  if (configured) {
    return configured;
  }
  if (
    requested &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/auth\/google-calendar\/callback$/i.test(
      requested,
    )
  ) {
    return requested;
  }
  throw new CalendarServerError(
    'SERVER_CONFIG_ERROR',
    'GOOGLE_CALENDAR_REDIRECT_URI is not configured.',
    500,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await requireAuthenticatedUser(req);
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const fnIdx = segments.indexOf('google-calendar-oauth');
    const subPath = fnIdx >= 0 ? `/${segments.slice(fnIdx + 1).join('/')}` : '/';

    if (req.method === 'GET' && (subPath === '/status' || subPath === '/')) {
      const { data } = await adminClient
        .from('google_calendar_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      return jsonResponse({
        status: data?.status ?? 'disconnected',
        calendarId: data?.calendar_id ?? 'primary',
        calendarSummary: data?.calendar_summary ?? null,
        scope: data?.scope ?? null,
        connectedAt: data?.connected_at ?? null,
        lastSyncedAt: data?.last_synced_at ?? null,
      });
    }

    if (req.method === 'POST' && subPath === '/auth-url') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      if (!clientId) {
        return errorResponse(
          'SERVER_CONFIG_ERROR',
          'GOOGLE_CLIENT_ID is not configured on the server.',
          500,
        );
      }

      const payload = await req.json().catch(() => ({}));
      const redirectUri = resolveRedirectUri(payload?.redirectUri);

      const state = generateRandomToken(24);
      const codeVerifier = generateRandomToken(48);
      const codeChallenge = await createPkceChallenge(codeVerifier);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      await adminClient
        .schema('private')
        .from('calendar_oauth_states')
        .delete()
        .lt('expires_at', new Date().toISOString());

      const { error: insertError } = await adminClient
        .schema('private')
        .from('calendar_oauth_states')
        .insert({
          state,
          user_id: user.id,
          code_verifier: codeVerifier,
          expires_at: expiresAt,
        });

      if (insertError) {
        return errorResponse(
          'STATE_STORE_FAILED',
          'Failed to initialize OAuth state.',
          500,
        );
      }

      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: CALENDAR_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'false',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return jsonResponse({
        url: `${GOOGLE_AUTH_URL}?${authParams.toString()}`,
      });
    }

    if (req.method === 'POST' && subPath === '/exchange') {
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
      if (!clientId || !clientSecret) {
        return errorResponse(
          'SERVER_CONFIG_ERROR',
          'Google OAuth client credentials are not configured.',
          500,
        );
      }

      const body = await req.json().catch(() => null);
      const code: string | undefined = body?.code;
      const state: string | undefined = body?.state;
      const redirectUri = resolveRedirectUri(body?.redirectUri);

      if (!code || !state) {
        return errorResponse(
          'INVALID_CALLBACK',
          'Missing authorization code or state.',
          400,
        );
      }

      const { data: stateRow } = await adminClient
        .schema('private')
        .from('calendar_oauth_states')
        .select('*')
        .eq('state', state)
        .maybeSingle();

      // Consume state immediately (single-use CSRF protection)
      await adminClient
        .schema('private')
        .from('calendar_oauth_states')
        .delete()
        .eq('state', state);

      if (
        !stateRow ||
        stateRow.user_id !== user.id ||
        new Date(stateRow.expires_at).getTime() < Date.now()
      ) {
        return errorResponse(
          'INVALID_STATE',
          'OAuth authorization state is invalid or expired. Please try connecting again.',
          400,
        );
      }

      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: stateRow.code_verifier,
        }),
      });

      if (!tokenResp.ok) {
        return errorResponse(
          'OAUTH_EXCHANGE_FAILED',
          'Google rejected the authorization code exchange.',
          400,
        );
      }

      const tokens = await tokenResp.json();
      const accessToken: string | undefined = tokens.access_token;
      const grantedScope: string = tokens.scope ?? '';

      if (!accessToken) {
        return errorResponse(
          'OAUTH_EXCHANGE_FAILED',
          'No access token returned by Google.',
          400,
        );
      }

      if (!grantedScope.includes(CALENDAR_SCOPE)) {
        return errorResponse(
          'INSUFFICIENT_SCOPE',
          'Google Calendar event permission was not granted.',
          403,
        );
      }

      const expiresAt = new Date(
        Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
      ).toISOString();

      const { data: existingTokenRow } = await adminClient
        .schema('private')
        .from('google_calendar_tokens')
        .select('encrypted_refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();

      const encryptedRefreshToken = tokens.refresh_token
        ? await encryptSecret(tokens.refresh_token)
        : existingTokenRow?.encrypted_refresh_token ?? null;

      await adminClient
        .schema('private')
        .from('google_calendar_tokens')
        .upsert(
          {
            user_id: user.id,
            encrypted_access_token: await encryptSecret(accessToken),
            encrypted_refresh_token: encryptedRefreshToken,
            token_expires_at: expiresAt,
            scope: grantedScope,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      let calendarSummary = 'Primary Calendar';
      try {
        const calMetaResp = await googleCalendarFetch(
          accessToken,
          '/calendars/primary',
        );
        if (calMetaResp.ok) {
          const calMeta = await calMetaResp.json();
          if (typeof calMeta.summary === 'string' && calMeta.summary.trim()) {
            calendarSummary = calMeta.summary.trim();
          }
        }
      } catch {
        // Non-fatal metadata fetch failure; default summary applies
      }

      const { data: existingConn } = await adminClient
        .from('google_calendar_connections')
        .select('connected_at')
        .eq('user_id', user.id)
        .maybeSingle();

      const now = new Date().toISOString();
      const connectedAt = existingConn?.connected_at ?? now;

      await adminClient
        .from('google_calendar_connections')
        .upsert(
          {
            user_id: user.id,
            status: 'connected',
            calendar_id: 'primary',
            calendar_summary: calendarSummary,
            scope: CALENDAR_SCOPE,
            sync_token: null,
            connected_at: connectedAt,
            updated_at: now,
          },
          { onConflict: 'user_id' },
        );

      return jsonResponse({
        status: 'connected',
        calendarId: 'primary',
        calendarSummary,
        scope: CALENDAR_SCOPE,
        connectedAt,
        lastSyncedAt: null,
      });
    }

    if (req.method === 'POST' && subPath === '/disconnect') {
      const { data: tokenRow } = await adminClient
        .schema('private')
        .from('google_calendar_tokens')
        .select('encrypted_access_token, encrypted_refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (tokenRow) {
        try {
          const tokenToRevoke = tokenRow.encrypted_refresh_token
            ? await decryptSecret(tokenRow.encrypted_refresh_token)
            : await decryptSecret(tokenRow.encrypted_access_token);
          await fetch(
            `${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(tokenToRevoke)}`,
            { method: 'POST' },
          );
        } catch {
          // Best-effort remote revocation; always clear server-side tokens
        }
      }

      await adminClient
        .schema('private')
        .from('google_calendar_tokens')
        .delete()
        .eq('user_id', user.id);

      await adminClient
        .from('google_calendar_connections')
        .upsert(
          {
            user_id: user.id,
            status: 'disconnected',
            sync_token: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      return jsonResponse({ status: 'disconnected' });
    }

    return errorResponse('NOT_FOUND', 'Unsupported OAuth endpoint.', 404);
  } catch (err) {
    if (err instanceof AuthError || err instanceof CalendarServerError) {
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
