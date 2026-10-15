import { randomUUID } from "node:crypto";
import type { InsightsSnapshot } from "../../src/repositories/insights.js";
import { insightsQuery } from "../../src/validators/insights.js";
export const org = randomUUID();
export const annual = {
  id: randomUUID(),
  code: "ANNUAL",
  name: "Annual leave",
};
export const ava = randomUUID(),
  bongi = randomUUID();
export const input = insightsQuery.parse({
  organisationId: org,
  from: "2026-10-30",
  to: "2026-11-04",
  allocationYear: 2026,
  lowBalanceThreshold: 12,
  coverageThresholdPercent: 75,
});
export function fixture(): InsightsSnapshot {
  return {
    role: "ADMIN",
    members: [
      { id: ava, employeeDisplayName: "Ava" },
      { id: bongi, employeeDisplayName: "Bongi" },
    ],
    types: [annual],
    allocations: [ava, bongi].map((membershipId) => ({
      membershipId,
      leaveTypeId: annual.id,
      allocatedDays: 15,
    })),
    usage: [
      {
        membershipId: ava,
        leaveTypeId: annual.id,
        status: "APPROVED",
        workingDays: 2,
      },
      {
        membershipId: ava,
        leaveTypeId: annual.id,
        status: "PENDING",
        workingDays: 2,
      },
      {
        membershipId: bongi,
        leaveTypeId: annual.id,
        status: "APPROVED",
        workingDays: 1,
      },
    ],
    requests: [
      {
        id: randomUUID(),
        membershipId: ava,
        leaveTypeId: annual.id,
        leaveType: annual,
        status: "APPROVED",
        startDate: new Date("2026-10-30"),
        endDate: new Date("2026-11-02"),
      },
      {
        id: randomUUID(),
        membershipId: ava,
        leaveTypeId: annual.id,
        leaveType: annual,
        status: "PENDING",
        startDate: new Date("2026-11-03"),
        endDate: new Date("2026-11-04"),
      },
      {
        id: randomUUID(),
        membershipId: bongi,
        leaveTypeId: annual.id,
        leaveType: annual,
        status: "APPROVED",
        startDate: new Date("2026-11-02"),
        endDate: new Date("2026-11-02"),
      },
    ],
  };
}
export const now = new Date("2026-10-15T10:00:00Z");
