import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Real isolated embedded PostgreSQL; no connection to the configured Supabase database.
describe('Profile migration and membership constraints', () => {
  const database = new PGlite();
  const user = '00000000-0000-4000-8000-000000000001';
  const manager = '00000000-0000-4000-8000-000000000002';
  const firstOrg = '00000000-0000-4000-8000-000000000011';
  const secondOrg = '00000000-0000-4000-8000-000000000012';
  const managerMembership = '00000000-0000-4000-8000-000000000021';

  beforeAll(async () => {
    const migration = await readFile(new URL('../prisma/migrations/20261013090000_initial/migration.sql', import.meta.url), 'utf8');
    await database.exec(migration);
    await database.query('INSERT INTO "User" (id, email, "fullName", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP), ($4, $5, $6, CURRENT_TIMESTAMP)', [user, 'employee@example.test', 'Employee Example', manager, 'manager@example.test', 'Manager Example']);
    await database.query('INSERT INTO "Organisation" (id, name, slug, "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP), ($4, $5, $6, CURRENT_TIMESTAMP)', [firstOrg, 'D-Lab', 'dlab', secondOrg, 'The Field Institute', 'field-institute']);
    await database.query('INSERT INTO "Membership" (id, "userId", "organisationId", role, "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', [managerMembership, manager, firstOrg, 'MANAGER']);
  }, 30000);
  afterAll(async () => { await database.close(); });

  it('applies the full SQL migration and permits a same-organisation manager', async () => {
    await database.query('INSERT INTO "Membership" (id, "userId", "organisationId", role, "managerMembershipId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)', ['00000000-0000-4000-8000-000000000022', user, firstOrg, 'EMPLOYEE', managerMembership]);
    const result = await database.query<{ role: string }>('SELECT role FROM "Membership" WHERE "userId" = $1 AND "organisationId" = $2', [user, firstOrg]);
    expect(result.rows).toEqual([{ role: 'EMPLOYEE' }]);
  });

  it('rejects a manager membership from another organisation', async () => {
    await expect(database.query('INSERT INTO "Membership" (id, "userId", "organisationId", role, "managerMembershipId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)', ['00000000-0000-4000-8000-000000000023', user, secondOrg, 'EMPLOYEE', managerMembership])).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects duplicate membership for the same user and organisation', async () => {
    await expect(database.query('INSERT INTO "Membership" (id, "userId", "organisationId", role, "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', ['00000000-0000-4000-8000-000000000024', user, firstOrg, 'ADMIN'])).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects noncanonical roles', async () => {
    await expect(database.query('INSERT INTO "Membership" (id, "userId", "organisationId", role, "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', ['00000000-0000-4000-8000-000000000025', user, secondOrg, 'OWNER'])).rejects.toMatchObject({ code: '22P02' });
  });

  it('keeps application tables private to ordinary database roles through row-level security', async () => {
    await database.exec('CREATE ROLE profile_reader; GRANT USAGE ON SCHEMA public TO profile_reader; GRANT SELECT ON "User", "Organisation", "Membership" TO profile_reader; SET ROLE profile_reader;');
    try {
      expect((await database.query('SELECT * FROM "User"')).rows).toEqual([]);
      expect((await database.query('SELECT * FROM "Organisation"')).rows).toEqual([]);
      expect((await database.query('SELECT * FROM "Membership"')).rows).toEqual([]);
    } finally { await database.exec('RESET ROLE;'); }
  });
});
