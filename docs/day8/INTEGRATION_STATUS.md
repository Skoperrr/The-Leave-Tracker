# Day 8 joint integration

15 October 2026. The original Insights integration was published at `4fa0001`. The user's subsequent pull/push request combines that main revision with Victor's extended AI feature commit `f64ef03`. Both pillars are now present in the merged source.

## What is now connected

- `AccessServices.insights` is optional for existing consumers and injected by **both** `backend/src/server.ts` and Vercel's `backend/src/index.mts`.
- The Insights router is mounted after the existing authenticated-account middleware, alongside Victor's AI router.
- `/insights` is registered inside the existing MANAGER/ADMIN route guard and existing WorkspaceShell. The **Insights** sidebar/drawer entry is visible only to reviewers. The existing five mobile destinations, centre action and Calendar settings are preserved.
- The merged OpenAPI includes both `/ai/leave-draft` and `/insights`, with every local schema/response reference resolved. All previous API entries remain present.
- Victor's three AI tools are connected through `createAiRuntime` in both runtime entries: natural-language leave drafting, the manager assistant and Ask the data. Provider configuration and explicit human submission/decision remain in place. No new dependencies, schema changes or environment variables are required for Insights.

## Local checks

| Check | Result |
|---|---|
| Backend source and test typecheck | Pass |
| Backend full suite | **319 passed; 42 skipped** |
| Backend production build | Pass, including Prisma generation |
| Frontend full suite | **102 passed** |
| Frontend production build | Pass |
| Merged OpenAPI and references | Parsed and resolved |
| `git diff --check` | Pass |

The skipped checks are 34 existing native database checks, two AI drafting/PostgreSQL checks, five AI tools/PostgreSQL checks and one Insights/native PostgreSQL fixture. They need explicitly configured test databases/provider access. They are not recorded as passed.

The real `createApp` registration tests now run on every default test invocation. They cover the response, authentication before aggregation, strict query input, an absent optional Insights service, and Insights independence from missing AI configuration. Full React application-flow tests navigate from the sidebar for ADMIN/MANAGER, block EMPLOYEE before the Insights fetch, and check the mobile drawer without changing existing navigation destinations. API data/authentication in these page-flow tests is simulated; the stored Prisma fixture checks remain separate.

## Where users will see it

After the integration revision is deployed, sign in using an active **admin or manager** membership, select that organisation, and choose **Insights** in the sidebar. On mobile, open the navigation panel. The route is `/insights` on the existing Vercel domain. Employee memberships intentionally do not have access.

Victor's draft panel is on **Request leave**, the manager assistant is on **Leave approvals / Manager inbox**, and **Ask the data** is on **Team calendar**. Gemini requires the existing server-side configuration documented in `docs/GEMINI_LEAVE_DRAFT_SETUP.md`; absent credentials do not disable ordinary requests or Insights.

## Evidence limits

This document records local implementation and verification. A successful Vercel build is distinct from an authenticated hosted data check. Native PostgreSQL/live read-only reconciliation, authenticated hosted joint acceptance and Insights screenshots in all three themes remain pending unless separately recorded. Historical fixture calculations and the read-only verification command are in `KOPANO_INSIGHTS_EVIDENCE.md`.

## Merge verification

The shared service type includes both `insights` and `aiTools`; both runtime entries construct the Insights service alongside `createAiRuntime`. The API router preserves all four feature endpoints: `/insights`, `/ai/leave-draft`, `/ai/manager-summary` and `/ai/ask-data`. OpenAPI schema conflicts were resolved by retaining both complete schema sets, with all references resolved. The automatically merged frontend flow tests include both the Insights navigation/role checks and the new AI flows.

Combined regression checks: backend **319 passed / 42 skipped**, frontend **102 passed**, backend source/test typecheck passed. Prior AI database/Gemini and screenshot evidence remains separately recorded in `VICTOR_INTELLIGENCE_EVIDENCE.md`; it is not a claim of hosted joint verification. See `docs/AI_FEATURES.md` for question scope, coverage limitations and relative-date rules.
