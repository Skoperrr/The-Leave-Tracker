import type { AccessRepository, Account } from '../repositories/access.js';
import type { TokenVerifier } from '../lib/supabase.js';
import { ApiError } from '../utils/api-error.js';
import type { LeaveService } from './leave.js';
import type { ManagerService } from './manager.js';
import type { AdminService } from './admin.js';
import type { OnboardingService } from './onboarding.js';
import type { CalendarIntegrationService } from './calendar-integration.js';
import type { CalendarWorker } from './calendar-worker.js';
import type { AiLeaveDraftService } from './ai-leave-draft.js';
import type { AiToolsService } from './ai-tools.js';

export type AccessServices = { verifyToken: TokenVerifier; repository: AccessRepository; leave?: LeaveService; manager?: ManagerService; admin?: AdminService; onboarding?: OnboardingService; google?: CalendarIntegrationService; calendarWorker?: CalendarWorker; ai?: AiLeaveDraftService; aiTools?: AiToolsService };

export async function authenticateAccount(services: AccessServices, token: string): Promise<Account> {
  const identityId = await services.verifyToken(token);
  if (!identityId) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  const account = await services.repository.findAccount(identityId);
  if (!account) throw new ApiError(404, 'NOT_FOUND', 'Your application profile has not been provisioned');
  if (!account.active) throw new ApiError(403, 'FORBIDDEN', 'An active application profile is required');
  return account;
}
