import type { LeaveRepository } from '../repositories/leave.js';
import { activeMemberships, lockMembershipIds } from '../repositories/leave.js';
import { ApiError } from '../utils/api-error.js';
import { membershipSchema } from '../types/me.js';
import { z } from 'zod';

const adminMembershipSchema = membershipSchema.extend({ employeeDisplayName: z.string() });

export function createAdminService(repository: LeaveRepository) {
  return {
    assignEmployee(actorId: string, input: { organisationId: string; email: string; managerMembershipId?: string | null }) {
      return repository.write(async tx => {
        const [initial] = await activeMemberships(tx, actorId, [input.organisationId]);
        if (!initial) throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        await lockMembershipIds(tx, [initial.id]);
        const [actor] = await activeMemberships(tx, actorId, [input.organisationId]);
        if (actor?.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        const user = await tx.user.findUnique({ where: { email: input.email } });
        if (!user?.active) throw new ApiError(404, 'NOT_FOUND', 'An active registered profile with that email was not found');
        if (input.managerMembershipId) {
          const manager = await tx.membership.findFirst({ where: { id: input.managerMembershipId, organisationId: input.organisationId,
            active: true, role: { in: ['MANAGER', 'ADMIN'] }, user: { active: true } } });
          if (!manager || manager.userId === user.id) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose another active manager in this organisation');
        }
        const existing = await tx.membership.findUnique({ where: { userId_organisationId: { userId: user.id, organisationId: input.organisationId } } });
        if (existing) throw new ApiError(409, 'MEMBERSHIP_EXISTS', 'This account already has a membership in this organisation');
        const member = await tx.membership.create({ data: { userId: user.id, organisationId: input.organisationId,
          role: 'EMPLOYEE', managerMembershipId: input.managerMembershipId ?? null }, include: { organisation: true } });
        await tx.auditLog.create({ data: { actorUserId: actorId, organisationId: member.organisationId,
          action: 'MEMBERSHIP_CREATED', entityType: 'Membership', entityId: member.id, metadata: { role: 'EMPLOYEE' } } });
        return adminMembershipSchema.parse({ ...member, organisationName: member.organisation.name, employeeDisplayName: user.fullName });
      });
    },
    allocate(actorId: string, input: { organisationId: string; membershipId: string; leaveTypeId: string; year: number; allocatedDays: number }) {
      return repository.write(async tx => {
        const [actor] = await activeMemberships(tx, actorId, [input.organisationId]);
        if (!actor) throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        await lockMembershipIds(tx, [actor.id, input.membershipId]);
        const [current] = await activeMemberships(tx, actorId, [input.organisationId]);
        if (current?.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        const member = await tx.membership.findFirst({ where: { id: input.membershipId, organisationId: input.organisationId, active: true, user: { active: true } } });
        const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, organisationId: input.organisationId, active: true } });
        if (!member || !type) throw new ApiError(404, 'NOT_FOUND', 'Active membership and leave type in this organisation are required');
        const existing = await tx.leaveBalance.findUnique({ where: { membershipId_leaveTypeId_year: { membershipId: member.id, leaveTypeId: type.id, year: input.year } } });
        if (existing) throw new ApiError(409, 'ALLOCATION_EXISTS', 'An allocation already exists for this year and leave type');
        const allocation = await tx.leaveBalance.create({ data: input });
        await tx.auditLog.create({ data: { actorUserId: actorId, organisationId: input.organisationId,
          action: 'ALLOCATION_CREATED', entityType: 'LeaveBalance', entityId: allocation.id,
          metadata: { year: input.year, allocatedDays: input.allocatedDays } } });
        return { ...allocation, allocatedDays: allocation.allocatedDays.toNumber() };
      });
    },
    memberships(userId: string, organisationId: string) {
      return repository.read(async transaction => {
        const [actor] = await activeMemberships(transaction, userId, [organisationId]);
        if (!actor) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
        if (actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        const memberships = await transaction.membership.findMany({
          where: { organisationId }, orderBy: { id: 'asc' },
          select: { id: true, organisationId: true, role: true, managerMembershipId: true, active: true,
            user: { select: { fullName: true } },
            organisation: { select: { name: true } } },
        });
        return memberships.map(({ organisation, user, ...membership }) => adminMembershipSchema.parse({
          ...membership, organisationName: organisation.name, employeeDisplayName: user.fullName,
        }));
      });
    },
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
