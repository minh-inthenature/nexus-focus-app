import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/common/LoadingState';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Guards workspace routes so unauthenticated visitors are redirected to `/login`
 * unless they explicitly entered offline Local Mode or signed in with Google.
 */
export function ProtectedRoute() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const localMode = useAuthStore((state) => state.localMode);

  if (localMode || status === 'authenticated') {
    return <Outlet />;
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="Verifying workspace session…" />
      </div>
    );
  }

  return (
    <Navigate
      to="/login"
      state={{ from: location.pathname + location.search }}
      replace
    />
  );
}
