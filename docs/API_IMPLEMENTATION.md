# API implementation status

The shared contract is unchanged. API prefix: `/api/v1`. Backend default: `http://localhost:3001`. Health, three access endpoints, four employee leave endpoints, manager queue/decision and internal calendar are implemented. Protected paths require verification; pending admin/Google paths return 401 without auth and 404 after successful auth. Google endpoints are proposed separately and are not operational.

## Implemented endpoint

**GET `/api/v1/health`** — public, no role, body or query required. Returns 200:

```json
{"data":{"status":"ok"}}
```

No database operation occurs. This proves API liveness only. A disallowed Origin header returns 403 FORBIDDEN. Unhandled errors use 500 INTERNAL_ERROR. Malformed or oversized JSON is rejected globally with 400 VALIDATION_ERROR. Unknown routes return 404 NOT_FOUND. All errors use:

```json
{"error":{"code":"NOT_FOUND","message":"Endpoint not found","details":{}}}
```

Input middleware is ready for future endpoint schemas: handlers use parsed `response.locals.validated`. It returns field paths/codes without echoing client values. The JSON body limit is 32 KB. These are infrastructure choices; no leave/business endpoint validation is claimed yet.

## Implemented access endpoints

All require `Authorization: Bearer <Supabase access token>`. The backend calls Supabase getUser(token), then queries PostgreSQL by that verified identity ID. A missing/inactive application profile returns 403 FORBIDDEN; profiles/memberships must be provisioned by the future safe Auth-backed seed/admin process. No role/user supplied by the browser is trusted.

| Method/path | Input/roles | Response |
|---|---|---|
| GET `/api/v1/me` | Active profile; no body/query required | 200 `{data: Me}` with exact shared fields and active memberships in active organisations |
| GET `/api/v1/organisations` | Active profile; no body/query required | 200 `{data:[{id,name,slug}]}` from own active memberships only |
| GET `/api/v1/organisations/:orgId/leave-types` | Active EMPLOYEE/MANAGER/ADMIN membership; UUID path | 200 `{data:[{id,organisationId,code,name}]}`; active leave types only |

Error responses: 400 VALIDATION_ERROR for an invalid organisation UUID; 401 UNAUTHENTICATED for missing/malformed/rejected tokens; 403 FORBIDDEN for unavailable profile, or ORGANISATION_MEMBERSHIP_REQUIRED for an unauthorised organisation; safe 500 INTERNAL_ERROR for provider/database outages. Membership is checked before the leave-type query. Profile and role data come from database records, not JWT user metadata.

```ts
const response = await fetch(`${apiUrl}/api/v1/me`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
});
const payload = await response.json();
if (!response.ok) throw new Error(payload.error.message);
const memberships = payload.data.memberships;
```

Verification: provider-mocked API/adapter tests pass. Fictional Auth-backed demo profiles/memberships now exist; auth:check:demo runs real sign-in and endpoint isolation checks. See TESTING.md for actual run evidence and DEMO_ACCOUNTS.md for local login credentials. OpenAPI describes these implemented routes.

## Pending endpoints (not operational)

All require verified bearer authentication once implemented. The linked contract defines request/response examples; these rows track scope rather than claiming executable APIs.

| Method | Full path | Role / inputs | Planned response |
|---|---|---|---|
| GET | `/api/v1/admin/memberships` | Org admin; organisationId required | Membership list; clarify exact shape |
| PATCH | `/api/v1/admin/memberships/:id` | Org admin; role/manager/active | Updated membership |
| PATCH | `/api/v1/admin/allocations/:id` | Org admin; allocatedDays | Updated allocation; clarify exact shape |

Planned business errors follow the shared contract: 401 UNAUTHENTICATED, 403 FORBIDDEN/ORGANISATION_MEMBERSHIP_REQUIRED, 404 NOT_FOUND for absent/hidden records, 409 OVERLAPPING_REQUEST/STATUS_CONFLICT, 422 INSUFFICIENT_BALANCE and safe 500 INTERNAL_ERROR. Exact schema validation will be documented as each route is implemented.

## Frontend health example

```ts
type Health = { data: { status: 'ok' } };
export async function getHealth(apiUrl = 'http://localhost:3001'): Promise<Health> {
  const response = await fetch(`${apiUrl}/api/v1/health`);
  if (!response.ok) throw new Error(`API unavailable (${response.status})`);
  return response.json() as Promise<Health>;
}
```

