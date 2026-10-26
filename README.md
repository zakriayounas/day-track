# DayTrack

A compact team workspace for tasks, issues, notes, reminders, and release checklists. Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, and Supabase Postgres.

## Requirements

- Node.js 20.9 or newer
- A Supabase project

## Local setup

1. Create a project at [supabase.com](https://supabase.com/).
2. In the Supabase SQL Editor, run the complete [`supabase/schema.sql`](./supabase/schema.sql) script.
3. Copy `.env.example` to `.env.local` and fill in the **Project URL**, **publishable/anon key**, and **service_role key** from Supabase → Project Settings → API.
4. Install and start the app:

   ```powershell
   npm install
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The sign-in page is at `/login`. Configure Supabase Auth → Providers → Email to allow email/password sign-in. The `handle_new_user` trigger creates a `profiles` record for each account.

## Invite teammates

An admin can open **Team → Invite teammate**, enter the invitee's name and email, and choose `user` or `admin`. The invitation is sent with Supabase Auth email invitations. Configure SMTP/email delivery and the allowed redirect URLs under Supabase Auth settings. The server-side `/api/team/invite` route verifies the caller's active admin profile before using `SUPABASE_SERVICE_ROLE_KEY`; this key is secret and must never use a `NEXT_PUBLIC_` prefix or be exposed to browser code.

### Configure invitation email delivery

Email delivery is configured in the hosted Supabase project; it cannot be enabled by running the app locally.

1. Create an account with an SMTP email provider (for example, Resend) and verify a sending domain you control. Add the SPF/DKIM DNS records the provider gives you.
2. In Supabase Dashboard, open **Authentication → SMTP Settings**, enable custom SMTP, and enter the host, port, username, password/API key, sender email, and sender name supplied by your provider. For Resend SMTP, the host is `smtp.resend.com`, the username is `resend`, and the password is the provider API key. Use a sender address on your verified domain.
3. Open **Authentication → URL Configuration**. Set **Site URL** to the app's deployed origin. Add redirect URLs for local development (for example `http://localhost:3000/**`) and the deployed app (for example `https://daytrack.yourdomain.com/**`).
4. Under **Authentication → Email Templates → Invite user** and **Reset password**, make sure each message contains Supabase's `{{ .ConfirmationURL }}` link. DayTrack exchanges the resulting auth code at `/auth/callback`; invitees land on `/reset-password` to set their password, and the sign-in page's **Forgot password?** action starts the same reset flow.
5. In the app's `.env.local`, set `SUPABASE_SERVICE_ROLE_KEY` using the server-only service-role key from the project API settings and restart `npm run dev`. Never commit this key or expose it in client-side code.

The app's password setup and recovery links require the exact app origin to be allowed in Supabase Auth redirect URLs. Password links expire according to the Supabase project's email/auth settings.

Supabase's built-in mail service is intended for testing and can restrict recipients/rate; configure custom SMTP for normal team invitations. If the invite API reports success but no email arrives, check the provider's send/activity logs, spam folder, verified sender/domain, and Supabase Auth logs.

If you ran the earlier version of `schema.sql` before the one-time sample loader was added, run [`supabase/demo_data_migration.sql`](./supabase/demo_data_migration.sql) once in the SQL Editor. The app will show a setup error until this migration is applied.

If you already applied that migration before team invitations were added, run the updated migration again to add/backfill profile email addresses and update the auth trigger. Restart the dev server after adding `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.

If the database schema was installed before item comments were connected, run [`supabase/comments_migration.sql`](./supabase/comments_migration.sql) in the SQL Editor. It grants comment update privileges and makes comment edits/deletes owner-only through RLS. Run the updated migration again if you already ran an earlier version.

## Create the first admin

Create the first account using Supabase Auth (Dashboard → Authentication → Users → Add user), or sign up through an admin-managed invitation flow. Then find that user's UUID in Authentication → Users and promote the matching profile in the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'AUTH_USER_UUID';
```

For a first login, use `/login` with that account. Do not expose a service-role key in the browser. The schema intentionally does not grant admin rights to the first account automatically.

## Included database protections

- Role-aware row-level security for profiles, items, comments, releases, platforms, release steps, and activity.
- Regular users can view workspace items, create items, update items assigned to or created by them, and delete only items they created.
- Admins manage team profiles, platforms, releases, and release content.
- Public release pages call `public_release_by_token`, a security-definer RPC returning only the public release fields. All base tables remain closed to anonymous access.
- `public.platforms` is seeded with Admin, Website, and Client.
- `workspace_settings` records the one-time sample-data load. `load_demo_data_once()` is an admin-only, transactional RPC and prevents a second load at the database level.

## Using the workspace

- The app requires a Supabase session and an active profile. It does not insert or display sample records automatically.
- Items, statuses, assignees, and reminders load from and save to Supabase. Admins see an optional first-login dialog to load sample data; choosing “Not now” leaves the workspace empty. The sample-data RPC can succeed only once per workspace.
- Release summary/details are read from the releases table. The broader release editor, team invitations, and complete activity timeline are not yet connected. Item comments support creating, editing, and deleting the current user's own comments.

## Reminders

The browser scheduler checks due local reminders and, when a signed-in Supabase session is available, polls the RLS-protected items table every 45 seconds. The in-app reminder list supports snoozing (10 minutes, 1 hour, or 1 day) and dismissing. The browser's native Notification API is permission-gated; reminders work only while the app/browser is open. A service worker handles notification clicks. For delivery while closed, add Web Push subscriptions, a server-side scheduler/queue, and a push service such as the Web Push protocol; never send push credentials to the client.

## Public releases

Public release data is available at `/r/[token]` only when a release has a matching `public_token` and `public_enabled = true`. The RPC is prepared in the schema; the UI includes copy-link, print-to-PDF, and Markdown download actions. Keep generated tokens random and unguessable, and disable or rotate a token if a link is no longer public.

## Current preview and assumptions

- Supabase email/password sign-in, workspace items, item status/assignee changes, reminders, and public release lookup are connected to Supabase.
- The SQL schema defines the broader data model and RLS boundaries; release administration, invitations, and full activity capture still require connecting those UI actions to their Supabase tables.
- Releases represent one deployment spanning multiple platforms. SQL steps, pre/post checklists, release updates, public visibility, and activity records have separate tables.
- PDF download uses the browser print dialog and its “Save as PDF” option.
- Repeating reminders advance by one day or one week after notification.
