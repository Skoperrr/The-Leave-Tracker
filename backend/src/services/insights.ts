import type {
  InsightsRepository,
  InsightsSnapshot,
} from "../repositories/insights.js";
import {
  insightsQuery,
  DAY_MS,
  INSIGHTS_TIMEZONE,
  type InsightsQuery,
} from "../validators/insights.js";
import { parseDateOnly } from "../utils/dates.js";
export type InsightsResult = {
  organisationId: string;
  generatedAt: string;
  timezone: typeof INSIGHTS_TIMEZONE;
  period: { from: string; to: string };
  allocationYear: number;
  scope: "ORGANISATION" | "DIRECT_REPORTS";
  activeMemberCount: number;
  thresholds: { lowBalanceDays: number; coveragePercent: number };
  summary: {
    approvedRequestCount: number;
    pendingRequestCount: number;
    approvedPersonDays: number;
    upcomingApprovedPersonDays: number;
    coverageWarningDays: number;
    unallocatedMemberCount: number;
  };
  lowBalances: {
    membershipId: string;
    employeeDisplayName: string;
    leaveTypeCode: string;
    leaveTypeName: string;
    allocatedDays: number;
    approvedDays: number;
    pendingDays: number;
    remainingDays: number;
  }[];
  monthly: { month: string; approvedPersonDays: number }[];
  dailyCoverage: {
    date: string;
    approvedPeople: number;
    pendingPeople: number;
    projectedPeople: number;
    approvedPercent: number;
    projectedPercent: number;
    warning: boolean;
  }[];
  byType: {
    leaveTypeCode: string;
    leaveTypeName: string;
    approvedRequestCount: number;
    approvedWorkingDays: number;
  }[];
  limitations: string[];
};
export function johannesburgToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: INSIGHTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
// Insights ranges can cross years and include weekend-only windows. Reuse strict
// date parsing, but not the submission helper that forbids those valid reports.
export function insightWeekdays(from: string, to: string): string[] {
  const dates: string[] = [];
  for (
    let time = parseDateOnly(from).getTime(), end = parseDateOnly(to).getTime();
    time <= end;
    time += DAY_MS
  ) {
    const day = new Date(time);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6)
      dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}
