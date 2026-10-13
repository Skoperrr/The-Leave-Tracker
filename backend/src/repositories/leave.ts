import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';

export const requestInclude = {
  membership: { include: { organisation: true } },
  leaveType: true,
  approver: { include: { user: { select: { fullName: true } } } },
} satisfies Prisma.LeaveRequestInclude;

export type StoredRequest = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;
// Fetch related records in sequential batches: no parallel queries on one transaction
// connection, and no per-row lookup loop when history contains many requests.
export async function loadRequests(transaction: LeaveTransaction, requests: Prisma.LeaveRequestGetPayload<{}>[]): Promise<StoredRequest[]> {
  if (!requests.length) return [];
  const memberships = await transaction.membership.findMany({
    where: { id: { in: [...new Set(requests.map((entry) => entry.membershipId))] } }, include: { organisation: true },
  });
  const types = await transaction.leaveType.findMany({ where: { id: { in: [...new Set(requests.map((entry) => entry.leaveTypeId))] } } });
  const approvers = await transaction.membership.findMany({
    where: { id: { in: requests.flatMap((entry) => entry.approverMembershipId ? [entry.approverMembershipId] : []) } },
    include: { user: { select: { fullName: true } } },
  });
  const byMembership = new Map(memberships.map((entry) => [entry.id, entry]));
  const byType = new Map(types.map((entry) => [entry.id, entry]));
  const byApprover = new Map(approvers.map((entry) => [entry.id, entry]));
  return requests.map((entry) => ({ ...entry,
    membership: byMembership.get(entry.membershipId)!, leaveType: byType.get(entry.leaveTypeId)!,
    approver: entry.approverMembershipId ? byApprover.get(entry.approverMembershipId)! : null,
  }));
}
export function requestDto(request: StoredRequest) {
  return {
    id: request.id, groupId: request.groupId, membershipId: request.membershipId,
    organisationId: request.organisationId, organisationName: request.membership.organisation.name,
    leaveTypeId: request.leaveTypeId, leaveTypeName: request.leaveType.name,
    startDate: request.startDate.toISOString().slice(0, 10), endDate: request.endDate.toISOString().slice(0, 10),
    workingDays: request.workingDays, reason: request.reason, status: request.status,
    submittedAt: request.submittedAt.toISOString(), approverName: request.approver?.user.fullName ?? null,
    decidedAt: request.decidedAt?.toISOString() ?? null, decisionComment: request.decisionComment,
  };
}

export type LeaveTransaction = Prisma.TransactionClient;

export async function lockMembershipIds(transaction: LeaveTransaction, ids: string[]) {
  await transaction.$queryRaw`SELECT id FROM "Membership" WHERE id IN
    (${Prisma.join([...new Set(ids)].map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
}

export async function activeMemberships(transaction: LeaveTransaction, userId: string, organisationIds?: string[]) {
  return transaction.membership.findMany({
    where: { userId, active: true, user: { active: true }, organisation: { active: true },
      ...(organisationIds ? { organisationId: { in: organisationIds } } : {}) },
    orderBy: { organisationId: 'asc' },
  });
}

// All reservation-changing operations lock membership rows in the same order.
// READ COMMITTED then sees reservations committed by the previous lock owner.
export async function lockMemberships(transaction: LeaveTransaction, userId: string, organisationIds: string[]) {
  await transaction.$queryRaw`SELECT id FROM "Membership" WHERE "userId" = ${userId}::uuid
    AND "organisationId" IN (${Prisma.join(organisationIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR UPDATE`;
  const memberships = await activeMemberships(transaction, userId, organisationIds);
  if (memberships.length !== organisationIds.length) {
    throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active membership is required in every selected organisation');
  }
  return memberships;
}

export async function balanceUsage(transaction: LeaveTransaction, membershipId: string, leaveTypeId: string, year: number) {
  const requests = await transaction.leaveRequest.groupBy({
    by: ['status'],
    where: { membershipId, leaveTypeId, status: { in: ['PENDING', 'APPROVED'] },
      startDate: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T00:00:00.000Z`) } },
    _sum: { workingDays: true },
  });
  return {
    pendingDays: requests.find((entry) => entry.status === 'PENDING')?._sum.workingDays ?? 0,
    approvedDays: requests.find((entry) => entry.status === 'APPROVED')?._sum.workingDays ?? 0,
  };
}

export function createLeaveRepository(database: PrismaClient) {
  return {
    write<T>(operation: (transaction: LeaveTransaction) => Promise<T>): Promise<T> {
      return database.$transaction(operation, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
    },
    read<T>(operation: (transaction: LeaveTransaction) => Promise<T>): Promise<T> {
      return database.$transaction(operation, { isolationLevel: 'RepeatableRead', timeout: 30_000 });
    },
  };
}
export type LeaveRepository = ReturnType<typeof createLeaveRepository>;
