# Victor — Insights integration handoff

**Integration update:** the user has requested the shared wiring, which is now implemented on top of main `b4d8135`, preserving Victor's AI changes. The patch below records the original handoff; **do not apply it again after this integration**. See [current status](INTEGRATION_STATUS.md). Backend registration tests now run by default, without `INSIGHTS_INTEGRATION_REHEARSAL`.

Branch: `day8/kopano-insights`, based on main `ab3c359`. Merge the feature modules before applying the shared-file changes. The feature commit is the commit adding this document; use `git log --oneline -- docs/day8/KOPANO_INSIGHTS_HANDOFF.md` to identify it.

## Original shared wiring patch (already integrated)

The feature branch intentionally does not edit your central integration files. Review/apply `docs/day8/insights-wiring.patch` from the repository root:

```sh
git apply --check docs/day8/insights-wiring.patch
git apply docs/day8/insights-wiring.patch
```

The patch adds optional `insights?: InsightsService` to `AccessServices`, mounts `createInsightsRouter(services)` **after** `authenticate(services)`, and injects the repository/service in **both `server.ts` and Vercel `index.mts`**. Merge these edits by hand if Pillar A has moved the context; preserve AI wiring.

It imports the named `Insights` page, registers `/insights` inside the MANAGER/ADMIN guard and adds the side-panel link using the existing overview icon. It does not change the five mobile destinations or admin Calendar settings/role-specific centre action. Insights is reachable in the mobile navigation drawer.

Merge `paths./insights` and `components.schemas` from `insights.openapi.yaml` into `backend/openapi.yaml`, retaining all existing and AI entries. The fragment reuses existing `bearerAuth` and standard error components. Its references were verified after a rehearsal merge. Do not replace the whole API document with the fragment.

## Public interfaces

| Module | Export / use |
|---|---|
| `backend/src/repositories/insights.ts` | `createInsightsRepository(database)` |
| `backend/src/services/insights.ts` | `createInsightsService(repository)`, `InsightsService`, `InsightsResult` |
| `backend/src/routes/insights.ts` | `createInsightsRouter(services)`, optional `services.insights` |
| `backend/src/validators/insights.ts` | `insightsQuery`, `InsightsQuery` |
| `frontend/src/pages/Insights.tsx` | Named `Insights` export, inherits WorkspaceShell |
| `frontend/src/api/insights.ts` | `fetchInsights(filters, signal)` through existing authenticated apiClient |
| `frontend/src/types/insights.ts` | `InsightsFilters`, `InsightsResult` |

Authenticated route example (substitute the selected organisation's UUID):

```http
GET /api/v1/insights?organisationId=<organisation-uuid>&from=2026-10-30&to=2026-11-04&allocationYear=2026&lowBalanceThreshold=12&coverageThresholdPercent=75
Authorization: Bearer <current-session>
```

Success: `{data: InsightsResult}`, exactly Day8-1.0. No browser role/team/user override. 400 invalid input, 401 invalid/missing bearer, 403 inaccessible scope. If mounted without a configured service: 503 `INSIGHTS_NOT_CONFIGURED`. No AI key required. Existing backend database/Supabase configuration remains required for actual application use.

## Verification after combining the pillars

```sh
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

The actual `createApp` registration checks now run by default. The combined implementation passes 256 backend tests (37 database checks skipped) and 98 frontend tests. Both builds and source/test typechecks pass. The earlier separate rehearsal confirmed the original patch; the current source contains its shared wiring alongside Victor's AI feature.

Detailed fixture calculations, timings, test counts, scope limitations, native PostgreSQL test command and authorised read-only live verification are in `KOPANO_INSIGHTS_EVIDENCE.md`. **B-10 live data, hosted page verification and desktop/mobile screenshots remain pending.** Do not label local fixture or DOM evidence as production or browser evidence.

Existing leave submission/approval refresh uses `['api', userId]`; the page's query keys retain that prefix. Confirm AI drafting creates no business rows; only normal confirmed submission/approval changes the report. Each pillar works independently of the other's service availability.

## Complete feature file list

Backend source:

- `backend/src/repositories/insights.ts`
- `backend/src/services/insights.ts`
- `backend/src/validators/insights.ts`
- `backend/src/routes/insights.ts`
- `backend/src/scripts/verify-insights.ts` (read-only live reconciliation, opt-in)

Backend tests/helpers:

- `backend/tests/insights/aggregation.test.ts`
- `backend/tests/insights/http-repository.test.ts`
- `backend/tests/insights/application-wiring.test.ts`
- `backend/tests/insights/stored-fixture.test.ts`
- `backend/tests/insights/postgres.integration.test.ts`
- `backend/tests/insights/fixture.ts`
- `backend/tests/insights/seed.ts`
- `backend/tests/insights/pglite.ts` (test-only bridge; production uses native pg)

Frontend:

- `frontend/src/pages/Insights.tsx`
- `frontend/src/pages/insights.css`
- `frontend/src/api/insights.ts`
- `frontend/src/types/insights.ts`
- `frontend/src/components/insights/filters.ts`
- `frontend/src/components/insights/InsightsReport.tsx`
- `frontend/src/test/insights.test.tsx`

Handoff/evidence:

- `docs/day8/KOPANO_INSIGHTS_HANDOFF.md`
- `docs/day8/KOPANO_INSIGHTS_EVIDENCE.md`
- `docs/day8/insights-wiring.patch`
- `docs/day8/insights.openapi.yaml`
