# Email signup and calendar backend handoff

Scope confirmed by Victor: open email signup; admin assignment of organisation access; backend only; shared Google calendars plus invitations to confirmed active organisation members. Google sign-in is deferred. No frontend components or the existing v1 shared contract file were modified. OpenAPI 0.6 describes the implemented additions below; Kopano must align the UI with this addendum before frontend integration.

## Email signup and sign-in

The browser continues to use Supabase Auth for email/password signup and login. No application endpoint receives or stores passwords. Enable Email and new-user signup in Supabase, keep email confirmation enabled, configure custom SMTP for real confirmation/recovery delivery, and set Site URL/redirect allowlist to the deployed frontend. Supabase's default email service restricts recipients; backend tests are not evidence of SMTP delivery. [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup), [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Kopano's signup flow:

```ts
const { data, error } = await supabase.auth.signUp({
  email, password,
  options: {
    data: { full_name: fullName },
    emailRedirectTo: `${window.location.origin}/sign-in`,
  },
});
// With confirmation enabled, normally no session exists yet.
// Show a neutral "Check your email" message; do not reveal whether an account exists.
```

After confirmation and successful email/password login, call `POST /api/v1/auth/profile` with the current access token and `{fullName}` BEFORE rendering the authenticated workspace. The backend calls Supabase getUser, requires a confirmed email, binds profile ID/email to that verified identity, and creates no memberships or allocations. It ignores no privilege fields: unknown body properties are rejected. Display name is untrusted display text; render it through React's ordinary escaped text rendering. Existing profiles are preserved; disabled profiles cannot reactivate themselves.

This operation returns 200 `{data: Me}` and is idempotent. A new account has `memberships: []`; show the existing “No active organisation” state and ask an administrator to assign access. Existing sign-in remains unchanged. Do not automatically grant access based on signup email domain, a selected organisation, JWT user metadata or a browser role flag.

## Admin assignment

All operations use a verified Supabase bearer. ADMIN authority is rechecked in the exact organisation; it never carries to another organisation.

| Method/path | Body | Response |
|---|---|---|
| POST `/api/v1/admin/memberships` | `{organisationId, email, managerMembershipId?}` | 201 `{data: Membership}` using the existing shared shape |
| POST `/api/v1/admin/allocations` | `{organisationId, membershipId, leaveTypeId, year, allocatedDays}` | 201 `{data: AdminAllocation}` |

Membership assignment accepts an existing active profile by exact normalised email and creates EMPLOYEE access only. An optional manager must be another active MANAGER/ADMIN in the same organisation. Existing memberships return 409 MEMBERSHIP_EXISTS, including inactive ones; this endpoint does not reactivate or overwrite roles. No general user directory is exposed.

Allocation creation requires an active member and leave type in that organisation, an explicit policy year and nonnegative days with at most two decimal places. It creates a new allocation; an existing allocation returns 409 ALLOCATION_EXISTS. AdminAssignment and allocation writes are audited. New memberships have no assumed/default leave entitlement. Existing membership/allocation PATCH editing remains pending.

AdminAllocation fields: `id, organisationId, membershipId, leaveTypeId, year, allocatedDays` (number), `createdAt, updatedAt` (ISO timestamps). Employee privileges cannot use these admin operations. Signup and assignment add EMAIL_CONFIRMATION_REQUIRED, PROFILE_CONFLICT, MEMBERSHIP_EXISTS and ALLOCATION_EXISTS error codes to the existing error envelope.

## Calendar admin API

Prefix `/api/v1/integrations/google`. Except callback, require a verified Supabase bearer plus active ADMIN membership in the selected organisation. Endpoints return 503 GOOGLE_NOT_CONFIGURED until server credentials are configured. The Supabase Google sign-in provider is not used.

| Method/path | Input | Response |
|---|---|---|
| GET `/status` | query `{organisationId}` | `{data: GoogleStatus}` |
| GET `/connect` | query `{organisationId}` | `{data:{authorisationUrl,expiresAt}}`; sets HttpOnly browser nonce cookie |
| GET `/callback` | provider query state + code/error | 303 fixed frontend redirect with `calendarConnection` result |
| GET `/calendars` | query `{organisationId,cursor?}` | `{data:[{id,summary,timeZone,accessRole}],meta:{nextPageToken}}` |
| PATCH `/settings` | query `{organisationId}`, body `{calendarId?,invitationsEnabled?}` with at least one field | `{data: GoogleStatus}` |
| POST `/test` | query `{organisationId}` | `{data:{calendarId,writable:true,checkedAt}}`; read-only |
| DELETE `/disconnect` | query `{organisationId}` | `{data: GoogleStatus}` |
| POST `/retry` | body `{organisationId,jobId}` | `{data: GoogleStatus}` for failed/waiting jobs at current integration revision |

```ts
type GoogleStatus = {
  organisationId: string;
  provider: 'GOOGLE';
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'REAUTH_REQUIRED';
  calendarId: string | null;
  invitationsEnabled: boolean;
  lastSync: null | {
    jobId: string;
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'RETRY' | 'FAILED' | 'CANCELLED';
    attemptedAt: string | null;
    errorCode: string | null;
    invitationStatus: string | null;
    recipientCount: number | null;
  };
};
```

