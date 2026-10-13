# Database design — planned for Phase 3

No Prisma schema, migration, database connection or persisted record exists in Phase 2. This design is the next implementation milestone, not a description of a running database.

One PostgreSQL database will contain User profiles linked by UUID to Supabase Auth, Organisation records and Membership joins. Unique (userId, organisationId) prevents duplicate membership. Roles and manager relationships belong to each membership, allowing Ayanda to belong to two organisations without granting either manager access to the other. A manager membership must reference the same organisation; this needs database constraints and service validation.

Organisation-scoped LeaveTypes define codes such as ANNUAL/SICK and whether balances apply. LeaveBalance allocations are unique by membership/type/policy year. LeaveRequests store date-only inclusive ranges, backend-calculated working days and PENDING/APPROVED/DECLINED/CANCELLED status. An optional LeaveGroup links organisation-specific child requests; a group does not authorise a global approval. A CalendarEvent uniquely references one approved request. AuditLogs record actor, organisation, action and time for decisions and admin changes.

Foreign keys and organisation consistency constraints must prevent cross-organisation membership/type/manager/event references, with indexes for membership, organisation, dates and statuses. Store day counts precisely; expose JSON numbers matching the contract.

Demo policy: count inclusive weekdays, excluding Saturdays/Sundays. Public holidays and half days are not included in v1. Reject cross-year requests explicitly. Overlap checks consider PENDING and APPROVED requests for the same membership, allowing matching dates in different organisations. Remaining = allocated - approved - pending; approval transfers a reservation without another deduction. Decline/cancel releases it. Leave allocations are fictional demo policies, not South African legal guidance or official HR policies; choose and document the actual seed amounts in Phase 3.

Submission must atomically validate all selected memberships/types/balances and create all children. Serialisation or consistently ordered membership/allocation locks must prevent concurrent overspending and overlapping submissions. Decisions must atomically guard pending status, write decision/audit data and create a unique calendar event on approval. Retry transient transaction conflicts deliberately; never silently accept duplicate decisions.

The seed will include the three named organisations, Ayanda, Thabo, Lerato, StrideShift members and admins, annual/sick allocations and varied request statuses. Login users need real development Supabase Auth identities. A server-only seed command should obtain credentials locally, create/find fictional Auth identities safely, and never commit or print passwords. This process is pending, not simulated by profile rows.
