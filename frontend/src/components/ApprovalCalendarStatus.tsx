import { Link } from "react-router-dom";
import { api } from "../api/endpoints";
import { useOrganisation } from "../auth/OrganizationProvider";
import { useApiQuery } from "../hooks/queries";
export function ApprovalCalendarStatus() {
  const { membership } = useOrganisation();
  const isAdmin = membership.role === "ADMIN";
  const status = useApiQuery(
    ["google-status", membership.organisationId],
    (signal) => api.googleStatus(membership.organisationId, signal),
    isAdmin,
  );
  if (!isAdmin)
    return (
      <p className="notice">
        Approved leave is added to the organisation's internal calendar. When an
        administrator has connected its shared Google calendar, it is queued for
        Google sync too.
      </p>
    );
  const data = status.data?.data;
  const ready =
    data?.connectionStatus === "CONNECTED" && Boolean(data.calendarId);
  return (
    <section className="panel" aria-labelledby="approval-calendar-heading">
      <h2 id="approval-calendar-heading">
        {ready
          ? "Organisation calendar ready"
          : "Set up organisation calendar sync"}
      </h2>
      {status.isPending ? (
        <p>Checking calendar connection…</p>
      ) : ready ? (
        <>
          <p>
            Approvals automatically queue an all-day leave event in{" "}
            {membership.organisationName}'s shared Google calendar. The
            scheduled worker publishes it.
          </p>
          <p>
            {data?.invitationsEnabled
              ? "Invitations are enabled for confirmed active members of this organisation only."
              : "Invitations are currently off. Enable them in calendar settings to invite confirmed active members of this organisation."}
          </p>
          {data?.invitationsEnabled && (
            <p className="muted">
              Members may need to accept the invitation before it appears on
              their personal Google calendar.
            </p>
          )}
        </>
      ) : (
        <p>
          {data?.connectionStatus === "REAUTH_REQUIRED"
            ? "Reconnect Google to resume syncing."
            : "Connect Google and choose this organisation's shared calendar to publish approved leave. Enable invitations to include its confirmed active members."}{" "}
          Leave approval and the internal team calendar remain available.
        </p>
      )}
      <Link className="secondary button" to="/admin/calendar">
        Manage organisation calendar
      </Link>
    </section>
  );
}
