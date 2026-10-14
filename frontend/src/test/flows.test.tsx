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
      const orgId = url.searchParams.get("organisationId");
      if (path.endsWith("/leave-types")) {
        const org = path.split("/")[2];
        return response([
          {
            id: `annual-${org}`,
            organisationId: org,
            code: "ANNUAL",
            name: "Annual leave",
          },
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
  it("collapses and expands the desktop sidebar without changing organisation", async () => {
    mount("/");
    await screen.findByRole("heading", { name: "Hello, Ayanda." });
    expect(
      screen.getByRole("img", { name: "D-Lab header logo" }),
    ).toBeInTheDocument();
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
      expect(within(nav).getAllByRole("link")).toHaveLength(4);
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        path,
      );
      expect(within(nav).getByRole("link", { name: label })).toHaveClass(
        "bottom-action",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(within(nav).getByRole("button", { name: "More" }));
      const panel = screen.getByRole("dialog", {
        name: "Workspace navigation",
      });
      expect(panel).toHaveAttribute("aria-modal", "true");
      expect(
        within(panel).getByRole("button", { name: "Close navigation panel" }),
      ).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "More" })).toHaveFocus();
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
    await screen.findByText("15");
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
    await screen.findByText("12");
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "field",
    );
    expect(
      screen.getByRole("img", { name: "The Field Institute logo" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("15")).not.toBeInTheDocument();
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
  it("assigns employee membership then creates an explicit allocation", async () => {
    profile.memberships = [{ ...dlab, role: "ADMIN" }];
    mount("/admin");
    await screen.findByRole("heading", { name: "Assign organisation access" });
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
        (call) => call.path === "/admin/memberships" && call.method === "POST",
      )?.body,
    ).toEqual({ organisationId: "org-dlab", email: "new@example.com" });
    await userEvent.selectOptions(
      screen.getByLabelText("Member", { exact: true }),
      "new-member",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Leave type"),
      "annual-org-dlab",
    );
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
      leaveTypeId: "annual-org-dlab",
      year: 2026,
      allocatedDays: 18.5,
    });
  });
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
