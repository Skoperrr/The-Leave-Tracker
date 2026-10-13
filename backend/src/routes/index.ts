import { Router } from 'express';
import { getHealth } from '../controllers/health.js';
import { z } from 'zod';
import { getMe, getOrganisations, getLeaveTypes } from '../controllers/access.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { AccessServices } from '../services/access.js';

export function createApiRouter(services?: AccessServices) {
  const router = Router();
  router.get('/health', getHealth);
  router.use(authenticate(services));
  router.get('/me', getMe);
  router.get('/organisations', getOrganisations);
  router.get('/organisations/:orgId/leave-types', validate(z.object({ orgId: z.uuid() }), 'params'), getLeaveTypes(services));
  return router;
}
