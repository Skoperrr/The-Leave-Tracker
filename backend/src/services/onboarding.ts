import type { PrismaClient } from '../generated/prisma/client.js';
import type { ConfirmedIdentityVerifier } from '../lib/supabase.js';
import { ApiError } from '../utils/api-error.js';
import { createAccessRepository } from '../repositories/access.js';
import { meSchema } from '../types/me.js';

export function createOnboardingService(database: PrismaClient, verifyIdentity: ConfirmedIdentityVerifier) {
  return {
    async profile(token: string, fullName: string) {
      const identity = await verifyIdentity(token);
      if (!identity) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid confirmed email account is required');
      if (!identity.confirmed) throw new ApiError(403, 'EMAIL_CONFIRMATION_REQUIRED', 'Confirm your email before opening your workspace');
      await database.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: identity.id } });
        if (user) {
          if (!user.active) throw new ApiError(403, 'FORBIDDEN', 'An active application profile is required');
          return; // Idempotent; browser input never overwrites an existing profile.
        }
        const collision = await tx.user.findUnique({ where: { email: identity.email } });
        if (collision) throw new ApiError(409, 'PROFILE_CONFLICT', 'Contact an administrator to resolve your account');
        await tx.user.upsert({ where: { id: identity.id }, update: {}, create: {
          id: identity.id, email: identity.email, fullName,
        } });
      });
      const account = await createAccessRepository(database).findAccount(identity.id);
      if (!account?.active) throw new ApiError(403, 'FORBIDDEN', 'An active application profile is required');
      return meSchema.parse(account);
    },
  };
}
export type OnboardingService = ReturnType<typeof createOnboardingService>;
