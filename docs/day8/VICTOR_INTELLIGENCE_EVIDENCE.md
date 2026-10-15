# Victor — Pillar A implementation and testing evidence

**Date:** 15 October 2026, Africa/Johannesburg

Implemented against the existing application after specification commit `ab3c359`. This report describes local implementation and checks, not a deployed Vercel release. See [the specification](../DAY8_VICTOR_PILLAR_A_SPECIFICATION.md) and [Gemini setup/handoff](../GEMINI_LEAVE_DRAFT_SETUP.md).

## Delivered behaviour

An employee selects their organisations and describes their leave on the existing Request leave page. Gemini produces a structured suggestion or asks for clarification. The employee reviews it, explicitly applies type/dates to the ordinary form, then separately submits. Applying does not save, change the private reason or approve anything.

The new authenticated endpoint is `POST /api/v1/ai/leave-draft`. All memberships are checked before provider access. Only the text, common active type names/codes and Johannesburg date context go to Google. User identities, memberships, selected organisation IDs, email addresses and the private reason field are not included in the provider context. The server supplies organisation IDs and working days in its response.

Both the standalone server and Vercel entry point construct the optional AI service. Missing credentials leave manual requests available. No database migration or package dependency was added, and no existing leave mutation/approval/calendar-worker logic was changed.

## Decisions and limitations

- Provider: Gemini REST, configured server-side; default `gemini-3.5-flash-lite`. Verified with the configured key. Google rejected the earlier 2.5 Flash-Lite model for new users, so the default was corrected before successful acceptance.
- Output: native structured JSON plus strict Zod and deterministic date/type checks. During the initial integration attempt, the endpoint rejected the newer documented `responseFormat` MIME example. The adapter now uses live-verified `responseMimeType` and `responseJsonSchema` fields.
- Consent/review: the panel explains Google processing and free-tier product-improvement use. It advises dates/types only; private reasons remain in the normal form. The model has no mutation tools.
- Ambiguity: vague timing, “next Thursday”, half days and explicit separate dates are clarified without a provider call. Missing dates can also be clarified by Gemini itself. Missing type/year cannot silently become a default type/year merely because a provider returned READY.
- Date grounding: invalid explicit ISO/English dates cannot be normalised into a different month. Recognised explicit dates must be present in proposed endpoints. General natural-language interpretation is still probabilistic and requires human review; this is not a complete grammar or proof of all semantic meanings.
- Scope: one contiguous full-day range, same policy year. Existing weekday/public-holiday rules are preserved. Balances/overlaps are rechecked at final submission rather than reserved by drafting.
- Bounds: input 1,000 characters, output 1,024 tokens, default 12-second provider timeout, configurable maximum 15 seconds. No automatic retry, alternate paid model, SQL or calendar calls.
- Quota protection is instance-local: 5 attempts/user/minute, 10 total/minute, 200 total/rolling day. It is not shared across Vercel instances. Free-tier project availability/Google quotas remain external constraints; code does not guarantee a paid project incurs no charges.
- New query responses are aborted/ignored on source/organisation/form changes. Applying uses the existing form and its actual submission refresh, so future Insights queries under the agreed cache prefix will refresh on real mutations.

## Verification recorded

| Check | Result | Scope |
|---|---|---|
| Backend `npm test` | **213 passed, 36 skipped**; 14 passing suites, 4 skipped suites | Full local regression suite. Database suites are opt-in; skipped does not mean passed. |
| Backend `npm run typecheck` | **Passed** | Source and test TypeScript checks, including new integration fixtures. |
| Backend `npm run build` | **Passed** | Prisma generation and production TypeScript build. |
| Frontend `npm test` | **81 passed**, 6 suites | Includes existing auth/navigation/core flows and new draft interactions. |
| Frontend `npm run build` | **Passed** | Existing large bundle warning remains: approximately 616 kB uncompressed JS. |
| Opt-in AI/PostgreSQL suite | **2 passed** | Temporary actual PostgreSQL rows; one test uses mocked provider, one uses actual Gemini. |
| Browser theme/layout QA | **6 views passed**, **0 browser exceptions** | Simulated auth/API responses, actual rendered React UI; widths 1440 and 390 for all three themes. |
| Contract/whitespace | **Passed** | OpenAPI YAML parsed with Ruby YAML; `git diff --check` clean. |

