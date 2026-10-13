import type { AccessRepository, Account } from '../repositories/access.js';
import type { TokenVerifier } from '../lib/supabase.js';
import { ApiError } from '../utils/api-error.js';

export type AccessServices = { verifyToken: TokenVerifier; repository: AccessRepository };

export async function authenticateAccount(services: AccessServices, token: string): Promise<Account> {
  const identityId = await services.verifyToken(token);
  if (!identityId) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  const account = await services.repository.findAccount(identityId);
  if (!account) throw new ApiError(404, 'NOT_FOUND', 'Your application profile has not been provisioned');
  if (!account.active) throw new ApiError(403, 'FORBIDDEN', 'An active application profile is required');
  return account;
}
