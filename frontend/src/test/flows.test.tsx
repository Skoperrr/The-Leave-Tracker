import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
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
import { AuthProvider } from "../auth/AuthProvider";
import { MonthCalendar } from "../components/MonthCalendar";
import type { CalendarEvent, LeaveRequest, Me, Membership } from "../types/api";
const auth = vi.hoisted(() => ({
  session: {
    access_token: "test-access-token",
    user: { id: "auth-employee" },
  } as { access_token: string; user: { id: string } } | null,
  listener: null as ((event: string, session: unknown) => void) | null,
  signIn: vi.fn(),
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
      if (path === "/admin/memberships")
        return response(
          profile.memberships.filter(
            (member) => member.organisationId === orgId,
          ),
        );
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
  it.each(["/manager", "/admin"])(
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
    expect(
      screen.queryByRole("option", { name: "Hidden org" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("YOUR ORGANISATION"),
      "org-field",
    );
    await screen.findByText("12");
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
