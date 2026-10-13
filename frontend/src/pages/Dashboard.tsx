import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { allApprovedRequests, useApiQuery } from "../hooks/queries";
import { today, formatDate } from "../hooks/dates";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
} from "../components/ui";
import { RequestCard } from "../components/RequestCard";
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
      <section aria-labelledby="balance-heading">
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
            Your administrator has not allocated leave for {year}. No available
            balance is assumed.
          </EmptyState>
        ) : (
          <div className="balance-grid">
            {balances.data.data.map((balance) => (
              <article
                className="balance-card"
                key={`${balance.membershipId}-${balance.leaveTypeId}-${balance.year}`}
              >
                <p>
                  {types.data.data.find(
                    (type) => type.id === balance.leaveTypeId,
                  )?.name ?? "Leave balance"}
                </p>
                <div className="balance-number">
                  {balance.remainingDays}
                  <span>days remaining</span>
                </div>
                <dl>
                  <div>
                    <dt>Allocated</dt>
                    <dd>{balance.allocatedDays}</dd>
                  </div>
                  <div>
                    <dt>Approved</dt>
                    <dd>{balance.approvedDays}</dd>
                  </div>
                  <div>
                    <dt>Pending</dt>
                    <dd>{balance.pendingDays}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
        <p className="caption">
          Pending requests reserve days. Balances are provided by your
          organisation.
        </p>
      </section>
      <section className="upcoming panel" aria-labelledby="upcoming-heading">
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
          <ul className="upcoming-list">
            {upcoming.map((request) => (
              <li key={request.id}>
                <span className="upcoming-day" aria-hidden="true">
                  {request.startDate.slice(8)}
                </span>
                <div>
                  <strong>{request.leaveTypeName}</strong>
                  <p>
                    {formatDate(request.startDate)} —{" "}
                    {formatDate(request.endDate)}
                  </p>
                </div>
                <span>{request.workingDays} working days · Approved</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    </>
  );
}
