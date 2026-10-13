# Vercel deployment

Import this repository as one Vercel project, with the repository root as the
project root. The root `vercel.json` builds the `backend` (Express) and `frontend`
(Vite) services independently. Use Node.js 22.x or 24.x.

Routing preserves request paths: `/api/*` reaches the backend, whose router is
mounted at `/api/v1`. Other paths reach the frontend, with an index.html fallback
for React Router. Authentication and organisation checks remain in the API.

## Environment variables

Set these through the Vercel project settings for each applicable environment:

- `DATABASE_URL`: the PostgreSQL connection URL, preferably the Supabase pooler URL
  suited to serverless connections. Keep it server-only.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`): backend
  token verification configuration.
- Leave `FRONTEND_ORIGINS` unset on Vercel. The backend derives exact HTTPS
  origins from `VERCEL_URL` and `VERCEL_BRANCH_URL`, plus
  `VERCEL_PROJECT_PRODUCTION_URL` on production deployments. Enable access to
  System Environment Variables in Vercel settings. An explicit `FRONTEND_ORIGINS`
  overrides this behavior; use it for custom domains or standalone local runs.
  For `vercel dev`, set it to the actual local origin (such as
  `http://localhost:3000`).
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: public frontend Auth settings.
  Use a public Supabase key, never a service-role key.
- Leave `VITE_API_URL` unset or empty for same-origin API requests. Use an explicit
  origin only when intentionally running the frontend and API separately.

`DIRECT_URL` is optional for separately run Prisma migrations. Do not run
migrations or seed accounts automatically in builds. Apply database migrations
before deploying code that requires them. Set Supabase Auth site/redirect URLs
to the selected deployment domain when using redirect-based sign-in flows.

## Bindings

There are no runtime service-to-service calls in this application. The static
frontend runs in the visitor's browser and calls the public `/api/v1` route.
The backend calls external Supabase/PostgreSQL, not another Vercel service.
Therefore no service binding is declared. Runtime bindings cannot be read by
Vite client code or baked into its build. If a server-side frontend function is
added later, declare its backend binding on the frontend service and read that
variable in the function only; do not manually set its generated URL.

## Verification

Run from the repository root:

```sh
vercel dev
```

With environment variables configured, check `/sign-in`, refresh `/requests`,
and request `/api/v1/health`. The health endpoint should return the API envelope;
protected endpoints should reject unauthenticated requests. Sign in and verify
organisation-scoped leave submission and manager decisions against a test DB.

The Vercel entrypoint `backend/src/index.ts` exports an Express app without
starting a port listener or installing process shutdown handlers. The standalone
`backend/src/server.ts` keeps its existing startup database check and lifecycle.
The pool is reused within each function instance; health reports API liveness,
not database readiness.

The app factory lives in `backend/src/application.ts` so Express detection cannot
select it instead of the configured `src/index.ts` function entrypoint.
