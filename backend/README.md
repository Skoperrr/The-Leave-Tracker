# Kopano backend

Express, TypeScript, Prisma and Supabase Auth. Implemented access endpoints are `GET /api/v1/me`, `GET /api/v1/organisations` and `GET /api/v1/organisations/:orgId/leave-types`. Leave workflows remain pending; see [API status](../docs/API_IMPLEMENTATION.md).

## Local setup

Use Node 22.12+ or 24 LTS. From the repository root:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix backend run dev
```

Configure ignored `backend/.env` before starting. Preserve an existing file rather than overwriting it:

- `DATABASE_URL`: the intended development PostgreSQL connection, with a URL-encoded password and a trusted role permitted to read the application tables under row-level security.
- `SUPABASE_URL`: the same Supabase project as the frontend.
- `SUPABASE_PUBLISHABLE_KEY` or legacy `SUPABASE_ANON_KEY`: the project's public key. A service role key is unnecessary for access endpoints.
- Optional `DIRECT_URL`: direct/session connection used by migration commands. When absent, the CLI uses `DATABASE_URL`; runtime queries always use `DATABASE_URL`.

Startup checks configuration and database connectivity without printing credentials. `npm ci` generates the Prisma client; generation and ordinary tests need no database credentials. See [backend setup](../docs/BACKEND_SETUP.md) for migration, seed and live verification commands.

## Profiles and memberships

The canonical [initial migration](prisma/migrations/20261013090000_initial/migration.sql) contains all nine application models, constraints and row-level security. Review the target before applying committed migrations; do not reset an existing database to resolve schema differences. This change does not add a second profile migration.

Provision application profiles using actual Supabase Auth account IDs. A trusted administrator assigns memberships and roles in stored organisations. The database enforces one membership per user/organisation and manager assignments within the same organisation. For an existing Auth identity, a profile can be provisioned in the SQL editor after replacing the example values locally:

```sql
INSERT INTO public."User" (id, email, "fullName", "updatedAt")
SELECT id, email, 'Your chosen display name', CURRENT_TIMESTAMP
FROM auth.users
WHERE email = 'your-registered-email@example.com';
```

The access routes verify the Bearer token through Supabase `getUser(token)`, then query that identity's persisted profile and active memberships in active organisations. They ignore browser-supplied roles and identity claims. Missing/rejected tokens return 401; a missing profile returns 404; an inactive profile returns 403. An active profile without memberships returns an empty list. Responses use `Cache-Control: no-store`.

The existing [demo-account setup](../docs/DEMO_ACCOUNTS.md) provisions fictional accounts through Supabase Auth and saves random passwords only to ignored local files. Keep its privileged key server-only. Access routes do not automatically create profiles or grant roles.

## Verification

```powershell
npm.cmd --prefix backend run typecheck
npm.cmd --prefix backend test
npm.cmd --prefix backend run build
```

Ordinary tests isolate authentication and repository boundaries. PGlite runs the canonical SQL migration in embedded PostgreSQL and checks membership constraints and row-level security. These checks do not contact the configured development database. Explicit live checks are documented separately in [testing](../docs/TESTING.md).
