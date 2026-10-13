# API implementation status

The shared contract is unchanged. API prefix: `/api/v1`. Backend default: `http://localhost:3001`. Health and the three access endpoints below are implemented. Protected paths require verification before dispatch; pending paths return 401 without auth and 404 after successful auth. Google endpoints are proposed separately in GOOGLE_WORKSPACE_INTEGRATION.md and are not operational.

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
| GET | `/api/v1/balances` | Own membership; organisationId, optional year | LeaveBalance[] |
| POST | `/api/v1/leave-requests` | Active in every selected org; organisationIds, leaveTypeCode, startDate, endDate, optional reason | 201 {groupId, requests} |
| GET | `/api/v1/leave-requests` | Own requests; optional organisationId/status/page/pageSize | Requests + pagination meta |
| POST | `/api/v1/leave-requests/:id/cancel` | Pending request owner; no body | Updated request |
| GET | `/api/v1/manager/leave-requests` | Org manager/admin; organisationId, optional status/page/pageSize | Team requests + employee names + meta |
| POST | `/api/v1/manager/leave-requests/:id/decision` | Assigned manager/admin; decision APPROVE/DECLINE, optional comment (required for decline) | Updated request |
| GET | `/api/v1/calendar-events` | Active member; organisationId/from/to required | Approved CalendarEvent[] |
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

See COLLABORATION.md for the future authenticated integration sequence. There is no React application to test in this checkout; HTTP CORS tests are not a completed browser integration test.
