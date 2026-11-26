import { getSupabaseClient } from '@/services/auth/supabase.client';
import { getPublicEnvConfig } from '@/utils/env';
import type {
  CalendarConnectionInfo,
  GoogleCalendarEventDto,
  GoogleCalendarEventPayload,
  GoogleCalendarListResponse,
} from './googleCalendarMapper';

export type CalendarSyncErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'NOT_CONNECTED'
  | 'CALENDAR_REVOKED'
  | 'EVENT_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'API_ERROR';

export class GoogleCalendarError extends Error {
  readonly code: CalendarSyncErrorCode;

  constructor(code: CalendarSyncErrorCode, message: string) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.code = code;
  }
}

export const DISCONNECTED_CALENDAR_INFO: CalendarConnectionInfo = {
  status: 'disconnected',
  calendarId: 'primary',
  calendarSummary: null,
  scope: null,
  connectedAt: null,
  lastSyncedAt: null,
};

async function getEdgeFunctionAuthHeaders(): Promise<{
  baseUrl: string;
  headers: Record<string, string>;
}> {
  const client = getSupabaseClient();
  const { supabaseUrl, supabaseAnonKey } = getPublicEnvConfig();

  if (!client || !supabaseUrl || !supabaseAnonKey) {
    throw new GoogleCalendarError(
      'NOT_CONFIGURED',
      'Supabase is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect Google Calendar.',
    );
  }

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.access_token) {
    throw new GoogleCalendarError(
      'UNAUTHORIZED',
      'Sign in with Google before connecting Google Calendar.',
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

function mapServerErrorCode(code: unknown, status: number): CalendarSyncErrorCode {
  if (code === 'CALENDAR_REVOKED') return 'CALENDAR_REVOKED';
  if (code === 'NOT_CONNECTED') return 'NOT_CONNECTED';
  if (code === 'EVENT_NOT_FOUND' || status === 404) return 'EVENT_NOT_FOUND';
  if (code === 'UNAUTHORIZED' || status === 401) return 'UNAUTHORIZED';
  if (code === 'VALIDATION_ERROR' || status === 400) return 'VALIDATION_ERROR';
  return 'API_ERROR';
}

async function invokeCalendarEdge<T>(
  functionPath: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const { baseUrl, headers } = await getEdgeFunctionAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${functionPath}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch {
    throw new GoogleCalendarError(
      'NETWORK_ERROR',
      'Unable to reach Google Calendar integration service. Ensure the Calendar Edge Functions are deployed and check your connection.',
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = mapServerErrorCode(payload?.code, response.status);
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : 'Google Calendar request failed.';
    throw new GoogleCalendarError(code, message);
  }

  return payload as T;
}

/**
 * Frontend client for Google Calendar OAuth and two-way event synchronization
 * backed by Supabase Edge Functions (`google-calendar-oauth` & `google-calendar-api`).
 */
export const googleCalendarService = {
  async getConnectionStatus(): Promise<CalendarConnectionInfo> {
    return invokeCalendarEdge<CalendarConnectionInfo>(
      'google-calendar-oauth/status',
    );
  },

  async createConnectAuthUrl(redirectUri: string): Promise<string> {
    const data = await invokeCalendarEdge<{ url: string }>(
      'google-calendar-oauth/auth-url',
      {
        method: 'POST',
        body: { redirectUri },
      },
    );
    return data.url;
  },

  async exchangeOAuthCode(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<CalendarConnectionInfo> {
    return invokeCalendarEdge<CalendarConnectionInfo>(
      'google-calendar-oauth/exchange',
      {
        method: 'POST',
        body: { code, state, redirectUri },
      },
    );
  },

  async disconnect(): Promise<void> {
    await invokeCalendarEdge<{ status: string }>(
      'google-calendar-oauth/disconnect',
      { method: 'POST' },
    );
  },

  async listEvents(options?: {
    forceFullSync?: boolean;
  }): Promise<GoogleCalendarListResponse> {
    return invokeCalendarEdge<GoogleCalendarListResponse>(
      'google-calendar-api/events/list',
      {
        method: 'POST',
        body: { forceFullSync: Boolean(options?.forceFullSync) },
      },
    );
  },

  async createEvent(
    payload: GoogleCalendarEventPayload,
  ): Promise<GoogleCalendarEventDto> {
    return invokeCalendarEdge<GoogleCalendarEventDto>(
      'google-calendar-api/events/create',
      {
        method: 'POST',
        body: payload,
      },
    );
  },

  async updateEvent(
    googleEventId: string,
    payload: GoogleCalendarEventPayload,
  ): Promise<GoogleCalendarEventDto> {
    return invokeCalendarEdge<GoogleCalendarEventDto>(
      `google-calendar-api/events/${encodeURIComponent(googleEventId)}`,
      {
        method: 'PATCH',
        body: payload,
      },
    );
  },

  async deleteEvent(googleEventId: string): Promise<void> {
    await invokeCalendarEdge<{ deleted: boolean }>(
      `google-calendar-api/events/${encodeURIComponent(googleEventId)}`,
      { method: 'DELETE' },
    );
  },
};
