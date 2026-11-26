# Nexus Architecture

Nexus uses a **hybrid local-first architecture** combining instant browser persistence with multi-device cloud synchronization and strict credential isolation.

```text
                       React 19 UI + Zustand Stores
                                    │
                                    ▼
                        Local Dexie Database (nexus_db v5)
                      notes, folders, attachments, tasks,
                    calendar_events, sync_changes, sync_conflicts
                                    │
                         Hybrid Sync Engine (`syncEngine`)
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
           Supabase Edge Functions           Supabase Postgres (RLS)
      google-drive-oauth / drive-api        drive_connections, sync_folders,
           AES-256-GCM Token Vault           drive_note_mappings, tasks,
                     │                           calendar_events, sync_state
                     ▼
         Google Drive (`drive.file` scope)
      Nexus/Notes/*.md · Nexus/Attachments/ · Nexus/Backups/
```

---

## 1. Local Database (`nexus_db` v5 via Dexie.js)

Schema versions increment additively in `src/services/storage/db.ts` without destructive table drops:

- **v1**: `folders`, `notes`, `note_links`, `tags`, `note_tags`, `attachments`, `note_revisions`, `offline_operations`
- **v2**: `drive_note_mappings`
- **v3**: `sync_changes` (transactional outbox), `sync_conflicts` (conflict preservation), `sync_meta` (checkpoints)
- **v4**: `tasks` (IndexedDB-first task records with `linkedNoteIds`)
- **v5**: `calendar_events` (timed + canonical UTC all-day events with `linkedNoteIds`, `linkedTaskIds`, and local IANA timezone tag)

All mutations run inside Dexie read-write transactions updating the domain entity alongside `db.sync_changes` (`create` / `update` / `delete` coalesced by `computeCoalescedOperation`). Deletions of synced records retain `deletedAt` tombstones until remote propagation completes.

---

## 2. Cloud Responsibilities & Data Ownership Boundaries

| Data Category | Primary Local Store | Cloud Storage | Access Control |
| --- | --- | --- | --- |
| Note Markdown Bodies | `db.notes` | Google Drive (`Nexus/Notes/`) | Server-mediated OAuth (`drive.file`), folder-scoped |
| Attachments (`<= 10 MB`) | `db.attachments` | Google Drive (`Nexus/Attachments/`) | Validated MIME/size + Drive folder checks |
| Note/Folder Sync Metadata | `db.drive_note_mappings`, `db.folders` | Supabase `public.drive_note_mappings`, `sync_folders`, `sync_attachments` | `auth.uid() = user_id` Postgres RLS |
| Tasks | `db.tasks` | Supabase `public.tasks` | `auth.uid() = user_id` Postgres RLS |
| Calendar Events | `db.calendar_events` | Supabase `public.calendar_events` | `auth.uid() = user_id` Postgres RLS |
| Drive OAuth PKCE & Tokens | None | Supabase `private.drive_oauth_states`, `private.google_drive_tokens` | Edge Function Service Role + AES-256-GCM only |

Markdown bodies are never duplicated inside Supabase tables, and Tasks/Calendar events are never duplicated into Google Drive Markdown files or each other's tables. Cross-module relationships store immutable UUIDs (`linkedNoteIds`, `linkedTaskIds`).

---

## 3. Synchronization & Conflict Resolution

1. **Outbox Coalescing (`src/services/sync/syncQueue.ts`)**: Consecutive offline edits merge cleanly (`create + update -> create`, `create + delete -> cancel`, `update + delete -> delete`) to prevent redundant network traffic.
2. **Crash Recovery**: `recoverStuckSyncingChanges()` resets any `syncing` entries left mid-flight on abrupt tab close back to `pending`.
3. **Deterministic Planning (`src/services/sync/syncPlanner.ts`)**: `buildSyncPlan()` computes ordered parent-first folder pushes, attachment uploads, note uploads/downloads, and independent Supabase sync actions for `tasks` and `calendar_events` (even when Google Drive is disconnected).
4. **Conflict Preservation (`src/services/sync/conflictResolver.ts`)**: Concurrent local & remote edits write conflict snapshots into `db.sync_conflicts` without silent overwrites. Users resolve conflicts via **Keep local**, **Keep remote**, or **Keep both** (preserving a conflict copy).

---

## 4. Timezone & All-Day Calendar Strategy

- **All-Day Events**: Stored at canonical UTC day bounds (`YYYY-MM-DDT00:00:00.000Z` to `YYYY-MM-DDT23:59:59.999Z`) and decoded via direct `YYYY-MM-DD` date prefix slicing when `allDay === true`, eliminating timezone/DST day-shifts across devices.
- **Timed Events**: Converted between local wall-clock `(date, HH:mm)` inputs and UTC ISO 8601 strings (`timestamptz`) using local `Date` instances and annotated with `Intl.DateTimeFormat().resolvedOptions().timeZone`.

---

## 5. Authentication & Security Architecture

- **Supabase Google Sign-In**: Frontend holds only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_GOOGLE_CLIENT_ID`. Sessions persist across reloads via Supabase Auth; expired sessions redirect unauthenticated users cleanly via `ProtectedRoute` without erasing local IndexedDB data.
- **Google Drive Proxy**: Edge Functions verify the caller's Supabase JWT via `requireAuthenticatedUser(req)`, store PKCE verifiers and AES-256-GCM–encrypted OAuth tokens inside schema `private` (explicitly revoked from `PUBLIC`, `anon`, and `authenticated`), and scope file operations exclusively inside `Nexus/`.
- **Frontend Safety**: `MarkdownPreview` sanitizes URL schemes (`safeUrlTransform`) without `dangerouslySetInnerHTML`, safely decodes URI segments, and `attachment.service.ts` rejects empty payloads, `>10 MB` binaries, directory traversal paths, and executable/HTML script uploads.

---

## 6. Backup & Restore Architecture

`src/services/storage/backup.service.ts` packages a self-contained `.zip` archive (`NEXUS_BACKUP_FORMAT = 'nexus-backup'`, schema `v1`) containing:
- `manifest.json` + `README.txt`
- Human-readable `notes/<folder>/<title>.md` with relative attachment links + binary `attachments/`
- Structured lossless `data/{folders,notes,attachments,tasks,calendar_events,settings}.json`

Restore runs full pre-write ZIP, manifest, array, attachment binary, and event range validation via `inspectBackupArchive()` before opening an atomic Dexie transaction (`merge` or explicit-confirmation `replace`) and re-indexing note links/tags and sync outbox entries.

---

## 7. Performance & PWA Shell

- **Code Splitting**: `src/app/router.tsx` lazy-loads route pages (`NotesPage`, `CalendarPage`, `TasksPage`, `SettingsPage`, `LoginPage`, callbacks) while `vite.config.ts` splits `vendor-react`, `vendor-codemirror`, `vendor-markdown`, `vendor-dexie`, and `vendor-zip` so initial landing (`/` Home) avoids loading CodeMirror (~1.6 MB) or Markdown/KaTeX chunks upfront.
- **Service Worker (`public/sw.js`)**: Caches only same-origin static assets (`/assets/*`, `/icons/*`, `/favicon.svg`, `/manifest.webmanifest`) and SPA `/index.html` navigation fallback offline. Explicitly bypasses non-GET requests, all cross-origin requests (Supabase, Google OAuth, Google Drive), and `/auth/*` callback routes.
