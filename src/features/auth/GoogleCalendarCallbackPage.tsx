import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';
import { useGoogleCalendarStore } from '@/stores/useGoogleCalendarStore';

/**
 * Handles the dedicated Google Calendar OAuth authorization callback, exchanges
 * the single-use authorization code via Supabase Edge Functions, triggers an
 * initial two-way calendar sync, and redirects cleanly into `/calendar`.
 */
export function GoogleCalendarCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authStatus = useAuthStore((state) => state.status);
  const completeOAuthCallback = useGoogleCalendarStore(
    (state) => state.completeOAuthCallback,
  );
  const syncNow = useGoogleCalendarStore((state) => state.syncNow);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (authStatus === 'loading' || handledRef.current) return;

    const oauthError = searchParams.get('error');
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    window.history.replaceState({}, '', '/auth/google-calendar/callback');

    if (oauthError) {
      handledRef.current = true;
      setErrorMessage(
        oauthError === 'access_denied'
          ? 'Google Calendar authorization was cancelled. Your local calendar remains available.'
          : `Google Calendar authorization returned an error (${oauthError}).`,
      );
      return;
    }

    if (authStatus !== 'authenticated') {
      handledRef.current = true;
      setErrorMessage(
        'Your Nexus session expired before Google Calendar setup finished. Please sign in and retry.',
      );
      return;
    }

    if (!code || !state) {
      handledRef.current = true;
      setErrorMessage('Missing Google Calendar authorization parameters.');
      return;
    }

    handledRef.current = true;
    void completeOAuthCallback(code, state)
      .then(async () => {
        await syncNow({ forceFullSync: true });
        navigate('/calendar', { replace: true });
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to connect Google Calendar.',
        );
      });
  }, [authStatus, searchParams, completeOAuthCallback, syncNow, navigate]);

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-2.5">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h1 className="font-serif text-base font-medium tracking-[-0.02em]">
                Google Calendar not connected
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
              <Link to="/calendar">Open Calendar</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <LoadingState label="Connecting Google Calendar & syncing events…" />
    </main>
  );
}