To connect, fetch `/connect` using `credentials: 'include'` and the bearer header, then navigate the SAME browser/tab to `authorisationUrl`. The cookie binds callback to the initiating browser. Never put Supabase access tokens in URLs or attempt to open a connect URL copied from a different CLI/browser session. Prefer the deployed same-origin setup; cross-site third-party-cookie configurations require separate coordination.

The callback is an explicit bearer-rule exception: it validates an expiring single-use hashed state and browser nonce, checks current admin access before and after Google token exchange, uses PKCE and verifies the Google identity/granted scopes. It stores only encrypted refresh credentials. Callback results contain no credential/code/token. The fixed frontend return URL initially points to `/admin`; Kopano can consume `calendarConnection` as a safe result banner.

Calendar settings must choose an actually writable calendar returned by this organisation's Google connection. The backend stores Google's canonical ID and a database uniqueness constraint prevents two organisation connections from selecting the same calendar through different aliases (409 GOOGLE_CALENDAR_ALREADY_ASSIGNED). Invitations default off. An admin enables them explicitly. Selecting a calendar or changing settings queues that organisation's upcoming active approved leave; historical expired leave is not backfilled. Settings return 409 CALENDAR_SYNC_BUSY while a live worker lease exists. Changing calendars leaves earlier calendar copies intact; reconnection/disconnect do not globally revoke a Google grant shared by other organisations.

## Approval, sync and invitation semantics

Approval atomically writes the request decision, audit, internal event and one Google outbox job when a calendar is connected/selected. It makes no Google HTTP request. Approval enqueue serializes with calendar settings so concurrent backfill cannot lose a newly approved event. Linked organisation approvals remain independent. Internal calendar and leave balances work without Google.

The worker uses only that job organisation's encrypted credential and selected calendar. AES-256-GCM binds ciphertext to organisation, provider, key version and purpose. Row leasing uses FOR UPDATE SKIP LOCKED; workers reclaim expired leases, bound retries with jitter and Retry-After, sanitise stored errors, and mark invalid grants REAUTH_REQUIRED. Event IDs are stable across retries/reconnects/settings changes for the same organisation/integration/calendar/internal event. Google insertion conflicts/timeouts are resolved by reading that deterministic ID and validating private markers; unchanged payloads do not resend update notifications. Updates use etags.

Payload: `<Employee Name> — On Leave`, all-day dates, Google-exclusive end date, private visibility, no leave reason/type/comment, and no guest modification/invitation/address discovery. Notification emails are looked up only from current active memberships/users in that organisation, verified against Supabase Auth Admin as matching confirmed emails, then rechecked against current active memberships before Google writes. Reserved demonstration domains are excluded. Public status contains counts, not attendee addresses.

The cap is an application policy of 100 recipients, configurable downward. Exceeding it creates the shared event without attendees and records INVITATION_RECIPIENT_LIMIT. There is no silent truncation. `NOTIFICATIONS_REQUESTED` means Google accepted the event API call with sendUpdates=all; it does not prove email delivery or acceptance. PARTIAL_UNCONFIRMED means some addresses were excluded, including fictional/reserved addresses. DISABLED means invitations are off. [Google event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Disconnect clears local credentials and stops future work. An already-running external write can finish; its mapping is stored as STALE and its job is not marked current. Existing Google events remain. V1 still does not allow cancelling approved leave; therefore no approved-deletion jobs are automatically emitted. The provider supports idempotent deletion for a later approved-revocation workflow, but this handoff does not expose one.

## Worker operation

`npm run calendar:sync` processes up to five jobs in a separate backend process. `GET /api/v1/internal/google-calendar-sync` processes at most one job and requires `Authorization: Bearer <CRON_SECRET>`; employee/admin Supabase tokens cannot authorise it. It is a second documented auth exception for the trusted scheduler. Per-call limits keep work bounded; additional invocations drain the queue. Do not poll it from frontend code or place CRON_SECRET in VITE variables.

The GitHub Actions workflow is prepared for Vercel Hobby. Schedules are disabled until repository variable CALENDAR_SYNC_ENABLED is true. Setup, provider consent and deployment instructions: [CALENDAR_EMAIL_SETUP.md](CALENDAR_EMAIL_SETUP.md).

## Admin membership display names

GET and POST `/api/v1/admin/memberships` return `AdminMembership`: the existing
Membership fields plus required `employeeDisplayName` from the stored profile.
GET retains exact ADMIN organisation scoping and includes inactive memberships.
No emails, Auth user IDs or nested user records are added. `/me` is unchanged.

The frontend displays `ROLE-Full-Name-ORG` for memberships and resolves manager
labels against that same organisation's list. D-Lab uses DLB, StrideShift Global
uses SSG and The Field Institute (also Field Institute) uses TFI. Full names
retain all components, with whitespace replaced by hyphens. These labels are
not unique keys; underlying UUIDs remain in form values and API payloads. Older
responses without names retain an ID fallback rather than guessed identities.
