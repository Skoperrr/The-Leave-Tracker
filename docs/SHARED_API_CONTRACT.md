# Leave Management System — Shared Contract
Version 1.0 | Both developers must follow this document

## Context and boundaries
Built jointly for the D-Lab Blitz Day 6 assessment. Three demo organisations: D-Lab (`dlab`), StrideShift Global (`strideshift-global`), The Field Institute (`field-institute`). Requirements from the brief: secure sign-in, employee requests/history/cancellation, manager decisions, balances, weekend-excluding duration, approved-team calendar, roles, persistent data, validation, tests, joint README/demo. The cross-organisation workflow and optional external calendar syncing are project extensions, not explicit brief requirements.

## Stack and repository
- `/frontend`: React + Vite + TypeScript (Kopano)
- `/backend`: Node.js + Express + TypeScript + Prisma + PostgreSQL (Supabase) + Supabase Auth (Victor)
- `/docs/api.md`: human-readable contract; `/backend/openapi.yaml`: authoritative OpenAPI spec, updated whenever endpoints change
- Shared repository; branches `frontend/kopano`, `backend/victor`; pull requests to `main`
- Local frontend `http://localhost:5173`, backend `http://localhost:3001`, API base `http://localhost:3001/api/v1`.
- Dates are ISO `YYYY-MM-DD` (date-only), timestamps UTC ISO 8601. Day counts are decimal numbers (v1: full working days only).
- Supabase access token passed as `Authorization: Bearer <token>` on protected requests. `userId`, role, and membership claims in request bodies are NEVER trusted.
- Public data should not include private leave notes on calendars.

## Canonical roles and status
Role per organisation membership: `EMPLOYEE | MANAGER | ADMIN`.
Leave request status: `PENDING | APPROVED | DECLINED | CANCELLED`.
Leave group status is derived from its child requests: `PENDING | PARTIALLY_APPROVED | APPROVED | DECLINED | CANCELLED | MIXED`; client must display each organisation's individual decision, never imply universal approval.
Leave types: seeded per organisation (e.g. `ANNUAL`, `SICK`); demo policies documented, not claimed as real company HR policy.

## API response envelope
Success: `{ "data": <payload> }` (for collections: `{ "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 10 } }`).
Error: `{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Not enough leave remaining", "details": {} } }`.
HTTP codes: 200 fetch/update; 201 created; 400 bad input; 401 absent/invalid auth; 403 permission denied; 404 not found or hidden cross-org object; 409 overlap/status conflict; 422 business rule (e.g. balance); 500 unexpected error.

## Core data contracts
```ts
type Role = 'EMPLOYEE'|'MANAGER'|'ADMIN';
type LeaveStatus = 'PENDING'|'APPROVED'|'DECLINED'|'CANCELLED';
type Organization = { id: string; name: string; slug: string };
type Membership = { id: string; organisationId: string; organisationName: string; role: Role; managerMembershipId: string|null; active: boolean };
type Me = { id: string; email: string; fullName: string; memberships: Membership[] };
type LeaveType = { id: string; organisationId: string; code: string; name: string };
type LeaveBalance = { membershipId: string; leaveTypeId: string; year: number; allocatedDays: number; approvedDays: number; pendingDays: number; remainingDays: number };
type LeaveRequest = { id: string; groupId: string|null; membershipId: string; organisationId: string; organisationName: string; leaveTypeId: string; leaveTypeName: string; startDate: string; endDate: string; workingDays: number; reason: string|null; status: LeaveStatus; submittedAt: string; approverName: string|null; decidedAt: string|null; decisionComment: string|null };
type CalendarEvent = { id: string; organisationId: string; requestId: string; employeeDisplayName: string; title: string; startDate: string; endDate: string; allDay: true };
```
Note: `LeaveRequest.reason` is only returned to that employee, authorised reviewing manager, or admin; not to organisation-wide calendar viewers. For manager queue include `employeeDisplayName` and `employeeId`.

## Endpoint contract
All below are prefixed `/api/v1`. Except `/health`, all require verified authentication.

