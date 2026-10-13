# Fictional demonstration accounts

The demo account seed uses Supabase's server-only Auth Admin API. It creates email-confirmed fictional accounts with a server-owned app_metadata seed marker; it does not send email invitations. Profiles use the exact Auth UUID, and memberships/roles are persisted separately for each organisation. The frontend still signs in through ordinary Supabase Auth and sends an access token to the backend. [Supabase createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

| Email | Name | Organisation roles and manager |
|---|---|---|
| thabo.demo@example.com | Thabo Demo | D-Lab ADMIN |
| lerato.demo@example.com | Lerato Demo | The Field Institute ADMIN |
| sibusiso.demo@example.com | Sibusiso Demo | StrideShift Global ADMIN |
| naledi.admin.demo@example.com | Naledi Demo Admin | ADMIN membership in each of the three organisations |
| ayanda.demo@example.com | Ayanda Demo | D-Lab EMPLOYEE reporting to Thabo; Field Institute EMPLOYEE reporting to Lerato |
| neo.demo@example.com | Neo Demo | StrideShift Global EMPLOYEE reporting to Sibusiso |

These are reserved example.com addresses, not actual employees. An admin's access to three organisations comes from three separate memberships, not a global role.

The three organisation managers were explicitly promoted to ADMIN at the user's request; employee reporting assignments remain intact. The separate promotion command authenticates Naledi, checks organisation-specific admin authority and records role-change audits. It skips already-ADMIN targets; ordinary seed reruns preserve existing roles.

## Local commands

Inside backend, after migrations and the baseline seed:

```sh
npm run db:seed:accounts
npm run demo:promote:admins
npm run auth:check:demo
```

Configure SUPABASE_SERVICE_ROLE_KEY (legacy service_role) or SUPABASE_SECRET_KEY (server secret key) in ignored .env. The key is used only by the account-seed command, never by frontend code or routine access-token verification. The seed refuses NODE_ENV=production.

Generated passwords and Auth UUIDs are stored in backend/.demo-credentials.json. Open that file locally to obtain a user's login password. It is ignored by Git and restricted to filesystem mode 600. No password/key/token is printed by the scripts. Do not copy this file into documentation or frontend source. Passwords are random, unique, 32-character base64url strings generated from 24 cryptographically random bytes.

Passwords are saved before provider creation so an interrupted run can resume. Repeated runs preserve existing passwords, memberships, roles and allocations. Existing Auth users are reused only if they have the matching server-owned demo marker and identity binding; unmarked users are never modified. Do not delete the credential file expecting a rerun to reset existing passwords: that would create local passwords that do not match the reused accounts. If the file is lost, use a deliberate account recovery/password-reset process rather than automatic seed overwrite.

Auth creation and PostgreSQL updates cannot share one transaction. A partial failure may leave marked Auth accounts before profiles/memberships exist. Keep the local credential file and rerun to finish the database transaction. Do not delete unrelated Auth identities. The database portion is atomic; passwords and provider error details are not logged.

## Fictional allocation policy

Every demo membership has 15 annual and 10 sick days allocated for policy year 2026. These amounts are made-up demonstration values, not legal guidance or official HR policy. Balances derive pending/approved usage without double deduction. The account seed creates no requests/decisions/events. leave:check:demo creates/cancels linked requests; manager:check:demo now preserves approved and declined samples plus organisation-specific events. After the verified manager smoke, Ayanda has five approved annual days in each organisation, ten remaining, and no smoke pending reservations. Seed reruns preserve these decisions and usage.

## Real sign-in verification

auth:check:demo reads the local credentials, signs each user in against the configured Supabase project, then calls the actual Express access endpoints with the real token and Prisma repository on an ephemeral loopback port. It checks profile ID, organisation listing, authorised leave-type access, cross-organisation rejection and Ayanda's two memberships. Each smoke session signs out afterward. Successful verification does not claim a React UI exists or that leave requests/Google sync work.
