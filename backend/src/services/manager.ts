import { activeMemberships, balanceUsage, loadRequests, lockMembershipIds, requestDto, type LeaveRepository } from '../repositories/leave.js';
import type { ManagerQuery, Decision, CalendarQuery } from '../validators/manager.js';
import { calculateWorkingDays, parseDateOnly } from '../utils/dates.js';
import { ApiError } from '../utils/api-error.js';
import { enqueueCalendarEvent } from './calendar-integration.js';

export function createManagerService(repository: LeaveRepository) {
  return {
    queue(actorUserId: string, input: ManagerQuery) {
      return repository.read(async (transaction) => {
        const [actor] = await activeMemberships(transaction, actorUserId, [input.organisationId]);
        if (!actor || !['MANAGER', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Manager or admin membership is required in this organisation');
        const where = { organisationId: input.organisationId, userId: { not: actorUserId }, status: input.status,
          membership: { active: true, user: { active: true }, ...(actor.role === 'MANAGER' ? { managerMembershipId: actor.id } : {}) } };
        const total = await transaction.leaveRequest.count({ where });
        const requests = await transaction.leaveRequest.findMany({ where, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          skip: (input.page - 1) * input.pageSize, take: input.pageSize });
        const loaded = await loadRequests(transaction, requests);
        const users = await transaction.user.findMany({ where: { id: { in: requests.map((entry) => entry.userId) } }, select: { id: true, fullName: true } });
        const byId = new Map(users.map((entry) => [entry.id, entry.fullName]));
        return { data: loaded.map((entry) => ({ ...requestDto(entry), employeeId: entry.userId, employeeDisplayName: byId.get(entry.userId)! })),
          meta: { page: input.page, pageSize: input.pageSize, total } };
      });
    },
    decide(actorUserId: string, id: string, input: Decision) {
      return repository.write(async (transaction) => {
        const memberships = (await activeMemberships(transaction, actorUserId)).filter((entry) => ['MANAGER', 'ADMIN'].includes(entry.role));
        const initial = await transaction.leaveRequest.findFirst({ where: { id, organisationId: { in: memberships.map((entry) => entry.organisationId) } } });
        if (!initial) throw new ApiError(404, 'NOT_FOUND', 'Leave request not found');
        if (initial.userId === actorUserId) throw new ApiError(403, 'FORBIDDEN', 'You cannot decide your own leave request');
        const initialActor = memberships.find((entry) => entry.organisationId === initial.organisationId)!;
        await lockMembershipIds(transaction, [initial.membershipId, initialActor.id]);
        // Re-read roles, assignment and status after waiting for concurrent changes.
        const [actor] = await activeMemberships(transaction, actorUserId, [initial.organisationId]);
        const [owner] = await activeMemberships(transaction, initial.userId, [initial.organisationId]);
        if (!actor || !['MANAGER', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Manager or admin membership is required');
        if (!owner || (actor.role === 'MANAGER' && owner.managerMembershipId !== actor.id)) throw new ApiError(404, 'NOT_FOUND', 'Leave request not found');
        const request = await transaction.leaveRequest.findUniqueOrThrow({ where: { id } });
        if (request.status !== 'PENDING') throw new ApiError(409, 'STATUS_CONFLICT', 'This request is no longer pending');
        if (input.decision === 'DECLINE' && !input.comment?.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'A decline comment is required');
        if (input.decision === 'APPROVE') {
          const workingDays = calculateWorkingDays(request.startDate, request.endDate);
          if (workingDays !== request.workingDays) throw new ApiError(409, 'STATUS_CONFLICT', 'Stored working days do not match the leave policy');
          const type = await transaction.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });
          if (!type.active) throw new ApiError(409, 'STATUS_CONFLICT', 'The leave type is no longer active');
          const overlap = await transaction.leaveRequest.findFirst({ where: { id: { not: id }, membershipId: owner.id,
            status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: request.endDate }, endDate: { gte: request.startDate } }, select: { id: true } });
          if (overlap) throw new ApiError(409, 'OVERLAPPING_REQUEST', 'Another active request overlaps these dates');
          if (type.balanceLimited) {
            const year = request.startDate.getUTCFullYear();
            const allocation = await transaction.leaveBalance.findUnique({ where: { membershipId_leaveTypeId_year: { membershipId: owner.id, leaveTypeId: type.id, year } } });
            const usage = await balanceUsage(transaction, owner.id, type.id, year);
            // Current pending days already reserve this request; do not subtract it twice.
            if (!allocation || allocation.allocatedDays.lessThan(usage.pendingDays + usage.approvedDays)) throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'The allocation no longer covers reserved leave');
          }
        }
        const status = input.decision === 'APPROVE' ? 'APPROVED' : 'DECLINED';
        const updated = await transaction.leaveRequest.updateMany({ where: { id, status: 'PENDING' }, data: {
          status, approverMembershipId: actor.id, decidedAt: new Date(), decisionComment: input.comment?.trim() || null,
        } });
        if (!updated.count) throw new ApiError(409, 'STATUS_CONFLICT', 'This request is no longer pending');
        await transaction.auditLog.create({ data: { actorUserId, organisationId: request.organisationId, action: `REQUEST_${status}`,
          entityType: 'LeaveRequest', entityId: id, metadata: { previousStatus: 'PENDING' } } });
        if (status === 'APPROVED') {
          const event = await transaction.calendarEvent.upsert({ where: { requestId: id }, update: {
          active: true, startDate: request.startDate, endDate: request.endDate, visibility: 'ORGANISATION',
          }, create: { organisationId: request.organisationId, requestId: id, startDate: request.startDate, endDate: request.endDate } });
          await enqueueCalendarEvent(transaction, event);
        }
        const stored = await transaction.leaveRequest.findUniqueOrThrow({ where: { id } });
        return requestDto((await loadRequests(transaction, [stored]))[0]!);
      });
    },
    calendar(actorUserId: string, input: CalendarQuery) {
      const from = parseDateOnly(input.from), to = parseDateOnly(input.to);
      if (to < from) throw new ApiError(400, 'INVALID_DATE_RANGE', 'Calendar end must not precede start');
      return repository.read(async (transaction) => {
        const [membership] = await activeMemberships(transaction, actorUserId, [input.organisationId]);
        if (!membership) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
        const events = await transaction.calendarEvent.findMany({ where: { organisationId: input.organisationId, active: true,
          visibility: 'ORGANISATION', startDate: { lte: to }, endDate: { gte: from }, request: { status: 'APPROVED' } },
          select: { id: true, organisationId: true, requestId: true, startDate: true, endDate: true,
            request: { select: { membership: { select: { user: { select: { fullName: true } } } } } } },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }] });
        return events.map((event) => ({ id: event.id, organisationId: event.organisationId, requestId: event.requestId,
          employeeDisplayName: event.request.membership.user.fullName, title: `${event.request.membership.user.fullName} — On leave`,
          startDate: event.startDate.toISOString().slice(0, 10), endDate: event.endDate.toISOString().slice(0, 10), allDay: true as const }));
      });
    },
  };
}
export type ManagerService = ReturnType<typeof createManagerService>;
