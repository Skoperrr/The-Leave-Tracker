import { useState } from "react";
import { Link } from "react-router-dom";
import { BalanceCards, UpcomingLeaveList } from "../components/DashboardCards";
import { EmptyState, PageHeading } from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import type { LeaveBalance, LeaveRequest, LeaveType } from "../types/api";

// Visual fixtures only: this module is lazy-loaded behind import.meta.env.DEV.
// It has no API/auth hooks, request handlers, or access to the live query cache.
const organisations = [
  { id: "preview-dlab", name: "D-Lab", allocated: 20, approved: 5, pending: 3 },
  {
    id: "preview-field",
    name: "The Field Institute",
    allocated: 18,
    approved: 2,
    pending: 5,
  },
];

function requestsFor(org: (typeof organisations)[number]): LeaveRequest[] {
  const base = {
    membershipId: `preview-membership-${org.id}`,
    organisationId: org.id,
    organisationName: org.name,
    leaveTypeId: `preview-annual-${org.id}`,
    leaveTypeName: "Annual leave",
    reason: null,
    submittedAt: "2026-10-13T08:00:00Z",
    approverName: null,
    decidedAt: null,
    decisionComment: null,
  };
  return [
    {
      ...base,
      id: `preview-linked-${org.id}`,
      groupId: "preview-linked-group",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      workingDays: 5,
      status: org.id === "preview-dlab" ? "APPROVED" : "PENDING",
      ...(org.id === "preview-dlab"
        ? { approverName: "Thabo Example", decidedAt: "2026-10-13T09:00:00Z" }
        : {}),
    },
    {
      ...base,
      id: `preview-second-${org.id}`,
      groupId: null,
      startDate: org.id === "preview-dlab" ? "2026-10-19" : "2026-10-22",
      endDate: org.id === "preview-dlab" ? "2026-10-21" : "2026-10-23",
      workingDays: org.id === "preview-dlab" ? 3 : 2,
      status: org.id === "preview-dlab" ? "PENDING" : "APPROVED",
      ...(org.id === "preview-dlab"
        ? {}
        : {
            approverName: "Lerato Example",
            decidedAt: "2026-10-13T10:00:00Z",
          }),
    },
    {
      ...base,
      id: `preview-declined-${org.id}`,
      groupId: null,
      startDate: "2026-09-14",
      endDate: "2026-09-15",
      workingDays: 2,
      status: "DECLINED",
      approverName: "Reviewing manager (sample)",
      decidedAt: "2026-09-08T09:00:00Z",
      decisionComment:
        "Sample decision: team coverage was needed on these dates.",
    },
  ];
}

export default function DashboardPreview() {
  const [selected, setSelected] = useState(organisations[0].id);
  const org =
    organisations.find((item) => item.id === selected) ?? organisations[0];
  const types: LeaveType[] = [
    {
      id: `preview-annual-${org.id}`,
      organisationId: org.id,
      code: "ANNUAL",
      name: "Annual leave",
    },
    {
      id: `preview-sick-${org.id}`,
      organisationId: org.id,
      code: "SICK",
      name: "Sick leave",
    },
  ];
  const balances: LeaveBalance[] = [
    {
      membershipId: `preview-membership-${org.id}`,
      leaveTypeId: types[0].id,
      year: 2026,
      allocatedDays: org.allocated,
      approvedDays: org.approved,
      pendingDays: org.pending,
      remainingDays: org.allocated - org.approved - org.pending,
    },
    {
      membershipId: `preview-membership-${org.id}`,
      leaveTypeId: types[1].id,
      year: 2026,
      allocatedDays: 10,
      approvedDays: 1,
      pendingDays: 0,
      remainingDays: 9,
    },
  ];
  const requests = requestsFor(org);
  const upcoming = requests.filter((request) => request.status === "APPROVED");

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link
          to="/preview/dashboard"
          className="brand"
          aria-label="The Leave Tracker dashboard preview"
        >
          <span className="brand-symbol" aria-hidden="true">
            LT
          </span>
          <span>
            The Leave Tracker<small>LEAVE, TOGETHER</small>
          </span>
        </Link>
        <div className="org-control">
          <label htmlFor="preview-organisation">PREVIEW ORGANISATION</label>
          <select
            id="preview-organisation"
            value={org.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {organisations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="role-label">Employee preview</span>
        </div>
        <nav className="main-nav" aria-label="Preview navigation">
          <a className="active" href="#main" aria-current="page">
            Overview
          </a>
          {["Request leave", "My requests", "Team calendar"].map((label) => (
            <button className="preview-nav" key={label} type="button" disabled>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="profile-name">Ayanda Example</p>
          <p className="profile-email">Sample employee</p>
          <Link className="secondary button" to="/sign-in">
            Back to sign in
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>{org.name}</span>
          <span>Dashboard preview</span>
        </div>
        <main id="main" className="main-content" tabIndex={-1}>
          <div className="notice preview-banner" role="status">
            <strong>Sample data · Read-only preview</strong>
            <p>
              Explore the dashboard layout and switch between example
              organisations. Balances and requests here are illustrative.
            </p>
          </div>
          <PageHeading
            eyebrow="YOUR TIME, AT A GLANCE"
            title="Hello, Ayanda."
            action={
              <button className="primary" type="button" disabled>
                + Request leave
              </button>
            }
          >
            Here's your leave at {org.name}.
          </PageHeading>
          <section aria-labelledby="balance-heading">
            <div className="section-heading">
              <h2 id="balance-heading">Leave balances</h2>
              <span className="caption">2026 · Sample balances</span>
            </div>
            <BalanceCards balances={balances} leaveTypes={types} />
            <p className="caption">
              Example allocations: pending requests reserve days.
            </p>
          </section>
          <section
            className="upcoming panel"
            aria-labelledby="upcoming-heading"
          >
            <div className="section-heading">
              <h2 id="upcoming-heading">Your upcoming leave</h2>
              <span className="caption">Approved · Sample data</span>
            </div>
            {upcoming.length ? (
              <UpcomingLeaveList requests={upcoming} />
            ) : (
              <EmptyState title="Nothing on the horizon yet">
                Approved time away appears here.
              </EmptyState>
            )}
          </section>
          <section id="preview-requests" aria-labelledby="recent-heading">
            <div className="section-heading">
              <h2 id="recent-heading">Your requests</h2>
              <span className="caption">
                Each organisation decides independently
              </span>
            </div>
            <div className="request-list">
              {requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          </section>
        </main>
        <footer className="app-footer">
          The Leave Tracker · D-Lab Blitz Day 6{" "}
          <span>Development preview · Sample data</span>
        </footer>
      </div>
    </div>
  );
}
