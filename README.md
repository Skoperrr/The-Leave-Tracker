# The Leave Tracker

Leave management for the D-Lab Blitz assessment, built by Victor (backend) and Kopano (React + Vite frontend). The planned system supports employees, managers and administrators across D-Lab, StrideShift Global and The Field Institute, with separate balances and approvals for each organisation.

**Current milestone: Phases 1–2, backend foundation.** The public health API, validation/error infrastructure, CORS and automated foundation tests are implemented. Database persistence, sign-in, memberships, leave workflows and calendars are pending; this is not yet a demonstration-ready leave system. The original assessment PDF is missing from this checkout.

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

Expected: `{"data":{"status":"ok"}}`. Health checks API liveness only.

Verification (inside `backend`):

```sh
npm run typecheck
npm test
npm run build
npm start
```

Use Node 22.12+ in the 22 LTS line or Node 24 LTS. Express handles HTTP; strict TypeScript checks code contracts; Zod validates configuration and input; Vitest and Supertest verify behaviour. Phase 3 will add Prisma for relational PostgreSQL data and Supabase Auth for verified identities. The frontend remains independently runnable and has not been created or modified here.

Read [implementation plan](docs/IMPLEMENTATION_PLAN.md), [setup](docs/BACKEND_SETUP.md), [API implementation](docs/API_IMPLEMENTATION.md), [database design](docs/DATABASE_DESIGN.md), [test evidence](docs/TESTING.md), and [collaboration/integration](docs/COLLABORATION.md). The [shared API contract](docs/SHARED_API_CONTRACT.md) defines endpoint names and JSON shapes. [OpenAPI](backend/openapi.yaml) describes currently implemented endpoints.
