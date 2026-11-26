import { AuthError, requireAuthenticatedUser } from '../_shared/auth.ts';
import {
  CalendarServerError,
  getValidCalendarAccessToken,
  googleCalendarFetch,
  type CalendarConnectionRow,
} from '../_shared/calendar.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

async function getConnectedCalendar(
  adminClient: Awaited<ReturnType<typeof requireAuthenticatedUser>>['adminClient'],
  userId: string,
): Promise<CalendarConnectionRow> {
  const { data: conn } = await adminClient
    .from('google_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!conn || conn.status !== 'connected') {
    throw new CalendarServerError(
      'NOT_CONNECTED',
      'Google Calendar is not connected.',
      403,
    );
  }

  return conn as CalendarConnectionRow;
}

async function listEventsWindow(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<{
  items: Record<string, unknown>[];
  nextSyncToken: string | null;
  fullSync: boolean;
}> {
  const items: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  const usingSyncToken = Boolean(syncToken);

  const now = Date.now();
  const timeMin = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '250',
    });

    if (usingSyncToken && syncToken) {
      params.set('syncToken', syncToken);
    } else {
      params.set('timeMin', timeMin);
      params.set('timeMax', timeMax);
    }

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const resp = await googleCalendarFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );

    if (resp.status === 410 && usingSyncToken) {
      throw new CalendarServerError(
        'SYNC_TOKEN_EXPIRED',
        'Incremental sync token expired.',
        410,
      );
    }

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new CalendarServerError(
        'GOOGLE_API_ERROR',
        errBody?.error?.message || 'Failed to fetch Google Calendar events.',
        resp.status,
      );
    }

    const data = await resp.json();
    if (Array.isArray(data.items)) {
      items.push(...data.items);
    }
    pageToken =
      typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined;
    if (typeof data.nextSyncToken === 'string') {
      nextSyncToken = data.nextSyncToken;
    }
  } while (pageToken);

  return {
    items,
    nextSyncToken,
    fullSync: !usingSyncToken,
  };
}

async function touchLastSyncedAt(
  adminClient: Awaited<ReturnType<typeof requireAuthenticatedUser>>['adminClient'],
  userId: string,
  nextSyncToken?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
  };
  if (nextSyncToken !== undefined) {
    patch.sync_token = nextSyncToken;
  }
  await adminClient
    .from('google_calendar_connections')
    .update(patch)
    .eq('user_id', userId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, adminClient } = await requireAuthenticatedUser(req);
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const fnIdx = segments.indexOf('google-calendar-api');
    const subPath = fnIdx >= 0 ? `/${segments.slice(fnIdx + 1).join('/')}` : '/';

    const conn = await getConnectedCalendar(adminClient, user.id);
    const calendarId = conn.calendar_id || 'primary';
    const accessToken = await getValidCalendarAccessToken(adminClient, user.id);

    // POST /events/list — incremental or full two-way sync pull
    if (req.method === 'POST' && subPath === '/events/list') {
      const body = await req.json().catch(() => ({}));
      const forceFullSync = Boolean(body?.forceFullSync);
      const tokenToUse = forceFullSync ? null : conn.sync_token;

      let result: {
        items: Record<string, unknown>[];
        nextSyncToken: string | null;
        fullSync: boolean;
      };

      try {
        result = await listEventsWindow(accessToken, calendarId, tokenToUse);
      } catch (err) {
        if (err instanceof CalendarServerError && err.code === 'SYNC_TOKEN_EXPIRED') {
          await adminClient
            .from('google_calendar_connections')
            .update({ sync_token: null })
            .eq('user_id', user.id);
          result = await listEventsWindow(accessToken, calendarId, null);
        } else {
          throw err;
        }
      }

      await touchLastSyncedAt(
        adminClient,
        user.id,
        result.nextSyncToken ?? conn.sync_token,
      );

      return jsonResponse({
        calendarId,
        items: result.items,
        nextSyncToken: result.nextSyncToken,
        fullSync: result.fullSync,
      });
    }

    // POST /events/create — create new Google Calendar event
    if (req.method === 'POST' && subPath === '/events/create') {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.summary !== 'string' || !body.summary.trim()) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Event summary is required.',
          400,
        );
      }

      const resp = await googleCalendarFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        return errorResponse(
          'GOOGLE_API_ERROR',
          errBody?.error?.message || 'Failed to create Google Calendar event.',
          resp.status,
        );
      }

      const created = await resp.json();
      await touchLastSyncedAt(adminClient, user.id);
      return jsonResponse(created, 201);
    }

    // PATCH or DELETE /events/:googleEventId
    const eventMatch = subPath.match(/^\/events\/([^/]+)$/);
    if (eventMatch) {
      const googleEventId = decodeURIComponent(eventMatch[1]!);

      if (req.method === 'PATCH') {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          return errorResponse(
            'VALIDATION_ERROR',
            'Event update payload is required.',
            400,
          );
        }

        const resp = await googleCalendarFetch(
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          },
        );

        if (resp.status === 404 || resp.status === 410) {
          return errorResponse(
            'EVENT_NOT_FOUND',
            'Google Calendar event was not found remotely.',
            404,
          );
        }

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          return errorResponse(
            'GOOGLE_API_ERROR',
            errBody?.error?.message || 'Failed to update Google Calendar event.',
            resp.status,
          );
        }

        const updated = await resp.json();
        await touchLastSyncedAt(adminClient, user.id);
        return jsonResponse(updated);
      }

      if (req.method === 'DELETE') {
        const resp = await googleCalendarFetch(
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          { method: 'DELETE' },
        );

        // Treat missing/already-deleted remote events as clean deletions
        if (resp.status !== 204 && resp.status !== 200 && resp.status !== 404 && resp.status !== 410) {
          const errBody = await resp.json().catch(() => ({}));
          return errorResponse(
            'GOOGLE_API_ERROR',
            errBody?.error?.message || 'Failed to delete Google Calendar event.',
            resp.status,
          );
        }

        await touchLastSyncedAt(adminClient, user.id);
        return jsonResponse({ deleted: true, googleEventId });
      }
    }

    return errorResponse('NOT_FOUND', 'Unsupported Calendar API endpoint.', 404);
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
