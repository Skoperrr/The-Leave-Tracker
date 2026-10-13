import { z } from 'zod';

export const membershipSchema = z.object({
  id: z.string(),
  organisationId: z.string(),
  organisationName: z.string(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']),
  managerMembershipId: z.string().nullable(),
  active: z.boolean(),
});

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  memberships: z.array(membershipSchema),
});

export type Me = z.infer<typeof meSchema>;
