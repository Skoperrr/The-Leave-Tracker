# Day 8 — Victor: Pillar A, Intelligence

**Date:** 15 October 2026 · Africa/Johannesburg  
**Owner:** Victor and Victor's AI coding assistant  
**Partner:** Kopano, Pillar B — [partner specification](DAY8_KOPANO_PILLAR_B_SPECIFICATION.md)  
**Specification version:** Day8-1.0  
**Starting code:** `main` at `b6d576c`; inspect current main before implementation.

## 1. Assignment and source requirements

Build **natural-language leave drafting**, end to end, in the existing application. This is a full-stack feature, not a return to the earlier frontend/backend division of labour. Victor leads Pillar A; Kopano leads Pillar B.

Source: the supplied **Day 8 Brief — The Leave Tracker, Phase 3: Intelligence & Insights**, dated 15 October 2026, file `5b7aface-38a9-4edf-8b01-d2ce131bc742.pdf`. Its Pillar A, Build and Deliverables sections require an AI feature with structured, validated output; human confirmation before saving; ambiguity/error handling; secure keys; and preservation of core workflows. The demonstration specifically includes parsing a request, confirming it and creating a real request.

The brief permits choosing among several AI capabilities. **This specification selects natural-language drafting as the MVP.** Endpoint names, file ownership, thresholds and technical limits below are implementation agreements for this team, not quotations from the brief. Manager summarisation and “ask the data” are stretch work after both pillars work.

This document authorises planning for implementation; it does not mean those features already exist or that the PDF's submission instructions have been carried out.

**User clarification, 15 October 2026:** infer omitted years from the current Africa/Johannesburg date. “Tomorrow” means the next calendar day; “next week”, “next whole week” and “next the whole week” mean Monday–Friday of the following calendar week. On 15 October 2026 these resolve to 16 October and 19–23 October respectively. This supersedes the original requirement below to clarify merely because a year was omitted. Continue clarifying a missing leave type or genuinely ambiguous dates, show the interpretation before submission, and preserve the same-year/weekday policy.

## 2. Shared Day 8 agreement — both models must read

**Further user scope update, 15 October 2026:** implement all three Intelligence examples: natural-language requests, manager assistant and Ask the data. The original “stretch work” ordering is superseded by this explicit request. Their implemented boundaries and additional endpoints are documented in [AI_FEATURES.md](AI_FEATURES.md). “Next Thursday and Friday” now resolves to those weekdays in the following calendar week with displayed interpretation; only genuinely ambiguous/non-contiguous qualifiers still require date clarification. Kopano's Insights ownership remains unchanged.

Read this document **and** Kopano's specification before editing. The user's Day 8 pillar allocation supersedes historical documents assigning all frontend work to Kopano and all backend work to Victor. Preserve existing product behaviour and organisation themes.

### Ownership and shared files

| Area | Owner | Partner rule |
|---|---|---|
| AI feature, `/api/v1/ai/*`, AI provider/config, NewRequest AI integration | Victor | Kopano does not edit these feature files. |
| Insights feature, `/api/v1/insights`, `/insights` page, metric calculations | Kopano | Victor integrates its exports without rewriting metric definitions. |
| Backend wiring: `services/access.ts`, `routes/index.ts`, `server.ts`, `index.mts` | Victor, integration owner | Kopano supplies exact export names and a wiring patch in the handoff. |
| Frontend wiring: `App.tsx`, `layouts/AppLayout.tsx`, `components/NavIcon.tsx` | Victor, integration owner | Kopano supplies the route/navigation entry and role guards. |
| Existing `api/endpoints.ts`, `types/api.ts`, global `styles.css`, package/lock/config files | Victor, integration owner | Prefer separate feature modules. Partner requests a small coordinated edit if needed. |
| `backend/openapi.yaml` | Victor, integration owner | Incorporate both reviewed contracts; do not let one pillar erase the other. |
| Existing leave creation, decisions, balances, calendar worker and database schema | Preserve | No schema migration is required for either MVP. Any discovered need must be explained and coordinated first. |
| Pillar-specific implementation notes, evidence and tests | Respective pillar owner | Use distinct filenames; do not overwrite the partner's evidence. |

