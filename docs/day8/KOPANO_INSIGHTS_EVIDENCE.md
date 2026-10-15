# Kopano — Day 8 Pillar B implementation and evidence

Date: 15 October 2026. Contract: Day8-1.0. Branch: `day8/kopano-insights`.
Base: `ab3c359c8c4e7205c61cee321517eb66a692a442` (latest main inspected and fetched).

## Delivery status

The original feature-local branch was merged into main in `b4d8135`. At the user's request, the shared integration is now implemented on top of that main revision, preserving Victor's Gemini drafting feature. Insights is registered after authentication; both standalone and Vercel runtime entries inject its service. `/insights` is registered behind MANAGER/ADMIN guards with a side-panel link, and its OpenAPI fragment is merged alongside the AI endpoint.

Current combined checks: **256 backend tests pass, 37 opt-in database tests skipped; 98 frontend tests pass; source/test typechecks and both builds pass**. The application-wiring checks are now permanent rather than opt-in. Authenticated application-flow tests cover the sidebar link, page, employee guard and mobile drawer. See [integration status](INTEGRATION_STATUS.md).

The earlier fixture and isolated rehearsal evidence below remains historical evidence. No schema, package, lockfile, authentication, leave-policy or calendar-worker changes were required. Hosted acceptance and read-only live-data reconciliation remain separate from these local checks.

## Implementation and access

- `createInsightsRepository(database)` reads Prisma/PostgreSQL data in one RepeatableRead transaction. It rechecks the actor's current active membership/user/organisation, then loads a bounded interval and grouped annual usage.
- ADMIN includes every current active membership with an active user in the selected organisation, including self and all roles. MANAGER includes only active direct reports, excluding self. EMPLOYEE, missing membership and inactive organisation are denied.
- The six logical database operations result in eight SQL SELECTs with Prisma's batched related-user/type loading in the measured nonempty fixtures. There is no employee-by-employee query loop. Annual usage is grouped in SQL, not fetched as unbounded history.
- `createInsightsService(repository)` / `InsightsService` and `createInsightsRouter(services)` expose the frozen contract. The router consumes existing authenticated context and must be mounted after the existing bearer middleware. It sends `Cache-Control: no-store`.
- `Insights` uses the existing authenticated client, organisation provider, query helper, UI feedback and theme tokens. Queries include user identity, organisation, all applied filters and membership/role scope, and consume abort signals. Invalid form edits do not refetch. Organisation/role changes hide old reports; server scope mismatches are rejected in the page.
- DTOs allowlist fields: display names are required for low balances; reasons, decision comments, emails and provider credentials are never returned. React escapes names. No AI calls, keys or generated narrative are needed.

## Metric definitions and design decisions

Approved person-days count distinct `(membershipId, weekday)` pairs clipped to the inclusive report interval. Monthly buckets partition those pairs and include empty months. Upcoming uses today's date in Africa/Johannesburg and the selected interval. Request totals deduplicate child IDs, independently of groups.

Daily approved/pending counts use distinct member sets; projected is their union. Percentages display one decimal; warning comparisons use unrounded approved percentages and require nonzero headcount. Pending projections do not create approved warnings.

Balances use the selected full policy year's persisted `workingDays`, classified by request start year, and subtract both approved usage and pending reservations from allocations. Prisma decimal allocations convert explicitly to numbers; remaining balances retain two decimal places. Missing allocations count distinct members, separately from allocated low/zero balances. Required allocation types are active and balance-limited. Archived types remain included in historical request load.

Leave-type totals count clipped weekdays for each distinct approved request, labelled **Approved request-days by leave type**. Legacy overlapping requests can make these exceed global deduplicated person-days; the UI states the distinction.

The existing submission working-day helper rejects cross-year and weekend-only intervals, which are valid report filters. Insights reuses strict date parsing and adds its own weekday expansion. Ordinary submission/approval rules remain unchanged.

