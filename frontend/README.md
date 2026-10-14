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

Open http://localhost:5173. `VITE_API_URL` defaults to `http://localhost:3001`; it is the server origin, without `/api/v1`. The API client appends the prefix exactly once. Use only the Supabase project URL and public anon key; never put a service role key or database credential in a Vite environment variable. `.env` files are ignored locally. The backend must allow the Vite origin in CORS and verify Supabase Bearer tokens from the same project. Email signup is available. New accounts wait for an administrator to assign organisation access and explicit leave allocations; the frontend never grants itself access.

## Troubleshooting workspace access

Supabase sign-in and the leave API are separate services. After sign-in, Kopano calls `GET http://localhost:3001/api/v1/me` with the session's Bearer token. The workspace requires that endpoint to return the real profile and memberships.

If you see "We cannot reach the leave server", check that the backend is running and that `VITE_API_URL` contains its origin, without `/api/v1`. Restart Vite after changing `.env`. Test the public health endpoint at `http://localhost:3001/api/v1/health`; a successful health response confirms the server is reachable, but does not confirm that `/me` or leave endpoints are implemented.

The backend implements `/me`, organisations and leave types. A missing application profile returns 404; an inactive profile returns 403. Provision real profiles and memberships or use the documented Auth-backed demo accounts. Balances, requests and internal calendar endpoints are implemented. See [API implementation status](../docs/API_IMPLEMENTATION.md) and [backend setup](../docs/BACKEND_SETUP.md).

Use `http://localhost:5173` for the frontend: the documented backend CORS default permits that exact origin. `http://127.0.0.1:5173` is a different origin and must also be allowed in the backend's `FRONTEND_ORIGINS` if used. A browser CORS failure can produce the same network-error message even when the backend is running.

## Implemented flows

For a read-only visual preview during local development, open `http://localhost:5173/preview/dashboard`. It uses explicitly labelled sample data, allows switching between example organisations, and disables submission controls. Preview rendering uses the same balance cards, upcoming leave list and request cards as the live dashboard. It makes no application API calls and is excluded from the production build; the live routes still require authenticated backend data.

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

Admin creation of employee memberships and initial allocations is implemented through the email/calendar handoff. Editing existing memberships and allocations remains deferred. The membership list uses stored profile names supplied by the organisation-scoped admin API. Public-holiday exclusions, half days and employee overlap warnings are not implemented. External calendar administration and email auth are described below. Upcoming approved leave consumes all documented pages; the dashboard request preview shows the API's first page without claiming an undocumented sort order. A production static host must rewrite browser routes to `index.html`. Authenticated-flow screenshots and live backend demo evidence remain pending until real credentials and the backend are available.

