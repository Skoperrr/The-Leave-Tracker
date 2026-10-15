# Gemini leave drafting — setup and use

Victor's Pillar A, 15 October 2026. This extends the existing Request leave page. Kopano's Insights feature remains separately owned under the two Day 8 specifications.

## Configure the server

1. Create an API key in [Google AI Studio](https://aistudio.google.com/api-keys) using a project on the free tier.
2. Enter it privately in ignored `backend/.env`:

   ```dotenv
   GEMINI_API_KEY=your_private_key
   AI_PROVIDER=gemini
   AI_MODEL=gemini-3.5-flash-lite
   AI_TIMEOUT_MS=12000
   ```

   Only the key is required; the other values are defaults. Do not include literal placeholder text or brackets around the key. Never prefix this key with `VITE_` or commit it.

3. Add the same server environment variables to the **backend Vercel project** for the environments you use. Redeploy the backend after adding or changing variables. If frontend and backend share one project, add them there as server variables.
4. For local development, run `npm run dev` in `backend/` and `frontend/`. Restart the backend after changing `.env`. Keep the existing API URL/CORS/auth configuration.

`gemini-3.5-flash-lite` was checked with the configured project on 15 October 2026. Google's API rejected `gemini-2.5-flash-lite` as unavailable to new users, despite older pricing listings; it is not the default. The model name is configurable so later availability changes do not require frontend edits.

Google currently lists a free tier for 3.5 Flash-Lite. Availability and quotas depend on the Google project and may change. Application code cannot determine whether your project has billing enabled or guarantee zero charges in a paid project. There is no automatic alternate-model fallback, retry, search grounding or other paid tool use. See [pricing](https://ai.google.dev/gemini-api/docs/pricing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## Employee flow

1. Open **Request leave** and select the organisations.
2. Describe the type and exact dates, including the year. Example: “Annual leave from 22 October 2026 to 23 October 2026.”
3. Choose **Generate draft**. Review the type, organisation names, inclusive dates, server-calculated weekdays and warnings.
4. If clarification is requested, edit the description and regenerate. Ambiguous “next Thursday”, missing type/year and unsupported half days are not silently guessed.
5. Choose **Use these details** to replace only the form's type and dates. The private reason remains your own input. You can edit the form afterward.
6. Choose **Submit request** separately. Only this step creates pending leave; it rechecks the actual balance, overlaps and memberships. A draft is not a reservation.

Your description is sent to Google. The panel explains this before generation and advises using only types/dates. Google states free-tier content may be used to improve its products; do not include medical details or other private reasons in AI text. Those belong in the existing private reason field, which is not sent by this feature.

## Endpoint and protections

`POST /api/v1/ai/leave-draft`, bearer authentication, strict `{organisationIds, text}` body. See the [OpenAPI contract](../backend/openapi.yaml) and [Victor specification](DAY8_VICTOR_PILLAR_A_SPECIFICATION.md).

The server checks every selected active membership before type reads/provider access; intersects active leave types; keeps identities/organisation IDs out of Gemini's prompt; validates output with Zod; rejects invalid dates, unsupported codes, reversed/cross-year/weekend-only ranges; and computes weekdays itself. The response reference date uses Africa/Johannesburg. Provider output has no database or calendar tools.

This MVP supports one full-day contiguous range. Public holidays are included, following existing policy. Balances and overlaps are intentionally checked at actual submission, not preview. The model remains fallible: review the proposed dates, especially natural-language interpretations.

Input is capped at 1,000 characters, output at 1,024 tokens, and provider timeout defaults to 12 seconds (configuration maximum 15 seconds). A per-instance limiter allows at most 5 draft attempts/user/minute, 10 total/minute and 200 total/rolling day. It includes clarification attempts. These are **instance-local**, not a distributed Vercel quota guarantee. Google's project quota is additional. A distributed limiter is a later improvement if public traffic increases.

Missing key, Google errors, exhausted quota, timeout and invalid output show safe messages while leaving manual leave entry available. In-flight results are aborted/ignored when the text, organisation, type options or manual form dates/type change. The server makes no business writes on draft generation, and no provider request contains the private reason field.

## Checks

From `backend/`:

```sh
npm run typecheck
npm test
npm run build
# Real PostgreSQL fixtures; no real employees are modified:
node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.integration.test.ts
# Additionally opt into one actual Gemini request:
TEST_GEMINI_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/ai.integration.test.ts
```

From `frontend/`:

```sh
npm test
npm run build
```

The live test creates temporary users/organisations/allocations, proves draft writes nothing, proves final balance enforcement, explicitly submits a fixture request, and removes its fixture rows afterward. It uses a test identity verifier rather than real Supabase sign-in. UI interaction tests and browser fixture screenshots are separate evidence; neither alone proves the deployed Vercel app.

Before the joint demo, check the deployed app with a real confirmed account, its normal organisation access and the configured backend. Verify generate → review → apply → submit → history, a clarification, and manual entry when AI is unavailable. Hosted delivery is not established by local tests.

## Handoff to Kopano

No schema migration or package dependency was introduced. Feature files are `config/ai-env.ts`, `lib/ai-provider.ts`, `validators/ai.ts`, `services/ai-leave-draft.ts`, `routes/ai.ts`, and frontend `api/ai.ts`, `types/ai.ts`, `components/AiLeaveDraft.tsx`/stylesheet. Central modifications are optional `AccessServices.ai`, mounting after auth, injection in both `server.ts` and `index.mts`, the NewRequest panel and the OpenAPI fragment. Existing request creation/decisions/calendar worker are unchanged.

The AI draft does not invalidate leave/Insights caches because no data changes. The existing actual submission mutation continues using the shared leave refresh. Kopano can build Insights independently without a Gemini key. Provide the agreed Insights exports and minimal central wiring patch when ready; no placeholder Insights implementation is included in Pillar A.

Provider implementation references: [GenerateContent API](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig), [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). The live-verified adapter uses REST `responseMimeType`/`responseJsonSchema` with strict application validation; it does not rely on the newer `responseFormat` example that the tested endpoint rejected.