export function aggregateInsights(
  snapshot: InsightsSnapshot,
  input: InsightsQuery,
  now: Date,
): InsightsResult {
  const today = johannesburgToday(now);
  const members = [
    ...new Map(snapshot.members.map((member) => [member.id, member])).values(),
  ];
  const memberIds = new Set(members.map((member) => member.id));
  const days = insightWeekdays(input.from, input.to);
  const daily = new Map(
    days.map((date) => [
      date,
      { approved: new Set<string>(), pending: new Set<string>() },
    ]),
  );
  const monthly = new Map<string, number>();
  const startMonth = parseDateOnly(input.from);
  startMonth.setUTCDate(1);
  for (
    const month = startMonth;
    month <= parseDateOnly(input.to);
    month.setUTCMonth(month.getUTCMonth() + 1)
  )
    monthly.set(month.toISOString().slice(0, 7), 0);
  const approvedIds = new Set<string>(),
    pendingIds = new Set<string>();
  const types = new Map<
    string,
    {
      leaveTypeCode: string;
      leaveTypeName: string;
      approvedRequestCount: number;
      approvedWorkingDays: number;
    }
  >();
  for (const request of new Map(
    snapshot.requests.map((request) => [request.id, request]),
  ).values()) {
    if (!memberIds.has(request.membershipId)) continue;
    const start = request.startDate.toISOString().slice(0, 10),
      end = request.endDate.toISOString().slice(0, 10);
    if (
      start > input.to ||
      end < input.from ||
      !["APPROVED", "PENDING"].includes(request.status)
    )
      continue;
    const approved = request.status === "APPROVED";
    (approved ? approvedIds : pendingIds).add(request.id);
    const dates = insightWeekdays(
      start < input.from ? input.from : start,
      end > input.to ? input.to : end,
    );
    for (const date of dates)
      daily
        .get(date)!
        [approved ? "approved" : "pending"].add(request.membershipId);
    if (approved) {
      const bucket = types.get(request.leaveTypeId) ?? {
        leaveTypeCode: request.leaveType.code,
        leaveTypeName: request.leaveType.name,
        approvedRequestCount: 0,
        approvedWorkingDays: 0,
      };
      bucket.approvedRequestCount++;
      bucket.approvedWorkingDays += dates.length;
      types.set(request.leaveTypeId, bucket);
    }
  }
  let approvedPersonDays = 0,
    upcomingApprovedPersonDays = 0;
  const headcount = members.length;
  const dailyCoverage = [...daily].map(([date, sets]) => {
    const approvedPeople = sets.approved.size,
      pendingPeople = sets.pending.size;
    const projectedPeople = new Set([...sets.approved, ...sets.pending]).size;
    const percent = headcount ? (approvedPeople / headcount) * 100 : 0;
    approvedPersonDays += approvedPeople;
    if (date >= today) upcomingApprovedPersonDays += approvedPeople;
    monthly.set(
      date.slice(0, 7),
      monthly.get(date.slice(0, 7))! + approvedPeople,
    );
    return {
      date,
      approvedPeople,
      pendingPeople,
      projectedPeople,
      approvedPercent: Math.round(percent * 10) / 10,
      projectedPercent: headcount
        ? Math.round((projectedPeople / headcount) * 1000) / 10
        : 0,
      warning: headcount > 0 && percent >= input.coverageThresholdPercent,
    };
  });
  const allocationByKey = new Map(
    snapshot.allocations.map((row) => [
      `${row.membershipId}|${row.leaveTypeId}`,
      row.allocatedDays,
    ]),
  );
  const usageByKey = new Map<string, { approved: number; pending: number }>();
  for (const row of snapshot.usage) {
    const key = `${row.membershipId}|${row.leaveTypeId}`;
    const value = usageByKey.get(key) ?? { approved: 0, pending: 0 };
    if (row.status === "APPROVED") value.approved += row.workingDays;
    if (row.status === "PENDING") value.pending += row.workingDays;
    usageByKey.set(key, value);
  }
  const unallocated = new Set<string>();
  const lowBalances: InsightsResult["lowBalances"] = [];
  for (const member of members)
    for (const type of snapshot.types) {
      const key = `${member.id}|${type.id}`,
        allocation = allocationByKey.get(key);
      if (allocation === undefined) {
        unallocated.add(member.id);
        continue;
      }
      const usage = usageByKey.get(key) ?? { approved: 0, pending: 0 };
      const remainingDays =
        Math.round((allocation - usage.approved - usage.pending) * 100) / 100;
      if (remainingDays <= input.lowBalanceThreshold)
        lowBalances.push({
          membershipId: member.id,
          employeeDisplayName: member.employeeDisplayName,
          leaveTypeCode: type.code,
          leaveTypeName: type.name,
          allocatedDays: allocation,
          approvedDays: usage.approved,
          pendingDays: usage.pending,
          remainingDays,
        });
    }
  lowBalances.sort(
    (a, b) =>
      a.remainingDays - b.remainingDays ||
      a.employeeDisplayName.localeCompare(b.employeeDisplayName) ||
      a.leaveTypeCode.localeCompare(b.leaveTypeCode) ||
      a.membershipId.localeCompare(b.membershipId),
  );
  return {
    organisationId: input.organisationId,
    generatedAt: now.toISOString(),
    timezone: INSIGHTS_TIMEZONE,
    period: { from: input.from, to: input.to },
    allocationYear: input.allocationYear,
    scope: snapshot.role === "ADMIN" ? "ORGANISATION" : "DIRECT_REPORTS",
    activeMemberCount: headcount,
    thresholds: {
      lowBalanceDays: input.lowBalanceThreshold,
      coveragePercent: input.coverageThresholdPercent,
    },
    summary: {
      approvedRequestCount: approvedIds.size,
      pendingRequestCount: pendingIds.size,
      approvedPersonDays,
      upcomingApprovedPersonDays,
      coverageWarningDays: dailyCoverage.filter((day) => day.warning).length,
      unallocatedMemberCount: unallocated.size,
    },
    lowBalances,
    monthly: [...monthly].map(([month, approvedPersonDays]) => ({
      month,
      approvedPersonDays,
    })),
    dailyCoverage,
    byType: [...types.values()].sort((a, b) =>
      a.leaveTypeCode.localeCompare(b.leaveTypeCode),
    ),
    limitations: [
      "Scope uses the currently active workforce, including for historical periods; historical headcount snapshots are unavailable.",
      "Weekdays only; public holidays, shifts, half days and required staffing levels are not modelled.",
      "Coverage warnings indicate potential coverage pressure, not confirmed understaffing. Pending leave is projected only.",
      "Balances use full-year persisted approved and pending usage; missing allocations are not zero entitlement.",
      "Approved person-days deduplicate people and dates. Request-days by type count each request separately; legacy overlaps can make these totals differ.",
      "Low-balance and coverage thresholds are planning settings, not HR policy.",
    ],
  };
}
export function createInsightsService(repository: InsightsRepository) {
  return {
    async report(
      actorUserId: string,
      query: InsightsQuery,
    ): Promise<InsightsResult> {
      const input = insightsQuery.parse(query);
      const now = new Date();
      return aggregateInsights(
        await repository.snapshot(actorUserId, input),
        input,
        now,
      );
    },
  };
}
export type InsightsService = ReturnType<typeof createInsightsService>;
