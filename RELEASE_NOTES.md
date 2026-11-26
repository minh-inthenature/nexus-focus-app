# Nexus Release Notes — v1.0.0 (Phases 0–8)

## Summary

Nexus v1.0.0 completes the 8-phase roadmap for a minimalist, desktop-first, local-first personal productivity and knowledge management web application unifying **Notes**, **Calendar**, and **Tasks**.

---

## Features Included

- **Unified Home Dashboard (`/`)**: Local-time greeting, live today overview metrics, chronological Today's Schedule, capped Task Overview (`Overdue`, `Due today`, `Upcoming`, `Recently completed`), Upcoming 7-day Events, Recent Notes, derived Recent Activity feed, Quick Actions, and persistent section show/hide + reordering.
- **Markdown Knowledge Base (`/notes`)**: CodeMirror 6 editor with GFM + KaTeX math preview, collapsible nested folders, `#tags`, `[[wiki-links]]` with ambiguity resolution & rename rewrites, backlinks, favorites, Daily Notes, IndexedDB attachments, single-note & ZIP vault export/import, and inline `Linked Tasks` / `Linked Events` panels.
- **Task Management (`/tasks`)**: Quick add & modal editor, statuses, priorities, start/due date validation, tags/categories, preset & search filters, List / Board (Kanban) / Schedule views, and bidirectional Note & Calendar linking.
- **Calendar Management (`/calendar`)**: Month, Week (overlap-safe columns), Day, and Agenda views, timed & timezone-neutral all-day events, category accents, multi-criteria filtering, `CalendarProvider` abstraction, and integrated Task due-date visibility & Note links.
- **Offline Global Search (`Ctrl+K` / `Cmd+K`)**: Instant offline debounced search across Note titles/content/tags, Task titles/descriptions, Calendar event titles/descriptions/locations, and workspace commands with highlighted match snippets.
- **Hybrid Synchronization**: Transactional Dexie (`nexus_db` v5) outbox coalescing, crash recovery, deletion tombstones, conflict detection & 3-way resolution UI (`Keep local`, `Keep remote`, `Keep both`), Supabase Postgres RLS for Tasks, Calendar Events, and sync metadata, and Edge Function–proxied Google Drive storage (`drive.file`).

---

## Phase 8 Security, Data Integrity & Performance Improvements

- **Portable Backup & Recovery (`Settings -> Data Backup & Recovery`)**: Full `.zip` export (`manifest.json` + portable `notes/` + `attachments/` + `data/*.json` + UI settings, zero credentials) and validated `merge`/`replace` restore requiring explicit confirmation.
- **Upload & Markdown Hardening**: Local attachment size (`<= 10 MB`), empty-file, directory-traversal filename sanitization, and executable/HTML MIME/extension rejection matching backend limits, plus safe URI decoding guards in Markdown preview and importer.
- **Performance Optimization**: Route-based lazy loading for Notes, Calendar, Tasks, Settings, Auth/Login, and manual Vite chunking separating initial app shell (`index` `~75 kB` gzip) from lazy-loaded CodeMirror 6 and Markdown/KaTeX chunks.
- **PWA Offline Shell & Vercel Config**: Added `public/manifest.webmanifest`, monochrome SVG icons, safe Service Worker (`public/sw.js` caching static shell only and strictly bypassing cross-origin APIs and `/auth/*`), and `vercel.json` with SPA rewrites and security headers.

---

## Architectural Decisions & Known Limitations

- **Local-First Boundaries**: Core Notes, Tasks, Calendar, Global Search, and Backup Export/Restore work completely offline. Google Sign-In, Google Drive operations, and multi-device Supabase sync require network connectivity and provisioned `.env.local` + Supabase Edge Function credentials.
- **Deferred Beyond v1.0.0**: Recurring calendar rules (`RRULE`), Google Calendar two-way sync, team/collaborative sharing, AI features, and cross-device syncing of device-local UI preferences (`nexus-theme`, dashboard section order).
- **Dependency Advisory Note**: `npm audit --omit=dev` flags 4 upstream low-severity `katex` advisory notices via `remark-math`/`rehype-katex` (`katex <= 0.18.1` vs direct `katex` `^0.19.1`; resolving requires breaking downgrades suggested by `npm audit`). `MarkdownPreview` avoids raw HTML injection and `dangerouslySetInnerHTML`.
- **Live Cloud QA Pending Environment Credentials**: Hosted Supabase two-user RLS isolation and live Preview/Production Vercel deployment require real project credentials and manual provisioning via `DEPLOYMENT.md`.
