# Nexus

Nexus is a local-first, desktop-first personal knowledge management and productivity workspace unifying **Notes**, **Calendar**, and **Tasks** behind a fast, distraction-free interface.

> **Release v1.0.0 — Production Ready**  
> Built with React 19, TypeScript (strict), Tailwind CSS v4, Dexie.js (`nexus_db` v6), CodeMirror 6, Supabase Auth + Postgres RLS, and server-mediated Google Drive (`drive.file`) & Google Calendar (`calendar.events`) synchronization, plus `.ics`/`.zip` calendar import/export, portable `.zip` backup/restore, route-based code splitting, PWA shell caching, and Vercel deployment configuration.

---

## Core Features

- **Unified Home Dashboard (`/`)**: Time-of-day greeting, live daily metrics strip, chronological Today's Schedule, Task Overview (`Overdue`, `Due today`, `Upcoming`, `Recently completed`) with 1-click completion, Upcoming 7-day Events, Recent Notes, derived Recent Activity feed, Quick Actions, and customizable/reorderable sections.
- **Notes — Markdown Knowledge Base (`/notes`)**: CodeMirror 6 editing + live GFM & KaTeX math preview, collapsible nested folder explorer, `#tags`, `[[wiki-links]]` with rename updates and ambiguity disambiguation, backlinks panel, favorites, Daily Notes, IndexedDB binary attachments (validated up to 10 MB), Markdown/ZIP import & export, and `Linked Tasks` / `Linked Events` panels.
- **Tasks Management (`/tasks`)**: Quick add + full task modal, priorities (`low`, `medium`, `high`), statuses (`todo`, `in_progress`, `done`), start/due dates with range validation, tags & categories, search & filter presets, List, Kanban Board (drag-and-drop + accessible selector), Schedule views, and bidirectional Note & Calendar links.
- **Calendar Management (`/calendar`)**: Month, Week (overlap-safe columns), Day, and Agenda views, timed & canonical all-day events without timezone day-shifts, categories & subtle color accents, search & multi-filter controls, `.ics` & Google Calendar `.zip` import/export with duplicate detection, optional two-way Google Calendar sync, and live Task due-date visibility & Note linking.
- **Offline Global Search (`Ctrl+K` / `Cmd+K`)**: Debounced offline full-text & metadata search across Notes, Tasks, Calendar Events, and workspace commands with highlighted matches and keyboard navigation.
- **Hybrid Cloud Sync & Backup/Recovery (`/settings`)**:
  - **Local Mode & Offline Access**: Core Notes, Tasks, Calendar, search, and UI work offline using browser IndexedDB (`nexus_db` v5) and queue changes cleanly in `db.sync_changes`.
  - **Cloud Sync (Requires Auth + Online)**: Google Sign-In via Supabase Auth, direct Postgres RLS sync for Tasks and Calendar Events, and Edge Function–mediated Google Drive (`drive.file`) sync for Markdown notes and attachments (`Nexus/Notes`, `Nexus/Attachments`, `Nexus/Backups`).
  - **Portable Backup & Restore**: Download a complete `.zip` archive (`manifest.json`, human-readable `notes/`, binary `attachments/`, and `data/*.json` + UI preferences) and restore with pre-write schema validation and explicit merge/replace confirmation.

---

## Tech Stack

- **Frontend**: React 19, TypeScript (`strict`, `noUncheckedIndexedAccess`), Vite 6, Tailwind CSS v4, shadcn/ui-style Radix primitives, Lucide React, React Router 7, Zustand (`persist`)
- **Editors & Media**: CodeMirror 6 (`@codemirror/lang-markdown`), `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `JSZip`
- **Local Persistence & PWA**: Dexie.js 4 (`IndexedDB`), Web App Manifest (`/manifest.webmanifest`), Service Worker (`/sw.js`)
- **Backend & Cloud**: Supabase Auth + PostgreSQL with Row Level Security (RLS), Deno Edge Functions (`google-drive-oauth`, `google-drive-api`)
- **Testing**: Vitest 5 + Playwright/Chromium verification

---

## Local Development

### Prerequisites

- Node.js 20+ (verified on Node 22/26)
- npm 10+

### Installation & Scripts

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Run automated Vitest test suites
npm run test

# Run strict TypeScript check
npm run typecheck

# Run production build (tsc -b && vite build)
npm run build

# Preview production bundle locally (with Service Worker active)
npm run preview
```

---

## Environment Variables

Copy `.env.example` to `.env.local` for local cloud integration:

```bash
cp .env.example .env.local
```

| Variable | Scope | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Frontend (`VITE_*`) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (`VITE_*`) | Supabase public anonymous key (enforced by Postgres RLS) |
| `VITE_GOOGLE_CLIENT_ID` | Frontend (`VITE_*`) | Google OAuth 2.0 Web Client ID |

**Server-Only Edge Function Secrets (NEVER prefix with `VITE_` or commit to Git):**
Set via `supabase secrets set`:
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `DRIVE_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte AES-256-GCM key)

---

## Database Migrations & Cloud Setup

1. Apply all migrations in `supabase/migrations/` in chronological order (`supabase db push` or Supabase SQL Editor):
   - `20261125000001_phase3_google_drive.sql` (`private.*` token tables, `public.drive_connections`, `public.drive_note_mappings`, RLS)
   - `20261125000002_phase4_hybrid_sync.sql` (`public.sync_folders`, `public.sync_attachments`, `public.sync_state`, RLS)
   - `20261125000003_phase5_tasks.sql` (`public.tasks`, date constraint, RLS)
   - `20261125000004_phase6_calendar_events.sql` (`public.calendar_events`, date/time constraint, RLS)
   - `20261126000001_google_calendar_sync.sql` (`private.*` calendar token tables, `public.google_calendar_connections`, Google Calendar mapping columns)
2. Deploy Supabase Edge Functions (`google-drive-oauth`, `google-drive-api`, `google-calendar-oauth`, `google-calendar-api`) and configure Google Cloud OAuth 2.0 credentials with your development and production redirect URLs. See [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md) for detailed OAuth & Edge Function steps.

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design, Dexie schema, Supabase/Drive boundaries, sync engine, and backup specification
- [DEPLOYMENT.md](DEPLOYMENT.md) — Production Vercel setup, environment configuration, OAuth redirects, and verification checklist
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — v1.0.0 feature summary, security/performance fixes, and known limitations
