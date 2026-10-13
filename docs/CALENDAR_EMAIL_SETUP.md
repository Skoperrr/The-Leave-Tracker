# Setup for email signup and Google Calendar

The backend is implemented and the additive database migrations have been applied. The frontend remains unchanged at your request; Kopano needs to add signup/profile bootstrap and the calendar settings page using [EMAIL_CALENDAR_BACKEND_HANDOFF.md](EMAIL_CALENDAR_BACKEND_HANDOFF.md). The hosted deployment must include these backend changes before the production callback can be used. Real Google connection, event creation and invitation receipts are not yet verified.

## Email

In Supabase Authentication, enable Email, allow new-user signup and keep Confirm email on. Configure custom SMTP for confirmation/recovery delivery to real addresses. Set Site URL to `https://the-leave-tracker-skfc.vercel.app` and allow `https://the-leave-tracker-skfc.vercel.app/sign-in` for confirmation redirects. Existing demo accounts are already confirmed and use ordinary email/password sign-in. Google sign-in can remain disabled. [Signup](https://supabase.com/docs/reference/javascript/auth-signup), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

A confirmed user first gets an empty profile. An organisation admin assigns EMPLOYEE membership and allocates leave via the documented admin endpoints. There is no automatic organisation access, ADMIN role or leave entitlement on signup.

## Google Cloud and Vercel

1. Select/create a Google Cloud project and enable **Google Calendar API**.
2. Configure Google Auth Platform Branding/Audience. For external testing, add the authorised calendar owners as test users.
3. Create an OAuth client of type **Web application**. Its authorised redirect URI must be:

   ```text
   https://the-leave-tracker-skfc.vercel.app/api/v1/integrations/google/callback
   ```

   This is the Express calendar callback. Do not use the Supabase Google sign-in callback.
4. Configure Calendar scopes `calendar.calendarlist.readonly` and `calendar.events`, plus `openid`/`email` for verifying the connecting Google identity. The backend requests offline access and consent. Each organisation's owner grants access separately and selects that organisation's separate shared writable calendar; the same canonical calendar cannot be selected by two organisation connections. [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
5. Local server settings and generated encryption/scheduler keys have been prepared in ignored `backend/.env`, without displaying them. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET there privately. The helper `npm run calendar:configure` preserves existing nonempty values.
6. In Vercel server environment variables, configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_FRONTEND_RETURN_URL, GOOGLE_TOKEN_ENCRYPTION_KEY, GOOGLE_TOKEN_KEY_VERSION, GOOGLE_INVITATION_LIMIT and CRON_SECRET from that local file. Keep all credential/encryption/scheduler variables server-only. For confirmed recipient checking, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required on the backend; never put it in Vite.
7. Redeploy the backend after configuration. GOOGLE_FRONTEND_RETURN_URL initially uses `https://the-leave-tracker-skfc.vercel.app/admin`. Preserve your working FRONTEND_ORIGINS configuration. Leaving GOOGLE_CLIENT_ID blank disables calendar routes without disabling the core app; an incomplete configuration with a client ID fails startup with field names only.
8. Through Kopano's future admin page, connect each organisation separately, list writable calendars, select its shared calendar, and run the read-only test. Only then enable invitations with consenting real members. Fictional example.com accounts are excluded from invitation delivery. Connections require actual browser consent by a Google account with write access.

External Google apps in Testing with Calendar permissions can have short-lived refresh grants. Reconnect when status says REAUTH_REQUIRED; mocked tests do not establish production consent/verification eligibility. Changing encryption keys requires keeping earlier versions in server-only GOOGLE_TOKEN_PREVIOUS_KEYS (JSON map of version to base64 key) until stored credentials are re-encrypted/reconnected; losing a key requires reconnection.

## Five-minute scheduler on Vercel Hobby

Vercel Hobby's own cron runs at most daily, so the prepared GitHub Actions workflow calls the protected worker every five minutes. Scheduling is best effort and can be delayed; queue status remains visible and the manual trigger can drain it. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [GitHub workflow schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

1. In Vercel, keep CRON_SECRET equal to the locally generated value. This authenticates the application worker.
2. In GitHub repository Settings → Secrets and variables → Actions, add secret **CALENDAR_CRON_SECRET** with that same value.
3. Your deployed site uses Vercel Authentication. Generate a Protection Bypass for Automation secret in Vercel's Deployment Protection settings. Store it as GitHub secret **VERCEL_AUTOMATION_BYPASS_SECRET**. It is sent only as a header; no secret is placed in URLs or logs. This bypasses Vercel's edge protection, while CRON_SECRET separately authenticates the worker. [Vercel automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
4. Deploy the backend and merge/push the workflow onto the default branch. Initially leave CALENDAR_SYNC_ENABLED unset/false.
5. Connect and select calendars, then run Actions → **Sync organisation calendars → Run workflow**. It should report numeric claimed/succeeded/retried/failed/cancelled counts. HTTP 302 indicates deployment protection; 401 indicates the application scheduler secret; 503 indicates missing Google server configuration. Configure a function duration sufficient for confirmed-recipient checks and Google calls (up to a few minutes); short function limits can interrupt jobs, which leases reclaim safely.
6. After the sandbox event/invitation check passes, set repository variable **CALENDAR_SYNC_ENABLED=true** to enable scheduled invocations. Only one job is processed per scheduled call; queue delays grow with volume. Run the separate backend worker more frequently/with larger batches if workload requires it. GitHub schedules require the default branch and may be disabled on inactive public repositories; monitor the workflow and last sync state.

No paid plan change, credential upload to chat, production mail send or Google grant revocation was performed by this task.

## Final live verification

Use real consenting test accounts/owners. Confirm a new email's confirmation receipt and empty workspace; have an admin assign membership/allocation. Submit a linked request, approve one organisation, and verify only its shared calendar event and intended member invitations. Confirm Google's all-day end date is exclusive and no private reason is included. Then approve the second child and verify its independent calendar/recipients. Check unrelated StrideShift users receive nothing. Retry a transient failure, reconnect after a revoked grant, and verify internal leave/calendar remain usable during Google outages. Until these steps pass, do not claim Google invitations were delivered.


## Optional connection verification before the frontend page is built

After the new backend deploys, open the app and sign in as Naledi. An admin must connect Google Calendar separately for each organisation; configured client credentials do not create an owner grant.

For D-Lab, run the contents of `backend/scripts/connect-calendar-in-browser.js` in that app page's browser console. This optional developer helper verifies the current ADMIN membership, fetches the connect URL in the same browser (including the HttpOnly nonce cookie), and opens Google consent. It does not modify frontend components or print credentials. Choose the real Google calendar owner account, grant Calendar permissions, and return to the app. A successful callback appends `calendarConnection=connected` to the admin return URL. If Google denies access, confirm the owner is an allowed test user and the exact Express callback is registered.

After consent, GET /integrations/google/calendars returns writable calendars. Select D-Lab's shared calendar via PATCH /settings with invitationsEnabled=false for the first verification, then POST /test for a read-only permission check. Selecting a calendar queues upcoming approved leave; do not enable the scheduler until the chosen calendar is intentional. Change organisationName in the helper to connect The Field Institute or StrideShift Global separately. Real invitations still require consenting real confirmed members; fictional accounts are excluded.
