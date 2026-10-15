import { Router } from 'express';
import { authenticatedAccount } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiDraftBody, type AiDraftInput } from '../validators/ai.js';
import type { AccessServices } from '../services/access.js';
import { ApiError } from '../utils/api-error.js';

// Mounted after the normal authentication middleware in routes/index.ts.
export function createAiRouter(services?: AccessServices) {
  const router = Router();
  router.post('/ai/leave-draft', validate(aiDraftBody), async (_req, res) => {
    if (!services?.ai) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI drafting is not configured. Use the manual form.');
    res.json({ data: await services.ai.draft(authenticatedAccount(res), res.locals.validated as AiDraftInput) });
  });
  return router;
}
