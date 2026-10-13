# The Leave Tracker

Leave management for the D-Lab Blitz assessment, built by Victor (backend) and Kopano (React + Vite frontend). The planned system supports employees, managers and administrators across D-Lab, StrideShift Global and The Field Institute, with separate balances and approvals for each organisation.

**Current milestone: employee and manager leave workflows plus internal calendars implemented.** Access routes verify Supabase tokens/memberships. Employee requests persist with weekday calculations, reservations, overlap protection and atomic multi-org submission. Assigned managers or org admins approve/decline; approvals commit audit and one organisation calendar event together. Real demo sign-in and independent multi-org approvals have been verified. Admin APIs, full browser integration and Google integration remain pending. See [demo accounts](docs/DEMO_ACCOUNTS.md). The full assessment definition of done is not complete; the assessment PDF is still missing.

From the repository root:

```sh
cd backend
npm ci
cp -n .env.example .env
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

The build generates Prisma Client without requiring database credentials. Database tooling: `npm run db:validate`, `npm run db:generate`, `npm run db:check`. Migrations use optional DIRECT_URL, falling back to DATABASE_URL. `test:database` connects to the development database; fixtures are rolled back or cleaned up by generated IDs. See setup before running migrations or seeds.

Use Node 22.12+ in the 22 LTS line or Node 24 LTS. Express handles HTTP; strict TypeScript checks code contracts; Zod validates configuration and input; Vitest and Supertest verify behaviour. Prisma handles PostgreSQL data and Supabase Auth verifies identities. Run the frontend with `npm --prefix frontend run dev` and open `http://localhost:5173`. The development-only read-only dashboard preview is at `/preview/dashboard`; see [frontend setup and verification](frontend/README.md).

Read [implementation plan](docs/IMPLEMENTATION_PLAN.md), [setup](docs/BACKEND_SETUP.md), [API implementation](docs/API_IMPLEMENTATION.md), [database design](docs/DATABASE_DESIGN.md), [test evidence](docs/TESTING.md), and [collaboration/integration](docs/COLLABORATION.md). The [shared API contract](docs/SHARED_API_CONTRACT.md) defines endpoint names and JSON shapes. [OpenAPI](backend/openapi.yaml) describes currently implemented endpoints.

The [Google Workspace proposal](docs/GOOGLE_WORKSPACE_INTEGRATION.md) covers separate org calendars, encrypted OAuth tokens, async jobs and optional org-only invitations, including manual Google Cloud setup. Google functionality is pending and the shared contract is unchanged.
