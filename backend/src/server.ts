import { createApp } from './app.js';
import { readEnvironment } from './config/env.js';

try {
  const environment = readEnvironment();
  const server = createApp(environment).listen(environment.PORT, () => {
    console.info(`Leave Tracker API listening on port ${environment.PORT}`);
  });
  server.on('error', () => {
    console.error('API failed to listen; check port availability and permissions');
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid startup configuration');
  process.exitCode = 1;
}
