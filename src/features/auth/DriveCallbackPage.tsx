import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDriveStore } from '@/stores/useDriveStore';

/**
 * Handles the separate Google Drive OAuth authorization callback, exchanges
 * the single-use code server-side via Supabase Edge Functions, and clears
 * query parameters from browser history.
 */
export function DriveCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authStatus = useAuthStore((state) => state.status);
  const completeOAuthCallback = useDriveStore(
    (state) => state.completeOAuthCallback,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (authStatus === 'loading' || handledRef.current) return;

    const oauthError = searchParams.get('error');
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // Remove OAuth parameters from the URL bar promptly
    window.history.replaceState({}, '', '/auth/google-drive/callback');

    if (oauthError) {
      handledRef.current = true;
      setErrorMessage(
        oauthError === 'access_denied'
          ? 'Google Drive authorization was cancelled. Your local notes remain available.'
          : `Google Drive authorization returned an error (${oauthError}).`,
      );
      return;
    }

    if (authStatus !== 'authenticated') {
      handledRef.current = true;
      setErrorMessage(
        'Your Nexus session expired before Google Drive setup finished. Please sign in and retry.',
      );
      return;
    }

    if (!code || !state) {
      handledRef.current = true;
      setErrorMessage('Missing Google Drive authorization parameters.');
      return;
    }

    handledRef.current = true;
    void completeOAuthCallback(code, state)
      .then(() => {
        navigate('/settings', { replace: true });
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to connect Google Drive.',
        );
      });
  }, [authStatus, searchParams, completeOAuthCallback, navigate]);

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-2.5">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h1 className="text-sm font-semibold">
                Google Drive not connected
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">Back to Settings</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notes">Open Notes</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <LoadingState label="Connecting Google Drive & preparing Nexus/ folder…" />
    </main>
  );
}