The final full backend run began at **10:38:43 SAST**; final opt-in suite began at **10:38:47 SAST** and passed in about 33.5 seconds. The backend live suite makes no real Supabase login assertion: it uses a test verifier for a temporary fixture user. Browser screenshots use simulated API/auth responses and are visibly labelled as such. Combining these separate checks does not establish hosted end-to-end acceptance.

### Successful drafting and persistence

1. With a frozen server context of 15 October 2026, a deterministic provider fixture parsed annual leave on **22–23 October 2026** into **2 weekdays** and the server-selected organisation ID.
2. In actual PostgreSQL, request, request-group, actor-audit and organisation calendar-sync-job counts were captured before drafting and were identical afterward.
3. The fixture allocation was changed to zero after drafting. Explicit submission was rejected with **422 INSUFFICIENT_BALANCE** and left those counts unchanged. This proves a prior draft does not bypass the authoritative transaction.
4. Restoring the fixture allocation allowed explicit submission to return **201** and persist a **PENDING**, 2-working-day request.
5. The real Gemini test requested annual leave on **26–27 October 2026**. It returned READY with the expected type/dates and 2 weekdays. Counts stayed unchanged until a separate submission call returned 201; the pending row was queried back from PostgreSQL.
6. The real provider also received “I want annual leave in November 2026”. It returned **NEEDS_CLARIFICATION**, a null draft and nonempty questions. Counts remained unchanged.
7. Temporary fixture records were removed by suite teardown. No real employee records or external calendar invitations were used.

### Rejected requests and invalid inputs

Mocked-provider HTTP/service tests prove:

- Missing bearer → 401 without provider use.
- Unrelated/inactive membership → 403 before provider or type reads.
- Empty/oversized text, malformed/duplicate/empty organisation selection and extra `userId`, `role` or `model` fields → 400 before provider use.
- Unknown type codes, malformed output, empty clarification questions, impossible dates, reversed dates, weekend-only intervals, cross-year intervals and valid-looking output that changes recognised explicit dates → 422 `AI_INVALID_OUTPUT`.
- “A few days off soon”, “next Thursday and Friday”, half days and explicit separated dates → clarification without silently creating a continuous interval.
- A provider that invents a missing type or year is converted to clarification rather than accepted as READY.
- Missing key → `AI_NOT_CONFIGURED`; quota → `AI_RATE_LIMITED`; provider/network failure → `AI_UNAVAILABLE`; timeout → `AI_TIMEOUT`. Upstream bodies/keys are not exposed, and no alternate model/retry is triggered.

The separate real PostgreSQL check above proves actual final balance enforcement. Existing overlap/cancellation/reviewer rules retain their existing regression coverage; this change does not claim that every historical PostgreSQL suite was rerun in this session.

### Frontend confirmation and stale-state checks

New component tests verify: blank input cannot generate; READY displays before applying; only the explicit apply action fills details; clarification has no apply action; failures retain editable text; organisation changes abort and ignore late responses; edits to source text or form type/dates invalidate a proposal.

The full application flow test verifies zero `/leave-requests` POSTs after generating and after applying, the exact AI payload excludes the private reason, the reason remains unchanged in the form, and one explicit Submit produces exactly one ordinary leave POST. This test uses isolated HTTP fixtures, not a live hosted app.

## Visual evidence

The actual Request leave UI was rendered in Chrome with simulated session/API data. All views showed the draft review and retained the institution theme. No horizontal overflow was detected: document width equalled viewport width at both sizes. No leave creation call was made during these visual checks.

| Institution | Desktop | Mobile |
|---|---|---|
| D-Lab | [1440px](screenshots/ai-draft-dlab-desktop.png) | [390px](screenshots/ai-draft-dlab-mobile.png) |
| The Field Institute | [1440px](screenshots/ai-draft-field-desktop.png) | [390px](screenshots/ai-draft-field-mobile.png) |
| StrideShift Global | [1440px](screenshots/ai-draft-stride-desktop.png) | [390px](screenshots/ai-draft-stride-mobile.png) |

[Machine-readable layout results](screenshots/verification.json).

## Joint handoff and remaining acceptance

Kopano's scoped Insights work stays separate. The agreed API response and cache strategy have not been redefined. Central AI wiring is in `AccessServices`, the API router and both runtime entries; the integration owner must incorporate Kopano's actual service/router/page exports when provided. No speculative Insights page was added here.

