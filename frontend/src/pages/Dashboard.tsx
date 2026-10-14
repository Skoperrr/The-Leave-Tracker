import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { allApprovedRequests, useApiQuery } from "../hooks/queries";
import { today } from "../hooks/dates";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
} from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import { BalanceCards, UpcomingLeaveList } from "../components/DashboardCards";
import { DashboardCalendar } from "../components/DashboardCalendar";
export function Dashboard() {
  const { membership, me } = useOrganisation();
  const org = membership.organisationId;
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const balances = useApiQuery(["balances", org, year], (signal) =>
    api.balances(org, year, signal),
  );
  const types = useApiQuery(["leave-types", org], (signal) =>
    api.leaveTypes(org, signal),
  );
  const requests = useApiQuery(["requests", org, "recent"], (signal) =>
    api.requests({ organisationId: org, page: 1, pageSize: 5 }, signal),
  );
  const approved = useApiQuery(["requests", org, "approved-all"], (signal) =>
    allApprovedRequests(org, signal),
  );
  const upcoming = approved.data?.data
    .filter((item) => item.endDate >= today())
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <>
      <PageHeading
        eyebrow="YOUR TIME, AT A GLANCE"
        title={`Hello, ${me.fullName.split(" ")[0] || me.fullName}.`}
        action={
          <Link className="primary button" to="/requests/new">
            + Request leave
          </Link>
        }
      >
        Here's your leave at {membership.organisationName}.
      </PageHeading>
      <div className="dashboard-summary">
        <div className="dashboard-summary-heading">
          <div className="section-heading">
            <h2 id="balance-heading">Leave balances</h2>
            <label className="inline-label" htmlFor="balance-year">
              Year{" "}
              <input
                id="balance-year"
                type="number"
                min="1"
                max="9999"
                value={year}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (next >= 1 && next <= 9999) setYear(next);
                }}
              />
            </label>
          </div>
        </div>
        <section
          className="dashboard-balances"
          aria-labelledby="balance-heading"
        >
          {balances.isPending || types.isPending ? (
            <Loading label="Loading balances" />
          ) : balances.isError || types.isError ? (
            <ErrorNotice
              error={balances.error ?? types.error}
              retry={() => {
                void balances.refetch();
                void types.refetch();
              }}
            />
          ) : balances.data.data.length === 0 ? (
            <EmptyState title="No balances allocated">
              Your administrator has not allocated leave for {year}. No
              available balance is assumed.
            </EmptyState>
          ) : (
            <BalanceCards
              balances={balances.data.data}
              leaveTypes={types.data.data}
            />
          )}
          <p className="caption">
            Pending requests reserve days. Balances are provided by your
            organisation.
          </p>
        </section>
        <div className="dashboard-side">
          <section
            className="upcoming panel"
            aria-labelledby="upcoming-heading"
          >
            <div className="section-heading">
              <h2 id="upcoming-heading">Your upcoming leave</h2>
              <Link to="/calendar">Team calendar →</Link>
            </div>
            {approved.isPending ? (
              <Loading label="Loading upcoming leave" />
            ) : approved.isError ? (
              <ErrorNotice
                error={approved.error}
                retry={() => {
                  void approved.refetch();
                }}
              />
            ) : !upcoming?.length ? (
              <EmptyState title="Nothing on the horizon yet">
                Your approved time away will appear here.
              </EmptyState>
            ) : (
              <>
                <UpcomingLeaveList requests={upcoming.slice(0, 4)} />
                {upcoming.length > 4 && (
                  <Link className="caption" to="/requests">
                    View all my requests ({upcoming.length} upcoming)
                  </Link>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      <div className="dashboard-details">
        <DashboardCalendar
          requests={approved.data?.data ?? []}
          markersState={
            approved.isPending
              ? "loading"
              : approved.isError
                ? "unavailable"
                : "ready"
          }
        />
        <section aria-labelledby="recent-heading">
          <div className="section-heading">
            <h2 id="recent-heading">Your requests</h2>
            <Link to="/requests">View all →</Link>
          </div>
          {requests.isPending ? (
            <Loading label="Loading requests" />
          ) : requests.isError ? (
            <ErrorNotice
              error={requests.error}
              retry={() => {
                void requests.refetch();
              }}
            />
          ) : requests.data.data.length === 0 ? (
            <EmptyState title="Your first break starts here">
              Choose Request leave when you're ready to plan some time away.
            </EmptyState>
          ) : (
            <div className="request-list">
              {requests.data.data.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
