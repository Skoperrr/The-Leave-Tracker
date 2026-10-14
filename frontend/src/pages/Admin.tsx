import { AdminAssignment } from "../components/AdminAssignment";
import { CalendarConnectionBanner } from "../components/CalendarConnectionBanner";
import { Link } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useApiQuery } from "../hooks/queries";
import { membershipLabel } from "../hooks/membership-label";
import type { Membership } from "../types/api";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
} from "../components/ui";
export function Admin() {
  const { membership, me } = useOrganisation();
  const label = (member: Membership) =>
    membershipLabel(
      member,
      member.employeeDisplayName ??
        (me.memberships.some((own) => own.id === member.id)
          ? me.fullName
          : undefined),
    );
  const org = membership.organisationId;
  const members = useApiQuery(
    ["memberships", org],
    (signal) => api.memberships(org, signal),
    membership.role === "ADMIN",
  );
  return (
    <>
      <PageHeading eyebrow="ORGANISATION ADMINISTRATION" title="Administration">
        Roles and memberships for {membership.organisationName}.
      </PageHeading>
      <section className="panel" aria-labelledby="admin-approvals-heading">
        <h2 id="admin-approvals-heading">Leave approvals</h2>
        <p>
          Review pending leave across {membership.organisationName}. Approve
          requests or decline them with a comment.
        </p>
        <Link className="primary button" to="/admin/approvals">
          Review leave requests
        </Link>
      </section>
      <CalendarConnectionBanner />
      <section className="panel">
        <h2>Shared Google Calendar</h2>
        <p>
          Connect a writable calendar, manage invitations and check sync status.
        </p>
        <Link className="secondary button" to="/admin/calendar">
          Manage calendar settings
        </Link>
      </section>
      {members.isPending ? (
        <Loading label="Loading memberships" />
      ) : members.isError ? (
        <ErrorNotice
          error={members.error}
          retry={() => {
            void members.refetch();
          }}
        />
      ) : members.data.data.length === 0 ? (
        <>
          <AdminAssignment members={[]} />
          <EmptyState title="No memberships returned" />
        </>
      ) : (
        <>
          <AdminAssignment members={members.data.data} />
          <div className="membership-list">
            {members.data.data.map((member) => {
              const manager = members.data.data.find(
                (candidate) =>
                  candidate.id === member.managerMembershipId &&
                  candidate.organisationId === member.organisationId,
              );
              return (
                <article className="panel" key={member.id}>
                  <div className="request-top">
                    <h2>
                      {member.role.charAt(0) +
                        member.role.slice(1).toLowerCase()}
                    </h2>
                    <span
                      className={`status ${member.active ? "approved" : "cancelled"}`}
                    >
                      {member.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <dl className="membership-details">
                    <div>
                      <dt>Membership</dt>
                      <dd>{label(member)}</dd>
                    </div>
                    <div>
                      <dt>Organisation</dt>
                      <dd>{member.organisationName}</dd>
                    </div>
                    <div>
                      <dt>Manager membership</dt>
                      <dd>
                        {manager
                          ? label(manager)
                          : (member.managerMembershipId ?? "Not assigned")}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
