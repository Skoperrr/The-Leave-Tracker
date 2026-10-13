# Google Workspace integration — proposed extension

Status: the original proposal below is retained as design history. The backend now implements calendar OAuth/state/PKCE, encrypted credentials, scoped settings, transactional jobs, a leased retry worker and notification-recipient filtering. The additive migration is applied. The exact implemented API/behaviour is in EMAIL_CALENDAR_BACKEND_HANDOFF.md and OpenAPI 0.6; setup is in CALENDAR_EMAIL_SETUP.md. Frontend remains unchanged. No live Google owner connection, event creation or invitation receipt is verified; credentials, consent and scheduler setup remain pending. Google sign-in is deferred.

## How it works

The manager's approval saves the approved request, decision metadata, internal calendar event, audit log and pending sync job in one PostgreSQL transaction. Balances are derived from pending/approved requests, so approval transfers a pending reservation rather than deducting days twice. Only after commit does a separate worker contact Google. A Google outage cannot roll back approval or stop the in-app calendar. Each child request in a multi-organisation group enqueues its own organisation's job only when that child is approved.

Use the official `googleapis` Node client when implementing the provider adapter. Keep Google requests out of HTTP controllers and approval transactions. The worker obtains only the job organisation's integration; it never chooses another organisation's credentials as a fallback. Put organisation IDs in composite foreign keys and unique keys, not only service filters.

## Proposed database additions (not migrated)

| Model | Fields and constraints |
|---|---|
| OrganisationCalendarIntegration | UUID id; unique organisationId; provider GOOGLE; nullable selected googleCalendarId; connectedByUserId; verified Google account subject; status DISCONNECTED/CONNECTED/REAUTH_REQUIRED; encryptedRefreshToken; keyVersion; invitationsEnabled default false; configurationRevision; createdAt/updatedAt. Unique (id, organisationId) for child foreign keys. |
| CalendarSyncJob | UUID id; organisationId; integrationId; internal calendarEventId; operation UPSERT/DELETE; eventRevision; integrationRevision; state PENDING/PROCESSING/SUCCEEDED/RETRY/FAILED/CANCELLED; attempts; nextAttemptAt; leaseExpiresAt; leaseOwner; allowlisted lastErrorCode; createdAt/updatedAt. Unique (calendarEventId, eventRevision, operation). Composite FKs ensure event and integration belong to its organisation. Index (state, nextAttemptAt), (organisationId, createdAt). |
| ExternalCalendarEvent | UUID id; organisationId; integrationId; calendarEventId; googleCalendarId snapshot; googleEventId; etag; lastSyncedRevision; syncStatus; invitationStatus; recipientCount; createdAt/updatedAt. Unique (integrationId, calendarEventId); unique (googleCalendarId, googleEventId). Same-organisation composite FKs. |
| GoogleOAuthState | Hash of random single-use state; initiating administrator userId/membershipId; organisationId; configurationRevision; encrypted PKCE verifier where supported; expiresAt; consumedAt. Short expiry and atomic consumption. |

Memberships also need an organisation-specific authorised notification address and authorisation/verification timestamps, or an explicitly agreed rule that uses a confirmed account email. No arbitrary email array from the browser may become attendees. Notification-email provisioning and its admin contract must be agreed before invitations go live. A user's membership in two organisations does not authorise inviting either organisation to the other's event.

Store refresh tokens encrypted with AES-256-GCM, a fresh nonce, authentication tag and organisation/provider identity bound as additional authenticated data. Keep the 32-byte key outside PostgreSQL/source control, version it for rotation, and restrict token decryption to the worker/OAuth service. Do not log OAuth codes, raw provider errors, access tokens, state values or refresh tokens. RLS on integration/outbox/credential tables must exclude browser access. Runtime startup must validate configured provider secrets; public status responses contain no encrypted credential material.

## Proposed API contract additions

Prefix `/api/v1/integrations/google`. Except callback, all require a verified Supabase bearer token and active ADMIN membership in the selected organisation. Organisation selectors are required; possession of an ID is never permission. Shared success/error envelopes remain unchanged. These paths are **pending** and not mounted in Express.