Use separate branches, suggested `day8/victor-intelligence` and `day8/kopano-insights`. If both models operate on one machine, use separate worktrees so branch changes cannot disturb the other model. Do not reset, clean or overwrite local changes. Existing untracked `docs/reports/` contains the user's previous three reports and must be preserved.

The shared-file owner is an editing convention, not a reason to stop all partner work. Kopano can complete feature modules and tests while Victor prepares wiring. Send a precise handoff instead of concurrently editing the same central files. Neither model should silently redefine the other's endpoint or duplicate the other's feature.

### Shared runtime and contract rules

- Retain React/Vite/TypeScript, TanStack Query and Supabase Auth on the frontend; Express/TypeScript/Prisma/PostgreSQL on the backend. Keep existing package versions unless a specific dependency is justified.
- All new application endpoints require the existing verified bearer identity and active application profile. Server-side memberships determine access; never trust browser role or user IDs.
- Use `{data: ...}` success and `{error:{code,message,details?}}` failure envelopes. Date-only fields are `YYYY-MM-DD`; timestamps are UTC ISO strings; UUIDs remain API identifiers.
- Use **Africa/Johannesburg** for relative-language and planning-date interpretation in this MVP. This is an explicit project assumption, not a timezone field already present in Organisation. Supply the timezone in responses.
- Keep core leave policy: weekdays only, full days, same-year requests, pending reservations, independent linked organisation decisions, no self-approval. Do not introduce public-holiday, half-day or department assumptions.
- Preserve email auth, password recovery/visibility, the unified auth loader, compact dashboard, clickable calendars, sidebar/drawer/mobile actions and DLB/TFI/SSG themes.
- Frontend mutations use existing cache refresh. Insights queries must use the existing `['api', userId, ...]` prefix so leave mutations also invalidate them.
- Do not put provider keys, service-role keys, database URLs or scheduler secrets in frontend code, `VITE_*`, evidence or commits.
- Distinguish deterministic fixtures, live database checks, real AI calls and hosted end-to-end evidence. Never present fallback text or fabricated numbers as a successful AI/database integration.

### Integration handshake

1. Agree Day8-1.0 before divergent implementation. Each owner controls their endpoint contract below; changes require a brief written note to the partner.
2. Victor provides `POST /api/v1/ai/leave-draft` and `/requests/new` integration. Kopano provides `GET /api/v1/insights` and `/insights` modules, as specified in the partner document.
3. Kopano's backend exports: `createInsightsService(repository)` and type `InsightsService` from `backend/src/services/insights.ts`; `createInsightsRouter(services)` from `backend/src/routes/insights.ts`. The router consumes the existing authenticated account context and is mounted **after** authentication.
4. Victor adds optional `insights?: InsightsService` to `AccessServices`, mounts the router, and constructs/injects the service in **both** `server.ts` and Vercel `index.mts`. Keep existing tests able to construct services without enabling every optional feature.
5. Kopano's frontend exports `Insights` from `frontend/src/pages/Insights.tsx`; Victor registers `/insights` behind MANAGER/ADMIN guards and adds navigation. Keep admin Calendar settings and role-specific mobile centre actions intact; put Insights in the side panel rather than replacing existing mobile destinations.
6. Integrate and verify each pillar separately, then together. AI drafting must work without the insights service; insights must work without AI credentials. Merge without force-pushing, using the user's authorised publication workflow.

## 3. Pillar A user experience

Add an AI draft panel to the existing **Request leave** page, not a competing submission screen.

1. The signed-in employee selects one or more of their active organisations.
2. They describe their leave. Example: “Annual leave from 22 October 2026 to 23 October 2026.”
3. **Generate draft** calls the AI draft endpoint. Show a real loading state and disable duplicate generation while pending.
4. On ambiguity, show specific questions and let the employee revise the text. Do not invent a leave type, year, date, organisation or owner.
5. On a valid draft, display organisation names, leave type, inclusive dates, server-calculated working days and warnings. Label it **AI suggestion — review before submitting**.
6. **Use these details** fills the normal form. It does not save anything. The employee can edit or discard the proposal.
7. Only the existing, explicit **Submit request** action calls `POST /api/v1/leave-requests`. The normal backend transaction rechecks membership, dates, overlap and balance and creates PENDING children.
8. Show the existing server-confirmed result and independent organisation statuses. Refresh balances, history, calendars and insights using existing invalidation.

