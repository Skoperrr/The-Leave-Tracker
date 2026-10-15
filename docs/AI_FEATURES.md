# Gemini features — employee drafting, manager assistant and Ask the data

Updated 15 October 2026. All three features use the existing server-only Gemini configuration in [the setup guide](GEMINI_LEAVE_DRAFT_SETUP.md). No additional key or migration is needed. The code is wired in both the local server and Vercel runtime. Deploy the changed backend/frontend before treating these local results as hosted functionality.

## Where to use each feature

| Feature | Location | Examples and behaviour |
|---|---|---|
| Natural-language requests | **Request leave → Describe your time away** | “Annual leave next week”, “Sick leave tomorrow”, “I need annual leave next Thursday and Friday off”. Review the suggestion, apply it, then submit separately. |
| Manager assistant | **Leave approvals / Manager inbox → Manager assistant** | Choose a planning window and generate a plain-language review, prioritised highlights, all calculated flags and source requests. It never approves or rejects anything. |
| Ask the data | **Team calendar → Ask the data** | “Who's off next week?”, “How many people are off tomorrow?”, “What is my leave balance?”, or, for reviewers, “What requests are pending next week?” |

Dates use the server's current Africa/Johannesburg date. Missing years use the current year. On 15 October 2026, tomorrow is 16 October, next week is Monday 19–Friday 23 October, and “next Thursday and Friday” is 22–23 October. “Next [weekday]” means that weekday in the following calendar week, even if there is an earlier occurrence this week. The interpretation is displayed before submission. Separated weekdays such as “next Monday and Friday” are not broadened to include intervening days. A bare request without a leave type still needs the employee to specify it.

## Manager assistant: evidence and limits

The backend reads active, authorised review members and PENDING/APPROVED requests overlapping the selected window. Managers see assigned direct reports; admins see their wider organisation review scope. Both exclude the actor, matching the no-self-approval review queue. Roles and assignments are rechecked inside the database read transaction.

The server calculates canonical facts:

- Pending and approved request counts in the window.
- Pending requests overlapping another scoped member on a weekday, with supporting request IDs.
- Potential coverage pressure when approved plus pending leave would involve at least **30%** of active reviewable members on a weekday. Approved and projected counts remain distinct. Unique members are counted, not request rows.
- Requests waiting at least seven elapsed days, and pending requests whose start date has passed, within the chosen window.

This is a planning signal, not a staffing roster or a proven coverage gap. The denominator is explicitly the active reviewable scope, excluding the actor. Kopano's Insights specification can include a different population; do not compare percentages without comparing their denominators.

Gemini receives up to **40 anonymous candidate facts** containing only an opaque fact ID, kind, date and number of supporting requests. It selects up to eight highlight IDs. The server validates those IDs and renders the canonical, database-derived wording; model-generated names, figures, free-form claims and decision recommendations are not accepted. Employee names, private reasons, emails and actual request IDs are not sent to Gemini for this feature. All calculated attention flags and source requests remain available, even if they were not AI-selected.

An empty/no-attention report uses no provider call and is labelled a **Database review overview**, with `aiUsed: false`. A report with prioritised facts is labelled **AI-assisted review summary**. This is constrained AI prioritisation with grounded prose, not unrestricted text generation.

The window defaults to today through 30 days later; users can choose up to **93 calendar days**. At most 1,000 reviewable members and 500 overlapping requests are accepted. Larger datasets fail with `AI_DATA_LIMIT` instead of silently truncating counts. Historical windows describe current active assignments, not historical headcount.

## Ask the data: supported questions and access

Gemini translates the question into a strict, allowlisted query plan. It never produces SQL or the final factual answer. The server chooses the organisation and verified actor, validates intent/date bounds, queries the database, and writes the answer from the actual results.

| Intent | Available to | Data used |
|---|---|---|
| `WHO_OFF` | Active organisation members | Active, organisation-visible calendar events for APPROVED requests, matching the existing team calendar's privacy boundary. |
| `COUNT_OFF` | Active organisation members | Same approved calendar rows; reports distinct member count and separate request count. Two people sharing a display name remain separate people. |
| `PENDING_REQUESTS` | MANAGER / ADMIN | Only the same role-scoped review population as the manager assistant; never the actor's own requests. |
| `MY_BALANCE` | Active organisation members | Only the verified actor's active, balance-limited allocations for the requested year. Remaining = allocated − approved − pending. Missing allocation is not presented as zero entitlement. |

