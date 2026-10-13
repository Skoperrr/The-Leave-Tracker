import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createLeaveRepository } from '../src/repositories/leave.js';
import { createLeaveService } from '../src/services/leave.js';
import { createManagerService } from '../src/services/manager.js';
import { createCalendarWorker } from '../src/services/calendar-worker.js';
import { createCalendarCipher } from '../src/lib/calendar-crypto.js';
import type { GoogleProvider } from '../src/lib/google-calendar.js';
import type { GoogleEventPayload } from '../src/lib/calendar-event.js';

describe.skipIf(!process.env.DATABASE_URL)('calendar outbox on real PostgreSQL (Google mocked)', () => {
  const org = randomUUID(), otherOrg = randomUUID(), employee = randomUUID(), administrator = randomUUID(), unrelated = randomUUID();
  const organisations = [org, otherOrg], users = [employee, administrator, unrelated];
  let database: ReturnType<typeof createDatabase>;
  let repository: ReturnType<typeof createLeaveRepository>;
  const cipher = createCalendarCipher({ '1': randomBytes(32) }, '1');
  let type: string;
  beforeAll(async () => {
    database = createDatabase(); repository = createLeaveRepository(database);
    await database.$transaction(async tx => {
      for (const id of users) await tx.user.create({ data: { id, email: `${id}@company.test`, fullName: 'Temporary calendar check' } });
      for (const id of organisations) await tx.organisation.create({ data: { id, name: 'Temporary calendar organisation', slug: `test-${id}` } });
      await tx.membership.createMany({ data: [{ userId: employee, organisationId: org }, { userId: administrator, organisationId: org, role: 'ADMIN' }, { userId: unrelated, organisationId: otherOrg }] });
      const leaveType = await tx.leaveType.create({ data: { organisationId: org, code: 'ANNUAL', name: 'Annual' } }); type = leaveType.id;
      const membership = await tx.membership.findUniqueOrThrow({ where: { userId_organisationId: { userId: employee, organisationId: org } } });
      await tx.leaveBalance.create({ data: { organisationId: org, membershipId: membership.id, leaveTypeId: type, year: 2026, allocatedDays: 15 } });
      await tx.organisationCalendarIntegration.create({ data: { organisationId: org, status: 'CONNECTED', calendarId: 'sandbox-shared',
        googleSubject: 'mock-google-subject', encryptedRefreshToken: cipher.encrypt('mock-refresh', org), invitationsEnabled: true, connectedByUserId: administrator } });
    }, { timeout: 30_000 });
  }, 60_000);
  afterAll(async () => {
    if (!database) return;
    try {
      await database.$transaction(async tx => {
        await tx.externalCalendarEvent.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.calendarSyncJob.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.googleOAuthState.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.organisationCalendarIntegration.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.calendarEvent.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.auditLog.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.leaveRequest.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.leaveGroup.deleteMany({ where: { userId: { in: users } } });
        await tx.leaveBalance.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.membership.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.leaveType.deleteMany({ where: { organisationId: { in: organisations } } });
        await tx.organisation.deleteMany({ where: { id: { in: organisations } } });
        await tx.user.deleteMany({ where: { id: { in: users } } });
      }, { timeout: 60_000 });
    } finally { await database.$disconnect(); }
  }, 70_000);
  it('commits approval plus one job and claims it once with concurrent workers', async () => {
    const created = await createLeaveService(repository).create(employee, { organisationIds: [org], leaveTypeCode: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Must never reach Google' });
    const id = created.requests[0]!.id;
    expect(await database.calendarSyncJob.count({ where: { organisationId: org } })).toBe(0);
    await createManagerService(repository).decide(administrator, id, { decision: 'APPROVE' });
    expect(await database.calendarSyncJob.count({ where: { organisationId: org } })).toBe(1);
    const provider = { upsert: vi.fn(async (_refresh: string, _calendar: string, payload: GoogleEventPayload) => ({ id: payload.id, etag: 'mock-etag' })) } as unknown as GoogleProvider;
    const recipients = vi.fn(async (members: { id: string; email: string }[]) => members.map(member => member.email));
    const worker = createCalendarWorker(database, cipher, provider, recipients);
    const results = await Promise.all([worker.run(1, org), worker.run(1, org)]);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(provider.upsert).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(provider.upsert).mock.calls[0]![2];
    expect(payload.end.date).toBe('2026-11-07'); expect(JSON.stringify(payload)).not.toContain('Must never reach Google');
    expect(payload.attendees.map(person => person.email)).not.toContain(`${unrelated}@company.test`);
    expect(payload.attendees).toHaveLength(2);
    expect((await database.calendarSyncJob.findFirstOrThrow({ where: { organisationId: org } })).state).toBe('SUCCEEDED');
    expect(await database.externalCalendarEvent.count({ where: { organisationId: org } })).toBe(1);
    await expect(createManagerService(repository).decide(administrator, id, { decision: 'APPROVE' })).rejects.toMatchObject({ code: 'STATUS_CONFLICT' });
    const balance = await createLeaveService(repository).balances(employee, org, 2026);
    expect(balance[0]).toMatchObject({ approvedDays: 5, pendingDays: 0, remainingDays: 10 });
  }, 120_000);
});
