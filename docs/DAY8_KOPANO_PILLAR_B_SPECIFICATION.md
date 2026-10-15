# Day 8 — Kopano: Pillar B, Insights

**Date:** 15 October 2026 · Africa/Johannesburg  
**Owner:** Kopano and Kopano's AI coding assistant  
**Partner/integration owner:** Victor, Pillar A — [partner specification and shared agreement](DAY8_VICTOR_PILLAR_A_SPECIFICATION.md)  
**Specification version:** Day8-1.0  
**Starting code:** `main` at `b6d576c`; inspect current main before implementation.

## 1. Assignment and source requirements

Build a **manager/admin insights view backed by real stored leave data**, including its backend aggregation endpoint and frontend page. This is a full-stack pillar: you are not limited to frontend work. Victor owns the AI pillar and shared integration wiring.

Source: the supplied **Day 8 Brief — The Leave Tracker, Phase 3: Intelligence & Insights**, dated 15 October 2026, file `5b7aface-38a9-4edf-8b01-d2ce131bc742.pdf`. Its Pillar B, Build and Deliverables sections require meaningful patterns, correct real-data aggregation, honest visualisation, acceptable performance and an insight checked against the underlying records.

**Selected MVP:** low balances, approved leave load/busy periods, daily coverage warnings, and leave-type breakdown. Departments are not present in the current data model; do not fabricate them or add a department subsystem for this deadline. CSV export and richer charts are stretch work.

The brief lists examples rather than prescribing our exact metrics. The endpoint, formulas and planning thresholds below are the team's implementation choices. They are not official HR policy, legal entitlements or facts supplied by the AI.

## 2. Mandatory coordination rules

Read section 2 of Victor's specification and follow its shared Day8-1.0 agreement. The new pillar allocation supersedes historical frontend/backend ownership labels. In summary:

- Own Insights service/repository, validators, router/controller, `/insights` frontend page, feature API/types/styles, tests and your individual evidence.
- Victor owns central backend/frontend route registration, service wiring, global types/styles/config/package files and the merged OpenAPI file. Supply exact integration changes instead of editing those files concurrently.
- Proposed branch: `day8/kopano-insights`; use a separate worktree if sharing a machine. Preserve local/untracked reports and the partner's files.
- Do not change AI request contracts, the ordinary leave submission/decision rules, calendar workers, schema or authentication to make analytics easier.
- Implement against real Prisma/PostgreSQL data. No production fixture totals, public Supabase table access, browser-side service-role key or dependency on AI availability.
- Suggested feature files: `backend/src/services/insights.ts`, `repositories/insights.ts`, `validators/insights.ts`, `routes/insights.ts`, optional `controllers/insights.ts`; `frontend/src/pages/Insights.tsx`, `api/insights.ts`, `types/insights.ts`, `components/insights/*`, a feature stylesheet and focused tests.
- Export `createInsightsService(repository)` and `InsightsService`; export `createInsightsRouter(services)`. The router uses existing authenticated-account middleware/context. Victor mounts it after authentication and injects its service in both local `server.ts` and Vercel `index.mts`.
- Export the page as `Insights`. Victor registers `/insights` for MANAGER/ADMIN and adds side-panel navigation; preserve the existing five mobile destinations and role-specific centre action.

Your modules can be completed before central wiring is merged. If needed, use an isolated test-only router harness to verify your router with the existing auth middleware; label that scope. Complete actual `createApp` integration tests once Victor's registration is present. Do not claim an unmounted endpoint is running in the application.

## 3. Data access and workforce scope

The backend determines scope on every request:

| Role in selected organisation | Insights scope |
|---|---|
| ADMIN | All current active memberships with active users in that organisation, including the admin's own membership. |
| MANAGER | Current active direct reports with `managerMembershipId` equal to the actor's membership ID, in that exact organisation; exclude the actor. |
| EMPLOYEE, inactive/missing membership, inactive organisation | Deny with 403. |

Admin analytics includes their own record because it describes the workforce; it does not allow self-approval. Manager scope matches assigned-team privacy rather than showing organisation-wide balances. Never accept a browser-provided user/team/member scope override.

This is **planning for the currently active workforce**, including when a historical date range is selected. We do not have historical headcount snapshots; do not label current membership counts as historical staffing levels. The headcount includes all scoped active roles, not only EMPLOYEE. Balances/type counts are privileged information; never return private reasons, decision comments, emails or provider credentials.

