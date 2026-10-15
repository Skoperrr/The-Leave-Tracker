export type InsightsFilters = {
  organisationId: string;
  from: string;
  to: string;
  allocationYear: number;
  lowBalanceThreshold: number;
  coverageThresholdPercent: number;
};
export type InsightsResult = {
  organisationId: string;
  generatedAt: string;
  timezone: "Africa/Johannesburg";
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
