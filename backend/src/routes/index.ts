import { Router } from 'express';
import { getHealth } from '../controllers/health.js';
import { z } from 'zod';
import { getMe, getOrganisations, getLeaveTypes, getAdminMemberships } from '../controllers/access.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { AccessServices } from '../services/access.js';
import { leaveControllers } from '../controllers/leave.js';
import { balanceQuery, createLeaveBody, historyQuery, requestIdParams } from '../validators/leave.js';
import { managerQuery, calendarQuery } from '../validators/manager.js';
import { managerControllers } from '../controllers/manager.js';

export function createApiRouter(services?: AccessServices) {
  const router = Router();
  router.get('/health', getHealth);
  router.use(authenticate(services));
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
  return router;
}