An employee with memberships in two organisations counts separately within each organisation. Linked child requests belong only to their own organisation; do not aggregate a group across organisations or imply shared approval.

## 4. Insights endpoint and frozen response contract

### `GET /api/v1/insights`

Strict query parameters:

```ts
type InsightsQuery = {
  organisationId: string;          // required UUID
  from: string;                    // required date-only, inclusive
  to: string;                      // required date-only, inclusive
  allocationYear: number;          // required integer 2000–9999
  lowBalanceThreshold?: number;    // integer 0–365; default 3 days
  coverageThresholdPercent?: number; // integer 1–100; default 30
};
```

Reject invalid/nonexistent/reversed dates, unknown query fields and periods above **366 calendar days** with 400. This limit does not require introducing a database schema change. Missing/invalid bearer returns 401; unauthorised scope returns 403. Zero eligible members is a valid empty result, not a fabricated percentage or server error.

Return HTTP 200, `{data: InsightsResult}`:

```ts
type InsightsResult = {
  organisationId: string;
  generatedAt: string; // UTC ISO timestamp
  timezone: 'Africa/Johannesburg';
  period: { from: string; to: string };
  allocationYear: number;
  scope: 'ORGANISATION' | 'DIRECT_REPORTS';
  activeMemberCount: number;
  thresholds: { lowBalanceDays: number; coveragePercent: number };
  summary: {
    approvedRequestCount: number;
    pendingRequestCount: number;
    approvedPersonDays: number;
    upcomingApprovedPersonDays: number;
    coverageWarningDays: number;
    unallocatedMemberCount: number;
  };
  lowBalances: Array<{
    membershipId: string;
    employeeDisplayName: string;
    leaveTypeCode: string;
    leaveTypeName: string;
    allocatedDays: number;
    approvedDays: number;
    pendingDays: number;
    remainingDays: number;
  }>;
  monthly: Array<{ month: string; approvedPersonDays: number }>;
  dailyCoverage: Array<{
    date: string;
    approvedPeople: number;
    pendingPeople: number;
    projectedPeople: number;
    approvedPercent: number;
    projectedPercent: number;
    warning: boolean;
  }>;
  byType: Array<{
    leaveTypeCode: string;
    leaveTypeName: string;
    approvedRequestCount: number;
    approvedWorkingDays: number;
  }>;
  limitations: string[];
};
```

No AI narrative is required. The frontend can generate factual explanations from these fields, such as “2 of 5 active team members have approved leave on this date.” Render names through normal React escaping.

Keep field names aligned with this contract. Deliver corresponding feature-local TypeScript types plus an OpenAPI fragment in your handoff; Victor incorporates the fragment into `backend/openapi.yaml`. Do not silently change the base `Membership`, `LeaveRequest` or response envelopes.

## 5. Metric definitions — implement these exactly

### Population and records

Use one consistent read snapshot where feasible. Start from server-authorised, active workforce memberships. Select requests belonging to those memberships and this organisation where `startDate <= to && endDate >= from`. Deduplicate joined results by request ID. Count **APPROVED** and **PENDING** separately. DECLINED/CANCELLED contribute no load, reservation or coverage warning.

Do not drop valid historical request data just because its leave type is now archived. For current allocation warnings, however, consider active, balance-limited leave types only.

### Remaining balances

For `allocationYear`, preserve the existing full-year rule:

`remainingDays = allocatedDays − approvedDays − pendingDays`

Use full-year persisted usage for each membership/type, not only requests inside the chart's date filter. Reuse existing balance aggregation helpers where possible; convert Prisma decimals deliberately rather than returning strings.

Low balance means an allocated, active, balance-limited type with `remainingDays <= lowBalanceThreshold`. This is a configurable planning threshold, not an employer rule. Missing allocations are **unallocated**, not automatically zero entitlement. `unallocatedMemberCount` counts distinct scoped members missing at least one required active, balance-limited type allocation for the selected year. Do not include an unallocated row as a zero-day low balance. Explain this separately in the UI.

### Approved person-days and monthly load

Clip each request to the selected interval. Expand/count **weekdays only**, inclusive of both dates, using the project's existing date-only helpers. The global `approvedPersonDays` is the number of distinct `(membershipId, weekday)` pairs with approved leave. This avoids double-counting a person when data joins overlap.

