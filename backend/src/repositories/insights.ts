import type { PrismaClient, Role } from "../generated/prisma/client.js";
import type { InsightsQuery } from "../validators/insights.js";
import { parseDateOnly } from "../utils/dates.js";
import { ApiError } from "../utils/api-error.js";
export type InsightMember = { id: string; employeeDisplayName: string };
export type InsightType = { id: string; code: string; name: string };
export type InsightRequest = {
  id: string;
  membershipId: string;
  leaveTypeId: string;
  status: "APPROVED" | "PENDING";
  startDate: Date;
  endDate: Date;
  leaveType: InsightType;
};
export type InsightsSnapshot = {
  role: Extract<Role, "ADMIN" | "MANAGER">;
  members: InsightMember[];
  types: InsightType[];
  allocations: {
    membershipId: string;
    leaveTypeId: string;
    allocatedDays: number;
  }[];
  usage: {
    membershipId: string;
    leaveTypeId: string;
    status: "APPROVED" | "PENDING";
    workingDays: number;
  }[];
  requests: InsightRequest[];
};
export interface InsightsRepository {
  snapshot(
    actorUserId: string,
    input: InsightsQuery,
  ): Promise<InsightsSnapshot>;
}
export function createInsightsRepository(
  database: PrismaClient,
): InsightsRepository {
  return {
    snapshot(actorUserId, input) {
      return database.$transaction(
        async (tx) => {
          // Recheck current membership inside the same snapshot as the metric queries.
          const actor = await tx.membership.findFirst({
            where: {
              userId: actorUserId,
              organisationId: input.organisationId,
              active: true,
              user: { active: true },
              organisation: { active: true },
            },
            select: { id: true, role: true },
          });
          if (!actor || (actor.role !== "ADMIN" && actor.role !== "MANAGER"))
            throw new ApiError(
              403,
              "FORBIDDEN",
              "Insights require active manager or admin access in this organisation",
            );
          const storedMembers = await tx.membership.findMany({
            where: {
              organisationId: input.organisationId,
              active: true,
              user: { active: true },
              organisation: { active: true },
              ...(actor.role === "MANAGER"
                ? { managerMembershipId: actor.id, id: { not: actor.id } }
                : {}),
            },
            select: { id: true, user: { select: { fullName: true } } },
            orderBy: { id: "asc" },
          });
          const members = storedMembers.map((member) => ({
            id: member.id,
            employeeDisplayName: member.user.fullName,
          }));
          const memberIds = members.map((member) => member.id);
          const types = await tx.leaveType.findMany({
            where: {
              organisationId: input.organisationId,
              active: true,
              balanceLimited: true,
            },
            select: { id: true, code: true, name: true },
            orderBy: { code: "asc" },
          });
          if (!memberIds.length)
            return {
              role: actor.role,
              members,
              types,
              requests: [],
              allocations: [],
              usage: [],
            };
          const requests = await tx.leaveRequest.findMany({
            where: {
              organisationId: input.organisationId,
              membershipId: { in: memberIds },
              status: { in: ["APPROVED", "PENDING"] },
              startDate: { lte: parseDateOnly(input.to) },
              endDate: { gte: parseDateOnly(input.from) },
            },
            select: {
              id: true,
              membershipId: true,
              leaveTypeId: true,
              status: true,
              startDate: true,
              endDate: true,
              leaveType: { select: { id: true, code: true, name: true } },
            },
            orderBy: { id: "asc" },
          });
          const allocations = await tx.leaveBalance.findMany({
            where: {
              organisationId: input.organisationId,
              membershipId: { in: memberIds },
              leaveTypeId: { in: types.map((type) => type.id) },
              year: input.allocationYear,
            },
            select: {
              membershipId: true,
              leaveTypeId: true,
              allocatedDays: true,
            },
          });
          // One grouped annual query, not one query for each employee/type.
          const usage = await tx.leaveRequest.groupBy({
            by: ["membershipId", "leaveTypeId", "status"],
            where: {
              organisationId: input.organisationId,
              membershipId: { in: memberIds },
              leaveTypeId: { in: types.map((type) => type.id) },
              status: { in: ["APPROVED", "PENDING"] },
              startDate: {
                gte: parseDateOnly(`${input.allocationYear}-01-01`),
                lte: parseDateOnly(`${input.allocationYear}-12-31`),
              },
            },
            _sum: { workingDays: true },
          });
          return {
            role: actor.role,
            members,
            types,
            requests: requests.map((request) => ({
              ...request,
              status: request.status as "APPROVED" | "PENDING",
            })),
            allocations: allocations.map((allocation) => ({
              ...allocation,
              allocatedDays: allocation.allocatedDays.toNumber(),
            })),
            usage: usage.map((row) => ({
              membershipId: row.membershipId,
              leaveTypeId: row.leaveTypeId,
              status: row.status as "APPROVED" | "PENDING",
              workingDays: row._sum.workingDays ?? 0,
            })),
          };
        },
        { isolationLevel: "RepeatableRead", timeout: 30_000 },
      );
    },
  };
}
