# Backend/frontend collaboration

Victor owns backend, schema/migrations and backend documentation on `backend/victor`. Kopano owns React + Vite on `frontend/kopano`. No frontend files were modified. No automatic commits, merges or pushes were performed. Review logical changes through pull requests; agree on contract changes before either side implements them.

## What Kopano can use now

The health endpoint is available at `http://localhost:3001/api/v1/health`. Configure `VITE_API_URL=http://localhost:3001`. CORS allows `http://localhost:5173`, including preflight for Authorization and Content-Type. Backend and frontend are separate npm projects. Health, /me, /organisations and /organisations/:orgId/leave-types are implemented. Protected routes verify tokens with Supabase and require an active provisioned profile. Six fictional Auth-backed demo accounts now exist; see DEMO_ACCOUNTS.md and obtain passwords locally from the ignored credential file. Supabase business-table RLS has no browser policies: use the backend rather than querying business tables from React.

## Planned integration sequence

1. Sign in with the browser Supabase SDK and obtain the session access token. Send `Authorization: Bearer <access_token>` on each protected request. Never send a service role key or fabricated role/user flags.
2. Read `/api/v1/me`; select an active membership's organisationId. Fetch its leave types and `/balances?organisationId=...&year=2026`.
3. Submit `/leave-requests` using organisationIds, leaveTypeCode, startDate, endDate and optional reason from the exact shared contract. Display each child request's status.
4. Fetch own paginated requests; cancel a single pending child by its ID. Refetch balances and history after mutations.
5. Managers use organisationId to fetch their queue and send decision APPROVE/DECLINE. Decline requires a comment. Refetch queue, balance and calendar after a successful decision.
6. Read `/calendar-events?organisationId=...&from=2026-11-01&to=2026-11-30`. Dates are inclusive; events must contain no private reason. Only the approved organisation's event appears after a partial approval.

Authenticated TypeScript call pattern (access endpoints implemented; leave workflows pending):

```ts
type ApiError = { error: { code: string; message: string; details: Record<string, unknown> } };
export async function apiCall<T>(base: string, path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}/api/v1${path}`, { ...init, headers });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const failure = payload as ApiError;
    throw new Error(`${failure.error.code}: ${failure.error.message}`);
  }
  return payload as T;
}
```

Successful payloads are wrapped in data; pagination uses meta. Handle 401 by asking for sign-in, 403 as permission denied, 409 as stale status/overlap and 422 as a business constraint. Use the shared contract's types; do not display local guesses as saved backend state. Client role gating improves UX; backend authorisation must still check every request.

Admin allocation discovery, admin response shapes and audit visibility require agreement before the admin phase. No change to SHARED_API_CONTRACT.md was made at this milestone.

The requested Google shared-calendar/invitation expansion is proposed in GOOGLE_WORKSPACE_INTEGRATION.md. Its routes/page are not operational. Review the callback state authentication exception, writable-calendar selection endpoint and notification-email policy before frontend work. Core leave workflows must pass first; no frontend files were modified.

## Phase 5 integration

Balances, submission/history and pending cancellation match existing api.balances/createRequest/requests/cancelRequest methods. Shared field names/envelopes are unchanged. Use real UUIDs. Multi-org submission returns groupId and separate children; show each status and refetch balance/history after mutations. Backend weekdays are authoritative; pending reserves days; cancelling one child preserves others. Leave ranges stay within one year, weekends excluded, public holidays currently counted.

## Manager/calendar integration

Existing api.managerRequests/decideRequest/calendar methods now have backend implementations. Select the active organisation, then enforce UI role visibility from /me; the backend independently enforces the same role and assigned-team scope. Queue defaults to pending, with other status filters providing team history. Decline comment is required. After a decision refetch queue, employee history/balance and the selected organisation calendar. Calendar fields omit private reason/type/comment. Partial approval shows only the approved organisation's event. Full browser verification remains pending; no frontend components were modified. Admin APIs and Google integration remain pending.


## Verified frontend and admin handoff

The existing admin list now calls a working GET /admin/memberships endpoint with the existing shared Membership shape; editing remains pending. The three demo managers are ADMINs in their respective organisations. The user's explicit instruction was to keep frontend components unchanged and provide Google setup instructions only.

Actual Chrome verification passed 24 checks across all six demo accounts; see TESTING.md and verification/frontend-results.json. Kopano follow-up: resolve the Manager inbox “All statuses” mismatch (frontend omits status, backend defaults PENDING), review five frontend dependency audit entries (two critical test-tooling entries), and coordinate a Google sign-in entry point after provider setup. Email auth is currently enabled; Google is currently disabled. Setup steps are in SUPABASE_SIGN_IN_SETUP.md. New Google identities still need trusted provisioning of app profiles and organisation memberships; never grant ADMIN through browser metadata.


The latest main was pulled before this admin integration. Its Vercel Services routing, renamed application.ts factory, explicit ESM entry point, branding changes and dedicated ADMIN Leave approvals UI are preserved. The new membership-list service is injected into both standalone and Vercel entry points. Our changes do not modify the incoming frontend. Historical screenshots show the UI before the incoming branding/approval changes; their timestamped verification remains historical evidence. Production browser verification still requires the actual deployed URL.


## Email signup and calendar handoff

Victor selected open signup with no initial memberships, backend-only implementation, and invitations to confirmed active organisation members. Frontend remains unchanged. OpenAPI 0.6 and EMAIL_CALENDAR_BACKEND_HANDOFF.md document the new routes; coordinate this addendum before implementing the frontend. Signup uses Supabase SDK, then calls POST /auth/profile after email confirmation and before the authenticated workspace. Admins assign EMPLOYEE membership and allocations through new POST endpoints. Google connection uses browser-bound state/cookie and PKCE; callback is a documented bearer exception. Calendar jobs are created atomically with approvals and processed separately. Vercel Hobby uses the prepared GitHub Actions schedule, disabled until repository configuration is completed. Google sign-in is deferred; Calendar consent remains necessary. Google credentials/consent, real SMTP/signup delivery and real invitation receipts remain unverified.
