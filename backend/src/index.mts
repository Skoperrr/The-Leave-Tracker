import { createCalendarRuntime } from './services/calendar-runtime.js';
import { createOnboardingService } from './services/onboarding.js';
import express from 'express';
import { createApp } from './application.js';
import { readEnvironment } from './config/env.js';
import { readDatabaseEnvironment } from './config/database-env.js';
import { createDatabase } from './lib/database.js';
import { createTokenVerifier, createConfirmedIdentityVerifier } from './lib/supabase.js';
import { createAccessRepository } from './repositories/access.js';
import { createLeaveRepository } from './repositories/leave.js';
import { createLeaveService } from './services/leave.js';
import { createManagerService } from './services/manager.js';
import { createAdminService } from './services/admin.js';
import { createAiRuntime } from './services/ai-runtime.js';

// Vercel owns the listener and function lifecycle. Reuse the pool per instance;
// keep server.ts for standalone development and its database startup check.
const environment = readEnvironment();
const configuration = readDatabaseEnvironment();
const database = createDatabase(configuration.DATABASE_URL);
const repository = createLeaveRepository(database);
const app = express();
app.use(createApp(environment, {
  ...createCalendarRuntime(database, configuration), verifyToken: createTokenVerifier(configuration),
  repository: createAccessRepository(database),
  ...createAiRuntime(database),
  leave: createLeaveService(repository),
  manager: createManagerService(repository),
  admin: createAdminService(repository),
  onboarding: createOnboardingService(database, createConfirmedIdentityVerifier(configuration)),
}));
export default app;
