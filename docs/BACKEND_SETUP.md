# Backend setup

## Phase 2 local setup

Use npm and Node 22.12+ (22 LTS) or 24 LTS. Tested host runtime: Node 22.18.0, npm 10.9.3. Packages are reproducibly pinned by `backend/package-lock.json`.

```sh
cd backend
npm ci
cp .env.example .env
npm run dev
```

Default API: `http://localhost:3001/api/v1`; permitted frontend origin: `http://localhost:5173`. `PORT` must be an integer from 1 to 65535. `NODE_ENV` must be development, test or production. `FRONTEND_ORIGINS` accepts comma-separated exact HTTP(S) origins without paths or trailing slashes. Production origins require HTTPS. Invalid settings stop startup, listing field names without echoing values.

Node loads local .env before startup. Protected routes require the database/Auth settings below; the server performs SELECT 1 before listening. Invalid settings or an unreachable database prevent startup. Ordinary unit/API tests inject configuration and mock the provider/repository; explicit live database tests need credentials. `npm run dev` restarts on changes; `npm run build` generates Prisma Client and writes dist; `npm start` runs compiled JavaScript. SIGINT/SIGTERM close requests and disconnect Prisma, with a ten-second deadline.

## Phase 3 configuration — connection verified

Create or select the intended Supabase development project. Configure the following in ignored `backend/.env`, never in chat, screenshots or committed files:

- `DATABASE_URL`: server PostgreSQL connection; confirm pooler/direct choice with the chosen Prisma version.
- Optional `DIRECT_URL`: direct/session connection for migrations. When absent, Prisma CLI uses `DATABASE_URL`.
- `SUPABASE_URL`: project's HTTPS URL.
- `SUPABASE_PUBLISHABLE_KEY` or legacy `SUPABASE_ANON_KEY`: public key for project-scoped authentication calls. A blank publishable key falls back to the configured anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only privileged key, only when needed by the Auth-backed demo seed process. Never a Vite variable.

Remove the leading `#` from configured variables in your local .env; commented lines are ignored. Use the complete Session pooler URL on port 5432, including the project-scoped username and URL-encoded database password. DATABASE_URL and DIRECT_URL may both use this session connection during local development. A Supabase API key is not the database password.

Prisma 7.10 uses prisma.config.ts for CLI connection settings and @prisma/adapter-pg for runtime PostgreSQL access. The initial schema, migration, idempotent baseline seed and safe connection check exist. Health is a process liveness check: startup verifies PostgreSQL once, but health does not continually probe PostgreSQL or Supabase Auth.

```sh
npm run db:validate
npm run db:generate
npm run db:check
```

Connection verification succeeded on 13 October 2026 after removing leftover square brackets around the password. The target public schema was empty. The initial migration was reviewed and applied successfully, then the baseline seed ran. Real PostgreSQL constraint tests passed with rolled-back fixtures. On a new project, inspect the target before applying migrations. Use `npm run db:migrate` to apply committed migrations, then `npm run db:seed` for baseline organisations/types. Do not use db push or migrate reset. Do not reuse production HR data.

```sh
npm run test:database
```

This explicit live-database command loads .env and runs rollback-only fixture tests. Ordinary `npm test` does not load .env; it skips live tests when DATABASE_URL is absent. Always use a development database for integration testing.

The baseline seed creates only three organisations and six leave types. A separate `npm run db:seed:accounts` now creates six fictional Supabase Auth users plus profiles, nine memberships and eighteen 2026 allocations. It requires a locally configured privileged Auth key and saves random passwords to ignored backend/.demo-credentials.json. It does not create leave requests. See DEMO_ACCOUNTS.md for safety, roles, policy and recovery details.

The frontend uses its own public Supabase project settings for browser sign-in and sends the access token to this backend. No database credentials or service role key belong in the frontend.

## Troubleshooting

- Startup configuration failure: check the named field in `.env`.
- Listen failure: check whether port 3001 is occupied or the environment restricts sockets; choose a free PORT.
- 403 from a browser: ensure its exact origin is in FRONTEND_ORIGINS.
- Access, employee leave, manager queue/decision and calendar routes are implemented: absent/invalid tokens give 401; an unprovisioned profile gives 404; an inactive profile gives 403. An active profile with no memberships returns an empty list. Admin/Google endpoints remain pending and return 404 after authentication.
- Health succeeds but login/database do not: health currently checks process liveness only.

## Authentication milestone

The configured Supabase project/public key responds successfully. GET /me verifies a token through getUser(token); matching active database profiles/memberships determine access. Tokens are never accepted by merely decoding JWT payloads. User metadata is not a role source. Fictional Auth-backed accounts are now provisioned; there is no self-service role assignment. Keep privileged Auth-seed credentials server-only. `npm run auth:check:demo` verifies real sign-in and access isolation without printing credentials.

Google remains a later milestone. See GOOGLE_WORKSPACE_INTEGRATION.md for proposed contract changes and manual Cloud setup; none of its settings are required by current access endpoints.

## Phase 5 verification

Run typecheck, test, test:database and build inside backend. `npm run leave:check:demo` signs in Ayanda, submits five weekdays across both organisations, verifies reservations, independently cancels children and verifies restored balances. It preserves two CANCELLED history records and their audits; it does not delete history or create approved events. Free dates/balance are required for 2–6 November 2026. Use only the development demo project.

## Manager/calendar smoke

`npm run manager:check:demo` signs in Ayanda, Thabo, Lerato and Neo using local credentials. It submits 16–20 November 2026 in D-Lab and Field Institute, approves each independently, checks calendar isolation/duplicate decisions and declines another D-Lab request for 23–24 November. It preserves two APPROVED requests/internal events and one DECLINED request. Those approved five days now consume each fictional annual allocation. If the smoke fails, pending children are cancelled; successful approvals are preserved. It sends no Google invitations.

This smoke ran successfully. It intentionally needs free dates/balance; repeating it on the same approved dates will return an overlap conflict rather than duplicating events. Use existing history/calendar to review completed sample approvals. Production execution is rejected.
