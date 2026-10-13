import { createDatabase } from '../src/lib/database.js';
import { databaseFailureCategory } from '../src/utils/database-error.js';

// Baseline configuration only. Auth-backed fictional users are a separate milestone.
async function main() {
  const database = createDatabase();
  try {
    await database.$transaction(async (transaction) => {
      for (const [slug, name] of [
        ['dlab', 'D-Lab'],
        ['strideshift-global', 'StrideShift Global'],
        ['field-institute', 'The Field Institute'],
      ] as const) {
        const organisation = await transaction.organisation.upsert({
          where: { slug }, update: {}, create: { slug, name },
        });
        for (const [code, leaveName] of [['ANNUAL', 'Annual leave'], ['SICK', 'Sick leave']] as const) {
          await transaction.leaveType.upsert({
            where: { organisationId_code: { organisationId: organisation.id, code } },
            update: {}, create: { organisationId: organisation.id, code, name: leaveName },
          });
        }
      }
    }, { timeout: 30_000 });
    console.info('Baseline seed complete: three organisations and annual/sick leave types. No login accounts were created.');
  } finally { await database.$disconnect(); }
}

main().catch((error: unknown) => {
  console.error(`Baseline seed failed: ${databaseFailureCategory(error)}. No credentials are displayed.`);
  process.exitCode = 1;
});
