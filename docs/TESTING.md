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

## Phase 5 employee leave milestone

Verified on 13 October 2026, on backend/victor:

| Command/check | Result |
|---|---|
| `npm run typecheck` | Passed, including source, scripts and tests |
| `npm run build` | Passed, Prisma Client generated and compiled server emitted |
| `npm test` | 94 passed; 21 live tests skipped by the ordinary command |
| `npm run test:database` | 21 passed: 9 existing database tests and 12 employee workflow tests |
| `npm run leave:check:demo` | Passed with Ayanda's real Supabase login; two linked five-day reservations, independent cancellation and both balances restored |
| OpenAPI YAML/reference check | Parsed successfully; all local references resolved across seven path entries |
| `git diff --check` | Passed; frontend/shared API contract unchanged |

The live suite exercises actual Express/controllers/services/Prisma/PostgreSQL; only token verification is mocked for temporary fixture users. It verifies persistence, five-weekday duration, pending/approved/cancelled/declined balance accounting, independent linked children, rollback on insufficient balance, cross-organisation access, private paginated history, other-owner cancellation hiding, overlapping types, invalid/cross-year/weekend ranges, concurrent non-overlapping overspending prevention, reversed multi-org lock ordering and simultaneous cancellations with one audit. Temporary fixture IDs are cleaned up; demo accounts are preserved.

The real-token smoke uses ordinary Supabase sign-in, not the service-role key. It leaves two CANCELLED demonstration requests and their audit records; no pending reservation or approved calendar event remains. It is separate from browser React integration and should run only on the demo project. Existing active leave on the smoke dates may cause an intentional overlap rejection.

Initial runs exposed a pg deprecation warning from concurrent queries on a transaction connection. Balance and related-record queries now run in sequential batches, avoiding per-request-row relation lookups. The full 21-test live suite was rerun successfully after the change with no such warning emitted. Manager decisions/internal calendars remain pending; approved/declined records in balance tests are fixture state, not a verified manager approval API. Existing Prisma tooling audit findings remain unchanged.

Key files: validators/leave.ts validates HTTP fields; utils/dates.ts computes date-only weekdays; repositories/leave.ts sets transaction isolation, locks memberships, aggregates usage and maps response data; services/leave.ts applies leave rules and coordinates transactional writes; controllers/leave.ts handles the API envelope/status. Routes bind the four exact contract paths.

## Manager decisions and internal calendar milestone

Verified on 13 October 2026 on backend/victor:

- `npm test`: 106 local tests passed; 33 live database tests skipped by the ordinary command. Added decision/body/query validation and protected manager/calendar route tests.
- `npm run test:database`: all 33 live PostgreSQL tests passed. This includes the prior 21 tests plus 12 manager/calendar tests covering approval metadata/audit/event, decline comment/reservation release, assigned team and org admin queue/history, self/cross-org decisions, approved-only privacy-safe calendars with inclusive boundaries, independent linked approvals, two simultaneous approvals, approval versus decline/cancellation races, allocation revalidation and rollback on audit/calendar persistence failure.
- `npm run manager:check:demo`: real Supabase sign-in passed for Ayanda, Thabo, Lerato and Neo. Thabo approved only D-Lab, then Lerato approved only Field Institute; each calendar displayed only its own approved event. StrideShift was denied both calendars. Duplicate approval returned 409, missing decline comment returned 400, and a valid decline created no event.
- The real smoke preserves two approved child requests/events and one declined request. Approved leave consumes five annual days per selected organisation; no pending smoke reservation remains. These are intentional fictional demonstration records, not temporary test fixtures. No external Google event/invitation was created.
- OpenAPI YAML parsed successfully with every local reference resolved across ten paths. Shared API contract and frontend files are unchanged. No schema migration was required.

Key new files are validators/manager.ts, controllers/manager.ts and services/manager.ts. The service shares membership locking and request mapping with employee workflows. Actor/owner locks and fresh role/assignment checks protect decisions; request status, audit and approved event commit together. Calendar selects only name/date/ID fields, never private notes.

## Profile safeguards and dashboard preview integration

On 13 October 2026, a separate checkout based on the latest main preserved the canonical nine-model schema and initial migration, access endpoints and demo-account tooling.

