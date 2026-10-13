import type { ReactNode } from "react";
import type { LeaveRequest } from "../types/api";
import { formatDate, formatTimestamp } from "../hooks/dates";
import { StatusChip } from "./ui";
export function RequestCard({
  request,
  manager = false,
  children,
}: {
  request: LeaveRequest;
  manager?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="request-card">
      <div className="request-top">
        <div>
          <p className="eyebrow">{request.organisationName}</p>
          <h3>
            {manager ? `${request.employeeDisplayName ?? "Employee"} · ` : ""}
            {request.leaveTypeName}
          </h3>
        </div>
        <StatusChip status={request.status} />
      </div>
      <p className="date-range">
        {formatDate(request.startDate)} — {formatDate(request.endDate)}
      </p>
      <div className="request-meta">
        <span>
          {request.workingDays} working{" "}
          {request.workingDays === 1 ? "day" : "days"}
        </span>
        <span>Submitted {formatTimestamp(request.submittedAt)}</span>
      </div>
      {request.groupId && (
        <p className="linked-note">
          Linked request · This organisation decides independently.
        </p>
      )}
      {request.reason && (
        <details className="private-note">
          <summary>Private reason</summary>
          <p>{request.reason}</p>
        </details>
      )}
      {request.approverName && (
        <p className="muted">
          Decision by {request.approverName}
          {request.decidedAt ? ` · ${formatTimestamp(request.decidedAt)}` : ""}
        </p>
      )}
      {request.decisionComment && (
        <p className="decision-comment">{request.decisionComment}</p>
      )}
      {children}
    </article>
  );
}
