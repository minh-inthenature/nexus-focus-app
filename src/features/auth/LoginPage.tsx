import { AlertCircle, HardDrive, Loader2 } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
      />
    </svg>
  );
}

function NexusBrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5 text-foreground"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8.5 15.5V8.5L15.5 15.5V8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Minimalist authentication view consistent with Nexus's workspace design.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const isSigningIn = useAuthStore((state) => state.isSigningIn);
  const localMode = useAuthStore((state) => state.localMode);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const enterLocalMode = useAuthStore((state) => state.enterLocalMode);

  const fromState = (location.state as { from?: string } | null)?.from;
  const destination =
    fromState && fromState !== '/login' ? fromState : '/';

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="Checking session…" />
      </div>
    );
  }

  if (status === 'authenticated' || localMode) {
    return <Navigate to={destination} replace />;
  }

  const isUnconfigured = status === 'unconfigured';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-7">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <NexusBrandMark />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Nexus
            </h1>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A calm, local-first workspace for Markdown notes, personal calendar
            events, and focused tasks.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-foreground"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        {isUnconfigured ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Supabase environment variables (<code className="font-mono">VITE_SUPABASE_URL</code>,{' '}
            <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>) are not
            set. You can continue offline in Local Mode using IndexedDB.
          </div>
        ) : null}

        <div className="space-y-2.5">
          <Button
            type="button"
            variant="default"
            disabled={isUnconfigured || isSigningIn}
            onClick={() => void signInWithGoogle()}
            className="h-9 w-full justify-center"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Redirecting to Google…</span>
              </>
            ) : (
              <>
                <GoogleMark />
                <span>Continue with Google</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              enterLocalMode();
              navigate(destination, { replace: true });
            }}
            className="h-9 w-full justify-center text-xs"
          >
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Continue offline in Local Mode</span>
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Signing in verifies your Nexus account only. Google Drive access is
          requested separately if you choose to connect your Drive folder.
        </p>
      </div>
    </main>
  );
}
