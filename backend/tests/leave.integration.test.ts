import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createAccessRepository } from '../src/repositories/access.js';
import { createLeaveRepository } from '../src/repositories/leave.js';
import { createLeaveService } from '../src/services/leave.js';
import { createManagerService } from '../src/services/manager.js';
import type { LeaveRepository, LeaveTransaction } from '../src/repositories/leave.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import type { Express } from 'express';

describe.skipIf(!process.env.DATABASE_URL)('employee workflows on real PostgreSQL', () => {
  const database = createDatabase;
  let db: ReturnType<typeof createDatabase>;
  let app: Express;
  const owner = randomUUID(), peer = randomUUID(), manager = randomUUID();
  const admin = randomUUID(), fieldManager = randomUUID(), wrongManager = randomUUID();
  const orgA = randomUUID(), orgB = randomUUID();
  const memberA = randomUUID(), memberB = randomUUID(), peerMember = randomUUID(), managerMember = randomUUID();
  const fieldManagerMember = randomUUID(), wrongManagerMember = randomUUID(), adminA = randomUUID(), adminB = randomUUID(), managerB = randomUUID();
  const annualA = randomUUID(), annualB = randomUUID(), sickA = randomUUID();
  const userIds = [owner, peer, manager, admin, fieldManager, wrongManager], orgIds = [orgA, orgB];
  const payload = (orgs = [orgA], startDate = '2026-11-02', endDate = '2026-11-06') => ({ organisationIds: orgs, leaveTypeCode: 'ANNUAL', startDate, endDate, reason: 'Fictional private test note' });
  const create = (body = payload()) => request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer owner').send(body);
  const balances = () => request(app).get(`/api/v1/balances?organisationId=${orgA}&year=2026`).set('Authorization', 'Bearer owner');
  const cancel = (id: string, token = 'owner') => request(app).post(`/api/v1/leave-requests/${id}/cancel`).set('Authorization', `Bearer ${token}`);
  const decide = (id: string, token = 'manager', decision = 'APPROVE', comment?: string) => request(app)
    .post(`/api/v1/manager/leave-requests/${id}/decision`).set('Authorization', `Bearer ${token}`).send({ decision, ...(comment === undefined ? {} : { comment }) });
  const calendar = (org = orgA, token = 'owner', from = '2026-11-01', to = '2026-11-30') => request(app)
    .get(`/api/v1/calendar-events?organisationId=${org}&from=${from}&to=${to}`).set('Authorization', `Bearer ${token}`);
  const clearRequests = async () => {
    await db.$transaction(async (tx) => {
      await tx.calendarEvent.deleteMany({ where: { organisationId: { in: orgIds } } });
      await tx.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await tx.leaveRequest.deleteMany({ where: { userId: { in: userIds } } });
      await tx.leaveGroup.deleteMany({ where: { userId: { in: userIds } } });
    }, { timeout: 30_000 });
  };
  beforeAll(async () => {
    db = database();
    await db.$transaction(async (tx) => {
      for (const id of userIds) await tx.user.create({ data: { id, email: `${id}@example.invalid`, fullName: 'Temporary workflow test' } });
      for (const id of orgIds) await tx.organisation.create({ data: { id, slug: `test-${id}`, name: 'Temporary workflow org' } });
      await tx.membership.createMany({ data: [
        { id: managerMember, userId: manager, organisationId: orgA, role: 'MANAGER' },
        { id: managerB, userId: manager, organisationId: orgB, role: 'EMPLOYEE' },
        { id: fieldManagerMember, userId: fieldManager, organisationId: orgB, role: 'MANAGER' },
        { id: wrongManagerMember, userId: wrongManager, organisationId: orgA, role: 'MANAGER' },
        { id: adminA, userId: admin, organisationId: orgA, role: 'ADMIN' },
        { id: adminB, userId: admin, organisationId: orgB, role: 'ADMIN' },
        { id: memberA, userId: owner, organisationId: orgA, managerMembershipId: managerMember },
        { id: memberB, userId: owner, organisationId: orgB, managerMembershipId: fieldManagerMember },
        { id: peerMember, userId: peer, organisationId: orgA },
      ] });
      await tx.leaveType.createMany({ data: [
        { id: annualA, organisationId: orgA, code: 'ANNUAL', name: 'Annual' },
        { id: sickA, organisationId: orgA, code: 'SICK', name: 'Sick' },
        { id: annualB, organisationId: orgB, code: 'ANNUAL', name: 'Annual' },
      ] });
      await tx.leaveBalance.createMany({ data: [
        { membershipId: memberA, organisationId: orgA, leaveTypeId: annualA, year: 2026, allocatedDays: 15 },
        { membershipId: memberA, organisationId: orgA, leaveTypeId: sickA, year: 2026, allocatedDays: 10 },
        { membershipId: memberB, organisationId: orgB, leaveTypeId: annualB, year: 2026, allocatedDays: 15 },
        { membershipId: peerMember, organisationId: orgA, leaveTypeId: annualA, year: 2026, allocatedDays: 15 },
        { membershipId: managerMember, organisationId: orgA, leaveTypeId: annualA, year: 2026, allocatedDays: 15 },
      ] });
    }, { timeout: 60_000 });
    app = createApp(readEnvironment({ NODE_ENV: 'test' }), {
      verifyToken: async (token) => ({ owner, peer, manager, admin, fieldManager, wrongManager } as Record<string, string>)[token] ?? null,
      repository: createAccessRepository(db), leave: createLeaveService(createLeaveRepository(db)),
      manager: createManagerService(createLeaveRepository(db)),
    });
  }, 70_000);
  beforeEach(async () => {
    await clearRequests();
    await db.leaveBalance.updateMany({ where: { membershipId: { in: [memberA, memberB] }, leaveType: { code: 'ANNUAL' } }, data: { allocatedDays: 15 } });
  }, 30_000);
  afterAll(async () => {
    if (!db) return;
    try {
      await clearRequests();
      await db.$transaction(async (tx) => {
        await tx.leaveBalance.deleteMany({ where: { membership: { userId: { in: userIds } } } });
        await tx.membership.deleteMany({ where: { id: { in: [memberA, memberB, peerMember] } } });
        await tx.membership.deleteMany({ where: { userId: { in: userIds } } });
        await tx.leaveType.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.organisation.deleteMany({ where: { id: { in: orgIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { timeout: 30_000 });
    } finally { await db.$disconnect(); }
  }, 40_000);

  it('persists five weekdays and reserves them until cancellation', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    const item = created.body.data.requests[0];
    expect(item).toMatchObject({ status: 'PENDING', workingDays: 5, startDate: '2026-11-02', endDate: '2026-11-06', organisationId: orgA });
    expect(created.body.data.groupId).toBeNull();
    expect((await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA)).toMatchObject({ allocatedDays: 15, pendingDays: 5, approvedDays: 0, remainingDays: 10 });
    expect((await cancel(item.id)).status).toBe(200);
    expect((await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA)).toMatchObject({ pendingDays: 0, remainingDays: 15 });
    expect((await cancel(item.id)).status).toBe(409);
    expect(await db.auditLog.count({ where: { entityId: item.id } })).toBe(2);
  }, 30_000);
  it('creates linked children atomically and cancels only the selected child', async () => {
    const result = await create(payload([orgB, orgA]));
    expect(result.status).toBe(201);
    expect(result.body.data.groupId).toBeTruthy();
    expect(result.body.data.requests.map((entry: { organisationId: string }) => entry.organisationId)).toEqual([orgB, orgA]);
    const [first, second] = result.body.data.requests;
    await cancel(first.id);
    expect((await db.leaveRequest.findUnique({ where: { id: second.id } }))?.status).toBe('PENDING');
    expect(await db.calendarEvent.count({ where: { organisationId: { in: orgIds } } })).toBe(0);
  }, 30_000);
  it('rolls back every child when one organisation lacks balance', async () => {
    await db.leaveBalance.updateMany({ where: { membershipId: memberB }, data: { allocatedDays: 0 } });
    const result = await create(payload([orgA, orgB]));
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await db.leaveRequest.count({ where: { userId: owner } })).toBe(0);
    expect(await db.leaveGroup.count({ where: { userId: owner } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorUserId: owner } })).toBe(0);
  }, 30_000);
  it('rejects duplicate/overlapping requests across leave types', async () => {
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
    expect((await create({ ...payload(), leaveTypeCode: 'SICK' })).body.error.code).toBe('OVERLAPPING_REQUEST');
  }, 30_000);
  it('requires membership in every selected organisation', async () => {
    const result = await create(payload([orgA, randomUUID()]));
    expect(result.status).toBe(403);
    expect(await db.leaveRequest.count({ where: { userId: owner } })).toBe(0);
    expect((await request(app).get(`/api/v1/balances?organisationId=${orgB}&year=2026`).set('Authorization', 'Bearer peer')).status).toBe(403);
  }, 30_000);
  it('keeps history private, paginated and filtered', async () => {
    await create(payload([orgA], '2026-11-02', '2026-11-02'));
    await create(payload([orgB], '2026-11-09', '2026-11-09'));
    const response = await request(app).get('/api/v1/leave-requests?page=1&pageSize=1&status=PENDING').set('Authorization', 'Bearer owner');
    expect(response.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(response.body.data).toHaveLength(1);
    const peerHistory = await request(app).get('/api/v1/leave-requests').set('Authorization', 'Bearer peer');
    expect(peerHistory.body).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    expect((await request(app).get(`/api/v1/leave-requests?organisationId=${orgB}`).set('Authorization', 'Bearer peer')).status).toBe(403);
  }, 30_000);
  it('hides another employee request from cancellation', async () => {
    const result = await create();
    expect((await cancel(result.body.data.requests[0].id, 'peer')).status).toBe(404);
    expect((await cancel(result.body.data.requests[0].id, 'manager')).status).toBe(404);
  }, 30_000);
  it('counts approved once and ignores declined/cancelled records', async () => {
    const created = await create(payload([orgA], '2026-11-02', '2026-11-03'));
    await db.leaveRequest.update({ where: { id: created.body.data.requests[0].id }, data: { status: 'APPROVED', approverMembershipId: managerMember, decidedAt: new Date() } });
    for (const status of ['DECLINED', 'CANCELLED'] as const) {
      await db.leaveRequest.create({ data: { membershipId: memberA, userId: owner, organisationId: orgA, leaveTypeId: annualA,
        startDate: new Date('2026-11-09'), endDate: new Date('2026-11-10'), workingDays: 2, status,
        ...(status === 'DECLINED' ? { approverMembershipId: managerMember, decidedAt: new Date(), decisionComment: 'Fictional test decline' } : {}) } });
    }
    const balance = (await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA);
    expect(balance).toMatchObject({ pendingDays: 0, approvedDays: 2, remainingDays: 13 });
    expect((await cancel(created.body.data.requests[0].id)).status).toBe(409);
  }, 30_000);
  it('prevents concurrent non-overlapping submissions from overspending', async () => {
    await db.leaveBalance.updateMany({ where: { membershipId: memberA, leaveTypeId: annualA }, data: { allocatedDays: 5 } });
    const results = await Promise.all([create(payload([orgA], '2026-11-02', '2026-11-05')), create(payload([orgA], '2026-11-09', '2026-11-12'))]);
    expect(results.map((entry) => entry.status).sort()).toEqual([201, 422]);
    expect((await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA)).toMatchObject({ pendingDays: 4, remainingDays: 1 });
  }, 30_000);
  it('serialises reversed multi-org selections without duplicate groups', async () => {
    const results = await Promise.all([create(payload([orgA, orgB])), create(payload([orgB, orgA]))]);
    expect(results.map((entry) => entry.status).sort()).toEqual([201, 409]);
    expect(await db.leaveGroup.count({ where: { userId: owner } })).toBe(1);
    expect(await db.leaveRequest.count({ where: { userId: owner } })).toBe(2);
  }, 30_000);
  it('allows only one concurrent cancellation and one cancellation audit', async () => {
    const result = await create();
    const id = result.body.data.requests[0].id;
    const cancelled = await Promise.all([cancel(id), cancel(id)]);
    expect(cancelled.map((entry) => entry.status).sort()).toEqual([200, 409]);
    expect(await db.auditLog.count({ where: { entityId: id, action: 'REQUEST_CANCELLED' } })).toBe(1);
  }, 30_000);
  it('rejects impossible dates and weekend-only requests', async () => {
    for (const [start, end] of [['2026-02-29', '2026-03-02'], ['2026-11-07', '2026-11-08'], ['2026-12-31', '2027-01-04']]) {
      expect((await create(payload([orgA], start!, end!))).status).toBe(400);
    }
  }, 30_000);

  it('approves reserved leave once with decision metadata, audit and one calendar event', async () => {
    const created = await create();
    const id = created.body.data.requests[0].id;
    const result = await decide(id);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ status: 'APPROVED', approverName: 'Temporary workflow test', decisionComment: null });
    expect(result.body.data.decidedAt).toBeTruthy();
    expect((await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA)).toMatchObject({ approvedDays: 5, pendingDays: 0, remainingDays: 10 });
    expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: id, action: 'REQUEST_APPROVED', actorUserId: manager } })).toBe(1);
    expect((await decide(id)).status).toBe(409);
    expect((await cancel(id)).status).toBe(409);
  }, 30_000);
  it('declines with a comment, releases pending reservation and creates no event', async () => {
    const id = (await create()).body.data.requests[0].id;
    expect((await decide(id, 'manager', 'DECLINE')).status).toBe(400);
    expect((await decide(id, 'manager', 'DECLINE', '  ')).status).toBe(400);
    const declined = await decide(id, 'manager', 'DECLINE', '  Fictional decline comment  ');
    expect(declined.status).toBe(200);
    expect(declined.body.data).toMatchObject({ status: 'DECLINED', decisionComment: 'Fictional decline comment' });
    expect((await balances()).body.data.find((entry: { leaveTypeId: string }) => entry.leaveTypeId === annualA)).toMatchObject({ pendingDays: 0, remainingDays: 15 });
    expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: id, action: 'REQUEST_DECLINED' } })).toBe(1);
    expect((await calendar()).body.data).toEqual([]);
  }, 30_000);
  it('scopes queues to assigned teams, allows org-wide admin review and filters history', async () => {
    const id = (await create()).body.data.requests[0].id;
    const peerRequest = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer peer').send(payload());
    expect(peerRequest.status).toBe(201);
    const queue = (token: string, status = 'PENDING') => request(app).get(`/api/v1/manager/leave-requests?organisationId=${orgA}&status=${status}`).set('Authorization', `Bearer ${token}`);
    const team = await queue('manager');
    expect(team.body.meta.total).toBe(1);
    expect(team.body.data[0]).toMatchObject({ id, employeeId: owner, employeeDisplayName: 'Temporary workflow test' });
    expect((await queue('wrongManager')).body.data).toEqual([]);
    expect((await decide(id, 'wrongManager')).status).toBe(404);
    expect((await queue('admin')).body.meta.total).toBe(2);
    expect((await queue('owner')).status).toBe(403);
    expect((await decide(peerRequest.body.data.requests[0].id, 'manager')).status).toBe(404);
    expect((await decide(peerRequest.body.data.requests[0].id, 'admin')).status).toBe(200);
    await decide(id);
    expect((await queue('manager', 'APPROVED')).body.meta.total).toBe(1);
  }, 40_000);
  it('prevents self decisions and carrying manager privileges to another organisation', async () => {
    const own = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer manager').send(payload());
    expect(own.status).toBe(201);
    expect((await decide(own.body.data.requests[0].id)).status).toBe(403);
    const otherId = (await create(payload([orgB]))).body.data.requests[0].id;
    expect((await decide(otherId)).status).toBe(404);
    expect((await decide(otherId, 'peer')).status).toBe(404);
    expect((await request(app).get(`/api/v1/manager/leave-requests?organisationId=${orgB}`).set('Authorization', 'Bearer manager')).status).toBe(403);
  }, 30_000);
  it('shows approved-only calendars with inclusive boundaries and no sensitive notes/type', async () => {
    const id = (await create()).body.data.requests[0].id;
    expect((await calendar()).body.data).toEqual([]);
    await decide(id);
    const response = await calendar(orgA, 'peer', '2026-11-06', '2026-11-06');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['id', 'organisationId', 'requestId', 'employeeDisplayName', 'title', 'startDate', 'endDate', 'allDay'].sort());
    expect(response.body.data[0]).toMatchObject({ requestId: id, title: 'Temporary workflow test — On leave', startDate: '2026-11-02', endDate: '2026-11-06', allDay: true });
    expect(JSON.stringify(response.body)).not.toContain('Fictional private test note');
    expect((await calendar(orgA, 'peer', '2026-11-07', '2026-11-08')).body.data).toEqual([]);
    expect((await calendar(orgB, 'peer')).status).toBe(403);
  }, 30_000);
  it('approves linked organisations independently and isolates their calendar events', async () => {
    const result = await create(payload([orgA, orgB]));
    const [first, second] = result.body.data.requests;
    await decide(first.id);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('PENDING');
    expect((await calendar(orgA)).body.data).toHaveLength(1);
    expect((await calendar(orgB)).body.data).toEqual([]);
    expect((await decide(second.id, 'fieldManager')).status).toBe(200);
    expect((await calendar(orgB)).body.data[0].requestId).toBe(second.id);
  }, 30_000);
  it('commits exactly one simultaneous approval without duplicate audit/events', async () => {
    const id = (await create()).body.data.requests[0].id;
    const results = await Promise.all([decide(id), decide(id, 'admin')]);
    expect(results.map((entry) => entry.status).sort()).toEqual([200, 409]);
    expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: id, action: 'REQUEST_APPROVED' } })).toBe(1);
  }, 30_000);
  it('serialises simultaneous approval and decline into one terminal decision', async () => {
    const id = (await create()).body.data.requests[0].id;
    const results = await Promise.all([decide(id), decide(id, 'admin', 'DECLINE', 'Fictional concurrent decline')]);
    expect(results.map((entry) => entry.status).sort()).toEqual([200, 409]);
    const stored = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
    expect(['APPROVED', 'DECLINED']).toContain(stored.status);
    expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(stored.status === 'APPROVED' ? 1 : 0);
    expect(await db.auditLog.count({ where: { entityId: id, action: { in: ['REQUEST_APPROVED', 'REQUEST_DECLINED'] } } })).toBe(1);
  }, 30_000);
  it('rejects reversed or impossible calendar dates', async () => {
    expect((await calendar(orgA, 'owner', '2026-11-06', '2026-11-02')).status).toBe(400);
    expect((await calendar(orgA, 'owner', '2026-02-29', '2026-03-01')).status).toBe(400);
  }, 30_000);
  it('serialises approval against cancellation without orphan events or double release', async () => {
    const id = (await create()).body.data.requests[0].id;
    const results = await Promise.all([decide(id), cancel(id)]);
    expect(results.map((entry) => entry.status).sort()).toEqual([200, 409]);
    const stored = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
    const count = await db.calendarEvent.count({ where: { requestId: id } });
    expect(count).toBe(stored.status === 'APPROVED' ? 1 : 0);
  }, 30_000);
  it('revalidates reduced allocation before approval and still permits decline', async () => {
    const id = (await create()).body.data.requests[0].id;
    await db.leaveBalance.updateMany({ where: { membershipId: memberA, leaveTypeId: annualA }, data: { allocatedDays: 1 } });
    expect((await decide(id)).status).toBe(422);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(0);
    expect((await decide(id, 'manager', 'DECLINE', 'Allocation changed')).status).toBe(200);
  }, 30_000);
  it('rolls back request status and audit when calendar or audit persistence fails', async () => {
    const id = (await create()).body.data.requests[0].id;
    const repository = createLeaveRepository(db);
    for (const delegateName of ['calendarEvent', 'auditLog']) {
      const faulty: LeaveRepository = {
        read: repository.read,
        write<T>(operation: (transaction: LeaveTransaction) => Promise<T>) {
          return repository.write((transaction) => operation(new Proxy(transaction, {
            get(target, key) {
              if (key === delegateName) return { create: async () => { throw new Error('Simulated persistence failure'); }, upsert: async () => { throw new Error('Simulated persistence failure'); } };
              return Reflect.get(target, key);
            },
          })));
        },
      };
      await expect(createManagerService(faulty).decide(manager, id, { decision: 'APPROVE' })).rejects.toThrow('Simulated persistence failure');
      expect((await db.leaveRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
      expect(await db.auditLog.count({ where: { entityId: id, action: 'REQUEST_APPROVED' } })).toBe(0);
      expect(await db.calendarEvent.count({ where: { requestId: id } })).toBe(0);
    }
  }, 40_000);
});
