import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Completes the Supabase Google OAuth PKCE callback and redirects into
 * the protected workspace.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completeOAuthCallback = useAuthStore(
    (state) => state.completeOAuthCallback,
  );
  const status = useAuthStore((state) => state.status);
  const storeError = useAuthStore((state) => state.error);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const oauthError = searchParams.get('error');
    const oauthDescription = searchParams.get('error_description');
    if (oauthError) {
      setCallbackError(
        oauthDescription ||
          'Google sign-in was cancelled or denied. You can try again anytime.',
      );
      return;
    }

    const code = searchParams.get('code');
    void completeOAuthCallback(code).then(() => {
      const nextStatus = useAuthStore.getState().status;
      if (nextStatus === 'authenticated') {
        navigate('/', { replace: true });
      }
    });
  }, [searchParams, completeOAuthCallback, navigate]);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true });
    }
  }, [status, navigate]);

  const errorMessage = callbackError ?? storeError;

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
              <h1 className="text-sm font-semibold">Sign-in incomplete</h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" asChild>
            <Link to="/login">Return to login</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <LoadingState label="Completing Google sign-in…" />
    </main>
  );
}