Monthly totals partition those person-days by `YYYY-MM`; their sum must equal `summary.approvedPersonDays`. Return chronological buckets, including zero buckets in the selected period, so empty months do not disappear from the chart.

`upcomingApprovedPersonDays` uses the same calculation but starts at `max(from, today's date in Africa/Johannesburg)`. If the selected interval ends before today, it is zero. Label it “Upcoming approved person-days within the selected period.”

`approvedRequestCount`/`pendingRequestCount` count distinct overlapping child requests by status, not working days and not groups. A request spanning two months still counts once in the overall request count.

### Daily coverage and warnings

Return each weekday in the interval, including zero-load days. For each day:

- `approvedPeople`: distinct scoped memberships with APPROVED leave.
- `pendingPeople`: distinct scoped memberships with PENDING leave.
- `projectedPeople`: distinct union of those sets, never a blind addition.
- Percentages = people / `activeMemberCount` × 100, rounded to one decimal. Zero members gives zero percentages.
- `warning` is true when the **unrounded approved** percentage meets/exceeds the configured threshold and headcount is nonzero. Pending projections are informational and must not be described as approved absences.
- `coverageWarningDays` counts the true warning entries.

Label these **potential coverage pressure**, not confirmed understaffing: the app has no shift rosters, required staffing levels or department staffing model. Display the denominator and threshold alongside the warning.

### Leave-type breakdown

`byType.approvedWorkingDays` sums each distinct approved request's clipped weekday count, grouped by the stored leave type. `approvedRequestCount` counts distinct requests for that type. Label the chart **Approved request-days by leave type**. This is request-based, while global person-days deduplicate person/date pairs; do not label the two interchangeably or hide inconsistent legacy overlaps. Do not expose a sick-leave reason or make medical/productivity judgements.

## 6. Frontend experience

Build `/insights` inside the existing `WorkspaceShell`, using current theme tokens, page headings, loading/error/empty states, icons and responsive layout. Avoid an unrelated dashboard design.

MVP content:

1. Selected organisation and scope caption: organisation-wide or direct reports, plus active workforce count.
2. Date-range and allocation-year controls. Show threshold values; if editable, validate them and refetch only valid filters.
3. Summary cards for approved person-days, pending request count, upcoming load and coverage-warning days, with units and definitions.
4. Low-balance table: employee name, type, remaining, approved and reserved days; separate missing-allocation count/message.
5. Monthly leave-load chart with a readable data-table alternative and zero baseline.
6. Daily coverage list/chart showing approved and pending projection separately, thresholds and dates worth reviewing.
7. Leave-type breakdown with explicit request-day units.

Use simple SVG/CSS charts if sufficient; do not add a large chart library merely for decoration. Provide readable labels, keyboard-accessible controls and non-colour-only warnings. No 3D charts, misleading truncated axes or “AI insights” labels for deterministic calculations.

Use feature-local `api/insights.ts` calling the existing authenticated `apiClient`; no direct browser database access. Use `useApiQuery(['insights', org, from, to, allocationYear, thresholds...], ...)`, with abort signals. The helper already prefixes user identity and the shared leave refresh invalidates that prefix. Clear/hide stale results on organisation changes and never render the previous organisation's report while the next one loads.

Default the planning period to today through the next 30 calendar days and allocation year to the current policy year. Show the exact inclusive interval and “Data generated at” timestamp. If filters have no data, display honest zeros/empty explanations rather than sample charts. Handle 401/403, invalid filters and network failures with existing patterns.

## 7. Hand-checkable fixture and acceptance tests

Freeze today at **15 October 2026**. In a temporary organisation with exactly two eligible active members:

- Ava: annual allocation 15; APPROVED **30 October–2 November 2026**, which is **2 weekdays**; PENDING **3–4 November**, **2 weekdays**.
- Bongi: annual allocation 15; APPROVED **2 November 2026**, **1 weekday**; no pending leave.
- Report period: **30 October–4 November 2026**; allocation year 2026; low-balance threshold 12; coverage threshold 75%.

Expected results:

| Calculation | Expected |
|---|---|
| Active workforce | 2 |
| Approved / pending request counts | 2 / 1 |
| Approved person-days / upcoming approved person-days | 3 / 3 |
| Monthly approved person-days | October 1, November 2 |
| Ava remaining / Bongi remaining | 11 / 14 |
| Low-balance entries | Ava's annual balance only |
| 30 October approved coverage | 1 of 2 = 50% |
| 2 November approved coverage | 2 of 2 = 100%, warning true |
| 3–4 November | Approved 0%; projected 50% from pending leave |
| Coverage warning days | 1 |
| ANNUAL breakdown | 2 approved requests, 3 approved request-days |

