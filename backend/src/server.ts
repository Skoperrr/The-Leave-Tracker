import { createInsightsRepository } from './repositories/insights.js';
import { createInsightsService } from './services/insights.js';
import { createCalendarRuntime } from './services/calendar-runtime.js';
import { createOnboardingService } from './services/onboarding.js';
import { createApp } from './application.js';
import { readEnvironment } from './config/env.js';
import { readDatabaseEnvironment } from './config/database-env.js';
import { createDatabase } from './lib/database.js';
import { createTokenVerifier, createConfirmedIdentityVerifier } from './lib/supabase.js';
import { createAccessRepository } from './repositories/access.js';
import { databaseFailureCategory } from './utils/database-error.js';
import { createLeaveRepository } from './repositories/leave.js';
import { createLeaveService } from './services/leave.js';
import { createManagerService } from './services/manager.js';
import { createAdminService } from './services/admin.js';
import { readAiEnvironment } from './config/ai-env.js';
import { createGeminiProvider } from './lib/ai-provider.js';
import { createAiLeaveDraftService } from './services/ai-leave-draft.js';

async function start() {
  const environment = readEnvironment();
  const configuration = readDatabaseEnvironment();
  const database = createDatabase(configuration.DATABASE_URL);
  try { await database.$queryRaw`SELECT 1`; }
  catch (error: unknown) {
    await database.$disconnect();
    throw new Error(`Database startup failed: ${databaseFailureCategory(error)}`);
  }
  const services = { ...createCalendarRuntime(database, configuration), verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    ai: createAiLeaveDraftService(createAccessRepository(database), createGeminiProvider(readAiEnvironment())),
    leave: createLeaveService(createLeaveRepository(database)), manager: createManagerService(createLeaveRepository(database)),
    admin: createAdminService(createLeaveRepository(database)),
    insights: createInsightsService(createInsightsRepository(database)),
    onboarding: createOnboardingService(database, createConfirmedIdentityVerifier(configuration)) };
  const server = createApp(environment, services).listen(environment.PORT, () => {
    console.info(`Leave Tracker API listening on port ${environment.PORT}`);
  });
  server.on('error', () => {
    console.error('API failed to listen; check port availability and permissions');
    process.exitCode = 1;
    void database.$disconnect();
  });
  const shutdown = () => {
    server.close(() => { void database.$disconnect().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Invalid startup configuration');
  process.exitCode = 1;
});