See COLLABORATION.md for integration. Kopano's frontend is present from main and unchanged. HTTP CORS tests do not constitute browser integration testing.

## Implemented employee leave endpoints — Phase 5

All four require a verified bearer and active database profile/membership. EMPLOYEE, MANAGER and ADMIN use their own employee privileges; these are not admin access to someone else's balances/history. Use real organisation UUIDs from /me, not the illustrative org-dlab text in the contract example.

| Method/path | Query/body | Success |
|---|---|---|
| GET `/api/v1/balances` | Required organisationId UUID; optional year integer 2000–9999, default current Africa/Johannesburg calendar year | 200 `{data: LeaveBalance[]}` |
| POST `/api/v1/leave-requests` | Unique organisationIds (1–20 UUIDs), leaveTypeCode (uppercase code, max 64), startDate/endDate YYYY-MM-DD; optional trimmed reason max 2000 | 201 `{data:{groupId,requests:LeaveRequest[]}}` |
| GET `/api/v1/leave-requests` | Optional organisationId/status/page/pageSize; page default 1 (max 1000000), pageSize default 20 (max 100) | 200 `{data:LeaveRequest[],meta:{page,pageSize,total}}` |
| POST `/api/v1/leave-requests/:id/cancel` | Request UUID in path; no body required | 200 `{data:LeaveRequest}` with CANCELLED status |

No frontend workingDays/userId/role/approver is accepted in submission. Unknown submission/query fields are rejected. Dates are inclusive, weekdays only; impossible dates, end-before-start, cross-year and weekend-only requests return 400 INVALID_DATE_RANGE. Public holidays and half-days remain out of v1 scope. Single-organisation submission has null groupId; multiple organisations share a UUID groupId and independently mutable children. Responses preserve selection order.

Sample balance (replace illustrative IDs with real UUIDs):

```json
{"data":[{"membershipId":"membership-uuid","leaveTypeId":"leave-type-uuid","year":2026,"allocatedDays":15,"approvedDays":0,"pendingDays":5,"remainingDays":10}]}
```

LeaveRequest responses have exactly the shared fields: id, groupId, membershipId, organisationId, organisationName, leaveTypeId, leaveTypeName, startDate, endDate, workingDays, reason, status, submittedAt, approverName, decidedAt, decisionComment. Pending/cancelled decision fields are null. Reason is returned only in the owner's history here, not a calendar payload.

History includes only the verified user's requests within currently active memberships/organisations, sorted by submittedAt then id descending. Filtering/total share a snapshot. Empty history returns data [] and total 0. Balances list active leave-type allocations for the selected year; no allocations returns []. Missing allocation for a balance-limited submission returns 422. Types explicitly balanceLimited=false may submit without allocation; overlap/weekday rules still apply.

Errors use `{error:{code,message,details}}`:

- 400 VALIDATION_ERROR: invalid UUIDs, duplicate selections, fabricated fields or pagination; INVALID_DATE_RANGE: invalid business dates.
- 401 UNAUTHENTICATED: absent/invalid tokens.
- 403 ORGANISATION_MEMBERSHIP_REQUIRED: unauthorised/inactive selected organisation; FORBIDDEN: missing/inactive profile.
- 404 NOT_FOUND: inactive/missing leave type or missing/another user's cancellation target.
- 409 OVERLAPPING_REQUEST: inclusive overlap with own PENDING/APPROVED request in the same membership, including across types; STATUS_CONFLICT: repeat/non-pending cancellation.
- 422 INSUFFICIENT_BALANCE: any selected organisation lacks allocation after reservations. Details: organisationId, requestedDays and remainingDays.
- 500 INTERNAL_ERROR: unexpected provider/database error; no secrets/stack traces returned.

Submission/cancellation persist requests and audits transactionally. Selected memberships lock in a consistent order before balance/overlap checks. Multi-org failure writes no children/group/audit. Cancelling one child preserves its siblings. Submission creates no approved calendar event or Google job.

Kopano's existing typed methods match these shapes:

```ts
const before = await api.balances(selectedOrganisationId, 2026);
const created = await api.createRequest({
  organisationIds: selectedMemberships.map(m => m.organisationId),
  leaveTypeCode: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Personal leave',
});
const history = await api.requests({ organisationId: selectedOrganisationId, page: 1, pageSize: 20 });
await api.cancelRequest(created.data.requests[0].id);
// Refetch balances/history after mutations. Display every organisation's child status.
```