| Method | Endpoint | Body / query | Accessible to | Returns |
|---|---|---|---|---|
| GET | `/health` | none | Public | `{data:{status:'ok'}}` |
| GET | `/me` | none | Any signed-in user | `Me` |
| GET | `/organisations` | none | Any signed-in user | only user's active organisations |
| GET | `/organisations/:orgId/leave-types` | none | active member | `LeaveType[]` |
| GET | `/balances?organisationId=&year=` | year optional | employee own, admin can use separate admin endpoint | `LeaveBalance[]` |
| POST | `/leave-requests` | `{organisationIds:string[], leaveTypeCode:string, startDate:string, endDate:string, reason?:string}` | employee with active membership in *all* selected organisations | `{groupId, requests:LeaveRequest[]}`; 201 |
| GET | `/leave-requests?organisationId=&status=&page=&pageSize=` | organisationId optional | signed-in employee's own | paginated `LeaveRequest[]` |
| POST | `/leave-requests/:id/cancel` | none | request owner for PENDING only | updated `LeaveRequest` |
| GET | `/manager/leave-requests?organisationId=&status=&page=&pageSize=` | organisationId required | manager/admin of org | paginated requests with employee names |
| POST | `/manager/leave-requests/:id/decision` | `{decision:'APPROVE'|'DECLINE', comment?:string}` | assigned manager or authorised admin in request org | updated `LeaveRequest` |
| GET | `/calendar-events?organisationId=&from=&to=` | all required | active org member | `CalendarEvent[]` of APPROVED requests only |
| GET | `/admin/memberships?organisationId=` | org required | org admin | membership list |
| PATCH | `/admin/memberships/:id` | role/manager/active supported | org admin | updated membership |
| PATCH | `/admin/allocations/:id` | `{allocatedDays:number}` | org admin | updated allocation |

### Submission example
`POST /api/v1/leave-requests`:
```json
{"organisationIds":["org-dlab","org-field"],"leaveTypeCode":"ANNUAL","startDate":"2026-11-02","endDate":"2026-11-06","reason":"Personal leave"}
```
Creates a linked group with *two* separate PENDING requests if both memberships, policies and balances are valid. Failure in either organisation rolls back entire submission. Weekends excluded; v1 public holidays not yet excluded (document limitation). Balance policy: remaining = allocated - approved - pending; pending reserves days, approval moves pending to approved, declining/cancelling releases reservation. All validation and balance checks happen server-side with transactional/concurrency-safe operations. Overlap handling considers PENDING and APPROVED requests of same membership; optionally warn about other employees' overlaps in manager view.

### Approval rules
Only an authorised manager/admin in the exact organisation of the request can decide. Reject self-approval. `DECLINE` requires nonempty comment. Approval is transactional with audit record and one calendar event. A request already decided must respond `409 STATUS_CONFLICT`; repeated/parallel requests must not create duplicate events or double-charge balance. Other organisation requests in the same group remain independent.

### Visibility and calendar semantics
An approved D-Lab request appears in D-Lab's *in-app* team calendar to authorised active D-Lab members; Field Institute sees the separate request only after *its* approval. Unrelated StrideShift Global users see neither. A shared event title is `<Name> — On leave` and never exposes leave reason/type if private. External Google/Microsoft Calendar syncing or sending events to every individual's personal calendar is a separate stretch integration requiring organisational permissions, reliability handling and explicit approval.

## Auth and security
Frontend signs in via Supabase Auth SDK and sends the access token. Backend verifies the token server-side and resolves the matching profile/memberships from PostgreSQL, not client-provided role flags. `ADMIN` is organisation-scoped, not global unless explicitly added later. CORS allowlist for local Vite origin plus configured deployed frontend origin. Keep `.env` and service role secrets out of frontend and Git. Use server-owned PostgreSQL database credentials only on backend. Mask or 404 cross-org objects. Validate with Zod. Rate limit auth-sensitive and mutation endpoints where feasible.

## Error codes front end must render
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_DATE_RANGE`, `OVERLAPPING_REQUEST`, `INSUFFICIENT_BALANCE`, `STATUS_CONFLICT`, `ORGANISATION_MEMBERSHIP_REQUIRED`, `INTERNAL_ERROR`.

## Shared acceptance tests
1. Employee views only own balance/history.
2. Mon–Fri request returns five working days for 2026-11-02 to 2026-11-06.
3. End date before start date, duplicate/overlap, zero available leave are rejected with clear errors.
4. Manager can approve own team in same organisation, cannot approve another org or own leave.
5. Decline requires comment and releases reserved days; pending cancellation releases reserved days.
6. Approved leave changes balance and appears on affected org in-app calendar.
7. Ayanda's D-Lab and Field Institute requests can be approved independently and shown only in the respective calendar.
8. Unrelated StrideShift Global member cannot see either event or approve either request.
9. Two concurrent approvals do not double-deduct or create duplicate events.
10. README and test evidence are complete; employee -> manager -> employee demo works.

## Explicit v1 scope / stretch features
**MVP:** login, balances, requests, cancellation, approval/decline, calendar, 3 organisations, membership/role permissions, overlap validation, seed/demo, tests.
**Stretch:** external calendar integration, mail notifications, public holidays, half days, export, sophisticated audit UI, conflict warnings. Never sacrifice MVP quality for stretch.

## Change control
Both developers agree on API and field changes before modifying them. Backend updates OpenAPI first; frontend uses types generated from or aligned to that OpenAPI. No independently guessed response shapes. Commit meaningful work on branches; peer review each other's code and document tests.