The page uses a simple zero-baseline CSS monthly chart with a readable table alternative, explicit count/unit labels, keyboard-accessible filters and scrollable tables. Coverage warnings use text as well as styling. Existing WorkspaceShell themes and mobile navigation are preserved through the integration patch.

## Stored fixture reconciliation (controlled test data)

The test creates actual rows using the generated Prisma client in a fresh PostgreSQL-in-WASM database, with all three existing SQL migrations and constraints applied. This is stored fixture evidence, **not an external PostgreSQL or production check**. Time is fixed to 15 October 2026. The organisation contains exactly Ava and Bongi and only the annual balance-limited type; each allocation is 15 days.

| Stored member/status | Inclusive dates | Persisted working days | Clipped weekdays |
|---|---|---:|---|
| Ava / APPROVED | 30 October–2 November 2026 | 2 | 30 October, 2 November |
| Ava / PENDING | 3–4 November 2026 | 2 | 3 November, 4 November |
| Bongi / APPROVED | 2 November 2026 | 1 | 2 November |

Query: 30 October–4 November 2026, allocation year 2026, low threshold 12 days, coverage threshold 75%.

| Figure | Hand calculation | Observed and asserted |
|---|---|---|
| Workforce | Ava + Bongi | 2 |
| Approved / pending requests | 2 / 1 | 2 / 1 |
| Approved / upcoming person-days | Ava 2 + Bongi 1 | 3 / 3 |
| Monthly person-days | October 1; November 2 | 1; 2 |
| Ava remaining | 15 − 2 approved − 2 pending | 11, sole low balance |
| Bongi remaining | 15 − 1 approved | 14, above threshold |
| Missing allocations | Both have annual allocations | 0 |
| 30 October | 1 / 2 approved | 50%, no warning |
| 2 November | 2 / 2 approved | 100%, warning |
| 3 and 4 November | 0 approved; 1 pending / 2 | 0% approved; 50% projected |
| Warning days | Only 2 November | 1 |
| Annual type | 2 approved requests; 2 + 1 weekdays | 2 requests; 3 request-days |

The stored-row test also reads the original request rows independently and reconciles their three approved weekdays to `summary.approvedPersonDays`. Separate tests cover duplicate joins, overlapping approved requests, pending unions, clipped periods, cross-year/month boundaries, archived types, missing allocations, zero headcount and unrounded thresholds.

Actionable fixture finding: a manager should review the overlap on **2 November**, when **2 of 2** current members have approved leave, above the selected **75%** planning threshold. Ava's **11** remaining annual days also meet the **12-day** discussion threshold. These are configurable planning signals, not evidence of actual understaffing or official HR policy.

## Verification and timing

Feature-branch checks:

| Command from repository root | Result |
|---|---|
| `npm --prefix backend run typecheck` | Source and test typechecks pass |
| `npm --prefix backend run build` | Pass, including Prisma generation |
| `npm --prefix backend test -- --reporter=dot` | 201 passed; 38 skipped |
| `npm --prefix frontend test -- --reporter=dot` | 89 passed (baseline 75; 14 added) |
| `npm --prefix frontend run build` | Pass |

The 38 skipped backend checks are 34 existing opt-in database tests, one new native PostgreSQL fixture and three central-registration checks. The last three are enabled and pass in the separate wiring rehearsal. Native PostgreSQL is intentionally opt-in; an external test database was not configured here.

Rehearsal scope: unchanged main base + these feature files + `insights-wiring.patch` + merged OpenAPI fragment. Source/test typechecks, both production builds, all 89 frontend tests, and 204 backend tests (35 opt-in database tests skipped) pass. The backend total includes the three actual `createApp` authentication/validation/response integration checks. This verifies the proposed patch locally; it does not establish Victor has merged it or that Vercel has deployed it.

Measured service/repository reads, excluding setup, against PostgreSQL-in-WASM on this runner:

| Dataset | Interval requests | Allocations / required types | SQL SELECTs | Elapsed |
|---|---:|---:|---:|---:|
| 2 active members | 3 | 2 / 1 | 8 | 55.73 ms |
| 102 active members | 204 | 102 / 1 | 8 | 48.36 ms |

