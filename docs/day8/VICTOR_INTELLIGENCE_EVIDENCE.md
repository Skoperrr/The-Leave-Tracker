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