Use a fixture with only the annual type for this example; otherwise explicitly allocate other required types when asserting the missing-allocation count.

Additional acceptance:

| ID | Required check |
|---|---|
| B-01 | Endpoint values match the persisted fixture rows and the hand calculation above. |
| B-02 | ADMIN sees organisation scope; MANAGER sees direct reports only; EMPLOYEE, missing membership and unrelated organisation are denied. |
| B-03 | Inactive memberships/users are excluded; zero eligible people has no divide-by-zero or invented warning. |
| B-04 | Weekend clipping, month/year boundaries, outside-period requests, pending versus approved, cancelled/declined exclusions and duplicate joins are correct. |
| B-05 | Missing allocations are distinguished from allocated zero/low balances; balance usage is not incorrectly clipped to chart dates. |
| B-06 | Date order, impossible dates, >366-day periods, invalid thresholds and extra query fields return 400. |
| B-07 | Organisation/filter changes cancel or ignore stale responses and cannot leak the previous scope. |
| B-08 | A normal confirmed leave submission changes pending insights; approval changes approved metrics after existing cache refresh. AI drafting alone changes neither. |
| B-09 | API/page work with AI disabled. No reason, comment, email or privileged key leaks through DTOs, chart labels or export. |
| B-10 | A read-only report against real authorised stored data is demonstrated, with one figure reconciled to its underlying rows. |

Use deterministic tests for aggregation and an opt-in real PostgreSQL integration test with cleaned-up fixtures. Do not mutate real employees or fabricate live totals. Keep queries bounded, avoid N+1 queries per employee and avoid loading unbounded all-history data when only annual usage or interval rows are needed. Record a representative scoped query/page timing with dataset size; do not claim a performance target was met without measurement.

Run feature tests, backend source/test typecheck and build, frontend tests/build and organisation/role regressions after integration. Latest recorded baseline is 75 frontend tests; report actual new results. Add desktop/mobile evidence in each institution theme without claiming sample screenshots prove real data.

## 8. Handoff and deliverables

Give Victor:

- Branch/commit and the complete feature file list.
- Exact `InsightsService`, router and frontend export names, route/role requirements and API examples matching section 4.
- A small shared-file wiring patch covering `AccessServices`, API registration, **both** runtime entry points, frontend route/navigation and OpenAPI fragment. Do not silently leave Vercel unwired.
- Test commands/results, deterministic fixture values and live-data reconciliation evidence.
- No-key behaviour, known limitations, query timing/dataset size and any dependency/config needs.

Suggested individual report: `docs/day8/KOPANO_INSIGHTS_EVIDENCE.md`, containing formulas, access scope, design choices, one actionable finding, the row-level reconciliation and limitations. This is a future deliverable, not evidence already collected.

Priority 1 is this correct real-data view plus Victor's working AI feature. Priority 2 is optional CSV export (same authorised scope, safe spreadsheet cells), richer filters or a second chart. Any export must avoid reasons/emails and recheck permissions server-side; do not make exports an MVP dependency.

For the joint demo, read one real insight, explain its denominator/unit and say what a manager would do: review a high-overlap date, discuss a low annual balance or allocate missing entitlement. Explain one limitation and one next improvement. Contribute your reflection and individual notes to the brief's shared app/repo/documentation/testing submission. Do not submit externally or claim production verification merely because this specification describes those future deliverables.

## Starter prompt for Kopano's model

> Implement Pillar B from `docs/DAY8_KOPANO_PILLAR_B_SPECIFICATION.md`. First read both Day 8 specifications and inspect current main. I am Kopano and own the full-stack real-data Insights feature. Victor owns AI leave drafting and central integration files. Follow Day8-1.0, the exact metric definitions, response contract and role scopes. Build your feature in separate files, provide Victor a minimal wiring/OpenAPI handoff, preserve the current themes/navigation/core leave rules and do not edit the partner's modules. Prove one insight against actual stored rows, distinguish fixtures from live evidence and never invent production data. Deliver your tests, implementation notes, limitations and demo explanation with the feature.
