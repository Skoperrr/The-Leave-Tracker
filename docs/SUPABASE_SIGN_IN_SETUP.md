# Supabase email and Google sign-in (Google sign-in deferred)

Current scope is email signup/sign-in and Google Calendar; Google sign-in is deferred. Email/calendar backend and frontend handoff: [EMAIL_CALENDAR_BACKEND_HANDOFF.md](EMAIL_CALENDAR_BACKEND_HANDOFF.md). Setup: [CALENDAR_EMAIL_SETUP.md](CALENDAR_EMAIL_SETUP.md).

The existing frontend uses React/Vite, Supabase browser authentication, and bearer tokens for the Express API. This is not the Next.js setup shown in the dashboard screenshot. Frontend components remain unchanged at the user's request.

Live public provider settings checked on 13 October 2026: **Email enabled; Google disabled**. Email/password also passed actual browser login for all six fictional accounts. Google must still be configured manually.

## Vercel deployment

The current main branch deploys backend and frontend as services in one Vercel project. Follow [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for the production configuration. Leave VITE_API_URL unset/empty to use same-origin /api/v1 requests. Leave FRONTEND_ORIGINS unset to derive exact Vercel deployment origins from system environment variables; for custom domains, configure the exact HTTPS origins explicitly. Local .env values do not configure the hosted deployment. Redeploy after changing Vercel environment variables.

Set Supabase Site URL and allowed redirect URLs to the actual HTTPS app domain for hosted sign-in. The localhost values below apply only to local development. The Google authorised JavaScript origin must likewise include the actual HTTPS app origin; the hosted Supabase callback remains the same.

## Email/password

1. Open your Supabase project → Authentication → Sign In / Providers → Email.
2. Enable Email authentication and save. Keep Confirm email enabled for ordinary new users. The fictional demo users were explicitly created as confirmed accounts and require no mail delivery.
3. Under Authentication → URL Configuration, set Site URL to `http://localhost:5173` and add `http://localhost:5173/` to allowed redirect URLs. Add your actual HTTPS frontend URL when deploying.
4. The ignored `frontend/.env` is configured locally with `VITE_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The last variable accepts the project's public publishable key. Restart Vite after changing environment variables.
5. Run the backend and frontend in separate terminals with `npm run dev` in each folder, then open `http://localhost:5173`. Use a demo email and its password from ignored `backend/.demo-credentials.json`.

Email/password authentication does not itself enable magic links, signup or password recovery screens: the existing UI exposes registered-account password login. For real confirmation/reset email delivery, configure your own SMTP service; Supabase's default SMTP has recipient restrictions and is intended for testing.

Sources: [Password-based Auth](https://supabase.com/docs/guides/auth/passwords), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Google provider — deferred reference

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select/create the project for your application.
2. Open Google Auth Platform. Configure Branding (app name, support/contact email), Audience and Data Access. Use `openid`, `userinfo.email` and `userinfo.profile`. If using an External audience in Testing, add the Google accounts that will test login under test users.
3. Under Clients, create an OAuth client with application type **Web application**.
4. Add **Authorized JavaScript origin**: `http://localhost:5173`.
5. Add **Authorized redirect URI**:

   ```text
   https://cwgcmmnsrggqujpdgong.supabase.co/auth/v1/callback
   ```

   Verify this exact URL by copying the callback displayed in Supabase's Google provider settings. This project uses hosted Supabase even during local Vite development.
6. Copy the Google Client ID and Client Secret into Supabase → Authentication → Sign In / Providers → Google. Enable Google and save. Keep the secret in provider settings; it must not be put in a `VITE_` variable or committed.
7. Keep the frontend Site URL and allowed redirects from the email steps. Add the actual deployed HTTPS origin in both Google and Supabase before production use.

Source: [Supabase Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

Provider configuration alone does not add a Google button. When coordinated with Kopano, the existing Supabase browser client can initiate the flow with:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/` },
});
```

No frontend component was changed or Google consent flow claimed as verified. Testing real Google login requires provider configuration, an approved UI entry point and an authorised real Google account. Reserved example.com demo addresses cannot be used as Google accounts.

## Application access and admin roles

Supabase verifies identity; PostgreSQL organisation memberships determine application roles. Creating a Google identity does not create a Leave Tracker profile, assign organisations or grant ADMIN. Provision the application's User using the exact Supabase Auth UUID, then the intended organisation membership through a trusted administrator. Do not assign roles from browser-supplied user metadata. An unprovisioned profile returns 404 NOT_FOUND; no active memberships produces the frontend's “No active organisation” state.

Thabo, Lerato and Sibusiso have ADMIN membership in D-Lab, The Field Institute and StrideShift Global respectively. Naledi retains a separate ADMIN membership in each organisation. Employees retain EMPLOYEE roles; manager assignments remain intact. ADMIN includes organisation-wide leave review and the read-only membership listing, with self-decision protection retained. Membership/allocation editing remains pending.

`npm run demo:promote:admins` is a deliberate demo-only operation: authenticates the marked fictional Naledi administrator, checks her ADMIN membership in each target organisation, locks the relevant memberships, promotes only the three named existing MANAGER memberships and writes audit records atomically. Reruns skip already-ADMIN targets. The ordinary account seed continues to preserve existing roles.

Google Calendar integration is a separate feature and OAuth connection. Enabling Google sign-in does not grant calendar access or implement the planned calendar worker.
