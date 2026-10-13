import type { PrismaClient } from '../generated/prisma/client.js';

export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type ActiveMembership = {
  id: string;
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  role: Role;
  managerMembershipId: string | null;
  active: boolean;
};
export type Account = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  memberships: ActiveMembership[];
};
export type LeaveTypeRecord = { id: string; organisationId: string; code: string; name: string };
export interface AccessRepository {
  findAccount(id: string): Promise<Account | null>;
  listLeaveTypes(organisationId: string): Promise<LeaveTypeRecord[]>;
}

export function createAccessRepository(database: Pick<PrismaClient, 'user' | 'leaveType'>): AccessRepository {
  return {
    async findAccount(id) {
      const user = await database.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, fullName: true, active: true,
          memberships: {
            where: { active: true, organisation: { active: true } },
            orderBy: { organisation: { name: 'asc' } },
            select: {
              id: true, organisationId: true, role: true, active: true, managerMembershipId: true,
              organisation: { select: { name: true, slug: true } },
            },
          },
        },
      });
      if (!user) return null;
      return { ...user, memberships: user.memberships.map(({ organisation, ...membership }) => ({
        ...membership, organisationName: organisation.name, organisationSlug: organisation.slug,
      })) };
    },
    listLeaveTypes(organisationId) {
      return database.leaveType.findMany({
        where: { organisationId, active: true }, orderBy: { name: 'asc' },
        select: { id: true, organisationId: true, code: true, name: true },
      });
    },
  };
}
