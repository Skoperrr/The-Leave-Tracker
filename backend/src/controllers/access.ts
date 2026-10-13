import type { RequestHandler } from 'express';
import { authenticatedAccount, requireMembership } from '../middleware/auth.js';
import type { AccessServices } from '../services/access.js';
import { ApiError } from '../utils/api-error.js';

export const getMe: RequestHandler = (_request, response) => {
  const account = authenticatedAccount(response);
  response.json({ data: {
    id: account.id, email: account.email, fullName: account.fullName,
    memberships: account.memberships.map(({ organisationSlug: _slug, ...membership }) => membership),
  } });
};

export const getOrganisations: RequestHandler = (_request, response) => {
  response.json({ data: authenticatedAccount(response).memberships.map((membership) => ({
    id: membership.organisationId, name: membership.organisationName, slug: membership.organisationSlug,
  })) });
};

export function getLeaveTypes(services?: AccessServices): RequestHandler {
  return async (_request, response) => {
    const { orgId } = response.locals.validated as { orgId: string };
    requireMembership(orgId, authenticatedAccount(response));
    if (!services) throw new ApiError(500, 'INTERNAL_ERROR', 'Database access is not configured');
    response.json({ data: await services.repository.listLeaveTypes(orgId) });
  };
}
