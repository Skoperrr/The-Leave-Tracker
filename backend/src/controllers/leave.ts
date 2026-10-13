import type { RequestHandler } from 'express';
import { authenticatedAccount } from '../middleware/auth.js';
import type { AccessServices } from '../services/access.js';
import type { CreateLeave, HistoryQuery } from '../validators/leave.js';
import { ApiError } from '../utils/api-error.js';

export function leaveControllers(services?: AccessServices): Record<'balances' | 'create' | 'history' | 'cancel', RequestHandler> {
  const service = () => {
    if (!services?.leave) throw new ApiError(500, 'INTERNAL_ERROR', 'Leave services are not configured');
    return services.leave;
  };
  return {
    balances: async (_request, response) => {
      const input = response.locals.validated as { organisationId: string; year?: number };
      response.json({ data: await service().balances(authenticatedAccount(response).id, input.organisationId, input.year) });
    },
    create: async (_request, response) => {
      response.status(201).json({ data: await service().create(authenticatedAccount(response).id, response.locals.validated as CreateLeave) });
    },
    history: async (_request, response) => {
      response.json(await service().history(authenticatedAccount(response).id, response.locals.validated as HistoryQuery));
    },
    cancel: async (_request, response) => {
      const { id } = response.locals.validated as { id: string };
      response.json({ data: await service().cancel(authenticatedAccount(response).id, id) });
    },
  };
}
