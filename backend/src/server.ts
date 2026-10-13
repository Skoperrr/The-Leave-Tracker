import { createApp } from './application.js';
import { readEnvironment } from './config/env.js';
import { readDatabaseEnvironment } from './config/database-env.js';
import { createDatabase } from './lib/database.js';
import { createTokenVerifier } from './lib/supabase.js';
import { createAccessRepository } from './repositories/access.js';
import { databaseFailureCategory } from './utils/database-error.js';
import { createLeaveRepository } from './repositories/leave.js';
import { createLeaveService } from './services/leave.js';
import { createManagerService } from './services/manager.js';
import { createAdminService } from './services/admin.js';

async function start() {
  const environment = readEnvironment();
  const configuration = readDatabaseEnvironment();
  const database = createDatabase(configuration.DATABASE_URL);
  try { await database.$queryRaw`SELECT 1`; }
  catch (error: unknown) {
    await database.$disconnect();
    throw new Error(`Database startup failed: ${databaseFailureCategory(error)}`);
  }
  const services = { verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    leave: createLeaveService(createLeaveRepository(database)), manager: createManagerService(createLeaveRepository(database)),
    admin: createAdminService(createLeaveRepository(database)) };
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