Before claiming joint Day 8 completion: integrate Kopano's real-data feature; configure the server variables on Vercel and deploy; run a real confirmed-account browser demonstration of generate → review → apply → submit → history on the hosted app; reconcile a real insight; and complete the joint reflection/demo. No external submission or deployment was performed by these checks.

Reflection contribution: keeping AI as a read-only draft preserved the existing leave transaction as the source of truth. Live testing caught provider API/model availability problems that mocks could not catch. A next improvement is shared quota enforcement and broader, explicitly tested natural-language provenance, followed by role-scoped manager summaries only after the two required MVP pillars are demonstrated.

## Follow-up: current-year and relative-date understanding — 15 October 2026

The user's subsequent clarification supersedes the earlier missing-year behaviour recorded above. An omitted year now uses the current Johannesburg year. The server interprets simple today/tomorrow/next-week expressions using its date, supplies the interpretation to Gemini and applies those computed endpoints even if model dates differ. Monday–Friday of the following calendar week is the explicit definition of “next week”, including “next the whole week”. Review warnings show the resolved dates and reference date. A missing leave type still requires clarification.

With a frozen reference date of **15 October 2026**, actual Gemini calls verified:

| Input | Observed result |
|---|---|
| “Annual leave next the whole week” | READY, **19–23 October 2026**, **5 weekdays**. |
| “Sick leave tomorrow” | READY, SICK, **16 October 2026**, **1 weekday**. |
| “tomorrow” | NEEDS_CLARIFICATION, acknowledges **16 October 2026**, asks which leave type. |

These checks used the actual configured Gemini adapter with a temporary in-memory membership/type repository and a frozen clock, without a database/write-capable dependency. They do not claim a new hosted browser demonstration. The first next-week provider call returned `AI_UNAVAILABLE`; an explicit verification rerun succeeded. The application still does not automatically retry or switch models.

Added tests cover incorrect model dates overridden by authoritative relative dates, yearless named dates, dynamic current-year changes to 2027, Johannesburg midnight context, Sunday/Monday next-week boundaries, leap day, year rollover, weekend tomorrow, qualified/mixed phrases left for full interpretation and cross-policy-year weeks clarified before provider use. The frontend placeholder now suggests natural-language examples.

Final follow-up results: **239 backend tests passed, 36 opt-in tests skipped**, **81 frontend tests passed**, and both production builds passed. An initial fully concurrent backend run hit the existing PGlite profile-schema setup timeout; rerunning with `npm test -- --maxWorkers=2` passed all 15 enabled suites. The existing frontend bundle-size warning remains. The original real PostgreSQL workflow evidence above is preserved; these date changes did not modify leave persistence or decision rules.

## Further user scope: all three AI features — 15 October 2026

The user explicitly requested natural-language drafting, a manager assistant and Ask the data. Implemented the additional tools under the same Gemini configuration; their contracts, access boundaries, interpretation rules and limitations are documented in [AI_FEATURES.md](../AI_FEATURES.md).

### Delivered and verified

- **Natural-language drafting:** “I need annual leave next Thursday and Friday off” was verified with actual Gemini against a frozen 15 October 2026 server context: READY, **22–23 October 2026**, **2 working days**. This was a read-only check with a temporary in-memory membership/type repository, not an additional saved real-employee request. A missing type still requires confirmation; separated weekdays are not broadened into a continuous interval. The displayed next-weekday interpretation now supersedes the earlier “next Thursday” ambiguity rule.
- **Manager assistant:** added to Leave approvals/Manager inbox, with explicit planning dates, overview, AI-prioritised anonymous facts, complete attention flags and source requests. Server-calculated prose reports clashes, approved versus projected coverage pressure, requests waiting seven elapsed days and pending requests past their start date. The model can only select validated fact IDs; it cannot invent narrative claims or decisions. All figures and names come from scoped source rows.
- **Ask the data:** added to Team calendar. Supported questions read approved absences/counts, the signed-in member's own balance, or role-authorised pending requests. Gemini returns an allowlisted intent/date/name plan; fixed repository queries and server-written answers use actual records. No arbitrary SQL, mutation, private-reason or other-person-balance access was introduced.
- **Refresh:** generation is manual. Organisation/input changes abort or ignore old responses; ordinary leave cache invalidation clears old answers/summaries. UI tests proved a normal approval clears the manager snapshot and that neither generating a summary nor asking a question sends a decision/creation call.

