import { z } from "zod";
const period = z.object({ from: z.string(), to: z.string() });
const fact = z.object({
  id: z.string(),
  kind: z.enum(["OVERVIEW", "CLASH", "COVERAGE", "WAITING", "PAST_START"]),
  text: z.string(),
  requestIds: z.array(z.string()),
  date: z.string().nullable(),
});
const source = z.object({
  id: z.string().optional(),
  requestId: z.string().optional(),
  employeeDisplayName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(["PENDING", "APPROVED"]).optional(),
});
const balance = z.object({
  leaveTypeName: z.string(),
  year: z.number(),
  allocatedDays: z.number(),
  approvedDays: z.number(),
  pendingDays: z.number(),
  remainingDays: z.number(),
});
export const managerSummarySchema = z.object({
  referenceDate: z.string(),
  generatedAt: z.string(),
  timezone: z.literal("Africa/Johannesburg"),
  period,
  scope: z.enum(["ORGANISATION_REVIEW", "DIRECT_REPORTS"]),
  activeMemberCount: z.number(),
  pendingCount: z.number(),
  approvedCount: z.number(),
  summary: z.string(),
  highlights: z.array(fact),
  attention: z.array(fact),
  sources: z.array(source),
  aiUsed: z.boolean(),
  coverageThresholdPercent: z.number(),
  limitations: z.array(z.string()),
});
export const askDataSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("NEEDS_CLARIFICATION"),
    questions: z.array(z.string()),
    referenceDate: z.string(),
    generatedAt: z.string(),
  }),
  z.object({
    status: z.literal("ANSWER"),
    intent: z.enum(["WHO_OFF", "COUNT_OFF", "PENDING_REQUESTS", "MY_BALANCE"]),
    scope: z.string(),
    period: period.nullable().optional(),
    answer: z.string(),
    rows: z.array(source),
    balances: z.array(balance),
    referenceDate: z.string(),
    generatedAt: z.string(),
    interpretation: z.string().optional(),
    limitations: z.array(z.string()).optional(),
  }),
]);
export type ManagerSummary = z.infer<typeof managerSummarySchema>;
export type AskDataResult = z.infer<typeof askDataSchema>;
