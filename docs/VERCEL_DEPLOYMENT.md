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

The Vercel entrypoint `backend/src/index.mts` exports an Express app without
starting a port listener or installing process shutdown handlers. The standalone
`backend/src/server.ts` keeps its existing startup database check and lifecycle.
The pool is reused within each function instance; health reports API liveness,
not database readiness.

The app factory lives in `backend/src/application.ts` so Express detection cannot
select it instead of the configured `src/index.mts` function entrypoint.

The root package declares ES module semantics for deployment packaging. The
backend entrypoint uses `.mts`, compiling to `dist/index.mjs` so its module format
is explicit. Builds remove stale output before compiling.

The backend service explicitly sets `outputDirectory` to `.`. This prevents the
Services builder from promoting the compiled `dist/index.mjs` to the function
root while retaining dependencies under `backend/node_modules`. Instead Vercel
packages the source entrypoint with dependency paths relative to the service.
Keep the frontend output directory as `dist`.


## Email onboarding and calendar worker

New email/calendar backend configuration is documented in CALENDAR_EMAIL_SETUP.md. Google client, encryption, Auth Admin recipient verification and scheduler secrets must stay server-only. Backend calendar routes are optional when GOOGLE_CLIENT_ID is unset; complete all required Google settings before setting that ID. Calendar approvals enqueue jobs inside PostgreSQL and never call Google in the approval request. On Hobby, use the prepared disabled-by-default GitHub Actions workflow for five-minute scheduling, with both application scheduler authentication and Vercel automation bypass. Worker calls are bounded and may need a sufficiently long function duration. No Vercel cron schedule was added that would fail Hobby deployment limits.