| Method/path | Input | Proposed response/behaviour |
|---|---|---|
| GET `/status?organisationId=...` | UUID query | 200 data: GoogleStatus below |
| GET `/connect?organisationId=...` | UUID query | 200 data: {authorisationUrl, expiresAt}. Frontend fetches with bearer, then navigates to the returned Google URL. Creates expiring state tied to verified actor and organisation. |
| GET `/callback?state=...&code=...` | Provider query; also support consent error | Validate/consume state, recheck initiating actor's current ADMIN membership, exchange code, verify granted scopes/account, encrypt token. Redirect 303 to a fixed allowlisted frontend integration route with a non-sensitive result. No arbitrary return URL. |
| DELETE `/disconnect?organisationId=...` | UUID query | 200 data: GoogleStatus. Mark disconnected, increment configuration revision, cancel unclaimed jobs, clear credential material and audit action. Preserve internal events. Explain treatment of existing Google events below. |
| PATCH `/settings?organisationId=...` | Body: {calendarId?: string, invitationsEnabled?: boolean}; require at least one field | Validate selected calendar against this connection's current writable CalendarList results. Default invitations off. 200 data: GoogleStatus. Audit changes. |
| POST `/test?organisationId=...` | No recipients/body required | 200 data: {calendarId, writable: true, checkedAt}. Read-only access/permission check; it does not send invitations or create a test absence. A separate explicit sandbox job verifies event/invitation writes later. |
| GET `/calendars?organisationId=...` | UUID query; optional cursor for pagination | **Additional proposed path needed for calendar selection:** 200 data: [{id, summary, timeZone, accessRole}], meta: {nextPageToken}. Return only writable calendars visible to this org's connection. |

```ts
type GoogleStatus = {
  organisationId: string;
  provider: 'GOOGLE';
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'REAUTH_REQUIRED';
  calendarId: string | null;
  invitationsEnabled: boolean;
  lastSync: null | {
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'RETRY' | 'FAILED' | 'CANCELLED';
    attemptedAt: string | null;
    errorCode: string | null;
  };
};
```

The callback needs a documented exception to the current contract's bearer-token rule: Google's browser redirect cannot supply the frontend's Authorization header. Its authority comes from expiring, single-use state bound to an already authenticated admin, with current database permission revalidation. Use a browser-binding nonce in a secure HTTP-only cookie as additional protection against login/consent CSRF; configure SameSite for the callback route and deployment. Never put a Supabase bearer token in a redirect URL. This exception must be explicitly adopted in the shared contract before implementation.

Proposed additional machine codes: GOOGLE_NOT_CONNECTED (409), GOOGLE_REAUTH_REQUIRED (409), INVALID_OAUTH_STATE (400), GOOGLE_CALENDAR_NOT_AUTHORISED (403), INVITATION_RECIPIENT_LIMIT (422), GOOGLE_UNAVAILABLE (500). Existing UNAUTHENTICATED/FORBIDDEN/VALIDATION_ERROR remain in use. All messages are safe summaries, not provider payloads. Sync failures are stored as allowlisted codes and shown by status rather than changing the leave decision.

## Safe event and invitation delivery

Use title `<Employee Name> — On Leave`, all-day date fields, no private reason, private/default organisation visibility, no guest modification or guest invitations, and hide other guest addresses. Our internal end date is inclusive; Google's end is exclusive, so 2–6 November 2026 becomes start.date `2026-11-02`, end.date `2026-11-07`. [Google event fields](https://developers.google.com/workspace/calendar/api/v3/reference/events/update)