Changing text or organisation selection invalidates an outstanding proposal. Abort/ignore stale responses so an earlier response cannot overwrite newer input or cross organisation scope. Do not silently overwrite manually edited form fields.

## 4. Pillar A API contract

### `POST /api/v1/ai/leave-draft`

Authenticated read-only operation. Strict body:

```ts
type AiDraftInput = {
  organisationIds: string[]; // 1–20 unique real UUIDs, active memberships
  text: string;             // trimmed, 1–1000 characters
};
```

Do not accept `userId`, role, reference date, timezone, model name or arbitrary provider instructions from the browser.

Return HTTP 200 for either valid proposal or clarification:

```ts
type AiDraftResult = {
  referenceDate: string; // server's date in Africa/Johannesburg
  timezone: 'Africa/Johannesburg';
} & (
  | {
      status: 'READY';
      draft: {
        organisationIds: string[];
        leaveTypeCode: string;
        startDate: string;
        endDate: string;
      };
      workingDays: number;
      warnings: string[];
    }
  | {
      status: 'NEEDS_CLARIFICATION';
      draft: null;
      questions: string[];
    }
);
// Success envelope: { data: AiDraftResult }
```

The server, not the model, supplies organisation IDs, reference date, timezone and working-day count. Resolve leave type against the active codes available in **all** selected organisations. No AI-generated reason is automatically saved; the existing reason field remains the employee's explicit input.

| Failure | Response |
|---|---|
| Empty/oversized text, malformed UUIDs or extra body fields | 400 `VALIDATION_ERROR` |
| Missing/invalid session | 401, existing authentication handling |
| Missing active membership in any selected organisation | 403, existing membership error |
| Known overlap / insufficient balance during optional preview checks | Existing 409 / 422 business-rule envelope |
| Provider returns malformed JSON or an invalid/unsupported proposal | 422 `AI_INVALID_OUTPUT`, safe message only |
| AI not configured | 503 `AI_NOT_CONFIGURED`; manual form remains usable |
| Provider failure/unavailable | 503 `AI_UNAVAILABLE` |
| Provider timeout | 504 `AI_TIMEOUT` |
| Rate limit | 429 `AI_RATE_LIMITED` with safe retry guidance |

Ambiguous language is normally a clarification result, not a 500. Invalid output must never create a request.

## 5. Implementation constraints

Suggested Victor-owned files: `backend/src/validators/ai.ts`, `services/ai-leave-draft.ts`, `lib/ai-provider.ts`, `routes/ai.ts`, `frontend/src/components/AiLeaveDraft.tsx`, `frontend/src/api/ai.ts`, `frontend/src/types/ai.ts`, a feature stylesheet and dedicated tests. Integrate the panel in `NewRequest.tsx` using the existing form state.