These are single local fixture measurements; the smaller run includes colder execution. They demonstrate constant query count at these sizes, not a production SLA, network latency, browser paint time or a benchmark for large organisations.

## Acceptance map

| Check | Evidence / status |
|---|---|
| B-01 | Deterministic and actual stored fixture values above pass |
| B-02 / B-03 | Mocked query-shape checks and stored role/activity changes pass; unrelated scope denied; manager denominator and zero workforce verified |
| B-04 / B-05 | Aggregation and stored-row tests pass, including full-year usage, allocated zero versus missing and archived types |
| B-06 | Strict schema and authenticated HTTP harness reject invalid ranges, UUIDs, thresholds, unknown/repeated fields |
| B-07 | Page tests verify cancellation/ignoring stale organisations, role-cache isolation, mismatched server scope and applied filters |
| B-08 | Existing real leave service creates PENDING fixture request; existing manager service approves it; pending/approved metrics change. Frontend test separately verifies shared leave invalidation refetches Insights. AI is absent; reading Insights makes no business writes |
| B-09 | Feature tests run without AI; stored private notes/emails excluded; names escaped; existing 401/403/network feedback retained |
| B-10 | Controlled stored fixture reconciled. **Read-only authorised live-data demonstration remains pending**; no database/auth credentials were supplied to this checkout |
| Desktop/mobile screenshots in DLB/TFI/SSG | **Pending browser/hosted verification after shared integration**; responsive source and DOM tests are not screenshot evidence |

## Completing live evidence safely

`backend/src/scripts/verify-insights.ts` is a read-only verification path using existing Supabase bearer verification, application profile verification and the same scoped repository. It prints only summary/monthly counts, timing and approved source row IDs/dates/weekday counts for reconciliation. It does not print names, emails, reasons, comments or configuration. Treat its row IDs as internal evidence; do not publish real employee identifiers.

Provide existing backend database/Supabase configuration and these environment variables through the normal local secure environment:

- `INSIGHTS_BEARER_TOKEN`: a current authorised manager/admin session; never commit it.
- `INSIGHTS_ORGANISATION_ID`, `INSIGHTS_FROM`, `INSIGHTS_TO`, `INSIGHTS_ALLOCATION_YEAR`.
- Optional `INSIGHTS_LOW_BALANCE_DAYS`, `INSIGHTS_COVERAGE_PERCENT` (defaults 3 and 30).

From `backend`, run `node --env-file=.env node_modules/tsx/dist/cli.mjs src/scripts/verify-insights.ts`. It rechecks scope, independently deduplicates approved member/weekday source pairs, and fails if those differ from reported approved person-days. Record the authorised organisation/scope, interval, summary, anonymised reconciliation and elapsed time here after actually running it. Then verify the mounted HTTP endpoint with the same authorised session and the visible page in all three themes at desktop/mobile sizes.

Native PostgreSQL fixture: provide an already migrated **disposable test database** as `INSIGHTS_TEST_DATABASE_URL` and set `INSIGHTS_RUN_POSTGRES=1`; run `npm --prefix backend test -- tests/insights/postgres.integration.test.ts`. The test creates a uniquely identified temporary organisation/users/rows and removes only those fixtures in teardown. It is separate from the read-only live-data script.

## Limitations and reflection

The denominator is the currently active workforce, even for historical periods. Weekdays exclude weekends but do not model public holidays, shifts, half days, required staffing or departments. The feature describes patterns, not medical causes, productivity or staffing adequacy. Legacy request overlaps are deduplicated for person-days but intentionally remain request-based in type totals and persisted annual policy usage.

Choosing simple charts and explicit units keeps the MVP auditable. The most important correctness decisions were reserving pending usage for full-year balances, distinguishing missing entitlement from zero, rechecking database scope and separating approved absences from projections. A useful next improvement is agreed staffing/holiday data and larger native PostgreSQL/hosted measurements. CSV export and richer charts are deferred; there are no new runtime dependencies or environment keys for Insights itself.
