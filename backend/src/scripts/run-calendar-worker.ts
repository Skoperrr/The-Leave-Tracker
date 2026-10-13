import { createDatabase } from '../lib/database.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { createCalendarRuntime } from '../services/calendar-runtime.js';
async function main() {
  const configuration = readDatabaseEnvironment(), database = createDatabase(configuration.DATABASE_URL);
  try {
    const { calendarWorker } = createCalendarRuntime(database, configuration);
    if (!calendarWorker) throw new Error('Configure Google Calendar before running the worker');
    console.info(JSON.stringify(await calendarWorker.run(5)));
  } finally { await database.$disconnect(); }
}
main().catch(() => { console.error('Calendar worker failed; check server configuration. Credentials are not displayed.'); process.exitCode = 1; });
