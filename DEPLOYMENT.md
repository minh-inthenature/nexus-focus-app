# Nexus Deployment Guide (Vercel + Supabase + Google Cloud)

This guide covers promoting Nexus from local development through a **Vercel Preview** deployment to **Vercel Production**.

---

## 1. Pre-Deployment Checklist

Run locally before pushing or deploying:

```bash
npm install
npm run test
npm run typecheck
npm run build
```

Verify `dist/` builds cleanly with `manifest.webmanifest`, `sw.js`, `favicon.svg`, and `icons/` copied to `dist/`.

---

## 2. Supabase Production Setup

1. **Apply Migrations** cleanly in chronological order (`supabase db push` or SQL Editor):
   - `supabase/migrations/20261125000001_phase3_google_drive.sql`
   - `supabase/migrations/20261125000002_phase4_hybrid_sync.sql`
   - `supabase/migrations/20261125000003_phase5_tasks.sql`
   - `supabase/migrations/20261125000004_phase6_calendar_events.sql`
2. **Verify RLS**: Confirm Row Level Security is enabled on:
   - `public.drive_connections`
   - `public.drive_note_mappings`
   - `public.sync_folders`
   - `public.sync_attachments`
   - `public.sync_state`
   - `public.tasks`
   - `public.calendar_events`
3. **Configure Supabase Auth Redirect URLs**:
   Under **Authentication -> URL Configuration**:
   - **Site URL**: `https://your-production-domain.vercel.app`
   - **Additional Redirect URLs**:
     - `http://localhost:5173/auth/callback`
     - `https://*-your-org.vercel.app/auth/callback` (preview deployments)
     - `https://your-production-domain.vercel.app/auth/callback`
4. **Deploy Edge Functions & Secrets**:
   ```bash
   supabase functions deploy google-drive-oauth --no-verify-jwt=false
   supabase functions deploy google-drive-api --no-verify-jwt=false

   supabase secrets set \
     GOOGLE_CLIENT_ID="your-google-oauth-client-id" \
     GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret" \
     GOOGLE_DRIVE_REDIRECT_URI="https://your-production-domain.vercel.app/auth/google-drive/callback" \
     DRIVE_TOKEN_ENCRYPTION_KEY="base64-32-byte-aes-256-gcm-key"
   ```

---

## 3. Google Cloud OAuth 2.0 Setup

In Google Cloud Console (**APIs & Services -> Credentials -> OAuth 2.0 Client ID**):
1. Ensure **Google Drive API** is enabled and OAuth consent screen requests only minimal scope (`https://www.googleapis.com/auth/drive.file`).
2. Add **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `https://your-production-domain.vercel.app`
3. Add **Authorized redirect URIs**:
   - `https://<your-supabase-ref>.supabase.co/auth/v1/callback` (for Supabase Google Sign-In)
   - `http://localhost:5173/auth/google-drive/callback` (dev Drive OAuth)
   - `https://your-production-domain.vercel.app/auth/google-drive/callback` (prod Drive OAuth)

---

## 4. Vercel Project Configuration

`vercel.json` is preconfigured in the repository root with:
- Build command (`npm run build`) and output directory (`dist`)
- SPA route rewrites mapping nested routes (`/notes/:id`, `/tasks`, `/calendar`, `/settings`, `/auth/*`) to `/index.html` while keeping `/assets/`, `/icons/`, `/sw.js`, `/manifest.webmanifest`, and `/favicon.svg` directly served
- Strict HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`)
- `Cache-Control: public, max-age=0, must-revalidate` on `/sw.js` and long-lived immutable caching on `/assets/*`

### Configure Vercel Environment Variables

Under **Vercel Project -> Settings -> Environment Variables** (configure separately for **Preview** and **Production**):

| Key | Required | Environment |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Preview & Production |
| `VITE_SUPABASE_ANON_KEY` | Yes | Preview & Production |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Preview & Production |

> **Critical**: Never add `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, or `DRIVE_TOKEN_ENCRYPTION_KEY` to Vercel frontend env vars.

---

## 5. Recommended Release Workflow

1. **GitHub Push**: Push audited code to a feature/release branch.
2. **Preview Verification**: Open the generated Vercel Preview URL and verify:
   - Google Sign-In + protected route redirect + session persistence on browser reload
   - Connecting Google Drive (`Settings -> Connect Google Drive`)
   - Creating a Note, Task, and Calendar Event -> refreshing -> confirming sync on a second device/browser with another user account verifying strict isolation
   - Downloading and restoring a `.zip` backup archive
   - Inspecting DevTools -> Application -> Manifest & Service Worker
3. **Promote to Production**: Merge to `main` (or run `vercel --prod`) and repeat smoke checks on the HTTPS production URL.

---

## 6. Rollback Procedure

1. **Frontend Rollback**: In **Vercel Dashboard -> Deployments**, promote the previous known-good production deployment to instantly revert static bundles without altering Postgres data.
2. **Database Safety**: All Phase 3–6 Postgres and Dexie v1–v5 migrations are additive (`IF NOT EXISTS`, additive columns) and preserve user data across rollbacks.
