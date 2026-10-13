import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useApiQuery, useRefreshLeave } from "../hooks/queries";
import type { LeaveStatus } from "../types/api";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
  Pagination,
} from "../components/ui";
import { RequestCard } from "../components/RequestCard";
export function MyRequests() {
  const { membership, memberships } = useOrganisation();
  const [org, setOrg] = useState(membership.organisationId);
  const [status, setStatus] = useState<LeaveStatus | "">("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null);
  const refresh = useRefreshLeave();
  const requests = useApiQuery(["requests", org, status, page], (signal) =>
    api.requests(
      {
        organisationId: org || undefined,
        status: status || undefined,
        page,
        pageSize: 20,
      },
      signal,
    ),
  );
  const cancel = useMutation({
    mutationFn: api.cancelRequest,
    onSuccess: () => setConfirm(null),
    onSettled: refresh,
  });
  return (
    <>
      <PageHeading
        eyebrow="EVERY ORGANISATION, EVERY DECISION"
        title="My requests"
        action={
          <Link className="primary button" to="/requests/new">
            + Request leave
          </Link>
        }
      >
        Track your requests and each organisation's decision.
      </PageHeading>
      <div className="filters">
        <div>
          <label htmlFor="request-org">Organisation</label>
          <select
            id="request-org"
            value={org}
            onChange={(event) => {
              setOrg(event.target.value);
              setPage(1);
              setConfirm(null);
              cancel.reset();
            }}
          >
            <option value="">All my organisations</option>
            {memberships.map((item) => (
              <option key={item.id} value={item.organisationId}>
                {item.organisationName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="request-status">Status</label>
          <select
            id="request-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as LeaveStatus | "");
              setPage(1);
              setConfirm(null);
              cancel.reset();
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
      {cancel.isError && <ErrorNotice error={cancel.error} />}
      {requests.isPending ? (
        <Loading label="Loading your requests" />
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
            <EmptyState title="No requests found">
              Try another filter or create a new leave request.
            </EmptyState>
          ) : (
            <div className="request-list">
              {requests.data.data.map((request) => (
                <RequestCard key={request.id} request={request}>
                  {request.status === "PENDING" && (
                    <div className="cancel-area">
                      {confirm === request.id ? (
                        <div className="notice">
                          <p>
                            Cancel only the request for{" "}
                            <strong>{request.organisationName}</strong>? Other
                            organisations in the linked group keep their own
                            status.
                          </p>
                          <div className="button-row">
                            <button
                              type="button"
                              className="danger"
                              disabled={cancel.isPending}
                              onClick={() => cancel.mutate(request.id)}
                            >
                              {cancel.isPending
                                ? "Cancelling…"
                                : "Confirm cancellation"}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={cancel.isPending}
                              onClick={() => setConfirm(null)}
                            >
                              Keep request
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          disabled={cancel.isPending}
                          onClick={() => {
                            setConfirm(request.id);
                            cancel.reset();
                          }}
                        >
                          Cancel this organisation's request
                        </button>
                      )}
                    </div>
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
            busy={requests.isFetching || cancel.isPending}
          />
        </>
      )}
    </>
  );
}
