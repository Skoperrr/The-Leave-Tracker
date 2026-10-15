import { describe, expect, it } from "vitest";
import {
  aggregateInsights,
  johannesburgToday,
} from "../../src/services/insights.js";
import { fixture, input, now, ava, bongi, annual } from "./fixture.js";
describe("Day8-1.0 deterministic insights", () => {
  it("matches every hand-calculated fixture metric", () => {
    const report = aggregateInsights(fixture(), input, now);
    expect(report.summary).toEqual({
      approvedRequestCount: 2,
      pendingRequestCount: 1,
      approvedPersonDays: 3,
      upcomingApprovedPersonDays: 3,
      coverageWarningDays: 1,
      unallocatedMemberCount: 0,
    });
    expect(report.activeMemberCount).toBe(2);
    expect(report.scope).toBe("ORGANISATION");
    expect(report.monthly).toEqual([
      { month: "2026-10", approvedPersonDays: 1 },
      { month: "2026-11", approvedPersonDays: 2 },
    ]);
    expect(report.lowBalances).toEqual([
      {
        membershipId: ava,
        employeeDisplayName: "Ava",
        leaveTypeCode: "ANNUAL",
        leaveTypeName: "Annual leave",
        allocatedDays: 15,
        approvedDays: 2,
        pendingDays: 2,
        remainingDays: 11,
      },
    ]);
    expect(
      report.dailyCoverage.map((day) => [
        day.date,
        day.approvedPercent,
        day.projectedPercent,
        day.warning,
      ]),
    ).toEqual([
      ["2026-10-30", 50, 50, false],
      ["2026-11-02", 100, 100, true],
      ["2026-11-03", 0, 50, false],
      ["2026-11-04", 0, 50, false],
    ]);
    expect(report.byType).toEqual([
      {
        leaveTypeCode: "ANNUAL",
        leaveTypeName: "Annual leave",
        approvedRequestCount: 2,
        approvedWorkingDays: 3,
      },
    ]);
    expect(JSON.stringify(report)).not.toMatch(
      /email|reason|decisionComment|token|credential/i,
    );
  });
  it("deduplicates joins and person-days while retaining overlapping request-days", () => {
    const data = fixture();
    const first = data.requests[0]!;
    data.requests.push(
      first,
      { ...first, id: "legacy-overlap" },
      {
        ...data.requests[1]!,
        id: "pending-overlap",
        startDate: first.startDate,
        endDate: first.endDate,
      },
    );
    const report = aggregateInsights(data, input, now);
    expect(report.summary.approvedPersonDays).toBe(3);
    expect(report.summary.approvedRequestCount).toBe(3);
    expect(report.byType[0]!.approvedWorkingDays).toBe(5);
    expect(report.dailyCoverage[1]).toMatchObject({
      approvedPeople: 2,
      pendingPeople: 1,
      projectedPeople: 2,
    });
    expect(
      report.monthly.reduce((sum, month) => sum + month.approvedPersonDays, 0),
    ).toBe(3);
  });
  it("uses full-year balances and distinguishes missing from allocated zero", () => {
    const data = fixture();
    data.allocations = data.allocations.filter(
      (row) => row.membershipId !== bongi,
    );
    data.usage.push({
      membershipId: ava,
      leaveTypeId: annual.id,
      status: "APPROVED",
      workingDays: 5,
    });
    const report = aggregateInsights(
      data,
      { ...input, from: "2026-11-03", to: "2026-11-04" },
      now,
    );
    expect(report.lowBalances[0]!.remainingDays).toBe(6);
    expect(report.summary.unallocatedMemberCount).toBe(1);
    data.allocations.push({
      membershipId: bongi,
      leaveTypeId: annual.id,
      allocatedDays: 0,
    });
    const zero = aggregateInsights(data, input, now);
    expect(zero.summary.unallocatedMemberCount).toBe(0);
    expect(
      zero.lowBalances.find((row) => row.membershipId === bongi)?.remainingDays,
    ).toBe(-1);
  });
  it("counts distinct unallocated members across multiple required types", () => {
    const data = fixture();
    data.types.push(
      { id: "sick", code: "SICK", name: "Sick leave" },
      { id: "other", code: "OTHER", name: "Other" },
    );
    expect(
      aggregateInsights(data, input, now).summary.unallocatedMemberCount,
    ).toBe(2);
  });
  it("returns zero workforce safely and includes zero month/day buckets", () => {
    const data = fixture();
    data.members = [];
    data.role = "MANAGER";
    const report = aggregateInsights(
      data,
      { ...input, from: "2026-10-01", to: "2026-12-31" },
      now,
    );
    expect(report.scope).toBe("DIRECT_REPORTS");
    expect(report.summary.approvedPersonDays).toBe(0);
    expect(report.monthly).toHaveLength(3);
    expect(report.monthly.every((row) => row.approvedPersonDays === 0)).toBe(
      true,
    );
    expect(
      report.dailyCoverage.every(
        (row) =>
          row.approvedPercent === 0 &&
          row.projectedPercent === 0 &&
          !row.warning,
      ),
    ).toBe(true);
  });
  it("clips across year boundaries, excludes outside rows and supports weekends only", () => {
    const data = fixture();
    data.requests = [
      {
        ...data.requests[0]!,
        startDate: new Date("2026-12-31"),
        endDate: new Date("2027-01-04"),
      },
    ];
    const report = aggregateInsights(
      data,
      { ...input, from: "2026-12-31", to: "2027-01-04" },
      now,
    );
    expect(report.summary.approvedPersonDays).toBe(3);
    expect(report.monthly.map((month) => month.approvedPersonDays)).toEqual([
      1, 2,
    ]);
    expect(
      aggregateInsights(data, input, now).summary.approvedRequestCount,
    ).toBe(0);
    expect(
      aggregateInsights(
        data,
        { ...input, from: "2027-01-02", to: "2027-01-03" },
        now,
      ).dailyCoverage,
    ).toEqual([]);
  });
  it("does not create approved coverage warnings from pending alone or rounded percentages", () => {
    const data = fixture();
    data.members.push({ id: "third", employeeDisplayName: "C" });
    const report = aggregateInsights(
      data,
      { ...input, coverageThresholdPercent: 67 },
      now,
    );
    expect(report.dailyCoverage[1]).toMatchObject({
      approvedPercent: 66.7,
      warning: false,
    });
    expect(report.dailyCoverage[2]).toMatchObject({
      approvedPeople: 0,
      pendingPeople: 1,
      warning: false,
    });
  });
  it("uses Johannesburg date and returns no upcoming load for past ranges", () => {
    expect(johannesburgToday(new Date("2026-10-14T22:30:00Z"))).toBe(
      "2026-10-15",
    );
    expect(
      aggregateInsights(fixture(), input, new Date("2026-12-01")).summary
        .upcomingApprovedPersonDays,
    ).toBe(0);
  });
  it("retains archived request types, while allocation warnings only use required current types", () => {
    const data = fixture();
    data.types = [];
    const report = aggregateInsights(data, input, now);
    expect(report.byType[0]!.approvedWorkingDays).toBe(3);
    expect(report.lowBalances).toEqual([]);
    expect(report.summary.unallocatedMemberCount).toBe(0);
  });
});
