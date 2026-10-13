# Kopano — Frontend Specification
**Project:** D-Lab Blitz Day 6 Leave Management System  
**Partner:** Victor (Express + Supabase + Prisma backend)  
**Contract:** `SHARED_API_CONTRACT.md` is binding; do not invent endpoints or request/response fields.

## Mission
Build a responsive, understandable, accessible React + Vite interface for an employee, organisation manager and organisation administrator. Integrate with Victor's authenticated REST API. Showcase multi-organisation membership: switch organisations; see one's own balances and history; request leave in one or several organisations; managers decide organisation-specific requests; approved leave appears on authorised organisation calendars.

## Ownership
Own `/frontend`: React + Vite + TypeScript app, layouts, UX, forms, routing, authenticated UI, API client, calendars, accessible/loading/error states and frontend tests. Review API integration with Victor; do not change backend shapes without agreement.

## Tech/UI structure
React + Vite + TypeScript; React Router for pages; Supabase JS client for authentication; React Query (TanStack Query) for server state; react-hook-form + Zod for form validation; date/calendar UI library such as FullCalendar or a simpler accessible month grid. Keep styling consistent across all roles; responsive desktop/mobile. Organise `/src/components`, `/src/pages`, `/src/auth`, `/src/api`, `/src/hooks`, `/src/types`, `/src/layouts`.

## Screens and behaviours
1. **Sign in:** Supabase Auth email/password; clear progress/errors. Never store service role keys in frontend. After auth call `/api/v1/me`.
2. **Organisation switcher:** show memberships from `/me`; active selection determines org-scoped view. Show role for this org. No option to browse inaccessible organisations. Persist UI preference locally if desired (but backend remains authority).
3. **Employee dashboard:** current-org leave balance cards (allocated, pending, approved, remaining); upcoming approved leave; recent requests; quick CTA Request Leave.
4. **New request:** leave type, start and end dates, optional private reason, organisation selection containing only current memberships (one or multiple). Show calculated weekdays as an estimate; backend response is authoritative. Use `POST /api/v1/leave-requests` with exact `organisationIds`, `leaveTypeCode`, `startDate`, `endDate`, `reason`. Display each org's request and status; handle partial approvals after submission. No synthetic backend data in production flow.
5. **My requests:** filters by status/org, dates, duration, approver/decision; pending cancellation via `POST /api/v1/leave-requests/:id/cancel`; if linked, cancelling one child does NOT silently cancel other organisations.
6. **Manager inbox:** only visible if role MANAGER or ADMIN for selected org; show employee name, type, dates, working days, optional private reason, overlaps if API supports them; approve/decline using `/manager/leave-requests/:id/decision`; require decline comment; refresh inbox, balance, calendar after decision.
7. **Organisation leave calendar:** query `GET /api/v1/calendar-events?organisationId=...&from=...&to=...`; month or timeline view, approved events only; show employee name and date range, NEVER employee's private reason. Changing org refreshes calendar. Dates use inclusive date-only semantics. Display a friendly empty state.
8. **Admin view (MVP basic):** organisation memberships/role or allocation management using documented admin endpoints, if ready; defer advanced management UI if core unfinished.
9. **States:** skeleton/loading, empty states, inline form errors, unauthorised, session-expired, server unavailable, no balance, overlap warning, unsuccessful submission. Map `error.code` from shared contract into human-friendly messaging.

## API integration rules
- `VITE_API_URL=http://localhost:3001`, API path `/api/v1`.
- Create one typed `apiClient` that gets Supabase session access token and sets `Authorization: Bearer ...`; handles 401 (sign in again), 403 (permission), 409 (conflict), 422 (balance) plus JSON envelope.
- Never pass fabricated `userId`, `role`, or manager flags to API. `organisationId` is a selector, not proof of access.
- Only request permitted organisation-scoped resources; backend enforces this too.
- Prefer types generated from OpenAPI, or manually mirror `SHARED_API_CONTRACT.md` until generation exists.
- Treat `data` as payload, `meta` as pagination; `error.code/message/details` for errors.
- Always refetch invalidated balance, requests, queue, calendar after a mutation. Avoid optimistic approval visualisation until server confirms.

## User journey and example
Ayanda signs in -> selects D-Lab -> sees balances -> creates annual leave for both D-Lab and Field Institute (both memberships from `/me`) -> sees two linked PENDING requests -> Thabo approves D-Lab portion; D-Lab calendar displays the absence -> Field Institute remains PENDING until Lerato approves -> Field Institute calendar then displays it -> StrideShift-only employee sees neither.

## UI acceptance and accessibility
- Keyboard navigable forms, focus indicators, labels and descriptive errors; colour-independent status chips.
- Mobile screens usable without horizontal overflow; responsive tables can become cards.
- Request input has explicit date picker labels and clear summary of selected organisations.
- Explain status for each selected organisation; don't imply global approval after one manager's decision.
- Never render private leave reasons on shared calendar UI.
- Working auth and actual API calls are required; mocks only in explicitly labelled development mode.
- Screens handle 401/403/404/409/422 without crashing, and avoid duplicate submits.

## Implementation order
1. Vite TS React setup, router, layout, auth UI, responsive tokens.
2. Typed API client, Supabase auth, `/me`, organisation switcher.
3. Dashboard, balance cards, leave type options and new-request form.
4. My requests/history/cancel.
5. Manager queue, approve/decline with comments.
6. Shared approved-leave calendar and multi-org statuses.
7. Basic admin view (if time), integration tests, demo recording/screenshots, README section.

## Definition of done
Employee + manager + admin entry points function with real backend; Ayanda cross-organisation scenario works; request statuses, balances and calendars match backend; no accidental private information exposure; reviewer can demo from sign-in to approval; screenshots/tests and known limitations included.

## Codex instruction (paste in VS Code)
> You are a senior React + TypeScript frontend engineer. Before writing code, read `SHARED_API_CONTRACT.md` and `KOPANO_FRONTEND_SPECIFICATION.md`. Work only in `/frontend` and agreed shared documentation. Build the accessible responsive employee, manager and admin interfaces with Supabase Auth, organisation switcher, leave form, balances, history, manager decision queue and approved calendar. Use the EXACT `/api/v1` endpoints and JSON shapes from the contract, with a reusable typed API client and Vite env configuration. Treat server as source of truth; never fabricate user roles or balances or expose private reasons in calendars. Build in milestones, run typecheck/tests, and show integration instructions. Do not modify `/backend` or invent a different API.
