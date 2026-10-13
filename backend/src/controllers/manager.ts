import type { RequestHandler } from 'express';
import type { AccessServices } from '../services/access.js';
import { authenticatedAccount } from '../middleware/auth.js';
import { ApiError } from '../utils/api-error.js';
import { decisionBody } from '../validators/manager.js';
import { requestIdParams } from '../validators/leave.js';
import type { CalendarQuery, ManagerQuery } from '../validators/manager.js';

export function managerControllers(services?: AccessServices): Record<'queue' | 'decide' | 'calendar', RequestHandler> {
  const service = () => {
    if (!services?.manager) throw new ApiError(500, 'INTERNAL_ERROR', 'Manager services are not configured');
    return services.manager;
  };
  return {
    queue: async (_req, res) => { res.json(await service().queue(authenticatedAccount(res).id, res.locals.validated as ManagerQuery)); },
    decide: async (req, res) => {
      const params = requestIdParams.safeParse(req.params), body = decisionBody.safeParse(req.body);
      if (!params.success || !body.success) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid request ID and decision are required; decline requires a comment');
      res.json({ data: await service().decide(authenticatedAccount(res).id, params.data.id, body.data) });
    },
    calendar: async (_req, res) => { res.json({ data: await service().calendar(authenticatedAccount(res).id, res.locals.validated as CalendarQuery) }); },
  };
}
