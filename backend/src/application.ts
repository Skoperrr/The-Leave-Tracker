import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Environment } from './config/env.js';
import { ApiError } from './utils/api-error.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { createApiRouter } from './routes/index.js';
import type { AccessServices } from './services/access.js';

export function createApp(environment: Environment, services?: AccessServices) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || environment.FRONTEND_ORIGINS.includes(origin)) callback(null, true);
      else callback(new ApiError(403, 'FORBIDDEN', 'Origin is not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', createApiRouter(services));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
