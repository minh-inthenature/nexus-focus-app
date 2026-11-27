import { describe, expect, it } from 'vitest';
import {
  NATIVE_OAUTH_REDIRECT_URL,
  parseOAuthCallbackUrl,
} from '../capacitor.service';

describe('parseOAuthCallbackUrl', () => {
  it('parses PKCE authorization code from com.minh.vault://login-callback', () => {
    const parsed = parseOAuthCallbackUrl(
      `${NATIVE_OAUTH_REDIRECT_URL}?code=pkce-auth-code-123&state=xyz`,
    );

    expect(parsed).toEqual({
      isOAuthCallback: true,
      code: 'pkce-auth-code-123',
      accessToken: null,
      refreshToken: null,
      error: null,
    });
  });

  it('parses implicit hash tokens when present', () => {
    const parsed = parseOAuthCallbackUrl(
      `${NATIVE_OAUTH_REDIRECT_URL}#access_token=atk-1&refresh_token=rtk-2&token_type=bearer`,
    );

    expect(parsed).toEqual({
      isOAuthCallback: true,
      code: null,
      accessToken: 'atk-1',
      refreshToken: 'rtk-2',
      error: null,
    });
  });

  it('extracts OAuth error descriptions cleanly', () => {
    const parsed = parseOAuthCallbackUrl(
      `${NATIVE_OAUTH_REDIRECT_URL}?error=access_denied&error_description=User+cancelled+login`,
    );

    expect(parsed.isOAuthCallback).toBe(true);
    expect(parsed.error).toBe('User cancelled login');
    expect(parsed.code).toBeNull();
  });

  it('ignores unrelated URLs or schemes', () => {
    expect(parseOAuthCallbackUrl('https://vault.example.com/auth/callback?code=abc').isOAuthCallback).toBe(false);
    expect(parseOAuthCallbackUrl('com.minh.vault://other-route?code=abc').isOAuthCallback).toBe(false);
    expect(parseOAuthCallbackUrl('not a valid url').isOAuthCallback).toBe(false);
  });
});
