# Implementation plan and Phase 1 findings

## Inspection

Branch: `backend/victor`; initial working tree clean. The checkout contained only a placeholder README and the backend specification, frontend specification and shared API contract. All three were read in full before application code was written. No frontend or existing application code was present. No AGENTS.md was found in the repository or directly applicable ancestor paths.

`docs/DAY_6_BRIEF.pdf` is absent. Assessment requirements below are reported by the specifications, **not independently verified against the original PDF**. Supply the PDF and reconcile it before claiming assessment compliance.

The recorded core requirements are secure sign-in, persistent data, employee balances/submission/history/pending cancellation, manager decisions, organisation roles, weekday calculations, approved team calendars, validation, tests and a joint README/demo. Cross-organisation linked requests extend that baseline and are required by this project's instructions. External calendar integrations remain stretch work.

## Conflicts and smallest proposed resolutions

- Documentation naming: the shared contract references `docs/api.md`; the master instruction requires `docs/API_IMPLEMENTATION.md`. Keep the contract untouched, use API_IMPLEMENTATION for implementation status and link it from README. Add an alias later only if the team needs it.
- The contract says OpenAPI is authoritative, while the master instruction makes SHARED_API_CONTRACT authoritative for HTTP shapes. Follow the Markdown contract and mirror implemented paths into OpenAPI, without creating conflicting definitions.
- Admin allocations have a PATCH endpoint but no allocation-list endpoint to discover IDs; admin membership response shape is also unspecified. Before the admin phase, agree on the smallest contract clarification/addition with Kopano. No new endpoint or response shape has been invented now.
- Master instructions mention manager history, audit visibility and overlap viewing beyond explicit endpoint coverage. Existing manager status filters and approved calendar ranges cover history and visible overlaps; an audit endpoint would require an agreed contract addition. Defer that gap until the admin phase.
- Required startup secrets apply once database/auth services exist. Phase 2 validates only settings it uses and can run without Supabase. Phase 3 must require validated database/Auth settings before starting protected functionality.

## Architecture decisions

`server.ts` owns startup and shutdown; `app.ts` assembles middleware and routes without binding a port, allowing Supertest to test the same application. Routes select controllers; controllers handle HTTP; future services hold business rules and repositories isolate Prisma access. Add service/repository/validator/lib directories when their first real implementation exists, rather than adding empty placeholders.

Roles belong to organisation memberships. Supabase verifies identity; PostgreSQL records determine permissions. Planned leave calculations derive balances from persisted pending and approved requests, with transactional locks/serialisation preventing simultaneous overspending. No mock authentication or in-memory business persistence will stand in for production functionality.

## Actionable milestones

| Phase | Work and verification | Status |
|---|---|---|
| 1 | Read source documents; inspect Git/runtime; record design, contract gaps, missing configuration | Completed subject to missing brief |
| 2 | Express/TS foundation; exact health route; validation/errors/CORS; tests, typecheck, build, real startup | Implemented; evidence in TESTING.md |
| 3 | Secure local Supabase config; compatible Prisma installation; schema and reviewed migration; connection check; safe Auth-backed seed | Pending credentials |
| 4 | Supabase token verification; profile, organisations, leave types; membership/role isolation tests | Pending |
| 5 | Transactions for balances, submission/history/cancel; date/overlap/reservation/concurrency tests | Pending |
| 6 | Assigned-team manager queue and decisions; self-approval protection; audit transaction and concurrent-decision tests | Pending |
| 7 | Atomic multi-org submission; independent decisions; unique approved calendar events and isolation tests | Pending |
| 8 | Expand OpenAPI and frontend integration examples; verify real browser authentication and CORS with Kopano | Pending |
| 9 | Full test suite, production build, security review, persisted end-to-end demo and documentation | Pending |

Stop at the Phase 2 checkpoint requested in the master instruction. For Phase 3, obtain configuration locally and the missing brief; do not run database migrations until the target and migration are reviewable.