- Backend typecheck and production build passed. Ordinary suite: 70 passed; 9 live database tests skipped because no credentials were copied into that checkout.
- Five PGlite tests applied the canonical migration in isolated embedded PostgreSQL and verified same-organisation managers, rejection of cross-organisation managers, duplicate memberships, invalid roles and row-level security. No migrations or seeds were run against Supabase for this integration.
- Access tests additionally verify no-store responses, Bearer challenges, missing-profile 404, empty memberships and response field filtering. Configuration tests cover optional DIRECT_URL and legacy public anon keys.
- Frontend typecheck and production build passed; 32 tests passed across four files. The temporary checkout was inside the protected `.preview` directory, so its test run used a temporary configuration allowing its own files. That configuration was removed before committing; application protections remain unchanged.
- Development dashboard preview screenshots at 1440px and 390px record no horizontal overflow or runtime exceptions. The labelled sample preview makes no application API requests; sample strings were absent from the production bundle. See frontend/README.md for artifacts.

These checks do not claim that pending leave endpoints are operational or repeat the earlier live demo-account verification.

## Remaining leave/core coverage

## Latest main integration verification

On 13 October 2026, merged origin/main's profile safeguards/setup improvements/dashboard preview with the employee and manager leave workflows. Resolved documentation/OpenAPI conflicts while preserving both features; frontend files remain byte-for-byte identical to the fetched main.

- `npm ci` completed with Prisma postinstall generation. The four existing high Prisma tooling audit findings remain reported; no forced dependency rewrite was used.
- `npm run typecheck` and `npm run build`: passed.
- `npm test`: 115 local tests passed, including the five incoming embedded PostgreSQL schema/RLS tests; 33 live tests skipped by the ordinary command.
- `npm run test:database`: 33 live tests passed against the merged code, including decisions, rollback and concurrency.
- `npm run auth:check:demo`: all six existing demo users passed real sign-in/profile/org isolation after merging response-schema validation, missing-profile 404, no-store and Bearer challenges.
- OpenAPI parsed with all local references resolved; tracked-file scanning found none of the configured privileged keys/database URLs/passwords/demo passwords in publication content. Local .env and demo credentials remain ignored.

Frontend changes were preserved from main; this merge did not rerun browser screenshots or claim full live UI integration. No repeat approval smoke was run, avoiding duplicate sample submissions on already-approved dates.

## Remaining work after integration

Next implement admin membership/allocation paths with their own permission/concurrency tests, respecting the shared lock convention and resolving documented contract gaps. Verify the full React employee/manager experience with Kopano, review deployment/security, and supply the missing brief before declaring the whole assessment demo ready. Google OAuth/sync/invitation tests follow core verification and provider configuration. Previously documented Prisma tooling audit findings remain unresolved.


## Admin roles and unchanged frontend verification — 13 October 2026

At the user's request, Thabo, Lerato and Sibusiso were promoted from MANAGER to ADMIN only in D-Lab, The Field Institute and StrideShift Global respectively. The explicit demo promotion authenticated the marked fictional Naledi administrator and wrote three role-change audits in one database transaction. Reporting assignments, allocations and employee roles remain unchanged. The ordinary seed preserves existing roles; defaults for new fictional manager memberships are now ADMIN.

GET /api/v1/admin/memberships implements the existing shared Membership list shape. Permissions are rechecked in a database read transaction. Lists are organisation-scoped, include inactive memberships and omit user identity/other private fields. Membership/allocation editing remains pending.

Verified checks:

- Backend typecheck, build and 123 local tests passed (33 opt-in live integration tests skipped in that run; their previous passing results remain recorded above). Eight new admin tests cover role/membership denial, scoped query and exact response fields, authentication and strict query validation.
- Updated auth:check:demo passed all six actual Supabase logins, expected organisation roles/manager assignments, and real admin endpoint isolation. Each demo administrator can list only authorised organisations; employees receive 403.
- Frontend's unchanged lockfile installed successfully; all 32 existing tests and the TypeScript/Vite production build passed. Build reported a JavaScript chunk above 500 kB.
- Isolated headless Chrome ran the actual frontend at localhost:5173 against Express localhost:3001 and hosted Supabase. **24 checks passed**, including six user logins, sign-out, employee/admin navigation, mobile dashboard width, organisation switching, linked five-day submission, admin membership rendering, real decline, independently pending sibling, employee cancellation, existing approved calendar/privacy, employee role guards and no unhandled runtime exceptions or API 5xx responses.
- Browser QA did not repeat a live approval: it verified the already-approved calendar samples. New linked requests for 30 November–4 December ended DECLINED in D-Lab and CANCELLED in Field Institute. Two requests from an interrupted QA attempt were cancelled using Ayanda's authenticated API. Read-only balance checks confirmed zero pending reservations and annual balances of 10 remaining / 5 approved in both organisations after verification. These fictional request/audit records remain persisted.
- Public Auth settings were read: email provider enabled, Google provider disabled. Actual Google consent/login remains unverified, and no Google button was added at the user's explicit request.
- Git diff confirms no frontend source, component, package or lockfile modifications. Local ignored frontend/.env contains only public Supabase config and API URL. Temporary isolated Chrome profiles were removed; evidence contains no passwords or tokens.

Evidence: verification/frontend-results.json and seven PNG screenshots in verification/. Reproduce with API/Vite running and `node backend/scripts/verify-frontend.mjs` from the repository root; Node 22+ and installed Chrome are required. LEAVE_TRACKER_BROWSER can override the browser executable. This uses only ignored fictional credentials and adds demonstration request/audit records. If interrupted after submission, resolve its pending fictional requests before rerunning; overlap rejection is intentional.

Known integration finding: Manager inbox “All statuses” omits status, while the backend defaults an omitted status to PENDING. Therefore decided requests are absent in that view; explicit Approved/Declined/Cancelled filters work. This requires frontend/backend coordination before changing semantics. It is recorded for Kopano, not silently changed during verification.

The frontend npm audit reports five dependency entries: three moderate (React Router / react-router-dom and @vitest/mocker) and two critical (tinypool and Vitest test tooling). npm proposes major-version upgrades; none were applied because the user asked to keep the frontend unchanged. Do not equate passing flow checks with production security acceptance. Prior backend Prisma tooling findings also remain unresolved.


## Local origin permission diagnostic — 13 October 2026

A user reported a FORBIDDEN message while submitting as Ayanda. The local backend allowed only localhost:5173, whereas Vite displays 127.0.0.1:5173. Live health checks confirmed the latter origin received 403 and localhost received 200. Development defaults, .env.example and ignored local .env now explicitly allow both exact local origins; unrelated origins still receive 403 and production still requires HTTPS. Frontend source remains unchanged. The user's browser address was requested; origin mismatch is a confirmed local defect, but attribution to that specific browser session remains unconfirmed.

Ayanda's live profile had active EMPLOYEE memberships in D-Lab and The Field Institute. A real-token linked one-day submission for 7 December 2026 returned 201 with two requests. Both diagnostic requests were cancelled through the authenticated API afterward. Backend typecheck and all 24 focused foundation tests passed. Running-server checks after reload returned 200 for the Vite loopback origin and 403 for an unlisted origin. This diagnostic adds only fictional cancelled request/audit records; no employee role was elevated.

A follow-up real-token submission with Origin http://127.0.0.1:5173 returned 201, two linked requests and the exact matching Access-Control-Allow-Origin header. Both temporary requests were cancelled. Thus both local addresses now support the employee submission API.


## Pull-before-push integration — 13 October 2026

Pulled origin/main through d03b1e4 before integrating local admin roles/listing and verification work. Preserved incoming Vercel Services configuration, application.ts rename, explicit index.mts entry point, build cleanup, frontend branding and admin Leave approvals UI. Injected the new admin service into both backend entry points and updated the new test's import for the renamed factory. Our diff leaves the incoming frontend unchanged.

Integrated backend typecheck/build and **127 local tests** passed; 33 opt-in live integration tests were not rerun. Integrated frontend production build and **35 tests** passed. A separate smoke loaded the actual compiled Vercel index.mjs app on an ephemeral local listener: real Supabase logins for Thabo and Ayanda verified profile access and ADMIN-versus-EMPLOYEE membership-list permissions. This verifies the Vercel entry point locally, not the hosted deployment. Secret scan passed for 123 reviewable text files. Prior dependency findings and large frontend chunk warning remain. Historical browser screenshots/results were produced before the incoming branding/approval UI changes; hosted browser verification still needs the deployment URL.