When invitations are enabled, query current active memberships AND active users AND active organisation for that exact organisation. Use only authorised notification addresses, normalise/deduplicate them and exclude inactive/unrelated memberships. Make the recipient policy visible to the admin. Use attendees and `sendUpdates: 'all'` for event creation; omit attendees when invitations are off. Google sends update notifications, but user settings affect whether an invitation appears automatically in a personal calendar. Do not equate API success with delivery or acceptance. [Google event creation](https://developers.google.com/workspace/calendar/api/guides/create-events), [attendee caveats](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)

For the demonstration, adopt a configurable conservative recipient cap, initially 100. This is our application policy, not a claimed Google event limit. If exceeded, create the shared calendar event without attendees, record invitationStatus FAILED with INVITATION_RECIPIENT_LIMIT, and require an admin to narrow/approve recipients before retrying invitations. Do not silently truncate recipients or split one absence into duplicate Google events. Google documents limitations in guest response propagation above 200 attendees; actual project limits must also be checked. [Google attendee reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)

Use a deterministic Google-compatible event ID derived from organisation, integration generation/calendar and internal event ID (hex characters fit Google's base32hex alphabet). Persist the intended ID before delivery. On timeout after insertion, fetch that exact ID first. On duplicate/409, confirm organisation/internal event markers before adopting it. If already at the desired event/recipient revision, mark the job successful without a repeated update notification. Updates use etags where available; never overwrite an unrelated event that happens to collide. This prevents duplicate events; exactly-once invitation-email delivery cannot be guaranteed by the API.

Claim jobs with PostgreSQL locking (`FOR UPDATE SKIP LOCKED`), short transactions and leases. Call Google outside the transaction. Reclaim expired leases after worker crashes. Compare integration/event revisions before outbound writes and when committing results. Disconnect cancels queued work and invalidates revisions; an in-flight external write may require reconciliation/compensating cleanup. Never mark stale results current or pretend database/provider writes are atomically reversible.

Retry network failures, 429, rate-limit 403 reasons and 5xx with bounded exponential backoff and jitter, respecting Retry-After. Bound attempts and store final failure for admin retry. Permission failures and invalid payloads require configuration changes; invalid_grant moves the integration to REAUTH_REQUIRED. Preserve an existing refresh token if reconnect returns none only when the verified account/organisation binding is unchanged. An absent token on first offline connection must be reported, not hidden. [Quota guidance](https://developers.google.com/workspace/calendar/api/guides/quota), [Google errors](https://developers.google.com/workspace/calendar/api/guides/errors)

Pending leave cancellation creates no external deletion because pending leave has no approved event. Approved-leave revocation is not yet allowed by the shared core contract. If later supported, commit an internal cancellation/update and DELETE/UPSERT job together. Treat 404/410 deletion as idempotent success. Do not resend notifications for unchanged attendee sets. Disconnection stops future sync and removes locally stored credentials; it leaves existing Google events intact by default and reports that choice. If an admin wants cleanup, perform it as an explicit action while credentials are still valid. Do not blindly revoke a Google grant on disconnect: the same account/client grant may authorise other organisation connections; coordinate revocation scope deliberately.

## Google Cloud setup Victor must complete manually

Prepare this after core workflow tests pass:

1. Create/select a development Google Cloud project; enable Google Calendar API.
2. Configure Google Auth Platform branding/audience. Use an appropriate Workspace audience; Internal is suitable only where all connecting accounts belong to the supported Workspace organisation. For separate organisations/external testing, configure External and add authorised test calendar owners.
3. Configure only the needed Calendar scopes: calendar.calendarlist.readonly for selection and calendar.events for shared calendar writes. If the integration is restricted to owner-connected calendars, consider calendar.events.owned instead. Do not request full-calendar administration or Gmail scopes. [Scope choices](https://developers.google.com/workspace/calendar/api/auth)
4. Create an OAuth client of type Web application. Register the exact development redirect `http://localhost:3001/api/v1/integrations/google/callback`; later register the exact HTTPS production callback. Keep the client secret in backend .env, never Vite. Request offline access in the server OAuth flow. [Web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
5. Create/select three separate shared calendars. Ensure each connecting owner/admin has the required write rights on its organisation's selected calendar. Connect and select each calendar separately through the future admin page.
6. Generate and securely store an independent 32-byte encryption key for OAuth token encryption. Planned backend variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_TOKEN_ENCRYPTION_KEY, GOOGLE_TOKEN_KEY_VERSION, GOOGLE_FRONTEND_RETURN_URL. They are not consumed by current code and no real values belong in this document.
7. Use consenting test recipients before enabling invitations. Test each organisation independently, including Ayanda's partial approval case and StrideShift exclusion. Run the worker as a separate process with database access and the same encryption-key configuration.
8. Verify production consent/verification requirements for chosen scopes. External apps in Testing with Calendar scopes may receive refresh tokens expiring after seven days; handle reconnection instead of promising permanent access. [Token expiration](https://developers.google.com/identity/protocols/oauth2/)

## What Kopano needs

The proposed page fetches status with a Supabase bearer, fetches connect URL then navigates, lists only authorised writable calendars, patches selected calendar/invitation setting, polls last sync status and disconnects. Show that disconnect keeps in-app leave working and may leave already-created Google events intact. Disable unsupported controls until routes are actually implemented. Keep provider secrets out of all frontend responses. No frontend files were changed.

## Verification gate before claiming Google works

First verify persisted core submission, balance reservations, assigned manager decisions, audit/internal event transaction, independent multi-organisation approvals and concurrent-state protection. Then add mocked tests for OAuth state expiry/reuse/wrong actor/role revocation; org-specific credential access; refresh encryption/decryption/rotation; recipient isolation and settings/cap; deterministic IDs and timeout recovery; 409/429/5xx/backoff; invalid_grant; job leasing/restart; updates/deletions/disconnect and notification replay.

Finally connect real authorised Google owners, create sandbox all-day events, confirm event IDs/dates and actual invitation receipts with consenting recipients, and demonstrate partial approvals plus outage behaviour. Mocked tests do not verify Google permissions or email delivery. Until those gates pass, both shared-calendar sync and automatic invitations remain pending.
