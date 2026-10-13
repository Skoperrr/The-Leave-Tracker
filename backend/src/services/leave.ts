import type { LeaveRepository } from '../repositories/leave.js';
import { activeMemberships, balanceUsage, lockMemberships, requestDto, loadRequests } from '../repositories/leave.js';
import type { CreateLeave, HistoryQuery } from '../validators/leave.js';
import { calculateWorkingDays, currentPolicyYear, parseDateOnly } from '../utils/dates.js';
import { ApiError } from '../utils/api-error.js';

export function createLeaveService(repository: LeaveRepository) {
  return {
    balances(userId: string, organisationId: string, year = currentPolicyYear()) {
      return repository.read(async (transaction) => {
        const [membership] = await activeMemberships(transaction, userId, [organisationId]);
        if (!membership) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
        const allocations = await transaction.leaveBalance.findMany({
          where: { membershipId: membership.id, year, leaveType: { active: true } }, orderBy: { leaveTypeId: 'asc' },
        });
        const results = [];
        for (const allocation of allocations) {
          const usage = await balanceUsage(transaction, membership.id, allocation.leaveTypeId, year);
          results.push({ membershipId: membership.id, leaveTypeId: allocation.leaveTypeId, year,
            allocatedDays: allocation.allocatedDays.toNumber(), ...usage,
            remainingDays: allocation.allocatedDays.minus(usage.approvedDays).minus(usage.pendingDays).toNumber() });
        }
        return results;
      });
    },
    create(userId: string, input: CreateLeave) {
      const startDate = parseDateOnly(input.startDate);
      const endDate = parseDateOnly(input.endDate);
      const workingDays = calculateWorkingDays(startDate, endDate);
      const year = startDate.getUTCFullYear();
      return repository.write(async (transaction) => {
        const memberships = await lockMemberships(transaction, userId, input.organisationIds);
        const selections = [];
        for (const membership of memberships) {
          const leaveType = await transaction.leaveType.findUnique({ where: {
            organisationId_code: { organisationId: membership.organisationId, code: input.leaveTypeCode },
          } });
          if (!leaveType?.active) throw new ApiError(404, 'NOT_FOUND', 'An active leave type was not found in a selected organisation');
          const overlap = await transaction.leaveRequest.findFirst({ where: {
            membershipId: membership.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate },
          }, select: { id: true } });
          if (overlap) throw new ApiError(409, 'OVERLAPPING_REQUEST', 'The dates overlap an active request in a selected organisation');
          if (leaveType.balanceLimited) {
            const allocation = await transaction.leaveBalance.findUnique({ where: {
              membershipId_leaveTypeId_year: { membershipId: membership.id, leaveTypeId: leaveType.id, year },
            } });
            const usage = await balanceUsage(transaction, membership.id, leaveType.id, year);
            const remaining = allocation?.allocatedDays.minus(usage.approvedDays).minus(usage.pendingDays);
            if (!remaining || remaining.lessThan(workingDays)) throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'Not enough leave remaining', {
              organisationId: membership.organisationId, requestedDays: workingDays, remainingDays: remaining?.toNumber() ?? 0,
            });
          }
          selections.push({ membership, leaveType });
        }
        const group = selections.length > 1 ? await transaction.leaveGroup.create({ data: { userId } }) : null;
        const requests = [];
        for (const { membership, leaveType } of selections) {
          const request = await transaction.leaveRequest.create({ data: {
            membershipId: membership.id, organisationId: membership.organisationId, userId, leaveTypeId: leaveType.id,
            groupId: group?.id ?? null, startDate, endDate, workingDays, reason: input.reason || null,
          } });
          await transaction.auditLog.create({ data: { organisationId: membership.organisationId, actorUserId: userId,
            action: 'REQUEST_SUBMITTED', entityType: 'LeaveRequest', entityId: request.id, metadata: { workingDays } } });
          requests.push(request);
        }
        // Preserve the selected organisation ordering for predictable frontend rendering.
        const result = (await loadRequests(transaction, requests)).map(requestDto);
        result.sort((a, b) => input.organisationIds.indexOf(a.organisationId) - input.organisationIds.indexOf(b.organisationId));
        return { groupId: group?.id ?? null, requests: result };
      });
    },
    history(userId: string, input: HistoryQuery) {
      return repository.read(async (transaction) => {
        const memberships = await activeMemberships(transaction, userId, input.organisationId ? [input.organisationId] : undefined);
        if (input.organisationId && !memberships.length) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
        const where = { userId, membershipId: { in: memberships.map((entry) => entry.id) }, ...(input.status ? { status: input.status } : {}) };
        const total = await transaction.leaveRequest.count({ where });
        const requests = await transaction.leaveRequest.findMany({ where,
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], skip: (input.page - 1) * input.pageSize, take: input.pageSize });
        return { data: (await loadRequests(transaction, requests)).map(requestDto), meta: { page: input.page, pageSize: input.pageSize, total } };
      });
    },
    cancel(userId: string, id: string) {
      return repository.write(async (transaction) => {
        const request = await transaction.leaveRequest.findFirst({ where: { id, userId }, select: { organisationId: true } });
        if (!request) throw new ApiError(404, 'NOT_FOUND', 'Leave request not found');
        await lockMemberships(transaction, userId, [request.organisationId]);
        const result = await transaction.leaveRequest.updateMany({ where: { id, userId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
        if (!result.count) throw new ApiError(409, 'STATUS_CONFLICT', 'Only pending requests can be cancelled');
        await transaction.auditLog.create({ data: { organisationId: request.organisationId, actorUserId: userId,
          action: 'REQUEST_CANCELLED', entityType: 'LeaveRequest', entityId: id, metadata: { previousStatus: 'PENDING' } } });
        const stored = await transaction.leaveRequest.findUniqueOrThrow({ where: { id } });
        return requestDto((await loadRequests(transaction, [stored]))[0]!);
      });
    },
  };
}
export type LeaveService = ReturnType<typeof createLeaveService>;
