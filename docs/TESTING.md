# Testing and verification

## Commands

Run inside backend:

```sh
npm run typecheck
npm test
npm run build
npm start
```

In a second terminal: `curl http://localhost:3001/api/v1/health`.

`tests/foundation.test.ts` exercises the actual Express app using Supertest, with no database or mocked business workflows. It covers exact public health JSON/security headers, pending-route 404, allowed/denied origins, bearer preflight, malformed/oversized JSON, configuration defaults and invalid settings, reusable parsed-input validation and sanitised async 500 errors. Production source and test files are both typechecked.

## Evidence

Verified on 13 October 2026 with Node 22.18.0 and npm 10.9.3:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed, including test source |
| `npm test` | Passed: 1 test file, 23 tests |
| `npm run build` | Passed; compiled server emitted to dist |
| `npm start` + real HTTP curl | Server started on port 3001; GET /api/v1/health returned HTTP 200 and exactly {"data":{"status":"ok"}} |
| SIGINT shutdown | Smoke server stopped after verification; npm reported exit 1 for the interrupted command |
| npm install audit | 146 packages audited, zero reported vulnerabilities at installation |

The initial test run exposed a URL parsing exception for invalid origins; it was fixed and the full suite rerun successfully. Socket-based tests and live HTTP smoke verification needed execution outside the restricted sandbox. Source/test typechecking and compilation ran within it. The first sandboxed server/curl attempts could not complete socket verification; approved runs did.

No authentication, persistence, leave workflow or browser integration test is claimed in this phase. The zero-vulnerability audit is point-in-time package evidence, not a completed application security audit.

## Phase 3 local verification

On 13 October 2026, after adding Prisma 7.10.0:

- `prisma validate` and `prisma generate`: passed.
- `npm run typecheck` and `npm run build`: passed, including schema-generated client, database tools, seed and tests.
- `npm test`: passed, 2 files and 35 tests. New tests verify required database/Auth settings, password-placeholder rejection, redacted error messages and safe nested/cyclic connection-error diagnosis.
- `npm run db:check`: PostgreSQL login now succeeds after correcting leftover password placeholder brackets. The public schema was verified empty before migration.
- `npm run db:migrate`: initial migration successfully applied, creating nine business tables and Prisma migration tracking.
- `npm run db:seed`: ran twice successfully; subsequent verification still showed three organisations and two leave types each (six total), demonstrating baseline seed idempotence. User profile count remained zero after live fixture tests. No Auth login accounts created.
- `npm run test:database`: 8 real PostgreSQL integration tests passed; temporary fixtures rolled back. Tested RLS enablement, unique membership, cross-organisation manager/type rejection, negative allocations, date-only pending persistence, invalid dates and approval metadata.
- Latest `npm test`: 35 local tests passed; 8 live tests skipped because the ordinary test command does not load .env. The live tests passed separately using test:database.
- npm audit after adding Prisma reports four high findings through development CLI transitive dependencies (`deepmerge-ts`, `mysql2`, `@prisma/config`, `prisma`). No forced downgrade or unverified major dependency override was applied; the findings remain unresolved. This supersedes the Phase 2 installation audit result.

Generated client files are ignored and regenerated at build time. Local .env remains ignored. These tests are not Supabase Auth-token or real PostgreSQL transaction tests.

## Phase 4 access milestone

On 13 October 2026:

- Local suite: 55 passed; 9 live tests skipped in the default suite. API tests mock provider identity and access repository; provider adapter tests mock HTTP and verify calls to configured Supabase Auth, token rejection and rate limiting.
- `npm run test:database`: 9 live tests passed. The new repository test verifies active organisation/membership/type filtering and database role changes with rollback-only fixtures.
- Production server starts after a successful PostgreSQL check. Live smoke: health 200; /me without token 401; /me with invalid token 401 using real Supabase verification. Configured public key/project settings check returned 200.
- A real successful demo-account sign-in has not been tested. Auth-backed fictional account provisioning is still pending, and no permanent profiles/memberships were created by the tests.
- Google OAuth/sync/invitation tests have not run: those features are proposed, not implemented, and await core verification and authorised provider setup.

This updates the local/live test counts above; audit findings remain unchanged.

## Auth-backed demo-account milestone

On 13 October 2026, the locally configured privileged Supabase key passed a read-only admin access check. The separate demo-account seed created six marked fictional Auth identities, linked database profiles, nine memberships and eighteen allocations for year 2026 (15 annual/10 sick per membership). No email invitations were sent. Generated passwords remain in ignored backend/.demo-credentials.json with permissions 600.

- `npm test`: 61 local tests passed; 9 live database tests skipped by the default command. Added six tests for marked account creation/reuse, refusal of unmarked/different identities, denied admin access and paginated account discovery.
- `npm run typecheck` and `npm run build`: passed after fixing optional credential-ID typing.
- `npm run auth:check:demo`: all six users successfully signed in against real Supabase; their actual tokens were verified by the Express middleware and database profiles. Profile, organisation access and cross-organisation isolation checks passed, including Ayanda's two memberships and Naledi's three ADMIN memberships. Smoke sessions were signed out afterward; passwords and tokens were not logged.
- The seed preserves existing passwords, roles and allocations rather than resetting administration changes. Supabase Auth and PostgreSQL cannot share one transaction; partial provisioning is recoverable by rerunning with the same local credential file.

This supersedes the earlier pending-real-sign-in statement. Leave requests/approvals/calendars and Google integration remain unimplemented. The previously recorded Prisma tooling audit findings remain unresolved.

## Remaining leave/core coverage

Next add weekdays/date validation, insufficient balance, overlap and duplicate submissions; pending/approved/cancelled balance calculations; approval/decline, missing comments, assigned-team authority, self-approval and duplicate/concurrent decisions; approved-only calendars and independent multi-organisation approvals. Existing token/access tests cover the completed milestone, but new mutation paths still need permission tests. PostgreSQL integration tests must cover actual transactions/concurrency. Add real frontend-auth-to-backend smoke evidence with Kopano before declaring the demo ready.
