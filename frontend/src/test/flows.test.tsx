import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "../App";
import { today } from "../hooks/dates";
import { connectGoogleCalendar } from "../pages/CalendarSettings";
import { AuthProvider } from "../auth/AuthProvider";
import { MonthCalendar } from "../components/MonthCalendar";
import type { CalendarEvent, LeaveRequest, Me, Membership } from "../types/api";
const auth = vi.hoisted(() => ({
  session: {
    access_token: "test-access-token",
    user: { id: "auth-employee" },
  } as {
    access_token: string;
    user: { id: string; user_metadata?: { full_name?: string } };
  } | null,
  listener: null as ((event: string, session: unknown) => void) | null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("../auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: auth.session },
        error: null,
      }),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void,
      ) => {
        auth.listener = listener;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                auth.listener = null;
              },
            },
          },
        };
      },
      signInWithPassword: auth.signIn,
      signUp: auth.signUp,
      resetPasswordForEmail: auth.resetPassword,
      updateUser: auth.updateUser,
      signOut: async () => {
        auth.session = null;
        auth.listener?.("SIGNED_OUT", null);
        return { error: null };
      },
    },
  },
}));
// Isolated HTTP fixtures. These never enter production source or the browser bundle.
const membership = (
  id: string,
  organisationId: string,
  organisationName: string,
  role: Membership["role"],
): Membership => ({
  id,
  organisationId,
  organisationName,
  role,
  active: true,
  managerMembershipId: null,
});
const dlab = membership("member-dlab", "org-dlab", "D-Lab", "EMPLOYEE");
const field = membership(
  "member-field",
  "org-field",
  "The Field Institute",
  "EMPLOYEE",
);
let profile: Me;
let requests: LeaveRequest[];
let calls: { path: string; method: string; body?: Record<string, unknown> }[];
let profileWrites: Record<string, unknown>[];
let assignedMembers: Membership[];
let google: import("../types/api").GoogleStatus;
let failure: { path: string; status: number; code: string } | null;
const createRequest = (id: string, org: Membership): LeaveRequest => ({
  id,
  groupId: "group-1",
  membershipId: org.id,
  organisationId: org.organisationId,
  organisationName: org.organisationName,
  leaveTypeId: `annual-${org.organisationId}`,
  leaveTypeName: "Annual leave",
  startDate: "2026-11-02",
  endDate: "2026-11-06",
  workingDays: 5,
  reason: "PRIVATE_REASON_123",
  status: "PENDING",
  submittedAt: "2026-10-13T08:00:00Z",
  approverName: null,
  decidedAt: null,
  decisionComment: null,
});
function response(
  data: unknown,
  meta?: { page: number; pageSize: number; total: number },
) {
  return new Response(JSON.stringify({ data, ...(meta ? { meta } : {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  localStorage.clear();
  auth.session = {
    access_token: "test-access-token",
    user: { id: "auth-employee" },
  };
  auth.signIn.mockReset();
  auth.signUp.mockReset();
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPassword.mockReset().mockResolvedValue({ error: null });
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
  profileWrites = [];
  assignedMembers = [];
  google = {
    organisationId: "org-dlab",
    provider: "GOOGLE",
    connectionStatus: "CONNECTED",
    calendarId: null,
    invitationsEnabled: false,
    lastSync: null,
  };
  profile = {
    id: "profile-employee",
    email: "employee@example.test",
    fullName: "Ayanda Example",
    memberships: [dlab, field],
  };
  requests = [];
  calls = [];
  failure = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (path === "/auth/profile") {
        profileWrites.push(body);
        if (failure?.path === path)
          return new Response(
            JSON.stringify({
              error: { code: failure.code, message: "Rejected" },
            }),
            { status: failure.status },
          );
        return response(profile);
      }
      calls.push({ path: `${path}${url.search}`, method, body });
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-access-token",
      );
      if (failure?.path === path)
        return new Response(
          JSON.stringify({
            error: { code: failure.code, message: "Rejected" },
          }),
          { status: failure.status },
        );
      if (path === "/me") return response(profile);
      if (path === "/ai/leave-draft")
        return response({
          referenceDate: "2026-10-15",
          timezone: "Africa/Johannesburg",
          status: "READY",
          draft: {
            organisationIds: body.organisationIds,
            reason: String(body.text).includes("family event")
              ? "I am requesting annual leave to attend a family event."
              : null,
            leaveTypeCode: "ANNUAL",
            startDate: "2026-10-22",
            endDate: "2026-10-23",
          },
          workingDays: 2,
          warnings: ["Balances and overlaps are checked on submission."],
        });
      if (path === "/ai/manager-summary") {
        const rows = requests.filter(
          (item) =>
            item.organisationId === body.organisationId &&
            ["PENDING", "APPROVED"].includes(item.status),
        );
        return response({
          referenceDate: "2026-10-15",
          generatedAt: "2026-10-15T08:00:00Z",
          timezone: "Africa/Johannesburg",
          period: { from: body.from, to: body.to },
          scope: "DIRECT_REPORTS",
          activeMemberCount: 2,
          pendingCount: rows.filter((row) => row.status === "PENDING").length,
          approvedCount: 0,
          summary:
            "Pending requests need your review; no decisions have been made.",
          aiUsed: true,
          coverageThresholdPercent: 30,
          highlights: [],
          attention: [],
          sources: rows.map((row) => ({
            id: row.id,
            employeeDisplayName: "Ayanda Example",
            startDate: row.startDate,
            endDate: row.endDate,
            status: row.status,
          })),
          limitations: [
            "Coverage is a planning signal, not a staffing roster.",
          ],
        });
      }
      if (path === "/ai/ask-data") {
        if (String(body.question).includes("balance"))
          return response({
            status: "ANSWER",
            intent: "MY_BALANCE",
            scope: "OWN_BALANCE",
            period: null,
            referenceDate: "2026-10-15",
            generatedAt: "2026-10-15T08:00:00Z",
            answer: "Your allocated balances are shown below.",
            rows: [],
            balances: [
              {
                leaveTypeName: "Annual leave",
                year: 2026,
                allocatedDays: 20,
                approvedDays: 3,
                pendingDays: 2,
                remainingDays: 15,
              },
            ],
          });
        const rows = requests.filter(
          (item) =>
            item.organisationId === body.organisationId &&
            item.status === "APPROVED",
        );
        return response({
          status: "ANSWER",
          intent: "WHO_OFF",
          scope: "ORGANISATION_CALENDAR",
          period: { from: "2026-10-19", to: "2026-10-23" },
          referenceDate: "2026-10-15",
          generatedAt: "2026-10-15T08:00:00Z",
          answer: `${rows.length} approved leave records were found.`,
          balances: [],
          rows: rows.map((row) => ({
            requestId: row.id,
            employeeDisplayName: "Ayanda Example",
            startDate: row.startDate,
            endDate: row.endDate,
          })),
          limitations: ["Private reasons are excluded."],
        });
      }
      const orgId = url.searchParams.get("organisationId");
      if (path === "/insights") {
        const from = url.searchParams.get("from")!,
          to = url.searchParams.get("to")!;
        const days = [];
        for (
          let time = Date.parse(from);
          time <= Date.parse(to);
          time += 86_400_000
        ) {
          const date = new Date(time);
          if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
            days.push({
              date: date.toISOString().slice(0, 10),
              approvedPeople: 0,
              pendingPeople: 0,
              projectedPeople: 0,
              approvedPercent: 0,
              projectedPercent: 0,
              warning: false,
            });
        }
        return response({
          organisationId: orgId,
          generatedAt: new Date().toISOString(),
          timezone: "Africa/Johannesburg",
          period: { from, to },
          allocationYear: Number(url.searchParams.get("allocationYear")),
          scope:
            profile.memberships.find(
              (member) => member.organisationId === orgId,
            )?.role === "ADMIN"
              ? "ORGANISATION"
              : "DIRECT_REPORTS",
          activeMemberCount: 1,
          thresholds: { lowBalanceDays: 3, coveragePercent: 30 },
          summary: {
            approvedRequestCount: 0,
            pendingRequestCount: 0,
            approvedPersonDays: 0,
            upcomingApprovedPersonDays: 0,
            coverageWarningDays: 0,
            unallocatedMemberCount: 0,
          },
          lowBalances: [],
          monthly: [...new Set([from.slice(0, 7), to.slice(0, 7)])].map(
            (month) => ({ month, approvedPersonDays: 0 }),
          ),
          dailyCoverage: days,
          byType: [],
          limitations: ["Simulated API data for route integration tests."],
        });
      }
      if (path.endsWith("/leave-types")) {
        const org = path.split("/")[2];
        return response([
          {
            id: `annual-${org}`,
            organisationId: org,
            code: "ANNUAL",
            name: "Annual leave",
          },
          ...[
            ["FAMILY_RESPONSIBILITY", "Family responsibility leave"],
            ["MATERNITY", "Maternity leave"],
            ["PARENTAL", "Parental leave"],
            ["RELIGIOUS", "Religious leave"],
          ].map(([code, name]) => ({
            id: `${code}-${org}`,
            organisationId: org,
            code,
            name,
          })),
        ]);
      }
      if (path === "/balances")
        return response([
          {
            membershipId: orgId === "org-field" ? field.id : dlab.id,
            leaveTypeId: `annual-${orgId}`,
            year: Number(url.searchParams.get("year")),
            allocatedDays: 20,
            approvedDays: 0,
            pendingDays:
              5 *
              requests.filter(
                (item) =>
                  item.organisationId === orgId && item.status === "PENDING",
              ).length,
            remainingDays: orgId === "org-field" ? 12 : 15,
          },
        ]);
      if (path === "/leave-requests" && method === "POST") {
        requests = (body.organisationIds as string[]).map((id, index) => ({
          ...createRequest(
            `request-${index + 1}`,
            profile.memberships.find((member) => member.organisationId === id)!,
          ),
          startDate: body.startDate,
          endDate: body.endDate,
          reason: body.reason ?? null,
        }));
        return response({ groupId: "group-1", requests });
      }
      if (
        (path === "/leave-requests" || path === "/manager/leave-requests") &&
        method === "GET"
      ) {
        const status = url.searchParams.get("status");
        const filtered = requests.filter(
          (item) =>
            (!orgId || item.organisationId === orgId) &&
            (!status || item.status === status),
        );
        return response(filtered, {
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 20),
          total: filtered.length,
        });
      }
      if (path.endsWith("/cancel")) {
        const request = requests.find(
          (item) => item.id === path.split("/")[2],
        )!;
        request.status = "CANCELLED";
        return response(request);
      }
      if (path.endsWith("/decision")) {
        const request = requests.find(
          (item) => item.id === path.split("/")[3],
        )!;
        request.status = body.decision === "APPROVE" ? "APPROVED" : "DECLINED";
        request.decisionComment = body.comment ?? null;
        return response(request);
      }
      if (path === "/calendar-events")
        return response(
          requests
            .filter(
              (item) =>
                item.organisationId === orgId && item.status === "APPROVED",
            )
            .map((item) => ({
              id: `event-${item.id}`,
              requestId: item.id,
              organisationId: item.organisationId,
              employeeDisplayName: "Ayanda Example",
              title: "Ayanda Example — On leave",
              startDate: item.startDate,
              endDate: item.endDate,
              allDay: true,
              reason: "PRIVATE_REASON_123",
            })),
        );
      if (path === "/admin/memberships" && method === "POST") {
        const member = membership(
          "new-member",
          body.organisationId,
          "D-Lab",
          "EMPLOYEE",
        );
        assignedMembers.push(member);
        return response(member);
      }
      if (path === "/admin/memberships")
        return response([
          ...profile.memberships.filter(
            (member) => member.organisationId === orgId,
          ),
          ...assignedMembers,
        ]);
      if (path === "/admin/allocations")
        return response({
          id: "allocation",
          ...body,
          createdAt: "2026-10-14T00:00:00Z",
          updatedAt: "2026-10-14T00:00:00Z",
        });
      if (path === "/integrations/google/status") return response(google);
      if (path === "/integrations/google/connect") {
        expect(init?.credentials).toBe("include");
        return response({
          authorisationUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state",
          expiresAt: "2026-10-14T00:10:00Z",
        });
      }
      if (path === "/integrations/google/calendars")
        return new Response(
          JSON.stringify({
            data: url.searchParams.has("cursor")
              ? [
                  {
                    id: "second-calendar",
                    summary: "Another calendar",
                    timeZone: "Africa/Johannesburg",
                    accessRole: "writer",
                  },
                ]
              : [
                  {
                    id: "shared-calendar",
                    summary: "D-Lab shared",
                    timeZone: "Africa/Johannesburg",
                    accessRole: "owner",
                  },
                  {
                    id: "read-only",
                    summary: "Read-only calendar",
                    timeZone: "UTC",
                    accessRole: "reader",
                  },
                ],
            meta: {
              nextPageToken: url.searchParams.has("cursor")
                ? null
                : "next-page",
            },
          }),
          { status: 200 },
        );
      if (path === "/integrations/google/settings") {
        google = {
          ...google,
          calendarId: body.calendarId,
          invitationsEnabled: body.invitationsEnabled,
        };
        return response(google);
      }
      if (path === "/integrations/google/test")
        return response({
          calendarId: google.calendarId,
          writable: true,
          checkedAt: "2026-10-14T00:00:00Z",
        });
      if (path === "/integrations/google/disconnect") {
        google = {
          ...google,
          connectionStatus: "DISCONNECTED",
          calendarId: null,
          invitationsEnabled: false,
        };
        return response(google);
      }
      if (path === "/integrations/google/retry") {
        google = {
          ...google,
          lastSync: { ...google.lastSync!, status: "PENDING" },
        };
        return response(google);
      }
      throw new Error(`Undocumented test request: ${method} ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount(path: string) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const ui = render(
    <QueryClientProvider client={cache}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...ui, cache };
}
describe("Frontend integration flows", () => {
  it.each(["ADMIN", "MANAGER"] as const)(
    "opens Insights from the sidebar for %s",
    async (role) => {
      profile.memberships = [{ ...dlab, role }];
      mount("/");
      const link = await screen.findByRole("link", { name: "Insights" });
      expect(link).toHaveAttribute("href", "/insights");
      await userEvent.click(link);
      await screen.findByRole("heading", { name: "Insights" });
      await screen.findByText(
        role === "ADMIN" ? /Organisation-wide/ : /Direct reports only/,
      );
      expect(
        calls.some((call) =>
          call.path.startsWith("/insights?organisationId=org-dlab&"),
        ),
      ).toBe(true);
      expect(
        screen.getByRole("heading", {
          name: "Approved request-days by leave type",
        }),
      ).toBeInTheDocument();
    },
  );
  it("guards the Insights route and hides its navigation from employees", async () => {
    mount("/insights");
    await screen.findByRole("heading", { name: "Permission required" });
    expect(
      screen.queryByRole("link", { name: "Insights" }),
    ).not.toBeInTheDocument();
    expect(calls.some((call) => call.path.startsWith("/insights"))).toBe(false);
  });

  it("falls back to the current month for an invalid calendar date link", async () => {
    mount("/calendar?date=2026-02-31");
    expect(await screen.findByLabelText("Calendar month")).toHaveValue(
      today().slice(0, 7),
    );
  });
  it("opens the full calendar at the day clicked in the dashboard calendar", async () => {
    mount("/");
    const mini = await screen.findByRole("region", {
      name: "Your leave calendar",
    });
    const dateLink = within(mini).getAllByRole("link")[0];
    const date = new URL(
      dateLink.getAttribute("href")!,
      window.location.origin,
    ).searchParams.get("date")!;
    await userEvent.click(dateLink);
    await screen.findByRole("heading", { name: "Team calendar" });
    expect(screen.getByLabelText("Calendar month")).toHaveValue(
      date.slice(0, 7),
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '.calendar-day-button[aria-pressed="true"] time',
        ),
      ).toHaveAttribute("datetime", date),
    );
  });
  it("opens upcoming leave at its start date", async () => {
    requests = [{ ...createRequest("upcoming", dlab), status: "APPROVED" }];
    mount("/");
    const upcoming = await screen.findByRole("region", {
      name: "Your upcoming leave",
    });
    const leave = await within(upcoming).findByRole("link", {
      name: "Annual leave",
    });
    expect(leave).toHaveAttribute("href", "/calendar?date=2026-11-02");
    await userEvent.click(leave);
    await screen.findByText("Ayanda Example — On leave");
    expect(
      document.querySelector('.calendar-day-button[aria-pressed="true"] time'),
    ).toHaveAttribute("datetime", "2026-11-02");
  });
  it("keeps one consistent centred loader from sign-in through delayed profile loading", async () => {
    auth.session = null;
    let finishLogin!: () => void;
    let finishProfile!: () => void;
    let profileStarted = false;
    const profileGate = new Promise<void>((resolve) => {
      finishProfile = resolve;
    });
    const fetcher = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).includes("/auth/profile")) {
        profileStarted = true;
        await profileGate;
      }
      return fetcher(...args);
    });
    auth.signIn.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
      auth.session = {
        access_token: "test-access-token",
        user: {
          id: "auth-employee",
          user_metadata: { full_name: "Ayanda Example" },
        },
      };
      auth.listener?.("SIGNED_IN", auth.session);
      return { data: { session: auth.session }, error: null };
    });
    mount("/sign-in");
    await userEvent.type(
      await screen.findByLabelText("Email address"),
      "employee@example.test",
    );
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Opening your workspace…" });
    await act(async () => {
      finishLogin();
    });
    await waitFor(() => expect(profileStarted).toBe(true));
    expect(auth.signIn).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Opening your workspace…" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".signin-loading")).toHaveLength(1);
    expect(
      document.querySelector(".loading .skeleton"),
    ).not.toBeInTheDocument();
    await act(async () => {
      finishProfile();
    });
    await screen.findByRole("heading", { name: "Hello, Ayanda." });
    expect(document.querySelector(".signin-loading")).not.toBeInTheDocument();
  });
  it("shows and hides the sign-in password without submitting or changing its value", async () => {
    auth.session = null;
    mount("/sign-in");
    const password = await screen.findByLabelText("Password");
    await userEvent.type(password, "ExamplePassword123!");
    expect(password).toHaveAttribute("type", "password");
    await userEvent.click(
      screen.getByRole("button", { name: "Show password" }),
    );
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("ExamplePassword123!");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Hide password" }),
    );
    expect(password).toHaveAttribute("type", "password");
    expect(auth.signIn).not.toHaveBeenCalled();
  });
  it("shows centred sign-in progress while awaiting auth and restores inputs after failure", async () => {
    auth.session = null;
    let complete!: (result: { error: Error }) => void;
    auth.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    mount("/sign-in");
    await userEvent.type(
      await screen.findByLabelText("Email address"),
      "employee@example.test",
    );
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByRole("heading", { name: "Opening your workspace…" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".signin-loading-animation .domino-spinner"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      complete({ error: new Error("Invalid login credentials") });
    });
    await screen.findByText("Invalid login credentials");
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "employee@example.test",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("password123");
    expect(auth.signIn).toHaveBeenCalledOnce();
  });
  it("collapses and expands the desktop sidebar without changing organisation", async () => {
    mount("/");
    await screen.findByRole("heading", { name: "Hello, Ayanda." });
    expect(
      screen.getByRole("img", { name: "D-Lab header logo" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Collapse sidebar" })
        .closest(".sidebar"),
    ).not.toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
    expect(document.querySelector(".app-shell")).toHaveClass(
      "sidebar-collapsed",
    );
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      screen.getByRole("button", { name: "Expand sidebar" }),
    );
    expect(document.querySelector(".app-shell")).not.toHaveClass(
      "sidebar-collapsed",
    );
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "dlab",
    );
  });
  it.each([
    ["EMPLOYEE", "Request leave", "/requests/new"],
    ["MANAGER", "Leave approvals", "/manager"],
    ["ADMIN", "Leave approvals", "/admin/approvals"],
  ] as const)(
    "uses the correct mobile centre action for %s",
    async (role, label, path) => {
      vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      profile.memberships = [{ ...dlab, role }];
      mount("/");
      const nav = await screen.findByRole("navigation", {
        name: "Mobile navigation",
      });
      expect(within(nav).getAllByRole("link")).toHaveLength(
        role === "ADMIN" ? 5 : 4,
      );
      if (role === "ADMIN") {
        expect(
          within(nav).getByRole("link", { name: "Calendar settings" }),
        ).toHaveAttribute("href", "/admin/calendar");
        expect(
          within(nav).queryByRole("button", { name: "Menu" }),
        ).not.toBeInTheDocument();
      } else
        expect(
          within(nav).queryByRole("link", { name: "Calendar settings" }),
        ).not.toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        path,
      );
      expect(within(nav).getByRole("link", { name: label })).toHaveClass(
        "bottom-action",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Open navigation panel" }),
      );
      const panel = screen.getByRole("dialog", {
        name: "Workspace navigation",
      });
      expect(panel).toHaveAttribute("aria-modal", "true");
      if (role === "EMPLOYEE")
        expect(
          within(panel).queryByRole("link", { name: "Insights" }),
        ).not.toBeInTheDocument();
      else
        expect(
          within(panel).getByRole("link", { name: "Insights" }),
        ).toHaveAttribute("href", "/insights");

      expect(
        within(panel).getByRole("button", { name: "Close navigation panel" }),
      ).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Open navigation panel" }),
      ).toHaveFocus();
      expect(document.body.style.overflow).not.toBe("hidden");
    },
  );
  it("closes the mobile panel after organisation selection and updates the header logo", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mount("/");
    const opener = await screen.findByRole("button", {
      name: "Open navigation panel",
    });
    await userEvent.click(opener);
    await userEvent.selectOptions(
      within(screen.getByRole("dialog")).getByLabelText("YOUR ORGANISATION"),
      "org-field",
    );
    await screen.findByRole("img", { name: "The Field Institute header logo" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".workspace")).toHaveProperty("inert", false);
  });
  it("uses explicit approval status filters and resets pagination", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    requests = [{ ...createRequest("approved", dlab), status: "APPROVED" }];
    mount("/admin/approvals");
    await screen.findByText("You're all caught up");
    expect(
      screen.queryByRole("option", { name: "All statuses" }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "APPROVED");
    await screen.findByText("Approved", { selector: ".status" });
    expect(
      calls
        .filter((call) => call.path.startsWith("/manager/leave-requests?"))
        .every((call) =>
          new URLSearchParams(call.path.split("?")[1]).has("status"),
        ),
    ).toBe(true);
    expect(
      calls.some((call) => call.path.includes("status=APPROVED&page=1")),
    ).toBe(true);
  });
  it("submits exactly one cross-organisation payload and displays individual statuses", async () => {
    const user = userEvent.setup();
    mount("/requests/new");
    await screen.findByRole("heading", { name: "Request leave" });
    await user.click(
      screen.getByRole("checkbox", { name: "The Field Institute" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Annual leave" }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText("Leave type"), "ANNUAL");
    await user.clear(screen.getByLabelText("Start date"));
    await user.type(screen.getByLabelText("Start date"), "2026-11-02");
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-11-06");
    await user.type(screen.getByLabelText(/Private reason/), "Personal leave");
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByRole("heading", {
      name: "Your time away is on its way.",
    });
    const posts = calls.filter(
      (call) => call.path === "/leave-requests" && call.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      organisationIds: ["org-dlab", "org-field"],
      leaveTypeCode: "ANNUAL",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      reason: "Personal leave",
    });
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getAllByText("5 working days")).toHaveLength(2);
  });
  it.each([
    ["FAMILY_RESPONSIBILITY", "Family responsibility leave"],
    ["MATERNITY", "Maternity leave"],
    ["PARENTAL", "Parental leave"],
    ["RELIGIOUS", "Religious leave"],
  ])("offers %s and submits the selected code", async (code, name) => {
    const user = userEvent.setup();
    mount("/requests/new");
    await screen.findByRole("option", { name });
    await user.selectOptions(screen.getByLabelText("Leave type"), code);
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-11-02" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-11-03" },
    });
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByRole("heading", {
      name: "Your time away is on its way.",
    });
    expect(
      calls.find(
        (call) => call.path === "/leave-requests" && call.method === "POST",
      )?.body,
    ).toMatchObject({ leaveTypeCode: code, organisationIds: ["org-dlab"] });
  });
  it("keeps AI generation and applying read-only until explicit leave submission, preserving the private reason", async () => {
    const user = userEvent.setup();
    mount("/requests/new");
    await screen.findByRole("heading", { name: "Request leave" });
    await user.type(
      screen.getByLabelText(/Private reason/),
      "Keep this private reason",
    );
    await user.type(
      screen.getByLabelText("What leave would you like?"),
      "Annual leave from 22 October 2026 to 23 October 2026",
    );
    await user.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("AI suggestion — review before submitting");
    expect(
      calls.filter(
        (call) => call.path === "/leave-requests" && call.method === "POST",
      ),
    ).toHaveLength(0);
    const aiCall = calls.find((call) => call.path === "/ai/leave-draft");
    expect(aiCall?.body).toEqual({
      organisationIds: ["org-dlab"],
      text: "Annual leave from 22 October 2026 to 23 October 2026",
    });
    await user.click(screen.getByRole("button", { name: "Use these details" }));
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-10-22");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-10-23");
    expect(screen.getByLabelText(/Private reason/)).toHaveValue(
      "Keep this private reason",
    );
    expect(
      calls.filter(
        (call) => call.path === "/leave-requests" && call.method === "POST",
      ),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByRole("heading", {
      name: "Your time away is on its way.",
    });
    expect(
      calls.filter(
        (call) => call.path === "/leave-requests" && call.method === "POST",
      ),
    ).toHaveLength(1);
  });
  it("applies a reviewed formal reason to the form and saves it only on explicit submission", async () => {
    const user = userEvent.setup();
    mount("/requests/new");
    await screen.findByRole("heading", { name: "Request leave" });
    await waitFor(() =>
      expect(screen.getByLabelText("What leave would you like?")).toBeEnabled(),
    );
    await user.type(
      screen.getByLabelText("What leave would you like?"),
      "Annual leave next Thursday and Friday for a family event",
    );
    await user.click(screen.getByRole("button", { name: "Generate draft" }));
    const formalReason =
      "I am requesting annual leave to attend a family event.";
    await screen.findByText(formalReason);
    expect(screen.getByLabelText(/Private reason/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Use these details" }));
    expect(screen.getByLabelText(/Private reason/)).toHaveValue(formalReason);
    expect(
      calls.filter(
        (call) => call.path === "/leave-requests" && call.method === "POST",
      ),
    ).toHaveLength(0);
    await user.clear(screen.getByLabelText(/Private reason/));
    await user.type(
      screen.getByLabelText(/Private reason/),
      "I am attending a family wedding.",
    );
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByRole("heading", {
      name: "Your time away is on its way.",
    });
    const saves = calls.filter(
      (call) => call.path === "/leave-requests" && call.method === "POST",
    );
    expect(saves).toHaveLength(1);
    expect(saves[0]?.body?.reason).toBe("I am attending a family wedding.");
    expect(calls.find((call) => call.path === "/ai/leave-draft")?.body).toEqual(
      {
        organisationIds: ["org-dlab"],
        text: "Annual leave next Thursday and Friday for a family event",
      },
    );
  });
  it("cancels only the selected child and refetches organisation requests", async () => {
    requests = [createRequest("r-dlab", dlab), createRequest("r-field", field)];
    const user = userEvent.setup();
    mount("/requests");
    await screen.findByRole("heading", { name: "My requests" });
    await user.selectOptions(screen.getByLabelText("Organisation"), "");
    await screen.findByText("The Field Institute", { selector: ".eyebrow" });
    const cards = screen.getAllByRole("article");
    const dlabCard = cards.find((card) =>
      within(card).queryByText("D-Lab", { selector: ".eyebrow" }),
    )!;
    await user.click(
      within(dlabCard).getByRole("button", {
        name: "Cancel this organisation's request",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await screen.findByText("Cancelled", { selector: ".status" });
    expect(requests[0].status).toBe("CANCELLED");
    expect(requests[1].status).toBe("PENDING");
    const post = calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe("/leave-requests/r-dlab/cancel");
    expect(post.body).toBeUndefined();
    expect(
      calls.filter((call) => call.path.startsWith("/leave-requests?")).length,
    ).toBeGreaterThan(2);
  });
  it("answers calendar questions only on demand, shows source rows and clears answers on organisation change", async () => {
    requests = [
      {
        ...createRequest("approved-source", dlab),
        status: "APPROVED",
        startDate: "2026-10-22",
        endDate: "2026-10-23",
      },
    ];
    const user = userEvent.setup();
    mount("/calendar");
    await screen.findByRole("heading", { name: "Ask the data" });
    expect(calls.some((call) => call.path === "/ai/ask-data")).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Who's off next week?" }),
    );
    await user.click(screen.getByRole("button", { name: "Ask the data" }));
    await screen.findByRole("heading", { name: "From your leave records" });
    expect(
      screen.getByText("1 approved leave records were found."),
    ).toBeInTheDocument();
    expect(screen.getByText("Source records (1)")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE_REASON_123")).not.toBeInTheDocument();
    expect(
      calls.filter((call) => call.method === "POST").map((call) => call.path),
    ).toEqual(["/ai/ask-data"]);
    await user.selectOptions(
      screen.getByLabelText("YOUR ORGANISATION"),
      "org-field",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "From your leave records" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("shows own database balance answers without exposing manager-only question shortcuts to employees", async () => {
    const user = userEvent.setup();
    mount("/calendar");
    await screen.findByRole("heading", { name: "Ask the data" });
    expect(
      screen.queryByRole("button", {
        name: "What requests are pending next week?",
      }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "What is my leave balance?" }),
    );
    await user.click(screen.getByRole("button", { name: "Ask the data" }));
    const balances = await screen.findByRole("table", {
      name: "Your allocated balances",
    });
    expect(
      within(balances).getByRole("cell", { name: "15" }),
    ).toBeInTheDocument();
  });
  it("generates manager review without decisions and clears the snapshot after an actual approval", async () => {
    profile.memberships = [
      { ...dlab, id: "manager-membership", role: "MANAGER" },
    ];
    requests = [
      {
        ...createRequest("pending-source", dlab),
        employeeDisplayName: "Ayanda Example",
        employeeId: "other-profile",
      },
    ];
    const user = userEvent.setup();
    mount("/manager");
    await screen.findByRole("button", { name: "Approve request" });
    expect(calls.some((call) => call.path === "/ai/manager-summary")).toBe(
      false,
    );
    await user.click(
      screen.getByRole("button", { name: "Generate manager summary" }),
    );
    await screen.findByRole("heading", { name: "AI-assisted review summary" });
    expect(calls.some((call) => call.path.endsWith("/decision"))).toBe(false);
    expect(screen.getByText("Source requests (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve request" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "AI-assisted review summary" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      calls.filter((call) => call.path.endsWith("/decision")),
    ).toHaveLength(1);
  });
  it("keeps ordinary calendar functionality when the AI provider fails", async () => {
    failure = { path: "/ai/ask-data", status: 503, code: "AI_UNAVAILABLE" };
    const user = userEvent.setup();
    mount("/calendar");
    await user.click(
      await screen.findByRole("button", { name: "Who's off next week?" }),
    );
    await user.click(screen.getByRole("button", { name: "Ask the data" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Your leave question")).toHaveValue(
      "Who's off next week?",
    );
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });
  it("requires a decline comment and sends only a documented decision payload", async () => {
    profile.memberships = [
      { ...dlab, id: "manager-membership", role: "MANAGER" },
    ];
    requests = [
      {
        ...createRequest("r-dlab", dlab),
        employeeDisplayName: "Ayanda Example",
        employeeId: "other-profile",
      },
    ];
    const user = userEvent.setup();
    mount("/manager");
    await screen.findByRole("button", { name: "Approve request" });
    await user.selectOptions(screen.getByLabelText("Decision"), "DECLINE");
    await user.click(screen.getByRole("button", { name: "Decline request" }));
    expect(
      await screen.findByText("A comment is required when declining leave."),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    await user.type(
      screen.getByLabelText("Comment (required)"),
      "Coverage needed",
    );
    await user.click(screen.getByRole("button", { name: "Decline request" }));
    await screen.findByText("You're all caught up");
    expect(calls.find((call) => call.method === "POST")).toMatchObject({
      path: "/manager/leave-requests/r-dlab/decision",
      body: { decision: "DECLINE", comment: "Coverage needed" },
    });
  });
  it("lets admins approve organisation leave through the dedicated approvals page", async () => {
    profile.memberships = [{ ...dlab, id: "admin-membership", role: "ADMIN" }];
    requests = [
      {
        ...createRequest("r-admin-review", dlab),
        employeeId: "other-profile",
        employeeDisplayName: "Ayanda Example",
      },
    ];
    mount("/admin/approvals");
    expect(
      await screen.findByRole("heading", { name: "Leave approvals" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Leave approvals" }),
    ).toHaveAttribute("href", "/admin/approvals");
    await userEvent.click(
      await screen.findByRole("button", { name: "Approve request" }),
    );
    await waitFor(() => expect(requests[0].status).toBe("APPROVED"));
    expect(calls.find((call) => call.method === "POST")).toMatchObject({
      path: "/manager/leave-requests/r-admin-review/decision",
      body: { decision: "APPROVE" },
    });
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });
  it("blocks admins from approving their own leave", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    requests = [createRequest("r-own-admin", dlab)];
    mount("/admin/approvals");
    expect(
      await screen.findByText(/You cannot decide your own leave/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve request" }),
    ).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
  it("blocks self-review before a decision form can submit", async () => {
    profile.memberships = [{ ...dlab, role: "MANAGER" }];
    requests = [createRequest("r-dlab", dlab)];
    mount("/manager");
    expect(
      await screen.findByText(/You cannot decide your own leave/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve request" }),
    ).not.toBeInTheDocument();
  });
  it.each(["/manager", "/admin", "/admin/approvals", "/admin/calendar"])(
    "guards direct employee navigation to %s without fetching protected resources",
    async (path) => {
      mount(path);
      expect(
        await screen.findByRole("heading", { name: "Permission required" }),
      ).toBeInTheDocument();
      expect(
        calls.some(
          (call) =>
            call.path.startsWith("/manager") || call.path.startsWith("/admin"),
        ),
      ).toBe(false);
    },
  );
  it("switches balance scopes and exposes only active memberships", async () => {
    profile.memberships.push({
      ...membership("inactive", "org-hidden", "Hidden org", "ADMIN"),
      active: false,
    });
    const user = userEvent.setup();
    mount("/");
    await screen.findByText("15", { selector: ".balance-number" });
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "dlab",
    );
    expect(screen.getByRole("img", { name: "D-Lab logo" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Hidden org" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("YOUR ORGANISATION"),
      "org-field",
    );
    await screen.findByText("12", { selector: ".balance-number" });
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "field",
    );
    expect(
      screen.getByRole("img", { name: "The Field Institute logo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("15", { selector: ".balance-number" }),
    ).not.toBeInTheDocument();
    expect(
      calls.some((call) =>
        call.path.startsWith("/balances?organisationId=org-field"),
      ),
    ).toBe(true);
    expect(
      screen.queryByRole("link", { name: "Administration" }),
    ).not.toBeInTheDocument();
  });
  it("clears private cache data and returns to sign-in when the API expires the session", async () => {
    failure = { path: "/me", status: 401, code: "UNAUTHENTICATED" };
    const { cache } = mount("/requests");
    expect(
      await screen.findByRole("heading", { name: "Sign in to your workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your session expired. Please sign in again."),
    ).toBeInTheDocument();
    expect(cache.getQueryData(["me", "auth-employee"])).toBeUndefined();
  });
  it("renders a business-rule error and retains request inputs after a failed submission", async () => {
    failure = {
      path: "/leave-requests",
      status: 422,
      code: "INSUFFICIENT_BALANCE",
    };
    const user = userEvent.setup();
    mount("/requests/new");
    await screen.findByRole("option", { name: "Annual leave" });
    await user.selectOptions(screen.getByLabelText("Leave type"), "ANNUAL");
    await user.click(screen.getByRole("button", { name: "Submit request" }));
    expect(
      await screen.findByText(/There is not enough leave available/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Leave type")).toHaveValue("ANNUAL");
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });
  it("signs in with email/password only and proceeds to the authenticated profile", async () => {
    auth.session = null;
    auth.signIn.mockImplementation(async (credentials: unknown) => {
      expect(credentials).toEqual({
        email: "employee@example.test",
        password: "password123",
      });
      auth.session = {
        access_token: "test-access-token",
        user: { id: "auth-employee" },
      };
      auth.listener?.("SIGNED_IN", auth.session);
      return { data: { session: auth.session }, error: null };
    });
    const user = userEvent.setup();
    mount("/sign-in");
    await screen.findByRole("heading", { name: "Sign in to your workspace" });
    await user.type(
      screen.getByLabelText("Email address"),
      "employee@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Hello, Ayanda." });
    expect(auth.signIn).toHaveBeenCalledOnce();
  });
  it("loads the calendar by organisation and month and never renders private server fields", async () => {
    requests = [{ ...createRequest("r-dlab", dlab), status: "APPROVED" }];
    mount("/calendar");
    await screen.findByLabelText("Calendar month");
    fireEvent.change(screen.getByLabelText("Calendar month"), {
      target: { value: "2026-11" },
    });
    await screen.findByText("Ayanda Example — On leave");
    await userEvent.click(
      screen.getByRole("button", { name: "View leave on 02 Nov 2026" }),
    );
    expect(screen.getByText("1 person on approved leave")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View leave on 02 Nov 2026" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("PRIVATE_REASON_123")).not.toBeInTheDocument();
    expect(screen.queryByText("Annual leave")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path ===
            "/calendar-events?organisationId=org-dlab&from=2026-11-01&to=2026-11-30",
        ),
      ).toBe(true),
    );
  });
});
describe("Shared calendar privacy and inclusive boundaries", () => {
  it("includes the final day, and ignores unexpected private fields", () => {
    const event = {
      id: "event-1",
      organisationId: "org-dlab",
      requestId: "r1",
      employeeDisplayName: "Ayanda",
      title: "Ignored server title",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      allDay: true,
      reason: "PRIVATE_REASON_123",
      leaveTypeName: "Private type",
    };
    render(<MonthCalendar month="2026-11" events={[event as CalendarEvent]} />);
    expect(screen.getAllByLabelText(/Ayanda, on leave/)).toHaveLength(5);
    expect(screen.queryByText("PRIVATE_REASON_123")).not.toBeInTheDocument();
    expect(screen.queryByText("Private type")).not.toBeInTheDocument();
    expect(screen.queryByText("Ignored server title")).not.toBeInTheDocument();
  });
});

describe("Email and calendar handoff", () => {
  it("shows readable member and manager labels while submitting UUID relationships", async () => {
    const manager = {
      ...dlab,
      employeeDisplayName: "Thabo Demo",
      role: "ADMIN" as const,
    };
    profile.memberships = [manager];
    assignedMembers = [
      {
        ...dlab,
        id: "ayanda-member",
        role: "EMPLOYEE",
        employeeDisplayName: "Ayanda Demo",
        managerMembershipId: manager.id,
      },
    ];
    mount("/admin");
    await screen.findByRole("option", { name: "EMPLOYEE-Ayanda-Demo-DLB" });
    const employee = screen
      .getAllByRole("article")
      .find((card) => within(card).queryByText("EMPLOYEE-Ayanda-Demo-DLB"))!;
    expect(
      within(employee).getByText("ADMIN-Thabo-Demo-DLB"),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Account email"),
      "new@example.com",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Manager (optional)"),
      manager.id,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Assign employee access" }),
    );
    await screen.findByText(/Employee access assigned/);
    expect(
      calls.find(
        (call) => call.path === "/admin/memberships" && call.method === "POST",
      )?.body,
    ).toEqual({
      organisationId: "org-dlab",
      email: "new@example.com",
      managerMembershipId: manager.id,
    });
  });
  it("requests a reset email with a fixed same-origin redirect and no application API call", async () => {
    auth.session = null;
    mount("/forgot-password");
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "person@example.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    await screen.findByRole("heading", { name: "Check your email" });
    expect(auth.resetPassword).toHaveBeenCalledWith("person@example.com", {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(calls).toEqual([]);
  });
  it("keeps recovery request feedback neutral when an account is missing", async () => {
    auth.resetPassword.mockResolvedValue({
      error: { code: "user_not_found", message: "Private account information" },
    });
    mount("/forgot-password");
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "missing@example.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    await screen.findByRole("heading", { name: "Check your email" });
    expect(
      screen.queryByText("Private account information"),
    ).not.toBeInTheDocument();
  });
  it("blocks password updates without a recovery event, even for a signed-in account", async () => {
    mount("/reset-password");
    await screen.findByText(/This reset link is missing or has expired/);
    expect(
      screen.queryByRole("button", { name: "Update password" }),
    ).not.toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
  it("validates matching passwords, updates through Supabase, and ends the recovery session", async () => {
    auth.session = null;
    mount("/reset-password");
    await screen.findByText(/This reset link is missing or has expired/);
    await act(async () => {
      auth.session = {
        access_token: "test-access-token",
        user: { id: "auth-employee" },
      };
      auth.listener?.("PASSWORD_RECOVERY", auth.session);
    });
    await userEvent.type(
      screen.getByLabelText("New password", { exact: true }),
      "NewPassword123!",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm new password"),
      "DifferentPassword!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Update password" }),
    );
    await screen.findByText("Passwords must match.");
    expect(auth.updateUser).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await userEvent.type(
      screen.getByLabelText("Confirm new password"),
      "NewPassword123!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Update password" }),
    );
    await screen.findByRole("heading", { name: "Password updated" });
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "NewPassword123!",
    });
    expect(auth.session).toBeNull();
    expect(calls).toEqual([]);
  });
  it("routes recovery sessions away from the workspace without loading private data", async () => {
    auth.session = null;
    mount("/");
    await screen.findByRole("heading", { name: "Sign in to your workspace" });
    await act(async () => {
      auth.session = {
        access_token: "test-access-token",
        user: { id: "auth-employee" },
      };
      auth.listener?.("PASSWORD_RECOVERY", auth.session);
    });
    await screen.findByRole("heading", { name: "Reset your password" });
    expect(calls).toEqual([]);
    expect(profileWrites).toEqual([]);
  });
  it("shows a safe retry message for a failed password update", async () => {
    auth.updateUser.mockResolvedValue({
      error: new Error("PRIVATE_PROVIDER_DATA"),
    });
    mount("/reset-password");
    await screen.findByText(/This reset link is missing or has expired/);
    await act(async () => {
      auth.listener?.("PASSWORD_RECOVERY", auth.session);
    });
    await userEvent.type(
      screen.getByLabelText("New password", { exact: true }),
      "NewPassword123!",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm new password"),
      "NewPassword123!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Update password" }),
    );
    await screen.findByText(/Unable to complete the password reset/);
    expect(screen.queryByText("PRIVATE_PROVIDER_DATA")).not.toBeInTheDocument();
    expect(auth.session).not.toBeNull();
  });
  it("shows neutral email confirmation and sends signup only to Supabase", async () => {
    auth.session = null;
    mount("/sign-up");
    await userEvent.type(screen.getByLabelText("Full name"), "New Person");
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "new@example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Password", { exact: true }),
      "ExamplePassword123!",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "ExamplePassword123!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "ExamplePassword123!",
      options: {
        data: { full_name: "New Person" },
        emailRedirectTo: `${window.location.origin}/sign-in`,
      },
    });
    expect(calls).toEqual([]);
  });
  it("bootstraps a profile before displaying the no-membership state", async () => {
    profile.memberships = [];
    mount("/");
    expect(
      await screen.findByRole("heading", { name: "No active organisation" }),
    ).toBeInTheDocument();
    expect(profileWrites).toEqual([{ fullName: "Ayanda Example" }]);
    expect(calls.some((call) => call.path.startsWith("/balances"))).toBe(false);
  });
  it.each([
    ["annual-org-dlab", "Annual leave"],
    ["FAMILY_RESPONSIBILITY-org-dlab", "Family responsibility leave"],
    ["MATERNITY-org-dlab", "Maternity leave"],
    ["PARENTAL-org-dlab", "Parental leave"],
    ["RELIGIOUS-org-dlab", "Religious leave"],
  ])(
    "assigns employee membership then allocates %s",
    async (typeId, typeName) => {
      profile.memberships = [{ ...dlab, role: "ADMIN" }];
      mount("/admin");
      await screen.findByRole("heading", {
        name: "Assign organisation access",
      });
      await userEvent.type(
        screen.getByLabelText("Account email"),
        "New@Example.com",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Assign employee access" }),
      );
      await screen.findByText(/Employee access assigned/);
      expect(
        calls.find(
          (call) =>
            call.path === "/admin/memberships" && call.method === "POST",
        )?.body,
      ).toEqual({ organisationId: "org-dlab", email: "new@example.com" });
      await userEvent.selectOptions(
        screen.getByLabelText("Member", { exact: true }),
        "new-member",
      );
      await userEvent.selectOptions(
        screen.getByLabelText("Leave type"),
        typeId,
      );
      expect(
        screen.getByRole("option", { name: typeName }),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Policy year"), {
        target: { value: "2026" },
      });
      await userEvent.type(screen.getByLabelText("Allocated days"), "18.5");
      await userEvent.click(
        screen.getByRole("button", { name: "Create allocation" }),
      );
      await screen.findByText("Leave allocation created.");
      expect(
        calls.find((call) => call.path === "/admin/allocations")?.body,
      ).toEqual({
        organisationId: "org-dlab",
        membershipId: "new-member",
        leaveTypeId: typeId,
        year: 2026,
        allocatedDays: 18.5,
      });
    },
  );
  it("paginates writable calendars and saves invitations only on explicit opt-in", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    mount("/admin/calendar");
    await screen.findByRole("option", { name: /D-Lab shared/ });
    expect(
      screen.queryByRole("option", { name: /Read-only calendar/ }),
    ).not.toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(
      screen.getByRole("button", { name: "Load more calendars" }),
    );
    await screen.findByRole("option", { name: /Another calendar/ });
    await userEvent.selectOptions(
      screen.getByLabelText("Shared calendar"),
      "second-calendar",
    );
    await userEvent.click(checkbox);
    await userEvent.click(
      screen.getByRole("button", { name: "Save calendar settings" }),
    );
    await screen.findByText(/Settings saved/);
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
      calendarId: "second-calendar",
      invitationsEnabled: true,
    });
    expect(calls.find((call) => call.method === "PATCH")?.path).toBe(
      "/integrations/google/settings?organisationId=org-dlab",
    );
    expect(calls.some((call) => call.path.includes("/internal/"))).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Verify calendar access" }),
    );
    await screen.findByText(
      "Calendar access verified. No event or invitation was sent.",
    );
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
    expect(
      calls.find(
        (call) =>
          call.path === "/integrations/google/test?organisationId=org-dlab",
      )?.method,
    ).toBe("POST");
  });
  it("shows accepted notifications without claiming delivery and retries the exact job", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    google.lastSync = {
      jobId: "job-1",
      status: "FAILED",
      attemptedAt: null,
      errorCode: "GOOGLE_TEMPORARY",
      invitationStatus: "NOTIFICATIONS_REQUESTED",
      recipientCount: 4,
    };
    mount("/admin/calendar");
    expect(
      await screen.findByText(/Email delivery and acceptance are not verified/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry last sync" }),
    );
    await screen.findByText(/Retry queued/);
    expect(
      calls.find((call) => call.path === "/integrations/google/retry")?.body,
    ).toEqual({ organisationId: "org-dlab", jobId: "job-1" });
  });
  it("requires confirmation before disconnecting and handles the returned state", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    mount("/admin/calendar");
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect Google" }),
    );
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm disconnect" }),
    );
    await screen.findByText("Not connected");
    expect(calls.find((call) => call.method === "DELETE")?.path).toBe(
      "/integrations/google/disconnect?organisationId=org-dlab",
    );
  });
  it("shows configuration errors without exposing a scheduler action", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    failure = {
      path: "/integrations/google/status",
      status: 503,
      code: "GOOGLE_NOT_CONFIGURED",
    };
    mount("/admin/calendar");
    expect(
      await screen.findByText(/Google Calendar is not configured yet/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Google" }),
    ).not.toBeInTheDocument();
  });
});

describe("Handoff access and connection boundaries", () => {
  it("creates profiles from display-name metadata before loading workspace resources", async () => {
    auth.session!.user.user_metadata = { full_name: "New Person" };
    profile.fullName = "New Person";
    profile.memberships = [];
    mount("/");
    await screen.findByRole("heading", { name: "No active organisation" });
    expect(profileWrites).toEqual([{ fullName: "New Person" }]);
    expect(calls).toEqual([]);
  });
  it("does not open the workspace when email confirmation is required", async () => {
    auth.session!.user.user_metadata = { full_name: "New Person" };
    failure = {
      path: "/auth/profile",
      status: 403,
      code: "EMAIL_CONFIRMATION_REQUIRED",
    };
    mount("/");
    await screen.findByText(
      "Confirm your email before opening your workspace.",
    );
    expect(calls.some((call) => call.path.startsWith("/balances"))).toBe(false);
  });
  it("starts Google consent in the same tab with cookies and no bearer in the URL", async () => {
    const navigate = vi.fn();
    await connectGoogleCalendar("org-dlab", navigate);
    expect(navigate).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state",
    );
    expect(navigate.mock.calls[0][0]).not.toContain("test-access-token");
    expect(calls[0].path).toBe(
      "/integrations/google/connect?organisationId=org-dlab",
    );
  });
  it("shows safe callback feedback and ignores arbitrary query text", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    mount("/admin?calendarConnection=%3Cscript%3Esecret%3C%2Fscript%3E");
    expect(
      await screen.findByText(/Google connection could not be completed/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("<script>secret</script>"),
    ).not.toBeInTheDocument();
  });
  it("does not disclose an existing account through signup feedback", async () => {
    auth.session = null;
    auth.signUp.mockResolvedValue({
      data: { session: null },
      error: {
        code: "user_already_exists",
        message: "User already registered",
      },
    });
    mount("/sign-up");
    await userEvent.type(screen.getByLabelText("Full name"), "New Person");
    await userEvent.type(
      screen.getByLabelText("Email address"),
      "new@example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Password", { exact: true }),
      "ExamplePassword123!",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "ExamplePassword123!",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    await screen.findByRole("heading", { name: "Check your email" });
    expect(
      screen.queryByText("User already registered"),
    ).not.toBeInTheDocument();
  });
});

describe("Organisation-wide approval calendar readiness", () => {
  it("shows ready Google sync and organisation-only invitations before approval", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    google.calendarId = "shared-calendar";
    google.invitationsEnabled = true;
    mount("/admin/approvals");
    await screen.findByRole("heading", { name: "Organisation calendar ready" });
    expect(
      screen.getByText(
        "Invitations are enabled for confirmed active members of this organisation only.",
      ),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.path.includes("/internal/"))).toBe(false);
  });
  it("keeps approvals usable when Google is not configured", async () => {
    profile.memberships = [{ ...dlab, id: "admin-membership", role: "ADMIN" }];
    failure = {
      path: "/integrations/google/status",
      status: 503,
      code: "GOOGLE_NOT_CONFIGURED",
    };
    requests = [
      {
        ...createRequest("r-no-google", dlab),
        employeeId: "other-profile",
        employeeDisplayName: "Ayanda Example",
      },
    ];
    mount("/admin/approvals");
    await userEvent.click(
      await screen.findByRole("button", { name: "Approve request" }),
    );
    await waitFor(() => expect(requests[0].status).toBe("APPROVED"));
    expect(
      screen.getByRole("link", { name: "Manage organisation calendar" }),
    ).toHaveAttribute("href", "/admin/calendar");
  });
});
