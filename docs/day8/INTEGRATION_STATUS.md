# Day 8 joint integration

15 October 2026. Implemented at the user's request on top of main `b4d8135`, which already includes Victor's Gemini drafting and Kopano's Insights modules.

## What is now connected

- `AccessServices.insights` is optional for existing consumers and injected by **both** `backend/src/server.ts` and Vercel's `backend/src/index.mts`.
- The Insights router is mounted after the existing authenticated-account middleware, alongside Victor's AI router.
- `/insights` is registered inside the existing MANAGER/ADMIN route guard and existing WorkspaceShell. The **Insights** sidebar/drawer entry is visible only to reviewers. The existing five mobile destinations, centre action and Calendar settings are preserved.
- The merged OpenAPI includes both `/ai/leave-draft` and `/insights`, with every local schema/response reference resolved. All previous API entries remain present.
- Victor's AI implementation, provider configuration and human-review/manual-submit behaviour remain unchanged. No new dependencies, schema changes or environment variables are required for Insights.

## Local checks

| Check | Result |
|---|---|
| Backend source and test typecheck | Pass |
| Backend full suite | **256 passed; 37 skipped** |
| Backend production build | Pass, including Prisma generation |
| Frontend full suite | **98 passed** |
| Frontend production build | Pass |
| Merged OpenAPI and references | Parsed and resolved |
| `git diff --check` | Pass |

The skipped checks are 34 existing native database checks, two AI/PostgreSQL checks and one Insights/native PostgreSQL fixture. They need explicitly configured test databases/provider access. They are not recorded as passed.

The real `createApp` registration tests now run on every default test invocation. They cover the response, authentication before aggregation, strict query input, an absent optional Insights service, and Insights independence from missing AI configuration. Full React application-flow tests navigate from the sidebar for ADMIN/MANAGER, block EMPLOYEE before the Insights fetch, and check the mobile drawer without changing existing navigation destinations. API data/authentication in these page-flow tests is simulated; the stored Prisma fixture checks remain separate.

## Where users will see it

After the integration revision is deployed, sign in using an active **admin or manager** membership, select that organisation, and choose **Insights** in the sidebar. On mobile, open the navigation panel. The route is `/insights` on the existing Vercel domain. Employee memberships intentionally do not have access.

Victor's draft panel remains on **Request leave**. Gemini requires the existing server-side configuration documented in `docs/GEMINI_LEAVE_DRAFT_SETUP.md`; absent credentials do not disable ordinary requests or Insights.

## Evidence limits

This document records local implementation and verification. A successful Vercel build is distinct from an authenticated hosted data check. Native PostgreSQL/live read-only reconciliation, authenticated hosted joint acceptance and Insights screenshots in all three themes remain pending unless separately recorded. Historical fixture calculations and the read-only verification command are in `KOPANO_INSIGHTS_EVIDENCE.md`.
