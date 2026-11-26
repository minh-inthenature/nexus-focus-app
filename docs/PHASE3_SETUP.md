# Phase 3 Setup Guide — Supabase Auth & Google Drive Integration

This document details the manual Supabase and Google Cloud Console steps required to run live Google Sign-In and Google Drive (`drive.file`) operations in Nexus.

---

## 1. Architecture Overview

Nexus strictly separates **user authentication** from **Google Drive authorization**:

1. **Google Sign-In (Supabase Auth — Identity Only)**  
   - Uses `@supabase/supabase-js` with PKCE OAuth (`flowType: 'pkce'`).  
   - Requests identity scopes only (`openid email profile`).  
   - Returns to `/auth/callback` and protects application routes (`/` -> `/notes`, `/calendar`, `/tasks`, `/settings`).

2. **Google Drive Authorization (`drive.file` Scope — Edge Functions)**  
   - Triggered explicitly by the user from **Settings → Google Account & Drive** or the Notes Drive modal.  
   - Uses a dedicated Authorization Code + PKCE flow in `supabase/functions/google-drive-oauth`.  
   - Requests only `https://www.googleapis.com/auth/drive.file`, ensuring Nexus can create and access only its own `Nexus/` folder (`Notes/`, `Attachments/`, `Backups/`) and files it created—never scanning unrelated user Drive files.  
   - `GOOGLE_CLIENT_SECRET` and encrypted Google access/refresh tokens (AES-256-GCM) stay exclusively inside Supabase Edge Functions and `private.google_drive_tokens`.

---

## 2. Google Cloud Console Configuration

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google Drive API** under **APIs & Services → Library**.
3. Configure the **OAuth consent screen**:
   - User Type: **External** (or Internal for Google Workspace).
   - Scopes: add `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`.
   - If in **Testing** publishing status, add your test Google accounts under **Test users**.
4. Create **OAuth 2.0 Client ID** (**Application type: Web application**):
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (Vite dev)
     - `http://localhost:4173` (Vite preview)
     - `https://your-production-domain.vercel.app`
   - **Authorized redirect URIs**:
     - `https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback` *(for Supabase Auth Sign-In)*
     - `http://localhost:5173/auth/google-drive/callback` *(for local Dev Drive OAuth)*
     - `http://localhost:4173/auth/google-drive/callback` *(for local Preview Drive OAuth)*
     - `https://your-production-domain.vercel.app/auth/google-drive/callback` *(for production Drive OAuth)*
5. Save the **Client ID** and **Client Secret**.

---

## 3. Supabase Configuration

### A. Enable Google Provider in Supabase Auth
1. In the Supabase Dashboard, go to **Authentication → Providers → Google**.
2. Enable Google and enter the Google **Client ID** and **Client Secret**.
3. Go to **Authentication → URL Configuration** and add:
   - **Site URL**: `http://localhost:5173` (or your production Vercel URL)
   - **Redirect URLs**:
     - `http://localhost:5173/auth/callback`
     - `http://localhost:4173/auth/callback`
     - `https://your-production-domain.vercel.app/auth/callback`

### B. Apply SQL Migration
Run the migration in [supabase/migrations/20261125000001_phase3_google_drive.sql](file:///d:/Project/Dagon/supabase/migrations/20261125000001_phase3_google_drive.sql):

```bash
supabase db push
```

This creates:
- `private.drive_oauth_states` and `private.google_drive_tokens` (blocked from `anon` / `authenticated` PostgREST access)
- `public.drive_connections` (with `auth.uid() = user_id` RLS policies)
- `public.drive_note_mappings` (with `auth.uid() = user_id` RLS policies)

### C. Configure Edge Function Secrets & Deploy
Generate a 32-byte base64 key for token encryption:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set Edge Function secrets (never prefix with `VITE_`):

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="your-google-client-secret" \
  GOOGLE_DRIVE_REDIRECT_URI="http://localhost:5173/auth/google-drive/callback" \
  DRIVE_TOKEN_ENCRYPTION_KEY="your-32-byte-base64-key"
```

*(Note: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected into Supabase Edge Functions in hosted Supabase environments.)*

Deploy the Edge Functions:

```bash
supabase functions deploy google-drive-oauth
supabase functions deploy google-drive-api
```

---

## 4. Frontend Environment Variables (`.env.local`)

Copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Never place `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or `DRIVE_TOKEN_ENCRYPTION_KEY` in `.env.local` or any `VITE_*` variable.
