import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Insights } from "../pages/Insights";
import { InsightsReport } from "../components/insights/InsightsReport";
import {
  defaultInsightsFilters,
  parseInsightsFilters,
} from "../components/insights/filters";
import { ApiClientError } from "../api/errors";
import type { InsightsResult } from "../types/insights";
const state = vi.hoisted(() => ({
  role: "ADMIN",
  org: "org-a",
  fetch: vi.fn(),
}));
vi.mock("../auth/OrganizationProvider", () => ({
  useOrganisation: () => ({
    membership: {
      id: "member-" + state.org,
      role: state.role,
      organisationId: state.org,
      organisationName: state.org === "org-a" ? "D-Lab" : "The Field Institute",
    },
  }),
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "user-a" } } }),
}));
vi.mock("../api/insights", () => ({ fetchInsights: state.fetch }));
function result(org = "org-a"): InsightsResult {
  return {
    organisationId: org,
    generatedAt: "2026-10-15T10:00:00Z",
    timezone: "Africa/Johannesburg",
    period: { from: "2026-10-30", to: "2026-11-04" },
    allocationYear: 2026,
    scope: "ORGANISATION",
    activeMemberCount: 2,
    thresholds: { lowBalanceDays: 12, coveragePercent: 75 },
    summary: {
      approvedRequestCount: 2,
      pendingRequestCount: 1,
      approvedPersonDays: 3,
      upcomingApprovedPersonDays: 3,
      coverageWarningDays: 1,
      unallocatedMemberCount: 1,
    },
    lowBalances: [
      {
        membershipId: "member-ava",
        employeeDisplayName: "Ava",
        leaveTypeCode: "ANNUAL",
        leaveTypeName: "Annual leave",
        allocatedDays: 15,
        approvedDays: 2,
        pendingDays: 2,
        remainingDays: 11,
      },
    ],
    monthly: [
      { month: "2026-10", approvedPersonDays: 1 },
      { month: "2026-11", approvedPersonDays: 2 },
    ],
    dailyCoverage: [
      {
        date: "2026-11-02",
        approvedPeople: 2,
        pendingPeople: 0,
        projectedPeople: 2,
        approvedPercent: 100,
        projectedPercent: 100,
        warning: true,
      },
    ],
    byType: [
      {
        leaveTypeCode: "ANNUAL",
        leaveTypeName: "Annual leave",
        approvedRequestCount: 2,
        approvedWorkingDays: 3,
      },
    ],
    limitations: ["Current active workforce only."],
  };
}
function mount() {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const tree = () => (
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <Insights />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { cache, ...view, refresh: () => view.rerender(tree()) };
}
beforeEach(() => {
  state.org = "org-a";
  state.role = "ADMIN";
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (filters) => ({
    data: result(filters.organisationId),
  }));
});
describe("Insights feature UI and stale scope boundaries", () => {
  it("shows units, workforce denominator, missing allocations, zero-baseline chart and table alternatives", async () => {
    mount();
    await screen.findByText("Ava");
    expect(screen.getByText("2 currently active members")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Approved request-days by leave type",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 members missing allocations"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Scale zero to 2/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("View monthly data table"));
    expect(
      screen.getByRole("table", { name: "Monthly approved person-days" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review coverage")).toBeInTheDocument();
    expect(state.fetch.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
  it("validates edits and fetches only on valid Apply filters", async () => {
    mount();
    await screen.findByText("Ava");
    const before = state.fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-11-05" },
    });
    fireEvent.change(screen.getByLabelText("To date inclusive"), {
      target: { value: "2026-10-01" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("1 to 366");
    expect(state.fetch).toHaveBeenCalledTimes(before);
    fireEvent.change(screen.getByLabelText("To date inclusive"), {
      target: { value: "2026-11-30" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Apply filters" }),
    );
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(before + 1));
    expect(state.fetch.mock.calls.at(-1)![0]).toMatchObject({
      from: "2026-11-05",
      to: "2026-11-30",
      organisationId: "org-a",
    });
  });
  it("hides previous organisation results and aborts outstanding requests", async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    const signals = new Map<string, AbortSignal>();
    state.fetch.mockImplementation((filters, signal) => {
      signals.set(filters.organisationId, signal);
      return new Promise((resolve) =>
        resolvers.set(filters.organisationId, resolve),
      );
    });
    const view = mount();
    await waitFor(() => expect(resolvers.has("org-a")).toBe(true));
    state.org = "org-b";
    view.refresh();
    await waitFor(() => expect(resolvers.has("org-b")).toBe(true));
    expect(signals.get("org-a")!.aborted).toBe(true);
    resolvers.get("org-a")!({ data: result("org-a") });
    expect(screen.queryByText("Ava")).not.toBeInTheDocument();
    const next = result("org-b");
    next.lowBalances[0]!.employeeDisplayName = "Bongi";
    resolvers.get("org-b")!({ data: next });
    await screen.findByText("Bongi");
    expect(screen.queryByText("Ava")).not.toBeInTheDocument();
  });
  it("keeps insights under the leave refresh cache prefix", async () => {
    const view = mount();
    await screen.findByText("Ava");
    const key = view.cache.getQueryCache().getAll()[0]!.queryKey;
    expect(key.slice(0, 4)).toEqual(["api", "user-a", "insights", "org-a"]);
    const before = state.fetch.mock.calls.length;
    await view.cache.invalidateQueries({
      queryKey: ["api", "user-a"],
      refetchType: "all",
    });
    expect(state.fetch.mock.calls.length).toBe(before + 1);
  });
  it("denies employees without querying and keeps no-key behaviour independent of AI", async () => {
    state.role = "EMPLOYEE";
    mount();
    expect(
      screen.getByRole("heading", { name: "Permission required" }),
    ).toBeInTheDocument();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("renders honest zero-workforce and weekend-only explanations", () => {
    const report = result();
    report.activeMemberCount = 0;
    report.dailyCoverage = [];
    report.lowBalances = [];
    report.byType = [];
    report.summary.approvedPersonDays = 0;
    report.summary.coverageWarningDays = 0;
    render(<InsightsReport report={report} />);
    expect(screen.getByText(/No eligible active members/)).toBeInTheDocument();
    expect(
      screen.getByText("The selected period contains no weekdays."),
    ).toBeInTheDocument();
  });
  it("renders untrusted names as escaped text", async () => {
    const report = result();
    report.lowBalances[0]!.employeeDisplayName = "<img src=x onerror=alert(1)>";
    state.fetch.mockResolvedValue({ data: report });
    mount();
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });
  it.each([
    [401, "UNAUTHENTICATED", /session has expired/],
    [403, "FORBIDDEN", /do not have permission/],
    [0, "SERVER_UNAVAILABLE", /cannot reach the leave server/],
  ] as const)(
    "shows existing error feedback for status %s without report data",
    async (status, code, message) => {
      state.fetch.mockRejectedValue(
        new ApiClientError(status, code, "Request failed"),
      );
      mount();
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.queryByText("Ava")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
    },
  );
  it("does not reuse organisation-wide cache after a role change", async () => {
    const view = mount();
    await screen.findByText("Ava");
    state.role = "MANAGER";
    state.fetch.mockImplementation(() => new Promise(() => {}));
    view.refresh();
    await screen.findByText(/Loading scoped leave insights/);
    expect(screen.queryByText("Ava")).not.toBeInTheDocument();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
  });
  it("does not display a mismatched server scope", async () => {
    state.fetch.mockResolvedValue({ data: result("org-other") });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "different organisation",
    );
    expect(screen.queryByText("Ava")).not.toBeInTheDocument();
  });
});
describe("Insights default and strict client filters", () => {
  it("uses Johannesburg date through the next 30 days", () => {
    expect(
      defaultInsightsFilters(new Date("2026-10-14T22:30:00Z")),
    ).toMatchObject({
      from: "2026-10-15",
      to: "2026-11-14",
      allocationYear: "2026",
    });
  });
  it("rejects impossible dates and invalid thresholds", () => {
    const defaults = defaultInsightsFilters(new Date("2026-10-15"));
    for (const changes of [
      { from: "2026-02-30" },
      { allocationYear: "" },
      { lowBalanceThreshold: "3.5" },
      { coverageThresholdPercent: "101" },
    ])
      expect(
        typeof parseInsightsFilters({ ...defaults, ...changes }, "org-a"),
      ).toBe("string");
  });
});
