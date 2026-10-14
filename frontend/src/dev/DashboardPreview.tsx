import { WorkspaceShell } from "../layouts/AppLayout";
import { useState } from "react";
import { BalanceCards, UpcomingLeaveList } from "../components/DashboardCards";
import { EmptyState, PageHeading } from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import { CalendarWorkspace } from "../components/CalendarWorkspace";
import { DashboardCalendar } from "../components/DashboardCalendar";
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
  {
    id: "preview-stride",
    name: "StrideShift Global",
    allocated: 20,
    approved: 4,
    pending: 2,
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

export default function DashboardPreview({
  calendar = false,
}: {
  calendar?: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState("2026-11-02");
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

  const previewMemberships = organisations.map((item) => ({
    id: `preview-membership-${item.id}`,
    organisationId: item.id,
    organisationName: item.name,
    role: calendar ? ("ADMIN" as const) : ("EMPLOYEE" as const),
    managerMembershipId: null,
    active: true,
  }));
  return (
    <WorkspaceShell
      preview
      me={{
        id: "preview-user",
        fullName: "Ayanda Example",
        email: "",
        memberships: previewMemberships,
      }}
      memberships={previewMemberships}
      membership={previewMemberships.find(
        (item) => item.organisationId === selected,
      )!}
      selectOrganisation={setSelected}
    >
      <div className="notice preview-banner" role="status">
        <strong>Sample data · Read-only preview</strong>
        <p>
          Explore the {calendar ? "calendar" : "dashboard"} layout and switch
          between example organisations.{" "}
          {calendar
            ? "Calendar entries are illustrative."
            : "Balances and requests here are illustrative."}
        </p>
      </div>
      {calendar ? (
        <>
          <PageHeading eyebrow="PLAN AROUND YOUR PEOPLE" title="Team calendar">
            Approved time away at {org.name}. Sample calendar data.
          </PageHeading>
          <section
            className="panel calendar-panel"
            aria-label="Organisation leave calendar"
          >
            <div className="calendar-toolbar">
              <h2>November 2026</h2>
              <span className="caption">Select a day to see who's away</span>
            </div>
            <CalendarWorkspace
              month="2026-11"
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              events={[
                {
                  id: "sample-ayanda",
                  organisationId: org.id,
                  requestId: "sample-1",
                  employeeDisplayName: "Ayanda Example",
                  title: "On leave",
                  startDate: "2026-11-02",
                  endDate: "2026-11-06",
                  allDay: true,
                },
                {
                  id: "sample-neo",
                  organisationId: org.id,
                  requestId: "sample-2",
                  employeeDisplayName: "Neo Example",
                  title: "On leave",
                  startDate: "2026-11-12",
                  endDate: "2026-11-16",
                  allDay: true,
                },
                {
                  id: "sample-thabo",
                  organisationId: org.id,
                  requestId: "sample-3",
                  employeeDisplayName: "Thabo Example",
                  title: "On leave",
                  startDate: "2026-11-23",
                  endDate: "2026-11-25",
                  allDay: true,
                },
              ]}
            />
          </section>
        </>
      ) : (
        <>
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
          <div className="dashboard-summary">
            <div className="dashboard-summary-heading">
              <div className="section-heading">
                <h2 id="balance-heading">Leave balances</h2>
                <span className="caption">2026 · Sample balances</span>
              </div>
            </div>
            <section
              className="dashboard-balances"
              aria-labelledby="balance-heading"
            >
              <BalanceCards balances={balances} leaveTypes={types} />
              <p className="caption">
                Example allocations: pending requests reserve days.
              </p>
            </section>
            <div className="dashboard-side">
              <section
                className="upcoming panel"
                aria-labelledby="upcoming-heading"
              >
                <div className="section-heading">
                  <h2 id="upcoming-heading">Your upcoming leave</h2>
                  <span className="caption">Approved · Sample data</span>
                </div>
                {upcoming.length ? (
                  <UpcomingLeaveList requests={upcoming} preview />
                ) : (
                  <EmptyState title="Nothing on the horizon yet">
                    Approved time away appears here.
                  </EmptyState>
                )}
              </section>
            </div>
          </div>
          <div className="dashboard-details">
            <DashboardCalendar requests={requests} preview />
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
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