## Email onboarding and Google Calendar backend — 13 October 2026

User decisions: open signup with no initial organisation access; backend-only implementation; shared calendar sync and invitations to confirmed active organisation members; Vercel Hobby. Google sign-in deferred. Frontend and existing shared v1 contract file are unchanged. OpenAPI 0.6 and EMAIL_CALENDAR_BACKEND_HANDOFF.md provide the integration addendum for Kopano.

Verified:

- Backend source/test typechecks and production build passed. **163 local tests passed**, with 34 live database tests skipped in that default run. New tests exercise confirmed identity/profile-only provisioning, existing/disabled profiles, role injection, OAuth state expiry/replay/browser binding/admin revocation, random authenticated encryption/org-purpose binding/key rotation, Google date/payload privacy, organisation recipient filtering, disabled invitations, stale settings, retry policy/Retry-After, callback authentication, calendar alias canonicalisation and cross-org canonical-ID uniqueness.
- Official Google HTTP adapter is mocked in provider tests: event insertion uses sendUpdates=all when authorised attendees exist; unchanged deterministic events avoid duplicate notifications; insert-409 recovery reads the known ID; wrong-org marker collisions are rejected; changed payload updates use etags; delete 404/410 is idempotent; read-only selection is rejected. These tests are not live Google event/delivery evidence.
- The additive calendar migration and separate canonical-calendar unique index were applied successfully to the configured Supabase database, preserving existing accounts/leave decisions. Four new credential/outbox tables have RLS and organisation composite foreign keys. PGlite applied all migrations and checked table security/FKs and duplicate calendar rejection.
- The existing **33 real PostgreSQL core tests passed** after the outbox migration. A further **one real PostgreSQL calendar outbox/concurrency test passed**: temporary organisation approval created one job; two simultaneous scoped workers claimed it once; unrelated recipients/private reasons were excluded; one external mapping persisted; repeated approval conflicted and the balance remained approved 5/pending 0/remaining 10. Google calls were mocked. All temporary fixture rows were removed. Total actual PostgreSQL tests passed: **34**, in separate core/calendar runs.
- `npm run auth:check:onboarding` passed against actual Supabase Auth plus Express/Prisma: a temporary explicitly confirmed Auth identity initially had no profile; POST /auth/profile created an empty-membership profile; browser role injection was rejected; real Naledi ADMIN assigned EMPLOYEE membership/allocation; the new employee could read its allocation and was denied admin membership assignment. Temporary Auth/profile/membership/allocation/audit fixtures were removed. No signup email was sent; this does not verify public signup confirmation delivery.
- OpenAPI YAML parses, all internal references resolve and path methods are valid. The GitHub Actions scheduler YAML parses; automatic runs stay disabled until CALENDAR_SYNC_ENABLED is true. Its remote execution is unverified; repository secrets and Vercel automation bypass must be configured manually.
- Ignored local calendar encryption and scheduler keys were generated without printing values, preserving existing credentials and mode 600. Google client ID/secret remain to be supplied. Secret scan passed for reviewable source/docs; no frontend or shared v1 contract modifications were made.

The backend work is local and not pushed/deployed in this task. Real SMTP confirmation, frontend signup/calendar settings, authorised Google owner consent, writable calendar checks, actual Google event creation, invitation receipts/acceptance, and scheduled hosted execution remain pending. The in-app calendar and core leave acceptance are verified; external sync is not claimed live. Prior four high Prisma tooling dependency audit entries remain unresolved; no forced dependency upgrade was applied.


## Google configuration readiness — 13 October 2026

After the user reported configuration complete, local Google settings passed validation: callback and return URLs match the deployed app, key version/recipient limit are valid, and scheduler/Auth Admin keys are present. No values were printed. The OAuth client ID has the expected Google client-ID suffix; this does not prove client-secret validity or owner consent.

A real Naledi Supabase session called the configured calendar status API for all three organisations: each returned 200 DISCONNECTED. No organisation connection exists yet. The scheduler-authenticated empty worker endpoint returned zero claimed jobs; no Google event or invitation was written. The production callback still requires the new backend deployment plus owner consent. An optional browser-console helper starts consent from the same authenticated app browser without printing tokens; it does not modify the frontend. Google delivery remains unverified.