The existing frontend apiClient returns the shared envelope. No frontend components were modified; full browser UI verification is a later milestone.

## Implemented manager decisions and internal calendar

All require a verified bearer and active profile/membership. IDs are real UUIDs from API responses.

| Method/full path | Role and input | Success |
|---|---|---|
| GET `/api/v1/manager/leave-requests` | MANAGER/ADMIN in required organisationId; optional status (defaults PENDING), page (1), pageSize (20, max 100) | 200 `{data:ManagerLeaveRequest[],meta:{page,pageSize,total}}` |
| POST `/api/v1/manager/leave-requests/:id/decision` | Assigned MANAGER or org ADMIN; body `{decision:'APPROVE'|'DECLINE',comment?:string}` | 200 `{data:LeaveRequest}` with approverName, decidedAt and decisionComment |
| GET `/api/v1/calendar-events` | Any active organisation member; required organisationId/from/to | 200 `{data:CalendarEvent[]}` |

Queue fields extend the exact shared LeaveRequest with employeeId and employeeDisplayName. Managers see only active members assigned to their managerMembershipId; admins see active organisation members. Own requests are excluded from review. APPROVED/DECLINED/CANCELLED filters retrieve authorised current-team history with the same pagination. A role in one organisation grants no manager access in another. The reviewing manager/admin can see the private reason on these request records.

Decisions are final in v1. Self-approval and self-decline are forbidden. DECLINE requires a nonempty trimmed comment, max 2000 characters; APPROVE comment is optional. Client role/approver/status/employee flags are rejected. Locks cover actor and owner memberships in globally consistent ID order. After locking, the service rechecks active roles, owner, assigned-team authority and pending status. Approval revalidates weekday duration, active type, overlaps and allocation. Since pending already reserves days, allocation must cover total pending + approved; approval must not deduct the same request again. Decline can release a reservation even if allocation was reduced after submission.

The guarded status update, decision metadata, audit and approved event commit in one transaction. A calendar/audit persistence failure rolls everything back. A unique requestId and upsert ensure one event. Repeated or simultaneous decisions return 409 for the losing operation and create neither duplicate event nor audit. One child approval/decline never changes another organisation's child.

Calendar bounds are inclusive and may span years; impossible/reversed dates are rejected. It returns active organisation-visible events whose requests are APPROVED and whose dates overlap the requested range, sorted by startDate/id. Pending, declined and cancelled requests are never shown as approved. Calendar payloads contain exactly id, organisationId, requestId, employeeDisplayName, title, startDate, endDate and allDay true. The title is `<Name> — On leave`; no reason, decision comment, leave type or attendee data is queried/returned. Calendar data exposes organisation absences to its active members, including those outside a manager's assigned team.

Error envelope remains `{error:{code,message,details}}`:

- 400 VALIDATION_ERROR: bad query/UUID/decision, forged fields or missing decline comment. INVALID_DATE_RANGE: impossible/reversed calendar dates.
- 401 UNAUTHENTICATED: absent/invalid bearer.
- 403 FORBIDDEN: employee role on manager queue or own decision; ORGANISATION_MEMBERSHIP_REQUIRED: unauthorised calendar organisation.
- 404 NOT_FOUND: missing/hidden request, cross-org decision or an unassigned reviewing manager. No private request details are disclosed.
- 409 STATUS_CONFLICT: no longer pending or invalidated policy/type; OVERLAPPING_REQUEST: a conflicting active request found on approval.
- 422 INSUFFICIENT_BALANCE: allocation no longer covers reservations/approved leave; request stays pending.
- 500 INTERNAL_ERROR: unexpected database/provider failure; state transaction rolls back and no credentials/internal error is exposed.

Kopano's existing API methods already match these routes:

```ts
const queue = await api.managerRequests({ organisationId, status: 'PENDING', page: 1, pageSize: 20 });
await api.decideRequest(requestId, { decision: 'APPROVE' });
// Or: await api.decideRequest(requestId, { decision: 'DECLINE', comment: 'Decision reason' });
const calendar = await api.calendar(organisationId, '2026-11-01', '2026-11-30');
// Refetch queue, own history/balance and calendar after decisions; show sibling statuses separately.
```

Overlapping team absences can be identified from event date ranges in this calendar response; no incompatible overlap endpoint/field was added. These are internal events only. No Google sync job/event/invitation exists yet.
