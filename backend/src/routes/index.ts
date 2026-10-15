import { createInsightsRouter } from './insights.js';
import { Router } from 'express';
import { getHealth } from '../controllers/health.js';
import { z } from 'zod';
import { getMe, getOrganisations, getLeaveTypes, getAdminMemberships } from '../controllers/access.js';
import { authenticate, authenticatedAccount } from '../middleware/auth.js';
import { ApiError } from '../utils/api-error.js';
import { validate } from '../middleware/validate.js';
import type { AccessServices } from '../services/access.js';
import { leaveControllers } from '../controllers/leave.js';
import { balanceQuery, createLeaveBody, historyQuery, requestIdParams } from '../validators/leave.js';
import { managerQuery, calendarQuery } from '../validators/manager.js';
import { managerControllers } from '../controllers/manager.js';
import { createCalendarRouter } from './calendar.js';
import { createAiRouter } from './ai.js';

export function createApiRouter(services?: AccessServices) {
  const router = Router();
  router.get('/health', getHealth);
  router.use(createCalendarRouter(services));
  router.post('/auth/profile', validate(z.object({ fullName: z.string().trim().min(2).max(120) }).strict()), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._~-]+)$/i)?.[1];
    if (!token || token.length > 8192) { res.set('WWW-Authenticate', 'Bearer'); throw new ApiError(401, 'UNAUTHENTICATED', 'A bearer token is required'); }
    if (!services?.onboarding) throw new ApiError(500, 'INTERNAL_ERROR', 'Profile provisioning is not configured');
    res.json({ data: await services.onboarding.profile(token, (res.locals.validated as { fullName: string }).fullName) });
  });
  router.use(authenticate(services));
  router.use(createInsightsRouter(services));
  router.use(createAiRouter(services));
  router.get('/me', getMe);
  router.get('/organisations', getOrganisations);
  router.get('/organisations/:orgId/leave-types', validate(z.object({ orgId: z.uuid() }), 'params'), getLeaveTypes(services));
  const leave = leaveControllers(services);
  router.get('/balances', validate(balanceQuery, 'query'), leave.balances);
  router.post('/leave-requests', validate(createLeaveBody), leave.create);
  router.get('/leave-requests', validate(historyQuery, 'query'), leave.history);
  router.post('/leave-requests/:id/cancel', validate(requestIdParams, 'params'), leave.cancel);
  const manager = managerControllers(services);
  router.get('/manager/leave-requests', validate(managerQuery, 'query'), manager.queue);
  router.post('/manager/leave-requests/:id/decision', manager.decide);
  router.get('/calendar-events', validate(calendarQuery, 'query'), manager.calendar);
  router.get('/admin/memberships', validate(z.object({ organisationId: z.uuid() }).strict(), 'query'), getAdminMemberships(services));
  router.post('/admin/memberships', validate(z.object({ organisationId: z.uuid(), email: z.email().transform(value => value.toLowerCase()),
    managerMembershipId: z.uuid().nullable().optional() }).strict()), async (_req, res) => {
    if (!services?.admin) throw new ApiError(500, 'INTERNAL_ERROR', 'Administration is not configured');
    res.status(201).json({ data: await services.admin.assignEmployee(authenticatedAccount(res).id, res.locals.validated) });
  });
  router.post('/admin/allocations', validate(z.object({ organisationId: z.uuid(), membershipId: z.uuid(), leaveTypeId: z.uuid(),
    year: z.number().int().min(2000).max(9999), allocatedDays: z.number().min(0).max(999999.99).multipleOf(0.01) }).strict()), async (_req, res) => {
    if (!services?.admin) throw new ApiError(500, 'INTERNAL_ERROR', 'Administration is not configured');
    res.status(201).json({ data: await services.admin.allocate(authenticatedAccount(res).id, res.locals.validated) });
  });
  return router;
}
