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

## Required later coverage

Add valid/missing/invalid Supabase-token tests; single/multi-organisation access and role isolation; weekdays/date validation, insufficient balance, overlap and duplicate submissions; pending/approved/cancelled balance calculations; approval/decline, missing comments, assigned-team authority, self-approval and duplicate/concurrent decisions; approved-only calendar visibility and independent multi-organisation approval. PostgreSQL integration tests must run against an isolated test database and cover actual transactions/concurrency, not merely in-memory mocks. Add real frontend-auth-to-backend smoke evidence with Kopano before declaring the core demo ready.