Implementation follows [the frontend specification](../docs/KOPANO_FRONTEND_SPECIFICATION.md) and [the binding shared API contract](../docs/SHARED_API_CONTRACT.md). Authentication and cache handling follow the [Supabase auth lifecycle documentation](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [TanStack Query invalidation documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).

## Recorded verification — 13 October 2026

- TypeScript check and production build passed.
- 32 tests passed across 4 files, including the Supabase token-source expiry regression and development dashboard preview.
- The real Vite sign-in route returned HTTP 200.
- Installed Chrome verified the actual rendered sign-in page at 1440px and 390px: no horizontal overflow and no JavaScript runtime exceptions.
- [Desktop screenshot](screenshots/sign-in-desktop.png), [mobile screenshot](screenshots/sign-in-mobile.png), and [browser verification data](screenshots/verification.json) are included. They show the unconfigured-auth state; they do not claim successful live authentication or backend integration.
- The read-only dashboard preview was checked at 1440px and 390px with no overflow or runtime exceptions: [desktop](screenshots/dashboard-desktop.png), [mobile](screenshots/dashboard-mobile.png), [verification data](screenshots/dashboard-verification.json). Run `npm run screenshots -- dashboard` to recapture it. Sample preview data is absent from the production bundle.

To recapture sign-in previews, start `npm run dev`, then run `npm run screenshots` in a second terminal. This optional helper requires Node 22+ and installed Chrome or Edge on Windows; set `KOPANO_BROWSER_EXE` for another installed Chromium executable. It uses isolated ignored profiles inside `.preview/` and sends no synthetic identity or application data. `npm run format` and `npm run format:check` maintain the source style.

## Email onboarding and Google Calendar administration

The frontend implements the additions in
[EMAIL_CALENDAR_BACKEND_HANDOFF.md](../docs/EMAIL_CALENDAR_BACKEND_HANDOFF.md).

- `/sign-up` uses Supabase email/password signup and confirmation, with neutral
  confirmation feedback. Passwords go only to Supabase. Signup creates no roles,
  memberships or leave entitlement.
- Authenticated workspace entry calls `/auth/profile` before rendering. It uses
  the display name from signup or an existing profile; accounts without a name
  can complete their profile. Existing profiles are preserved by the API. Accounts
  without active memberships see the organisation-access waiting state.
- `/admin` assigns EMPLOYEE membership by exact email and creates explicit
  allocations. Manager/member choices and membership cards show `ROLE-Full-Name-ORG` labels
  from the organisation-scoped admin response. Organisation codes are DLB, SSG
  and TFI; API requests continue to use UUIDs. Existing allocations
  and memberships cannot be edited/reactivated through these creation forms.
- `/admin/calendar` handles Google consent in the same tab with the browser nonce
  cookie, paginated writable calendars, explicit invitation opt-in, a read-only
  access check, sync status/retry, and disconnect confirmation. Callback feedback
  is consumed safely at `/admin` and does not expose raw query text.

Keep API calls same-origin on Vercel. Configure Supabase confirmation delivery
and redirect allowlists, Google server credentials, a distinct shared calendar
per organisation, and the trusted worker as described in
[CALENDAR_EMAIL_SETUP.md](../docs/CALENDAR_EMAIL_SETUP.md). No scheduler secret is
read by frontend code and the frontend never invokes the internal worker.

Automated UI/API fixture tests cover payloads, profile gating, role restrictions,
calendar pagination, cookie-backed consent, invitation defaults, retries and
status wording. Provider consent, SMTP delivery, live migrations and Google event
or invitation delivery require configured integration verification.

## Password recovery and approval filters

`/forgot-password` sends a Supabase reset email with neutral account feedback.
The link returns to `/reset-password`, which accepts the SDK's
`PASSWORD_RECOVERY` event, validates matching passwords (at least eight
characters), and updates the password directly through Supabase. Recovery
sessions are routed to the reset screen before any workspace/profile query.
After saving, the frontend closes the local session and asks the user to sign in
again. Missing/expired links show a new-link action; if the reset page is
reloaded before completion, request a fresh link. Provider policy still controls
which passwords are accepted.

In Supabase **Authentication → URL Configuration → Redirect URLs**, allow:

- `https://the-leave-tracker-skfc.vercel.app/reset-password`
- `http://localhost:5173/reset-password` for local development
- `http://127.0.0.1:5173/reset-password` if using that Vite origin

Configure confirmation/recovery email delivery separately in Supabase. The flow
follows [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
Automated fixtures verify recovery payloads, matching passwords, recovery
gating, safe failures and sign-out; they do not verify real email delivery.

Approvals offer Pending, Approved, Declined and Cancelled filters, always
sending an explicit status and resetting pagination when it changes. The
misleading “All statuses” option was removed because omitting status makes the
existing backend return only Pending. Employee request history retains its
working “All statuses” filter.

## Institution branding

The selected organisation controls its logo, sidebar, active navigation, primary
buttons, balance cards and header accents. The Leave Tracker uses a shared
calendar/check mark and `/favicon.svg`. Local SVG navigation icons retain text
labels. Unknown organisations use the neutral Leave Tracker theme; leave status
and error colours keep their semantic meaning.

Palette sources checked on 14 October 2026:

| Organisation        | Palette                                           | Source                                                                                   |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| D-Lab               | Navy `#1A294B`, gold `#EBB532`, green `#0B745C`   | [Official brand tokens](https://d-lab.co.za/wp-content/uploads/elementor/css/post-8.css) |
| The Field Institute | Black `#080808`, cyan `#15E0FB`, yellow `#F9BF11` | [Official website](https://www.thefieldinstitute.com/)                                   |
| StrideShift Global  | Navy logo, cool blue, warm off-white `#F6F4EE`    | [Official website](https://www.strideshift.ai/)                                          |

Original logos are stored locally in `public/brands` from the official sites:
D-Lab's white wordmark with coloured stars, The Field Institute's white geometric
mark, and StrideShift's navy wordmark (displayed on a white panel for contrast).

The development-only `/preview/dashboard` selector includes all three themes.
With Vite running, use `npm run screenshots -- themes`; set `KOPANO_BROWSER_EXE`
to an installed Chrome/Edge executable where needed. [Browser evidence](screenshots/theme-verification.json)
records desktop/mobile checks at 1440px/390px, loaded logos, navigation icons and
no horizontal page overflow or runtime exceptions. Screenshots use labelled
sample data; automated flow tests also verify membership selection changes the
workspace theme.

## Responsive workspace navigation

The live workspace and development preview share `WorkspaceShell`. The header
shows the organisation code and its actual logo. On desktop, the header toggle
collapses the sidebar to an icon rail; expanding restores the organisation
selector and profile controls.

At widths up to 760px, the sidebar becomes a modal side panel opened from the
header or **More** in the bottom navigation. It supports a close button,
backdrop dismissal, Escape, focus trapping/restoration and background scroll
locking. Navigation and organisation changes close the panel. The bottom bar
contains Overview, My requests, a raised circular centre action, Calendar and
More. The centre action is Request leave for EMPLOYEE, or Leave approvals for
MANAGER (`/manager`) and ADMIN (`/admin/approvals`). Reviewers can still request
their own leave from the side panel. Safe-area padding keeps the bar clear of
mobile home indicators and keeps page content above it.

Automated fixtures verify role-specific destinations, desktop toggling,
keyboard dismissal, focus restoration and organisation switching. Chrome theme
captures verify desktop collapse and mobile panel opening/closing, five bottom
items, loaded header logos and no page overflow at 1440px and 390px. Additional
`theme-*-mobile-panel.png` and `theme-*-desktop-collapsed.png` screenshots show the
open panel and collapsed rail; preview actions remain read-only.
