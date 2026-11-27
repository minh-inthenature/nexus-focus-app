import type { Session, User } from '@supabase/supabase-js';
import {
  closeExternalAuthBrowser,
  isNativeCapacitorApp,
  NATIVE_OAUTH_REDIRECT_URL,
  openExternalAuthUrl,
  parseOAuthCallbackUrl,
} from '@/services/native/capacitor.service';
import type {
  AuthService,
  AuthSession,
  AuthStateListener,
  AuthUser,
} from './auth.service';
import { getSupabaseClient } from './supabase.client';

function mapUser(user: User): AuthUser {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    typeof metadata?.full_name === 'string'
      ? metadata.full_name
      : typeof metadata?.name === 'string'
        ? metadata.name
        : undefined;
  const avatarUrl =
    typeof metadata?.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata?.picture === 'string'
        ? metadata.picture
        : undefined;

  return {
    id: user.id,
    email: user.email ?? '',
    ...(fullName ? { displayName: fullName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mapSession(session: Session | null): AuthSession | null {
  if (!session || !session.user) return null;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : Date.now();
  if (expiresAtMs <= Date.now()) {
    return null;
  }

  return {
    user: mapUser(session.user),
    expiresAt: new Date(expiresAtMs).toISOString(),
    provider: 'google',
  };
}

/**
 * Supabase implementation of `AuthService` using Google PKCE sign-in.
 * Requests identity scopes only; Google Drive permissions are requested
 * separately via the dedicated Drive OAuth flow.
 */
export class SupabaseAuthService implements AuthService {
  public isConfigured(): boolean {
    return getSupabaseClient() !== null;
  }

  public async getSession(): Promise<AuthSession | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client.auth.getSession();
    if (error) {
      throw new Error(error.message || 'Unable to verify authentication session.');
    }

    if (!data.session) return null;

    const mapped = mapSession(data.session);
    if (!mapped) {
      // Attempt silent refresh for expired access tokens
      const { data: refreshed, error: refreshErr } =
        await client.auth.refreshSession();
      if (refreshErr || !refreshed.session) {
        await client.auth.signOut({ scope: 'local' });
        return null;
      }
      return mapSession(refreshed.session);
    }

    return mapped;
  }

  public async signInWithGoogle(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        'Supabase authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.',
      );
    }

    if (isNativeCapacitorApp()) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: NATIVE_OAUTH_REDIRECT_URL,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to start Google sign-in.');
      }
      if (!data?.url) {
        throw new Error('Supabase did not return an OAuth sign-in URL.');
      }

      await openExternalAuthUrl(data.url);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to start Google sign-in.');
    }
  }

  public async completeNativeOAuthUrl(
    rawUrl: string,
  ): Promise<AuthSession | null> {
    const parsed = parseOAuthCallbackUrl(rawUrl);
    if (!parsed.isOAuthCallback) {
      return null;
    }

    await closeExternalAuthBrowser();

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase authentication is not configured.');
    }

    if (parsed.code) {
      return this.completeAuthCallback(parsed.code);
    }

    if (parsed.accessToken && parsed.refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) {
        throw new Error(
          error.message || 'Failed to complete native Google sign-in.',
        );
      }
      return mapSession(data.session);
    }

    return this.getSession();
  }

  public async completeAuthCallback(code?: string | null): Promise<AuthSession | null> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase authentication is not configured.');
    }

    // Return existing session first if already established (e.g. React StrictMode double-mount)
    const existing = await this.getSession();
    if (existing) {
      return existing;
    }

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        // Re-check session in case a concurrent exchange just succeeded
        const recovered = await this.getSession();
        if (recovered) {
          return recovered;
        }
        throw new Error(error.message || 'Failed to complete Google sign-in.');
      }
      return mapSession(data.session);
    }

    return null;
  }

  public async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client.auth.signOut();
    if (error) {
      throw new Error(error.message || 'Failed to sign out cleanly.');
    }
  }

  public onAuthStateChange(listener: AuthStateListener): () => void {
    const client = getSupabaseClient();
    if (!client) {
      return () => undefined;
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      listener(mapSession(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }
}

export const supabaseAuthService = new SupabaseAuthService();
