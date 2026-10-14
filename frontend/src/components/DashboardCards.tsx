import type { LeaveBalance, LeaveRequest, LeaveType } from "../types/api";
import { formatDate } from "../hooks/dates";
import { Link } from "react-router-dom";

export function BalanceCards({
  balances,
  leaveTypes,
}: {
  balances: LeaveBalance[];
  leaveTypes: LeaveType[];
}) {
  return (
    <div className="balance-grid">
      {balances.map((balance) => (
        <article
          className="balance-card"
          key={`${balance.membershipId}-${balance.leaveTypeId}-${balance.year}`}
        >
          <p>
            {leaveTypes.find((type) => type.id === balance.leaveTypeId)?.name ??
              "Leave balance"}
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
  );
}

export function UpcomingLeaveList({
  requests,
  preview = false,
}: {
  requests: LeaveRequest[];
  preview?: boolean;
}) {
  return (
    <ul className="upcoming-list">
      {requests.map((request) => (
        <li key={request.id}>
          <span className="upcoming-day" aria-hidden="true">
            {request.startDate.slice(8)}
          </span>
          <div>
            <strong>
              <Link
                to={
                  preview
                    ? "/preview/calendar"
                    : `/calendar?date=${request.startDate}`
                }
              >
                {request.leaveTypeName}
              </Link>
            </strong>
            <p>
              {formatDate(request.startDate)} — {formatDate(request.endDate)}
            </p>
          </div>
          <span>{request.workingDays} working days · Approved</span>
        </li>
      ))}
    </ul>
  );
}