- Keep provider access behind a server adapter. Use the selected provider's official structured-JSON mechanism and verify its current SDK/API documentation during implementation. Do not hardcode an unverified model name into the agreement.
- Suggested server configuration: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_TIMEOUT_MS`. AI configuration is optional; missing keys disable only AI. If configuration is supplied, validate it without printing values. Do not upgrade the whole stack to add one adapter.
- Authenticate and check all selected organisations **before** provider use. Send only the user's text, allowed type names/codes and date context; not membership rosters, passwords, tokens, database records or other people's reasons.
- Treat the text and model output as untrusted. Use strict Zod validation and deterministic date parsing/day counting from the existing backend. Structured JSON is not a substitute for business validation.
- Explicit impossible dates must be rejected, not rolled into another month. Do not silently resolve uncertain phrases such as “next Friday” or “a few days” without a documented, displayed interpretation or clarification.
- Start with a single contiguous date range. Non-contiguous dates, unsupported half days and cross-year ranges require clarification/manual correction; never broaden the user's request to cover extra days.
- Reuse existing date/type/business helpers where possible. If extracting read-only draft-validation helpers, preserve existing transactional leave creation. A preview is a snapshot, never a reservation or guarantee of availability.
- Bound input, output and provider time (target at most 15 seconds). Add cost/rate protection; document whether a limiter is instance-local or shared rather than claiming global protection from an in-memory counter.
- Never let the provider execute SQL, select owners or call leave mutation/approval/calendar APIs. The draft endpoint makes zero business writes and sends no invitations.
- Show useful, non-secret errors and retain text on provider failure. Do not add artificial loading delays or silently substitute hardcoded AI responses.

## 6. Acceptance tests and evidence

| ID | Required evidence |
|---|---|
| A-01 | Freeze server context at 15 October 2026, Africa/Johannesburg. Parse explicit annual leave for 22–23 October into the correct code/dates and **2 weekdays**. |
| A-02 | “I need a few days off soon” returns clarification, with no complete draft and no database write. |
| A-03 | Missing type or unclear relative dates cannot silently become ANNUAL or invented dates. Include the brief's “next Thursday and Friday” example in an ambiguity/interpretation test. |
| A-04 | Impossible date, weekend-only range, reversed dates, cross-year request, unavailable type, oversized input and malformed provider output fail safely. |
| A-05 | Unrelated organisation, spoofed owner/role and missing bearer are rejected before provider access. |
| A-06 | A valid draft leaves request/group/audit/outbox counts unchanged. Only explicit form submission creates the real PENDING record(s). |
| A-07 | Human edits are revalidated. A balance/overlap change after drafting can still reject final submission honestly. |
| A-08 | Timeout, rate limit, absent key and upstream failure preserve manual leave entry and do not reveal secrets. |
| A-09 | Changing organisations/text or generating a new draft cannot apply a stale response. Duplicate submit controls remain protected. |
| A-10 | One real-provider, authorised demo: input → actual AI draft → human confirmation → existing submission endpoint → persisted request/history. Record request outcome and clean up test pending leave when appropriate. |

Use mocked provider outputs for deterministic edge cases and actual PostgreSQL fixtures for relevant persistence assertions. A mock-only demonstration does not satisfy A-10; if credentials are missing, state that live AI acceptance remains pending.

Run frontend tests/build; backend source/test typecheck, tests and build; focused database checks where needed. Recheck employee submission, organisation isolation, admin decisions, calendar privacy and password recovery. The latest recorded frontend baseline is 75 tests; report the actual new counts, not a target count.

## 7. Handoff, priorities and definition of done

Send Kopano: AI endpoint/type/error contract, manual-confirmation behaviour, any shared-file changes, test commands/results, commit/branch, and known limitations. Receive and integrate Kopano's Insights exports as agreed in section 2. Do not wait for optional AI-to-insights integration to finish the independent MVPs.

Priority 1: working natural-language draft, confirmation and real submission; integrate a real-data insights page. Priority 2: manager summaries grounded in Kopano's scoped metrics. Do not implement a second AI feature at the cost of either Priority 1 deliverable.

Produce Victor's individual implementation notes (decisions, provider/config, validation, limits), AI ambiguity evidence, contribution to the team reflection and demo steps. Suggested evidence filename: `docs/day8/VICTOR_INTELLIGENCE_EVIDENCE.md`; this is a future deliverable, not evidence already collected.

Done means: real AI call demonstrated, no automatic save, core rules still enforced, both runtime entry points wired, both pillars present in the same app, checks pass, and limitations are honestly documented. The brief calls for a working link/repository, individual documentation, testing evidence, joint reflection and a joint demonstration. Do not mark hosted/provider delivery complete from local fixtures alone.

## Starter prompt for Victor's model

> Implement Pillar A from `docs/DAY8_VICTOR_PILLAR_A_SPECIFICATION.md`. First read both Day 8 specifications and inspect current main. I am Victor and own natural-language leave drafting plus the shared integration wiring. Kopano owns the full-stack Insights feature. Follow Day8-1.0 ownership and contracts; preserve the existing app and untracked reports. Build the AI draft → human review → existing leave submission flow, validate server-side and keep credentials private. Coordinate the partner's small wiring handoff rather than editing their feature modules. Distinguish mocked checks from real AI/database evidence. Do not claim completion while required live acceptance remains unverified.

## 15 October 2026 — employee-requested private reason extension

This supersedes the original manual-only reason drafting rule above. An employee-supplied explanation in the AI description may be formally paraphrased into optional `draft.reason` (nullable, at most 2,000 characters). Show it in the review; apply only on explicit confirmation. Preserve existing reason text unless the employee opts to replace it. Never invent medical facts or send the separate form reason automatically. Ordinary request submission remains explicit; all existing reason access controls and calendar exclusions remain in force.