### Actual PostgreSQL and Gemini evidence

Command, from `backend/`:

```sh
TEST_GEMINI_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai-tools.integration.test.ts
```

**5 tests passed** in approximately **27.9 seconds**, starting at **11:23:31 SAST**. The suite used unique temporary users, two organisations, assigned/unassigned members, allocations, pending requests and approved calendar events. It used a test token verifier, not live Supabase sign-in. An initial fixture setup lacked required approval metadata; this was corrected before the passing run, without weakening application constraints.

Reconciled expected values:

| Check | Expected and observed |
|---|---|
| Manager scope | 2 active assigned reports; 1 pending and 1 approved request. Unassigned members and the actor excluded. |
| Coverage on 22 October | 1 approved person, 2 projected people, denominator 2; projected 100%. This is a planning flag, not a confirmed staffing gap. |
| Admin scope | 4 active reviewable members; 2 pending and 2 approved requests. Actor excluded. |
| Employee approved-calendar answer | 2 approved records / 2 people in the selected organisation; pending and foreign-organisation records excluded. |
| Own allocation | 15 allocated − 0 approved − 2 pending = **13 remaining**. |
| Organisation / reviewer isolation | Unrelated organisation rejected with 403; direct employee access to reviewer repository rejected with 403. |
| Read-only guarantee | Request, actor-audit and organisation calendar-sync-job counts unchanged after both new tools. |

The fifth test used actual Gemini to plan “Who's off next week?” and then queried PostgreSQL, obtaining the expected **19–23 October** window and **2 people**. It also used actual Gemini to prioritise the real, anonymous manager fact catalog. Selected highlights were validated against canonical facts and reconciled to real scoped request rows. Names/private reasons were not included in the model's summary input; private fixture reasons did not appear in either tool's API output. Teardown removed fixture records.

### Final regression, contract and visual results

| Check | Result |
|---|---|
| Backend `npm test -- --maxWorkers=2` | **276 passed, 41 opt-in tests skipped**, 16 enabled suites passed. Final run started **11:32:09 SAST**. Skipped database tests are not counted as passed. |
| Backend source/test typecheck and build | **Passed**. |
| Frontend `npm test -- --maxWorkers=2` | **85 passed**, including 4 new full-application flows. |
| Frontend production build | **Passed**; existing bundle warning remains, approximately **626.6 kB** uncompressed JS. |
| OpenAPI | **0.7.0 parsed**, all local schema references resolve. |
| Chrome visual QA | **12 views passed**, **0 browser exceptions**, no horizontal overflow, both new tools at 1440px/390px across DLB/TFI/SSG. |

New unit/security checks cover role rejection before repository/provider access, organisation isolation, bounded/invalid dates, forged identity/body fields, fabricated fact IDs or narrative fields, unsupported/private/mutation questions, SQL-shaped model output, own-only balances, duplicate display names versus distinct employees, multiple requests per person, source records, empty scopes, quota/provider errors and seven elapsed days measured against the actual timestamp.

Screenshots are labelled **simulated session/API data** and prove rendered layout only. Actual database/Gemini checks above are separate. [Visual verification JSON](screenshots/ai-tools-verification.json).

| Tool | D-Lab | The Field Institute | StrideShift Global |
|---|---|---|---|
| Ask the data | [Desktop](screenshots/ask-data-dlab-desktop.png) / [Mobile](screenshots/ask-data-dlab-mobile.png) | [Desktop](screenshots/ask-data-field-desktop.png) / [Mobile](screenshots/ask-data-field-mobile.png) | [Desktop](screenshots/ask-data-stride-desktop.png) / [Mobile](screenshots/ask-data-stride-mobile.png) |
| Manager assistant | [Desktop](screenshots/manager-summary-dlab-desktop.png) / [Mobile](screenshots/manager-summary-dlab-mobile.png) | [Desktop](screenshots/manager-summary-field-desktop.png) / [Mobile](screenshots/manager-summary-field-mobile.png) | [Desktop](screenshots/manager-summary-stride-desktop.png) / [Mobile](screenshots/manager-summary-stride-mobile.png) |

Deployment and a real confirmed-account hosted walkthrough remain separate release checks. Kopano's Insights work remains independently owned; this change neither implements nor claims verification of that partner deliverable. No external submission or Google calendar invitation delivery was performed by these AI checks.
