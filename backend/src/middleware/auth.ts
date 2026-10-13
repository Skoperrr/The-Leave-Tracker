import type { RequestHandler, Response } from 'express';
import { authenticateAccount, type AccessServices } from '../services/access.js';
import type { Account, ActiveMembership, Role } from '../repositories/access.js';
import { ApiError } from '../utils/api-error.js';

export function authenticatedAccount(response: Response): Account {
  return response.locals.account as Account;
}

export function authenticate(services?: AccessServices): RequestHandler {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const header = request.get('Authorization');
    const token = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/i)?.[1];
    if (!token || token.length > 8192) {
      response.set('WWW-Authenticate', 'Bearer');
      throw new ApiError(401, 'UNAUTHENTICATED', 'A bearer access token is required');
    }
    if (!services) throw new ApiError(500, 'INTERNAL_ERROR', 'Authentication is not configured');
    try {
      response.locals.account = await authenticateAccount(services, token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) response.set('WWW-Authenticate', 'Bearer');
      throw error;
    }
    next();
  };
}

export function requireMembership(organisationId: string, account: Account): ActiveMembership {
  const membership = account.memberships.find((entry) => entry.organisationId === organisationId && entry.active);
  if (!membership) throw new ApiError(403, 'ORGANISATION_MEMBERSHIP_REQUIRED', 'Active organisation membership is required');
  return membership;
}

export function requireRole(membership: ActiveMembership, roles: readonly Role[]): void {
  if (!roles.includes(membership.role)) throw new ApiError(403, 'FORBIDDEN', 'Your organisation role does not permit this action');
}
