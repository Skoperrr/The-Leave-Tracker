import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createAccessRepository } from '../src/repositories/access.js';
import { createAiDataRepository } from '../src/repositories/ai-data.js';
import { createAiToolsService } from '../src/services/ai-tools.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import { createGeminiJsonProvider, type AiJsonProvider } from '../src/lib/ai-provider.js';
import { readAiEnvironment } from '../src/config/ai-env.js';

describe.skipIf(!process.env.DATABASE_URL)('AI tools database isolation and reconciliation', () => {
  const ids = Array.from({ length: 20 }, () => randomUUID());
  const [manager, employee, peer, outsider, admin, orgA, orgB, managerA, employeeA, peerA, outsiderA, adminA, outsiderB, typeA, typeB] = ids as [string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,...string[]];
  const userIds = [manager, employee, peer, outsider, admin], orgIds = [orgA, orgB];
  const adminB = ids[15]!;
  let db: ReturnType<typeof createDatabase>;
  const plan = { intent: 'WHO_OFF', from: '2026-10-19', to: '2026-10-23', year: null, personName: null, questions: [] };
  const provider: AiJsonProvider = async task => (task.context as { question?: string }).question
    ? plan : { highlightIds: [(task.context as { candidates: { id: string }[] }).candidates[0]!.id] };
  function appWith(generate = provider) {
    return createApp(readEnvironment({ NODE_ENV: 'test' }), {
      verifyToken: async token => ({ manager, employee, admin } as Record<string, string>)[token] ?? null,
      repository: createAccessRepository(db),
      aiTools: createAiToolsService(createAiDataRepository(db), generate, () => new Date('2026-10-15T08:00:00Z')),
    });
  }
  const counts = () => Promise.all([
    db.leaveRequest.count({ where: { organisationId: { in: orgIds } } }),
    db.auditLog.count({ where: { actorUserId: { in: userIds } } }),
    db.calendarSyncJob.count({ where: { organisationId: { in: orgIds } } }),
  ]);
  beforeAll(async () => {
    db = createDatabase();
    await db.$transaction(async tx => {
      for (const [index, id] of userIds.entries()) await tx.user.create({ data: { id, email: `${id}@example.invalid`, fullName: ['Temporary Manager', 'Temporary Employee', 'Temporary Peer', 'Temporary Outsider', 'Temporary Admin'][index]! } });
      for (const id of orgIds) await tx.organisation.create({ data: { id, name: 'Temporary AI tools org', slug: `ai-tools-${id}` } });
      await tx.membership.createMany({ data: [
        { id: managerA, userId: manager, organisationId: orgA, role: 'MANAGER' },
        { id: adminA, userId: admin, organisationId: orgA, role: 'ADMIN' },
        { id: adminB, userId: admin, organisationId: orgB, role: 'ADMIN' },
        { id: outsiderA, userId: outsider, organisationId: orgA }, { id: outsiderB, userId: outsider, organisationId: orgB },
      ] });
      await tx.membership.createMany({ data: [
        { id: employeeA, userId: employee, organisationId: orgA, managerMembershipId: managerA },
        { id: peerA, userId: peer, organisationId: orgA, managerMembershipId: managerA },
      ] });
      await tx.leaveType.createMany({ data: [{ id: typeA, organisationId: orgA, name: 'Annual', code: 'ANNUAL' }, { id: typeB, organisationId: orgB, name: 'Annual', code: 'ANNUAL' }] });
      await tx.leaveBalance.create({ data: { membershipId: employeeA, organisationId: orgA, leaveTypeId: typeA, year: 2026, allocatedDays: 15 } });
      for (const row of [
        { userId: employee, membershipId: employeeA, organisationId: orgA, leaveTypeId: typeA, status: 'PENDING' as const },
        { userId: peer, membershipId: peerA, organisationId: orgA, leaveTypeId: typeA, status: 'APPROVED' as const },
        { userId: outsider, membershipId: outsiderA, organisationId: orgA, leaveTypeId: typeA, status: 'APPROVED' as const },
        { userId: manager, membershipId: managerA, organisationId: orgA, leaveTypeId: typeA, status: 'PENDING' as const },
        { userId: outsider, membershipId: outsiderB, organisationId: orgB, leaveTypeId: typeB, status: 'APPROVED' as const },
      ]) {
        const stored = await tx.leaveRequest.create({ data: { ...row, startDate: new Date('2026-10-22T00:00:00Z'), endDate: new Date('2026-10-23T00:00:00Z'), workingDays: 2,
          submittedAt: new Date('2026-10-01T08:00:00Z'), reason: 'Private fixture reason must never appear in AI tool responses',
          ...(row.status === 'APPROVED' ? { approverMembershipId: row.organisationId === orgA ? adminA : adminB, decidedAt: new Date('2026-10-02T08:00:00Z') } : {}) } });
        if (row.status === 'APPROVED') await tx.calendarEvent.create({ data: { requestId: stored.id, organisationId: row.organisationId, startDate: stored.startDate, endDate: stored.endDate } });
      }
    }, { timeout: 60000 });
  }, 70000);
  afterAll(async () => {
    if (!db) return;
    try {
      await db.$transaction(async tx => {
        await tx.calendarSyncJob.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.calendarEvent.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
        await tx.leaveRequest.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.leaveGroup.deleteMany({ where: { userId: { in: userIds } } });
        await tx.leaveBalance.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.membership.deleteMany({ where: { id: { in: [employeeA, peerA] } } });
        await tx.membership.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.leaveType.deleteMany({ where: { organisationId: { in: orgIds } } });
        await tx.organisation.deleteMany({ where: { id: { in: orgIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { timeout: 60000 });
    } finally { await db.$disconnect(); }
  }, 70000);
  it('reconciles manager scope/coverage and proves tools make zero writes', async () => {
    const before = await counts();
    const response = await request(appWith()).post('/api/v1/ai/manager-summary').set('Authorization', 'Bearer manager').send({ organisationId: orgA, from: '2026-10-19', to: '2026-10-23' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ activeMemberCount: 2, pendingCount: 1, approvedCount: 1, scope: 'DIRECT_REPORTS' });
    expect(response.body.data.dailyCoverage.find((day: { date: string }) => day.date === '2026-10-22')).toMatchObject({ approvedPeople: 1, projectedPeople: 2, projectedPercent: 100 });
    expect(response.body.data.sources.map((row: { employeeDisplayName: string }) => row.employeeDisplayName).sort()).toEqual(['Temporary Employee', 'Temporary Peer']);
    expect(JSON.stringify(response.body)).not.toContain('Private fixture reason');
    expect(await counts()).toEqual(before);
  }, 30000);
  it('lets admin review the broader organisation but still excludes self', async () => {
    const response = await request(appWith()).post('/api/v1/ai/manager-summary').set('Authorization', 'Bearer admin').send({ organisationId: orgA });
    expect(response.body.data).toMatchObject({ activeMemberCount: 4, pendingCount: 2, approvedCount: 2 });
  }, 30000);
  it('answers employees from approved organisation calendar rows only', async () => {
    const response = await request(appWith()).post('/api/v1/ai/ask-data').set('Authorization', 'Bearer employee').send({ organisationId: orgA, question: "Who's off next week?" });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ peopleCount: 2, requestCount: 2 });
    expect(response.body.data.rows.map((row: { employeeDisplayName: string }) => row.employeeDisplayName).sort()).toEqual(['Temporary Outsider', 'Temporary Peer']);
    expect(JSON.stringify(response.body)).not.toContain('Private fixture reason');
  }, 30000);
  it('reconciles own balance with pending reservations and rejects unrelated organisation access', async () => {
    const app = appWith(async () => ({ ...plan, intent: 'MY_BALANCE', from: null, to: null, year: 2026 }));
    const response = await request(app).post('/api/v1/ai/ask-data').set('Authorization', 'Bearer employee').send({ organisationId: orgA, question: 'What is my leave balance?' });
    expect(response.body.data.balances[0]).toMatchObject({ allocatedDays: 15, approvedDays: 0, pendingDays: 2, remainingDays: 13 });
    expect((await request(app).post('/api/v1/ai/ask-data').set('Authorization', 'Bearer employee').send({ organisationId: orgB, question: 'Who is off?' })).status).toBe(403);
    await expect(createAiDataRepository(db).review(employee, orgA, '2026-10-19', '2026-10-23')).rejects.toMatchObject({ status: 403 });
  }, 30000);
  it.skipIf(process.env.TEST_GEMINI_LIVE !== '1' || !process.env.GEMINI_API_KEY)('real Gemini plans a DB-backed answer and ranks real anonymous review facts', async () => {
    const before = await counts();
    const app = appWith(createGeminiJsonProvider(readAiEnvironment()));
    const answer = await request(app).post('/api/v1/ai/ask-data').set('Authorization', 'Bearer employee').send({ organisationId: orgA, question: "Who's off next week?" });
    expect(answer.status).toBe(200);
    expect(answer.body.data).toMatchObject({ status: 'ANSWER', peopleCount: 2, period: { from: '2026-10-19', to: '2026-10-23' } });
    const summary = await request(app).post('/api/v1/ai/manager-summary').set('Authorization', 'Bearer manager').send({ organisationId: orgA });
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ aiUsed: true, pendingCount: 1, approvedCount: 1 });
    expect(summary.body.data.highlights.length).toBeGreaterThan(0);
    expect(await counts()).toEqual(before);
  }, 60000);
});
