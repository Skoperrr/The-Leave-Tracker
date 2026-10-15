# Available leave types

All three institution baselines now include these six types. The request form, admin allocation selector and AI drafting read the active types from the backend.

| Code | Label | Allocation |
|---|---|---|
| ANNUAL | Annual leave | Admin-assigned annual days |
| SICK | Sick leave | Admin-assigned annual days |
| FAMILY_RESPONSIBILITY | Family responsibility leave | Admin-assigned annual days |
| MATERNITY | Maternity leave | Admin-assigned annual days |
| PARENTAL | Parental leave | Admin-assigned annual days |
| RELIGIOUS | Religious leave | Admin-assigned annual days |

The four new types require allocations, as requested. No default day allowances or automatic approvals are introduced. Existing annual/sick allocations remain unchanged. An employee without enough allocated days receives `422 INSUFFICIENT_BALANCE`; pending requests reserve days, and approvals consume the same reservation without double deduction.

## Admin setup

Select the institution, open **Administration → Create leave allocation**, choose the member and leave type, enter the policy year and approved day allowance, then choose **Create allocation**. Repeat for the relevant members and institutions. Existing allocations cannot be overwritten through this form.

## Database setup

From `backend/`, run `npx prisma db seed` with the existing private database environment configured. This idempotently adds missing baseline types for D-Lab, StrideShift Global and The Field Institute. Existing type settings are preserved; it does not reset accounts, requests, credentials or balances. No schema migration or new environment variable is needed.

## Existing date rules

Requests remain full-day weekday ranges within a single calendar year. Longer maternity or parental leave crossing December must use separate requests for each year, with allocations for each policy year. This change adds categories; it does not define legal entitlements or eligibility.

## Verification — 15 October 2026

- Confirmed all four new types are active and balance-limited in each of the three configured institutions, without reading employee records.
- Four real PostgreSQL workflow tests passed on temporary fixtures: no allocation rejects with `422 INSUFFICIENT_BALANCE`; an employee cannot allocate; an admin can allocate; requests reserve only their own type's balance; approval transfers the reservation; approved absences appear in the calendar without private reasons. Fixture cleanup completed.
- Backend regression suite: 330 passed, 46 opt-in tests skipped. Includes AI drafting for all four organisation-provided type codes.
- Frontend suite: 114 passed, covering selection/submission and admin allocation for each new type.
- Backend typecheck and both production builds passed.
