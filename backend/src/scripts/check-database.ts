import { createDatabase } from '../lib/database.js';
import { databaseFailureCategory } from '../utils/database-error.js';

async function main() {
  const database = createDatabase();
  try {
    await database.$queryRaw`SELECT 1`;
    console.info('PostgreSQL connection verified');
    const tables = await database.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name
    `;
    console.info(`Public schema has ${tables.length} tables`);
    // Names only, never connection URLs, user rows, or credentials.
    for (const table of tables) console.info(table.table_name);
    if (tables.some((table) => table.table_name === 'Organisation') && tables.some((table) => table.table_name === 'LeaveType')) {
      const organisations = await database.organisation.findMany({
        select: { name: true, slug: true, _count: { select: { leaveTypes: true } } },
        orderBy: { slug: 'asc' },
      });
      for (const organisation of organisations) {
        console.info(`${organisation.name}: ${organisation._count.leaveTypes} leave types`);
      }
      console.info(`User profiles: ${await database.user.count()}`);
      console.info(`Organisation memberships: ${await database.membership.count()}`);
      console.info(`Leave allocations: ${await database.leaveBalance.count()}`);
    }
  } finally { await database.$disconnect(); }
}

main().catch((error: unknown) => {
  console.error(`Database check failed: ${databaseFailureCategory(error)}. Check local settings; credentials are not displayed.`);
  process.exitCode = 1;
});
