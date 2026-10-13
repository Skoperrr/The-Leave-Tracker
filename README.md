# The Leave Tracker

Leave management for the D-Lab Blitz assessment, built by Victor (backend) and Kopano (React + Vite frontend). The planned system supports employees, managers and administrators across D-Lab, StrideShift Global and The Field Institute, with separate balances and approvals for each organisation.

**Current milestone: connected database and implemented access endpoints.** Prisma's initial migration has been applied; three demo organisations and annual/sick types are seeded. Health, /me, /organisations and organisation leave types use token verification and membership checks. Six fictional Auth accounts now have profiles, organisation roles and 2026 allocations; see [demo accounts](docs/DEMO_ACCOUNTS.md). Leave workflows and calendars remain pending. Google's shared-calendar/invitation extension is proposed for after core verification. This is not yet a demonstration-ready leave system. The original assessment PDF is missing.

From the repository root:

```sh
cd backend
npm ci
cp .env.example .env
npm run dev
```

In another terminal:

```sh
curl http://localhost:3001/api/v1/health
```

Configure the database/Auth fields in backend/.env before starting. Expected health response: `{"data":{"status":"ok"}}`. Startup verifies PostgreSQL; health itself checks API liveness only.

Verification (inside `backend`):

```sh
npm run typecheck
npm test
npm run test:database
npm run build
npm start
```

The build generates Prisma Client and requires local DIRECT_URL configuration in .env. Database tooling: `npm run db:validate`, `npm run db:generate`, `npm run db:check`. `test:database` connects to your configured development database; each fixture transaction rolls back. See setup before running migrations or seeds.

Use Node 22.12+ in the 22 LTS line or Node 24 LTS. Express handles HTTP; strict TypeScript checks code contracts; Zod validates configuration and input; Vitest and Supertest verify behaviour. Phase 3 will add Prisma for relational PostgreSQL data and Supabase Auth for verified identities. The frontend remains independently runnable and has not been created or modified here.

Read [implementation plan](docs/IMPLEMENTATION_PLAN.md), [setup](docs/BACKEND_SETUP.md), [API implementation](docs/API_IMPLEMENTATION.md), [database design](docs/DATABASE_DESIGN.md), [test evidence](docs/TESTING.md), and [collaboration/integration](docs/COLLABORATION.md). The [shared API contract](docs/SHARED_API_CONTRACT.md) defines endpoint names and JSON shapes. [OpenAPI](backend/openapi.yaml) describes currently implemented endpoints.

The [Google Workspace proposal](docs/GOOGLE_WORKSPACE_INTEGRATION.md) covers separate org calendars, encrypted OAuth tokens, async jobs and optional org-only invitations, including manual Google Cloud setup. Google functionality is pending and the shared contract is unchanged.
