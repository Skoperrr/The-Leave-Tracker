import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useApiQuery } from "../hooks/queries";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
} from "../components/ui";
export function Admin() {
  const { membership } = useOrganisation();
  const org = membership.organisationId;
  const members = useApiQuery(
    ["memberships", org],
    (signal) => api.memberships(org, signal),
    membership.role === "ADMIN",
  );
  return (
    <>
      <PageHeading eyebrow="ORGANISATION ADMINISTRATION" title="Memberships">
        Roles and memberships for {membership.organisationName}.
      </PageHeading>
      <div className="notice">
        This basic view lists memberships. Allocation and membership editing are
        deferred until the shared contract defines their complete payloads and
        allocation identifiers.
      </div>
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
        <EmptyState title="No memberships returned" />
      ) : (
        <div className="membership-list">
          {members.data.data.map((member) => (
            <article className="panel" key={member.id}>
              <div className="request-top">
                <h2>
                  {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
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
                  <dd>{member.id}</dd>
                </div>
                <div>
                  <dt>Organisation</dt>
                  <dd>{member.organisationName}</dd>
                </div>
                <div>
                  <dt>Manager membership</dt>
                  <dd>{member.managerMembershipId ?? "Not assigned"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