Approved calendar questions may name a person literally present in the question. Ambiguous matches require a more specific name; identical full names are not silently merged. No email or private reason is returned. Requests for other people's balances, private reasons, department filters, mutation actions, SQL or unsupported restrictions are clarified rather than treated as general-purpose database access. Calendar questions cannot filter by private leave type. This is a focused leave question box, not an arbitrary database chatbot.

The response shows the interpreted date window, scope, snapshot timestamp and source rows. An empty approved-calendar result means no matching approved calendar event was found; it is not a guarantee that someone is available. Date windows are capped at 93 days and approved rows at 500. Balance reads use a bounded allocation query and batched usage aggregation.

## Refresh, privacy and failure behaviour

Generation is explicit; focusing a tab does not consume Gemini quota. Editing a question/window, changing organisation or invalidating leave data cancels/clears a result. Source timestamps remain visible, and users can ask/generate again to refresh. A real approval or cancellation clears the old manager snapshot.

Questions are sent to Google and may contain user-supplied names; the UI explains processing and advises avoiding private details. Google's free-tier product-improvement notice is shown. Manager prioritisation sends anonymous facts only. No browser service key, database URL or provider key is introduced.

All three features share the existing instance-local limiter in the runtime: 5 attempts per user/minute, 10 total/minute and 200 total/rolling day. This is not a distributed Vercel quota guarantee. Google project quotas remain additional limits. Timeouts, missing configuration, rate limits and provider failures produce safe errors and leave ordinary forms, calendars and decisions usable. No automatic paid-model fallback or approval action exists.

## API contracts

All require verified bearer authentication and use existing success/error envelopes. See [OpenAPI 0.7](../backend/openapi.yaml).

```http
POST /api/v1/ai/leave-draft
{"organisationIds":["<uuid>"],"text":"Annual leave next Thursday and Friday"}

POST /api/v1/ai/manager-summary
{"organisationId":"<uuid>","from":"2026-10-19","to":"2026-10-23"}

POST /api/v1/ai/ask-data
{"organisationId":"<uuid>","question":"Who's off next week?"}
```

Manager dates are optional as a pair. Draft input caps at 1,000 characters; questions cap at 500. Unknown body fields, including owner/role overrides, fail validation. Errors include existing 400/401/403 handling, `AI_INVALID_OUTPUT`/`AI_DATA_LIMIT` (422), `AI_RATE_LIMITED` (429), `AI_NOT_CONFIGURED`/`AI_UNAVAILABLE` (503) and `AI_TIMEOUT` (504).

Source files: `backend/src/repositories/ai-data.ts`, `services/ai-tools.ts`, `services/ai-runtime.ts`, `validators/ai-tools.ts`, existing AI router/provider, and frontend `AskLeaveData`, `ManagerAssistant`, `useAiTool` plus feature API/types/styles. Kopano's Insights feature and schema remain separately owned; these additions do not modify the existing leave decision transaction.

## Verification and release checks

Run `npm test -- --maxWorkers=2` and `npm run build` in each package, plus backend `npm run typecheck`. Real database/AI checks are opt-in:

```sh
# From backend/. Temporary fixture users/organisations are removed afterward.
TEST_GEMINI_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai-tools.integration.test.ts
```

The suite reconciles scoped source rows, coverage, unique people and own balances against PostgreSQL; proves no business writes from either new tool; checks unrelated-organisation and employee/reviewer boundaries; and uses real Gemini for intent planning and anonymous fact prioritisation. It uses a test token verifier, not a real Supabase login. Browser screenshots use clearly labelled simulated auth/API data. See [Day 8 evidence](day8/VICTOR_INTELLIGENCE_EVIDENCE.md) for results and limits.

Before the joint demo, verify the deployed app with a real confirmed employee and a manager/admin: draft → confirm → submit; manager summary → inspect sources → make a normal decision; ask an approved-calendar question → reconcile the displayed records. Confirm an employee cannot read a pending review queue, and ensure Kopano's Insights work remains integrated independently.
