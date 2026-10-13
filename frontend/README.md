# Kopano frontend

React 18, TypeScript, Vite, React Router 6, TanStack Query 5, Supabase Auth, react-hook-form and Zod. All application data comes from the authenticated Express API. No production mocks are included.

## Run locally

From the repository root, start the frontend with:

```powershell
npm --prefix frontend run dev
```

This runs Vite from `/frontend`, where `index.html`, the Vite configuration and `.env` live. Running a root-level Vite server can return HTTP 404 because the repository root has no `index.html`. Stop that server with Ctrl+C before starting the frontend on the same port.

From this directory:

```powershell
npm ci
Copy-Item .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.
npm run dev
```

Open http://localhost:5173. `VITE_API_URL` defaults to `http://localhost:3001`; it is the server origin, without `/api/v1`. The API client appends the prefix exactly once. Use only the Supabase project URL and public anon key; never put a service role key or database credential in a Vite environment variable. `.env` files are ignored locally. The backend must allow the Vite origin in CORS and verify Supabase Bearer tokens from the same project. Accounts, profiles, memberships, leave types and allocations must already be provisioned by the backend; this app does not fabricate them or offer registration.

## Implemented flows

- Email/password authentication, session restoration, expiry handling and sign-out. Query caches are cleared when the authenticated identity changes.
- Organisation selection from active `/me` memberships, with the selected organisation's actual role. Stored selection is only a UI preference and is checked against live memberships.
- Own balance cards with year selection, upcoming approved requests, history and request CTA.
- Multi-organisation leave submission. Types are intersected by their server-provided codes across selected organisations. The body contains only `organisationIds`, `leaveTypeCode`, `startDate`, `endDate`, and optional `reason`.
- History with organisation/status filters and server pagination, per-organisation statuses, private reason disclosure, approver and decision details. Cancelling a pending child explicitly cancels only that child.
- Manager/admin inbox, approval and required-comment decline. Self-review controls are disabled; the server remains the authority on reviewer assignment and permissions.
- Accessible Monday-first month table, month controls and text agenda. Inclusive date-only ranges; only approved calendar endpoint data is shown. Calendar rendering uses employee names and dates, never private reasons or leave types.
- Admin-only membership inspection. No undocumented update payloads are sent.
- Loading, empty, validation, network, unauthorised and business-rule error states. All leave mutations invalidate and refetch cached balances, requests, manager queues and calendar data. Mutations are never automatically retried or optimistically approved.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

Tests use isolated auth and HTTP fixtures only in `src/test`; real application flows use Supabase and Express. Automated checks exercise date semantics, validation, auth headers, error envelopes, multi-organisation payloads, scoped cancellation, decision comments, role guards, organisation switching, query refresh, and private-calendar rendering. Live API verification requires the partner backend and configured Supabase credentials.

## Demo and integration checklist

1. Sign in as the provisioned employee with active memberships in D-Lab and The Field Institute. Select D-Lab and check the balance figures against the backend.
2. Request ANNUAL leave in both organisations for 2026-11-02 through 2026-11-06. The estimate should be five working days; confirm both returned requests independently show PENDING and server-confirmed days.
3. In My requests choose All my organisations to track both children. Check pending reservations in each organisation's balance cards.
4. Sign out; sign in as the authorised D-Lab manager. Approve only the D-Lab child. Check its manager inbox, balance refresh and November team calendar.
5. Sign in as the employee. D-Lab should be APPROVED; Field Institute should remain PENDING. Confirm the Field Institute calendar has no event for this pending request.
6. Use the Field Institute reviewer to approve or decline with a comment. Check its independent status and calendar. Cancellation of a pending child must leave the other organisation's child unchanged.
7. Sign in as a StrideShift-only member and confirm neither unrelated organisation is selectable. Direct navigation to manager/admin pages as an employee must show Permission required.
8. Exercise overlapping leave, insufficient balance, invalid date range, already-decided requests, expired token, forbidden and hidden/not-found resources. Clear messages should appear without a crash or duplicate automatic submission.
9. Check a narrow viewport and keyboard-only navigation. Capture sign-in, multi-organisation statuses, manager decision and approved calendar screenshots for the assessment after live setup.

## Known limitations

Admin editing is deferred: the shared contract does not define an allocation-list endpoint, allocation response shape, or complete membership-update payload. The membership list renders only documented Membership fields and has no invented employee names. No public-holiday exclusions, half days, external calendars, email, or employee overlap warnings are implemented. Upcoming approved leave consumes all documented pages; the dashboard request preview shows the API's first page without claiming an undocumented sort order. A production static host must rewrite browser routes to `index.html`. Authenticated-flow screenshots and live backend demo evidence remain pending until real credentials and the backend are available.

Implementation follows [the frontend specification](../docs/KOPANO_FRONTEND_SPECIFICATION.md) and [the binding shared API contract](../docs/SHARED_API_CONTRACT.md). Authentication and cache handling follow the [Supabase auth lifecycle documentation](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [TanStack Query invalidation documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).

## Recorded verification — 13 October 2026

- TypeScript check and production build passed.
- 31 tests passed across 3 files, including the Supabase token-source expiry regression.
- The real Vite sign-in route returned HTTP 200.
- Installed Chrome verified the actual rendered sign-in page at 1440px and 390px: no horizontal overflow and no JavaScript runtime exceptions.
- [Desktop screenshot](screenshots/sign-in-desktop.png), [mobile screenshot](screenshots/sign-in-mobile.png), and [browser verification data](screenshots/verification.json) are included. They show the unconfigured-auth state; they do not claim successful live authentication or backend integration.

To recapture sign-in previews, start `npm run dev`, then run `npm run screenshots` in a second terminal. This optional helper requires Node 22+ and installed Chrome or Edge on Windows; set `KOPANO_BROWSER_EXE` for another installed Chromium executable. It uses isolated ignored profiles inside `.preview/` and sends no synthetic identity or application data. `npm run format` and `npm run format:check` maintain the source style.
