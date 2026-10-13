import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readDatabaseEnvironment } from '../src/config/database-env.js';
import { createDatabase } from '../src/lib/database.js';
import { createAccessRepository } from '../src/repositories/access.js';

// Opt-in live database tests. Every fixture is rolled back, including failing writes.
describe.skipIf(!process.env.DATABASE_URL)('live PostgreSQL constraints', () => {
  let client: pg.Client;
  let user: string;
  let org: string;
  let otherOrg: string;
  let member: string;
  let otherMember: string;
  let type: string;
  let otherType: string;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: readDatabaseEnvironment().DATABASE_URL, connectionTimeoutMillis: 10_000 });
    await client.connect();
  }, 20_000);
  afterAll(async () => { if (client) await client.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    [user, org, otherOrg, member, otherMember, type, otherType] = Array.from({ length: 7 }, () => randomUUID()) as [string, string, string, string, string, string, string];
    await client.query('INSERT INTO "User" (id,email,"fullName","updatedAt") VALUES ($1,$2,$3,NOW())', [user, `${user}@example.invalid`, 'Temporary test user']);
    for (const id of [org, otherOrg]) {
      await client.query('INSERT INTO "Organisation" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,NOW())', [id, 'Temporary test organisation', `test-${id}`]);
    }
    for (const [id, organisationId] of [[member, org], [otherMember, otherOrg]]) {
      await client.query('INSERT INTO "Membership" (id,"userId","organisationId","updatedAt") VALUES ($1,$2,$3,NOW())', [id, user, organisationId]);
    }
    for (const [id, organisationId] of [[type, org], [otherType, otherOrg]]) {
      await client.query('INSERT INTO "LeaveType" (id,"organisationId",code,name,"updatedAt") VALUES ($1,$2,$3,$4,NOW())', [id, organisationId, 'TEST', 'Test leave']);
    }
  }, 20_000);
  afterEach(async () => { await client.query('ROLLBACK'); });

  it('has enabled RLS on all nine business tables', async () => {
    const result = await client.query('SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_class.relnamespace=pg_namespace.oid WHERE nspname=$1 AND relname=ANY($2)',
      ['public', ['User', 'Organisation', 'Membership', 'LeaveType', 'LeaveBalance', 'LeaveGroup', 'LeaveRequest', 'CalendarEvent', 'AuditLog']]);
    expect(result.rows).toHaveLength(9);
    expect(result.rows.every((row) => row.relrowsecurity === true)).toBe(true);
  });
  it('prevents duplicate user/organisation memberships', async () => {
    await expect(client.query('INSERT INTO "Membership" (id,"userId","organisationId","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), user, org]))
      .rejects.toMatchObject({ code: '23505' });
  });
  it('prevents cross-organisation managers', async () => {
    await expect(client.query('UPDATE "Membership" SET "managerMembershipId"=$1 WHERE id=$2', [otherMember, member]))
      .rejects.toMatchObject({ code: '23503' });
  });
  it('prevents allocating a type from a different organisation', async () => {
    await expect(client.query('INSERT INTO "LeaveBalance" (id,"membershipId","organisationId","leaveTypeId",year,"allocatedDays","updatedAt") VALUES ($1,$2,$3,$4,2026,15,NOW())', [randomUUID(), member, org, otherType]))
      .rejects.toMatchObject({ code: '23503' });
  });
  it('prevents negative leave allocations', async () => {
    await expect(client.query('INSERT INTO "LeaveBalance" (id,"membershipId","organisationId","leaveTypeId",year,"allocatedDays","updatedAt") VALUES ($1,$2,$3,$4,2026,-1,NOW())', [randomUUID(), member, org, type]))
      .rejects.toMatchObject({ code: '23514' });
  });
  it('persists a date-only pending request', async () => {
    const id = randomUUID();
    await client.query('INSERT INTO "LeaveRequest" (id,"membershipId","organisationId","userId","leaveTypeId","startDate","endDate","workingDays","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,5,NOW())', [id, member, org, user, type, '2026-11-02', '2026-11-06']);
    const result = await client.query('SELECT status,"startDate"::text,"endDate"::text FROM "LeaveRequest" WHERE id=$1', [id]);
    expect(result.rows).toEqual([{ status: 'PENDING', startDate: '2026-11-02', endDate: '2026-11-06' }]);
  });
  it('rejects invalid request date order', async () => {
    await expect(client.query('INSERT INTO "LeaveRequest" (id,"membershipId","organisationId","userId","leaveTypeId","startDate","endDate","workingDays","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,1,NOW())', [randomUUID(), member, org, user, type, '2026-11-06', '2026-11-02']))
      .rejects.toMatchObject({ code: '23514' });
  });
  it('rejects approval without decision metadata', async () => {
    await expect(client.query('INSERT INTO "LeaveRequest" (id,"membershipId","organisationId","userId","leaveTypeId","startDate","endDate","workingDays",status,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,5,$8,NOW())', [randomUUID(), member, org, user, type, '2026-11-02', '2026-11-06', 'APPROVED']))
      .rejects.toMatchObject({ code: '23514' });
  });
});

describe.skipIf(!process.env.DATABASE_URL)('live access repository', () => {
  it('filters inactive memberships/organisations/types and reloads changed roles', async () => {
    const database = createDatabase();
    const rollback = new Error('intentional fixture rollback');
    try {
      await expect(database.$transaction(async (transaction) => {
        const user = await transaction.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid`, fullName: 'Temporary access test' } });
        const organisations = [];
        for (const active of [true, true, false]) {
          organisations.push(await transaction.organisation.create({ data: { slug: `test-${randomUUID()}`, name: 'Temporary organisation', active } }));
        }
        for (const [index, organisation] of organisations.entries()) {
          await transaction.membership.create({ data: { userId: user.id, organisationId: organisation.id, active: index !== 1, role: 'EMPLOYEE' } });
        }
        const organisation = organisations[0]!;
        await transaction.leaveType.createMany({ data: [
          { organisationId: organisation.id, code: 'ACTIVE', name: 'Active type', active: true },
          { organisationId: organisation.id, code: 'INACTIVE', name: 'Inactive type', active: false },
        ] });
        const repository = createAccessRepository(transaction);
        const account = await repository.findAccount(user.id);
        expect(account?.memberships).toHaveLength(1);
        expect(account?.memberships[0]?.organisationId).toBe(organisation.id);
        expect(account?.memberships[0]?.role).toBe('EMPLOYEE');
        await transaction.membership.update({ where: { userId_organisationId: { userId: user.id, organisationId: organisation.id } }, data: { role: 'MANAGER' } });
        expect((await repository.findAccount(user.id))?.memberships[0]?.role).toBe('MANAGER');
        expect((await repository.listLeaveTypes(organisation.id)).map((entry) => entry.code)).toEqual(['ACTIVE']);
        throw rollback;
      }, { timeout: 30_000 })).rejects.toBe(rollback);
    } finally { await database.$disconnect(); }
  }, 40_000);
});
