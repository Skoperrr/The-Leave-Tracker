import { useState } from "react";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useApiQuery } from "../hooks/queries";
import type { LeaveStatus } from "../types/api";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
  Pagination,
} from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import { DecisionForm } from "../components/DecisionForm";
export function ManagerInbox() {
  const { membership, me } = useOrganisation();
  const org = membership.organisationId;
  const [status, setStatus] = useState<LeaveStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const requests = useApiQuery(
    ["manager-requests", org, status, page],
    (signal) =>
      api.managerRequests(
        {
          organisationId: org,
          status: status || undefined,
          page,
          pageSize: 20,
        },
        signal,
      ),
    ["MANAGER", "ADMIN"].includes(membership.role),
  );
  return (
    <>
      <PageHeading eyebrow="LOOK AFTER YOUR TEAM" title="Manager inbox">
        Review leave for {membership.organisationName}. Each organisation's
        decision is independent.
      </PageHeading>
      <div className="filters">
        <div>
          <label htmlFor="inbox-status">Status</label>
          <select
            id="inbox-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as LeaveStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(["PENDING", "APPROVED", "DECLINED", "CANCELLED"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ),
            )}
          </select>
        </div>
      </div>
      {requests.isPending ? (
        <Loading label="Loading manager inbox" />
      ) : requests.isError ? (
        <ErrorNotice
          error={requests.error}
          retry={() => {
            void requests.refetch();
          }}
        />
      ) : (
        <>
          {requests.data.data.length === 0 ? (
            <EmptyState title="You're all caught up">
              There are no requests matching this status in your authorised
              queue.
            </EmptyState>
          ) : (
            <div className="request-list">
              {requests.data.data.map((request) => (
                <RequestCard key={request.id} request={request} manager>
                  {request.status === "PENDING" && (
                    <DecisionForm
                      requestId={request.id}
                      disabled={
                        request.membershipId === membership.id ||
                        request.employeeId === me.id
                      }
                    />
                  )}
                </RequestCard>
              ))}
            </div>
          )}
          <Pagination
            meta={requests.data.meta}
            page={page}
            count={requests.data.data.length}
            onPage={setPage}
            busy={requests.isFetching}
          />
        </>
      )}
    </>
  );
}
