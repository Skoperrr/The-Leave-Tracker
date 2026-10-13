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

Node loads the optional local `.env` before startup. Tests inject configuration directly and do not require credentials. `npm run dev` restarts on changes; `npm run build` writes `dist`; `npm start` runs compiled JavaScript. SIGINT/SIGTERM allow active requests to close, with a ten-second shutdown deadline.

## Phase 3 configuration — not connected yet

Create or select the intended Supabase development project. Configure the following in ignored `backend/.env`, never in chat, screenshots or committed files:

- `DATABASE_URL`: server PostgreSQL connection; confirm pooler/direct choice with the chosen Prisma version.
- `DIRECT_URL`: direct/session connection if required for migrations by that Prisma configuration.
- `SUPABASE_URL`: project's HTTPS URL.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key for project-scoped authentication calls (or clarify legacy anon-key compatibility).
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only privileged key, only when needed by the Auth-backed demo seed process. Never a Vite variable.

The Phase 2 process does not read or validate these commented placeholders. Phase 3 must add strict configuration, Prisma schema/migrations and a connectivity check before claiming persistence. No migration or seed command exists yet. Do not reuse production HR data.

The frontend uses its own public Supabase project settings for browser sign-in and sends the access token to this backend. No database credentials or service role key belong in the frontend.

## Troubleshooting

- Startup configuration failure: check the named field in `.env`.
- Listen failure: check whether port 3001 is occupied or the environment restricts sockets; choose a free PORT.
- 403 from a browser: ensure its exact origin is in FRONTEND_ORIGINS.
- 404 on `/me` or leave endpoints: these are pending, not authentication failures.
- Health succeeds but login/database do not: health currently checks process liveness only.
