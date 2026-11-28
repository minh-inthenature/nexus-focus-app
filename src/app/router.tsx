import { lazy, Suspense, type ReactNode } from 'react';
import { Compass } from 'lucide-react';
import { createBrowserRouter, Link } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { ProtectedRoute } from '@/features/auth';
import { HomePage } from '@/features/dashboard';

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const AuthCallbackPage = lazy(() =>
  import('@/features/auth/AuthCallbackPage').then((m) => ({
    default: m.AuthCallbackPage,
  })),
);
const DriveCallbackPage = lazy(() =>
  import('@/features/auth/DriveCallbackPage').then((m) => ({
    default: m.DriveCallbackPage,
  })),
);
const GoogleCalendarCallbackPage = lazy(() =>
  import('@/features/auth/GoogleCalendarCallbackPage').then((m) => ({
    default: m.GoogleCalendarCallbackPage,
  })),
);
const NotesPage = lazy(() =>
  import('@/features/notes/NotesPage').then((m) => ({ default: m.NotesPage })),
);
const CalendarPage = lazy(() =>
  import('@/features/calendar/CalendarPage').then((m) => ({
    default: m.CalendarPage,
  })),
);
const TasksPage = lazy(() =>
  import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const HabitsPage = lazy(() =>
  import('@/features/habits/HabitsPage').then((m) => ({
    default: m.HabitsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
);

function LazyRoute({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Suspense fallback={<LoadingState label={label} />}>{children}</Suspense>
  );
}

function NotFoundPage() {
  return (
    <div className="py-12">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The workspace route you requested does not exist."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Return to Home</Link>
          </Button>
        }
      />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <LazyRoute label="Loading sign-in…">
        <LoginPage />
      </LazyRoute>
    ),
  },
  {
    path: '/auth/callback',
    element: (
      <LazyRoute label="Completing sign-in…">
        <AuthCallbackPage />
      </LazyRoute>
    ),
  },
  {
    path: '/auth/google-drive/callback',
    element: (
      <LazyRoute label="Connecting Google Drive…">
        <DriveCallbackPage />
      </LazyRoute>
    ),
  },
  {
    path: '/auth/google-calendar/callback',
    element: (
      <LazyRoute label="Connecting Google Calendar…">
        <GoogleCalendarCallbackPage />
      </LazyRoute>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'notes',
            element: (
              <LazyRoute label="Loading Notes…">
                <NotesPage />
              </LazyRoute>
            ),
          },
          {
            path: 'notes/:noteId',
            element: (
              <LazyRoute label="Loading Notes…">
                <NotesPage />
              </LazyRoute>
            ),
          },
          {
            path: 'calendar',
            element: (
              <LazyRoute label="Loading Calendar…">
                <CalendarPage />
              </LazyRoute>
            ),
          },
          {
            path: 'tasks',
            element: (
              <LazyRoute label="Loading Tasks…">
                <TasksPage />
              </LazyRoute>
            ),
          },
          {
            path: 'habits',
            element: (
              <LazyRoute label="Loading Habits…">
                <HabitsPage />
              </LazyRoute>
            ),
          },
          {
            path: 'settings',
            element: (
              <LazyRoute label="Loading Settings…">
                <SettingsPage />
              </LazyRoute>
            ),
          },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]);
