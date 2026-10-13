import { Router } from 'express';
import { getHealth } from '../controllers/health.js';

export const apiRouter = Router();
apiRouter.get('/health', getHealth);
