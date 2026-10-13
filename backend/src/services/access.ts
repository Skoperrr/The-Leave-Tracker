import type { AccessRepository, Account } from '../repositories/access.js';
import type { TokenVerifier } from '../lib/supabase.js';
import { ApiError } from '../utils/api-error.js';
import type { LeaveService } from './leave.js';
import type { ManagerService } from './manager.js';

export type AccessServices = { verifyToken: TokenVerifier; repository: AccessRepository; leave?: LeaveService; manager?: ManagerService };

export async function authenticateAccount(services: AccessServices, token: string): Promise<Account> {
  const identityId = await services.verifyToken(token);
  if (!identityId) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  const account = await services.repository.findAccount(identityId);
  if (!account || !account.active) throw new ApiError(403, 'FORBIDDEN', 'An active application profile is required');
  return account;
}
