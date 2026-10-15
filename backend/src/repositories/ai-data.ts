import type { PrismaClient } from '../generated/prisma/client.js';
import { activeMemberships } from './leave.js';
import { ApiError } from '../utils/api-error.js';

export type ReviewRequest = { id: string; membershipId: string; employeeDisplayName: string; startDate: string; endDate: string;
  status: 'PENDING' | 'APPROVED'; submittedAt: string; workingDays: number };
export type ReviewSnapshot = { scope: 'ORGANISATION_REVIEW' | 'DIRECT_REPORTS'; activeMemberCount: number; requests: ReviewRequest[] };
export type CalendarAnswerRow = { requestId: string; membershipId: string; employeeDisplayName: string; startDate: string; endDate: string };
export type OwnBalanceRow = { leaveTypeName: string; year: number; allocatedDays: number; approvedDays: number; pendingDays: number; remainingDays: number };
export interface AiDataRepository {
  review(actorId: string, organisationId: string, from: string, to: string): Promise<ReviewSnapshot>;
  approved(organisationId: string, actorId: string, from: string, to: string): Promise<CalendarAnswerRow[]>;
  ownBalances(organisationId: string, actorId: string, year: number): Promise<OwnBalanceRow[]>;
}
const iso = (value: Date) => value.toISOString().slice(0, 10);
const tooLarge = () => new ApiError(422, 'AI_DATA_LIMIT', 'There are too many records to summarise safely. Choose a narrower date range.');

export function createAiDataRepository(database: PrismaClient): AiDataRepository {
  return {
    review(actorId, organisationId, from, to) {
      return database.$transaction(async tx => {
        const [actor] = await activeMemberships(tx, actorId, [organisationId]);
        if (!actor || !['MANAGER', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Manager or admin access is required');
        const members = await tx.membership.findMany({ where: { organisationId, active: true, userId: { not: actorId },
          user: { active: true }, ...(actor.role === 'MANAGER' ? { managerMembershipId: actor.id } : {}) }, select: { id: true }, take: 1001 });
        if (members.length > 1000) throw tooLarge();
        const requests = await tx.leaveRequest.findMany({ where: { organisationId, membershipId: { in: members.map(member => member.id) },
          status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: new Date(`${to}T00:00:00Z`) }, endDate: { gte: new Date(`${from}T00:00:00Z`) } },
          select: { id: true, membershipId: true, startDate: true, endDate: true, status: true, submittedAt: true, workingDays: true,
            membership: { select: { user: { select: { fullName: true } } } } },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }], take: 501 });
        if (requests.length > 500) throw tooLarge();
        return { scope: actor.role === 'ADMIN' ? 'ORGANISATION_REVIEW' : 'DIRECT_REPORTS', activeMemberCount: members.length,
          requests: requests.map(row => ({ id: row.id, membershipId: row.membershipId, employeeDisplayName: row.membership.user.fullName,
            startDate: iso(row.startDate), endDate: iso(row.endDate), status: row.status as 'PENDING' | 'APPROVED', submittedAt: row.submittedAt.toISOString(), workingDays: row.workingDays })) };
      }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    },
    approved(organisationId, actorId, from, to) {
      return database.$transaction(async tx => {
        if (!(await activeMemberships(tx, actorId, [organisationId])).length) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active membership is required');
        const rows = await tx.calendarEvent.findMany({ where: { organisationId, active: true, visibility: 'ORGANISATION',
          startDate: { lte: new Date(`${to}T00:00:00Z`) }, endDate: { gte: new Date(`${from}T00:00:00Z`) }, request: { status: 'APPROVED' } },
          select: { requestId: true, startDate: true, endDate: true, request: { select: { membershipId: true, membership: { select: { user: { select: { fullName: true } } } } } } },
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }], take: 501 });
        if (rows.length > 500) throw tooLarge();
        return rows.map(row => ({ requestId: row.requestId, membershipId: row.request.membershipId, employeeDisplayName: row.request.membership.user.fullName, startDate: iso(row.startDate), endDate: iso(row.endDate) }));
      }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    },
    ownBalances(organisationId, actorId, year) {
      return database.$transaction(async tx => {
        const [actor] = await activeMemberships(tx, actorId, [organisationId]);
        if (!actor) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active membership is required');
        const balances = await tx.leaveBalance.findMany({ where: { organisationId, membershipId: actor.id, year, leaveType: { active: true, balanceLimited: true } },
          include: { leaveType: { select: { name: true } } }, take: 101 });
        if (balances.length > 100) throw tooLarge();
        const usage = await tx.leaveRequest.groupBy({ by: ['leaveTypeId', 'status'],
          where: { membershipId: actor.id, leaveTypeId: { in: balances.map(balance => balance.leaveTypeId) }, status: { in: ['PENDING', 'APPROVED'] },
            startDate: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } }, _sum: { workingDays: true } });
        const result: OwnBalanceRow[] = [];
        for (const balance of balances) {
          const pendingDays = usage.find(row => row.leaveTypeId === balance.leaveTypeId && row.status === 'PENDING')?._sum.workingDays ?? 0;
          const approvedDays = usage.find(row => row.leaveTypeId === balance.leaveTypeId && row.status === 'APPROVED')?._sum.workingDays ?? 0;
          result.push({ leaveTypeName: balance.leaveType.name, year, allocatedDays: Number(balance.allocatedDays), pendingDays, approvedDays,
            remainingDays: Number(balance.allocatedDays) - pendingDays - approvedDays });
        }
        return result;
      }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    },
  };
}
