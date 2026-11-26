import { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Cloud,
  CloudOff,
  FolderCheck,
  HardDrive,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDriveStore } from '@/stores/useDriveStore';
import { useGoogleCalendarStore } from '@/stores/useGoogleCalendarStore';
import { useSyncStore } from '@/stores/useSyncStore';
import type { ThemePreference } from '@/types/theme';
import { cn } from '@/utils/cn';
import { getIntegrationConfigStatus } from '@/utils/env';
import { DataBackupSection } from './components/DataBackupSection';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: LucideIcon;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'dark', label: 'Warm Charcoal', icon: Moon },
  { value: 'forest', label: 'Forest Focus', icon: Trees },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
];

interface IntegrationRowProps {
  name: string;
  description: string;
  statusLabel: string;
  configured?: boolean;
}

function IntegrationRow({
  name,
  description,
  statusLabel,
  configured = false,
}: IntegrationRowProps) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          'inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
          configured
            ? 'border-border bg-accent text-foreground'
            : 'border-border bg-muted/60 text-muted-foreground',
        )}
      >
        {statusLabel}
      </span>
    </div>
  );
}

/**
 * Workspace settings view managing persisted appearance preferences,
 * keyboard shortcuts reference, Google Account & Drive connection, and
 * integration readiness status.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const { preference, resolvedTheme, setPreference } = useTheme();
  const integrationStatus = getIntegrationConfigStatus();

  const authStatus = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const localMode = useAuthStore((state) => state.localMode);
  const signOut = useAuthStore((state) => state.signOut);
  const exitLocalMode = useAuthStore((state) => state.exitLocalMode);

  const driveConnection = useDriveStore((state) => state.connection);
  const driveBusy = useDriveStore((state) => state.busyAction);
  const driveError = useDriveStore((state) => state.error);
  const lastOperationSummary = useDriveStore(
    (state) => state.lastOperationSummary,
  );
  const connectDrive = useDriveStore((state) => state.connectDrive);
  const disconnectDrive = useDriveStore((state) => state.disconnectDrive);
  const ensureFolders = useDriveStore((state) => state.ensureFolders);

  const calendarConnection = useGoogleCalendarStore(
    (state) => state.connection,
  );
  const calendarBusy = useGoogleCalendarStore((state) => state.busyAction);
  const calendarSyncing = useGoogleCalendarStore((state) => state.syncing);
  const calendarError = useGoogleCalendarStore((state) => state.error);
  const calendarSyncSummary = useGoogleCalendarStore(
    (state) => state.lastSyncSummary,
  );
  const connectCalendar = useGoogleCalendarStore(
    (state) => state.connectCalendar,
  );
  const disconnectCalendar = useGoogleCalendarStore(
    (state) => state.disconnectCalendar,
  );
  const syncGoogleCalendar = useGoogleCalendarStore((state) => state.syncNow);

  const syncStatus = useSyncStore((state) => state.status);
  const syncNow = useSyncStore((state) => state.syncNow);
  const retryFailed = useSyncStore((state) => state.retryFailed);
  const setConflictsDialogOpen = useSyncStore(
    (state) => state.setConflictsDialogOpen,
  );

  const [signingOut, setSigningOut] = useState(false);

  const isAuthenticated = authStatus === 'authenticated' && Boolean(session);
  const isDriveConnected = driveConnection.status === 'connected';
  const isDriveRevoked = driveConnection.status === 'revoked';
  const isCalendarConnected = calendarConnection.status === 'connected';
  const isCalendarRevoked = calendarConnection.status === 'revoked';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const handleGoToSignIn = () => {
    exitLocalMode();
    navigate('/login');
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Workspace appearance, account session, Google Drive access, and shortcuts."
      />

      {/* Google Account, Drive & Calendar */}
      <section
        className="space-y-3"
        aria-label="Google Account, Drive, and Calendar"
      >
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Google Account, Drive &amp; Calendar
          </h2>
          <p className="text-xs text-muted-foreground">
            Google Sign-In authenticates your Nexus session. Google Drive (
            <code className="font-mono">drive.file</code>) and Google Calendar (
            <code className="font-mono">calendar.events</code>) are requested
            separately with server-side token encryption.
          </p>
        </div>

        {driveError || calendarError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-foreground"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>{driveError || calendarError}</span>
          </div>
        ) : null}

        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {/* Account Row */}
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {isAuthenticated && session?.user.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt={session.user.displayName || session.user.email}
                  className="h-8 w-8 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-muted-foreground">
                  {isAuthenticated ? (
                    (session?.user.displayName?.[0] ??
                      session?.user.email[0] ??
                      'G'
                    ).toUpperCase()
                  ) : (
                    <HardDrive className="h-4 w-4" aria-hidden="true" />
                  )}
                </div>
              )}

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {isAuthenticated
                      ? session?.user.displayName || session?.user.email
                      : localMode
                        ? 'Offline Local Mode'
                        : 'Not signed in'}
                  </p>
                  <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {isAuthenticated
                      ? 'Signed in'
                      : authStatus === 'unconfigured'
                        ? 'Supabase unconfigured'
                        : 'Local only'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAuthenticated
                    ? session?.user.email
                    : 'Local IndexedDB notes remain available offline without signing in.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                >
                  {signingOut ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Sign out</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGoToSignIn}
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign in with Google</span>
                </Button>
              )}
            </div>
          </div>

          {/* Drive Connection Row */}
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isDriveConnected ? (
                  <Cloud
                    className="h-4 w-4 text-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <CloudOff
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <p className="text-sm font-medium text-foreground">
                  Google Drive Storage
                </p>
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    isDriveConnected
                      ? 'border-border bg-accent text-foreground'
                      : isDriveRevoked
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : 'border-border bg-muted/60 text-muted-foreground',
                  )}
                >
                  {isDriveConnected
                    ? 'Connected'
                    : isDriveRevoked
                      ? 'Permission revoked'
                      : 'Disconnected'}
                </span>
              </div>

              <div className="space-y-0.5 text-xs text-muted-foreground">
                {isDriveConnected ? (
                  <>
                    <p className="flex items-center gap-1.5">
                      <FolderCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        Connected folder: <code className="font-mono">Nexus/Notes</code>{' '}
                        (+ <code className="font-mono">Attachments/</code>,{' '}
                        <code className="font-mono">Backups/</code>)
                      </span>
                    </p>
                    <p>
                      Last Drive operation:{' '}
                      {lastOperationSummary ??
                        (driveConnection.lastOperationAt
                          ? new Date(
                              driveConnection.lastOperationAt,
                            ).toLocaleString()
                          : 'Folder verified')}
                    </p>
                  </>
                ) : (
                  <p>
                    {isAuthenticated
                      ? 'Connect Google Drive to export, upload, and download Markdown files inside Nexus/.'
                      : 'Sign in with a Google account first to authorize separate Google Drive access.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAuthenticated ? (
                isDriveConnected ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(driveBusy)}
                      onClick={() => void ensureFolders()}
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          driveBusy && 'animate-spin',
                        )}
                        aria-hidden="true"
                      />
                      <span>Verify folders</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(driveBusy)}
                      onClick={() => void disconnectDrive()}
                    >
                      <span>Disconnect Drive</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={Boolean(driveBusy)}
                    onClick={() => void connectDrive()}
                  >
                    {driveBusy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isDriveRevoked
                        ? 'Reconnect Google Drive'
                        : 'Connect Google Drive'}
                    </span>
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {/* Google Calendar Two-Way Sync Row */}
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar
                  className={cn(
                    'h-4 w-4',
                    isCalendarConnected
                      ? 'text-focus-accent'
                      : 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-foreground">
                  Google Calendar (Two-Way Sync)
                </p>
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    isCalendarConnected
                      ? 'border-focus-accent/50 bg-focus-surface text-focus-foreground'
                      : isCalendarRevoked
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : 'border-border bg-muted/60 text-muted-foreground',
                  )}
                >
                  {isCalendarConnected
                    ? 'Connected'
                    : isCalendarRevoked
                      ? 'Permission revoked'
                      : 'Disconnected'}
                </span>
              </div>

              <div className="space-y-0.5 text-xs text-muted-foreground">
                {isCalendarConnected ? (
                  <>
                    <p>
                      Calendar:{' '}
                      <span className="text-foreground">
                        {calendarConnection.calendarSummary ||
                          calendarConnection.calendarId}
                      </span>
                    </p>
                    <p className="tabular-nums">
                      {calendarSyncSummary ??
                        (calendarConnection.lastSyncedAt
                          ? `Last synced: ${new Date(calendarConnection.lastSyncedAt).toLocaleString()}`
                          : 'Ready for two-way event sync')}
                    </p>
                  </>
                ) : (
                  <p>
                    {isAuthenticated
                      ? 'Connect Google Calendar to create, edit, and delete events across Nexus and Google Calendar.'
                      : 'Sign in with Google first to authorize Google Calendar two-way sync.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAuthenticated ? (
                isCalendarConnected ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(calendarBusy) || calendarSyncing}
                      onClick={() => void syncGoogleCalendar()}
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          calendarSyncing && 'animate-spin',
                        )}
                        aria-hidden="true"
                      />
                      <span>{calendarSyncing ? 'Syncing…' : 'Sync now'}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(calendarBusy) || calendarSyncing}
                      onClick={() => void disconnectCalendar()}
                    >
                      <span>Disconnect Calendar</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={Boolean(calendarBusy)}
                    onClick={() => void connectCalendar()}
                  >
                    {calendarBusy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isCalendarRevoked
                        ? 'Reconnect Google Calendar'
                        : 'Connect Google Calendar'}
                    </span>
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {/* Hybrid Synchronization Status Row */}
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw
                  className={cn(
                    'h-4 w-4 text-muted-foreground',
                    syncStatus.state === 'syncing' && 'animate-spin text-foreground',
                  )}
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-foreground">
                  Hybrid Synchronization
                </p>
                <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {syncStatus.state === 'syncing'
                    ? 'Syncing…'
                    : syncStatus.conflictCount > 0
                      ? `${syncStatus.conflictCount} conflict(s)`
                      : syncStatus.failedCount > 0
                        ? `${syncStatus.failedCount} failed`
                        : syncStatus.pendingCount > 0
                          ? `${syncStatus.pendingCount} pending`
                          : isAuthenticated
                            ? 'Up to date'
                            : 'Queued locally'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pending outbox changes: <span className="font-mono text-foreground">{syncStatus.pendingCount}</span>
                {syncStatus.failedCount > 0 ? (
                  <> · Failed: <span className="font-mono text-destructive">{syncStatus.failedCount}</span></>
                ) : null}
                {syncStatus.lastSyncedAt ? (
                  <> · Last synced: {new Date(syncStatus.lastSyncedAt).toLocaleString()}</>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {syncStatus.conflictCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConflictsDialogOpen(true)}
                >
                  Resolve conflicts ({syncStatus.conflictCount})
                </Button>
              ) : null}
              {syncStatus.failedCount > 0 && isAuthenticated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void retryFailed()}
                >
                  Retry failed
                </Button>
              ) : null}
              {isAuthenticated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={syncStatus.state === 'syncing'}
                  onClick={() => void syncNow('manual')}
                >
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5',
                      syncStatus.state === 'syncing' && 'animate-spin',
                    )}
                    aria-hidden="true"
                  />
                  <span>Sync now</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Data Backup & Recovery */}
      <DataBackupSection />

      {/* Appearance */}
      <section className="space-y-3" aria-label="Appearance">
        <div>
          <h2 className="text-sm font-medium text-foreground">Appearance</h2>
          <p className="text-xs text-muted-foreground">
            Choose your workspace theme. Currently rendering{' '}
            <span className="text-foreground">
              {resolvedTheme === 'forest'
                ? 'Forest Focus'
                : resolvedTheme === 'dark'
                  ? 'Warm Charcoal'
                  : 'Light'}
            </span>{' '}
            mode.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="inline-flex rounded-lg border border-border bg-card p-1"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreference(option.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer',
                  selected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="space-y-3" aria-label="Keyboard shortcuts">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Keyboard Shortcuts
          </h2>
          <p className="text-xs text-muted-foreground">
            Global navigation controls available across the workspace.
          </p>
        </div>

        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-foreground">
              Open Command Palette
            </span>
            <div className="flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <span className="text-xs text-muted-foreground">/</span>
              <Kbd>⌘</Kbd>
              <span className="text-xs text-muted-foreground">+</span>
              <Kbd>K</Kbd>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-foreground">Toggle Sidebar</span>
            <div className="flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <span className="text-xs text-muted-foreground">/</span>
              <Kbd>⌘</Kbd>
              <span className="text-xs text-muted-foreground">+</span>
              <Kbd>\</Kbd>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture & Integrations */}
      <section className="space-y-3" aria-label="Architecture and integrations">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Architecture &amp; Integrations
          </h2>
          <p className="text-xs text-muted-foreground">
            Local-first IndexedDB storage paired with Supabase metadata and
            Google Drive files via the Phase 4 hybrid synchronization engine.
          </p>
        </div>

        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          <IntegrationRow
            name="Local Storage (IndexedDB)"
            description="Offline Markdown vault, folder hierarchy, links, tags, mappings, and attachments via Dexie.js."
            statusLabel="Active · Dexie.js IndexedDB"
            configured
          />
          <IntegrationRow
            name="Supabase (Auth & Drive Metadata)"
            description="Google sign-in, session persistence, and RLS-protected Drive note mappings."
            statusLabel={
              isAuthenticated
                ? 'Active · Signed in'
                : integrationStatus.supabaseConfigured
                  ? 'Configured · Signed out'
                  : 'Not configured'
            }
            configured={integrationStatus.supabaseConfigured}
          />
          <IntegrationRow
            name="Google Drive (Markdown Vault)"
            description="Server-mediated drive.file access scoped to Nexus/Notes, Attachments, and Backups."
            statusLabel={
              isDriveConnected
                ? 'Connected · Nexus/'
                : integrationStatus.googleDriveConfigured
                  ? 'Configured · Disconnected'
                  : 'Not configured'
            }
            configured={
              isDriveConnected || integrationStatus.googleDriveConfigured
            }
          />
          <IntegrationRow
            name="Google Calendar (Two-Way Sync)"
            description="Server-mediated calendar.events two-way synchronization with your primary Google Calendar."
            statusLabel={
              isCalendarConnected
                ? `Connected · ${calendarConnection.calendarSummary || 'Primary'}`
                : integrationStatus.googleDriveConfigured
                  ? 'Configured · Disconnected'
                  : 'Not configured'
            }
            configured={
              isCalendarConnected || integrationStatus.googleDriveConfigured
            }
          />
        </div>
      </section>
    </div>
  );
}
