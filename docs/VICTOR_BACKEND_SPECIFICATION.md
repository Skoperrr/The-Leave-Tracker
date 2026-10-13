# Victor — Backend Specification
**Project:** D-Lab Blitz Day 6 Leave Management System  
**Partner:** Kopano (React + Vite frontend)  
**Contract:** `SHARED_API_CONTRACT.md` is binding; never invent alternative endpoints/fields.

## Mission
Deliver a secure working multi-organisation backend with persistent PostgreSQL data, Supabase Auth, roles, balances, requests, managerial decisions and organisation-scoped calendar events. Enable one employee to belong to multiple organisations with **separate organisation approvals and balances**. The briefing prioritises working core ahead of advanced features.

## Ownership
Own `/backend`, Prisma schema/migrations, seed script, API implementation, validation, access controls, security tests, OpenAPI specification, backend setup README. Review and test Kopano's React integration, but do not edit `/frontend` without agreement.

## Stack and structure
Node.js LTS + Express + TypeScript; Prisma ORM + Supabase PostgreSQL; Supabase Auth for identity; Zod request schemas; Vitest + Supertest for route tests. Organise into `/src/config`, `/src/middleware` (auth, errors), `/src/routes`, `/src/services` (business logic), `/src/repositories` (data access), `/src/utils` (dates), `/prisma` (schema and migrations), `/tests` and `/backend/openapi.yaml`. `GET /api/v1/health` public; all other endpoints bearer-token protected. Environment config validates missing secrets at startup.

## Data model and invariants
- User: UUID matching Supabase Auth, email, full name.
- Organisation: unique slug for D-Lab, StrideShift Global, The Field Institute.
- Membership: user + organisation unique, per-org role, active flag, optional same-org manager membership; do not put a single global role on User.
- LeaveType: organisation-specific with code (e.g., ANNUAL, SICK), active flag.
- Allocation/Balance: membership + leave type + year unique, `allocatedDays` numeric. Derive approved/pending/remaining from requests or safely maintained transactions (document approach).
- LeaveGroup: optional linkage for submission spanning several organisations; one child LeaveRequest per organisation.
- LeaveRequest: membership, type, leave group, date-only start/end, workingDays, optional reason, status, submittedAt, approver and decision fields. Prevent invalid statuses and cross-organisation references.
- CalendarEvent: organisation + approved request unique; date-only inclusive range; no private reasons.
- AuditLog: who did what, to which record, when, in which organisation.

## Logic
1. Validate bearer token server-side; map authenticated identity to User. Resolve role from Membership for EACH request.
2. `GET /me` returns profile and active memberships. `/organisations` only returns active memberships.
3. Submitting leave: validate organisationIds nonempty/unique, current active memberships, matching leaveTypeCode, date order, full day inclusive weekday count, applicable policy year, sufficient leave in every selected organisation, no own overlapping PENDING/APPROVED leave. Atomically create LeaveGroup + each org LeaveRequest. Fail all if one fails. Cross-year spans: reject in v1 with explicit validation or implement deliberate split allocation and document it.
4. Balance policy (demo, not real HR policy): `remaining = allocated - approved - pending`. Pending reserves; approval transfers pending to approved, so remaining doesn't drop twice; decline/cancel releases pending. Transactions and locks/serialisation guard against simultaneous overspend.
5. Review: only authorised manager or org admin of request's organisation, cannot self-approve. Decline requires comment. Record actor/date, status and audit trail. Approval creates exactly one organisation-scoped calendar event in same transaction. Concurrency-safe terminal status guards.
6. Visibility: employees only their requests and balances; manager their eligible team and calendar; org admin organisation records. Calendar returns ONLY approved events for requested active organisation, with name and dates, not notes. Distinct linked requests approve independently.
7. Validation: Zod payload/query, consistent response envelope/error codes, HTTP statuses specified in contract, date-only UTC-safe calculations, sensible pagination.
8. External Google/Outlook calendar writes explicitly stretch; never promise personal-calendar pushes without credentials/permissions. In-app calendar meets brief.

## API implementation priority
Follow the exact endpoint table, payloads, role matrix and response envelope in `SHARED_API_CONTRACT.md`. Keep `/backend/openapi.yaml` in sync. Emit stable IDs and organisationId on every relevant object. Do not expose secrets or private reasons in calendar responses.

## Database design tests
Seed fictional users: Ayanda member of D-Lab and Field Institute; D-Lab manager Thabo; Field Institute manager Lerato; a StrideShift-only employee. Include distinct demo leave types and yearly allocations. Seed Auth accounts via documented safe process rather than storing passwords in Git. Foreign keys and indexes for organisation, membership, status, dates, approver. Unique calendar event per approved request. Never use authentic staff HR data.

## Backend completion order
1. Shared repo, branching, .gitignore, TS Express scaffold, working `/api/v1/health`, README.
2. Supabase project + env vars + current Prisma config, migrations, seed and DB connectivity.
3. Auth middleware, `/me`, `/organisations`, leave types; role/membership tests.
4. Balance + employee request list/create/cancel; date validation and concurrency tests.
5. Manager queue/decision and audit; prevent self-approval and unauthorised access.
6. Organisation calendar endpoint and multi-organisation linking/partial approvals.
7. OpenAPI examples, full test suite, deploy/local-run instructions, collaboration notes, demo evidence.

## Definition of done
All shared acceptance tests pass; login works from frontend; no data leakage across organisations; all records survive server restart; approvals reflected in status, balances and calendar; all errors machine-readable; one repo with credible individual commits; documented policy and limitations.

## Codex instruction (paste in VS Code)
> You are a senior backend engineer and patient mentor. Read `SHARED_API_CONTRACT.md` and `VICTOR_BACKEND_SPECIFICATION.md` completely before touching code. Work only in `/backend`, backend OpenAPI, and shared README/docs. Implement in milestones, starting with scaffolding and a working `/api/v1/health`. Use the agreed exact endpoint names, request/response shapes and error envelope. Use current compatible Prisma/Supabase configuration. Enforce membership-based authorisation on the server and safe transactional leave balance updates. Create tests at each milestone and run typecheck/tests. Explain each new file and why it is needed. Never modify `/frontend` or run destructive migrations without permission; never expose secrets. Stop after each milestone and report commands to run, tests passed and any blockers.
