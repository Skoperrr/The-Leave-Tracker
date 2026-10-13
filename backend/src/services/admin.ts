import type { LeaveRepository } from '../repositories/leave.js';
import { activeMemberships } from '../repositories/leave.js';
import { ApiError } from '../utils/api-error.js';
import { membershipSchema } from '../types/me.js';

export function createAdminService(repository: LeaveRepository) {
  return {
    memberships(userId: string, organisationId: string) {
      return repository.read(async transaction => {
        const [actor] = await activeMemberships(transaction, userId, [organisationId]);
        if (!actor) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
        if (actor.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'An organisation admin role is required');
        const memberships = await transaction.membership.findMany({
          where: { organisationId }, orderBy: { id: 'asc' },
          select: { id: true, organisationId: true, role: true, managerMembershipId: true, active: true,
            organisation: { select: { name: true } } },
        });
        return memberships.map(({ organisation, ...membership }) => membershipSchema.parse({
          ...membership, organisationName: organisation.name,
        }));
      });
    },
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
