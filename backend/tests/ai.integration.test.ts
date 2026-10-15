import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/lib/database.js';
import { createAccessRepository } from '../src/repositories/access.js';
import { createLeaveRepository } from '../src/repositories/leave.js';
import { createLeaveService } from '../src/services/leave.js';
import { createAiLeaveDraftService } from '../src/services/ai-leave-draft.js';
import { createGeminiProvider, type AiProvider } from '../src/lib/ai-provider.js';
import { readAiEnvironment } from '../src/config/ai-env.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';

// Opt-in PostgreSQL fixtures; never reuse actual employees or calendars.
// TEST_GEMINI_LIVE=1 additionally enables one real Gemini call.
describe.skipIf(!process.env.DATABASE_URL)('AI draft and existing submission on PostgreSQL', () => {
  const userId = randomUUID(), organisationId = randomUUID(), membershipId = randomUUID(), leaveTypeId = randomUUID();
  let db: ReturnType<typeof createDatabase>;
  const body = { organisationIds: [organisationId], text: 'Annual leave from 22 October 2026 to 23 October 2026' };
  const ready = { status: 'READY', draft: { leaveTypeCode: 'ANNUAL', startDate: '2026-10-22', endDate: '2026-10-23' }, questions: [] };
  function appWith(provider: AiProvider) {
    const repository = createAccessRepository(db);
    return createApp(readEnvironment({ NODE_ENV: 'test' }), {
      verifyToken: async token => token === 'fixture-token' ? userId : null,
      repository, leave: createLeaveService(createLeaveRepository(db)),
      ai: createAiLeaveDraftService(repository, provider, () => new Date('2026-10-15T08:00:00Z')),
    });
  }
  const counts = () => Promise.all([
    db.leaveRequest.count({ where: { userId } }), db.leaveGroup.count({ where: { userId } }),
    db.auditLog.count({ where: { actorUserId: userId } }),
    db.calendarSyncJob.count({ where: { organisationId } }),
  ]);
  beforeAll(async () => {
    db = createDatabase();
    await db.$transaction(async tx => {
      await tx.user.create({ data: { id: userId, email: `${userId}@example.invalid`, fullName: 'Temporary AI fixture' } });
      await tx.organisation.create({ data: { id: organisationId, slug: `ai-test-${organisationId}`, name: 'Temporary AI fixture org' } });
      await tx.membership.create({ data: { id: membershipId, userId, organisationId } });
      await tx.leaveType.create({ data: { id: leaveTypeId, organisationId, code: 'ANNUAL', name: 'Annual leave' } });
      await tx.leaveBalance.create({ data: { membershipId, organisationId, leaveTypeId, year: 2026, allocatedDays: 15 } });
    }, { timeout: 30000 });
  }, 40000);
  afterAll(async () => {
    if (!db) return;
    try {
      await db.$transaction(async tx => {
        await tx.calendarSyncJob.deleteMany({ where: { organisationId } });
        await tx.auditLog.deleteMany({ where: { actorUserId: userId } });
        await tx.leaveRequest.deleteMany({ where: { userId } });
        await tx.leaveGroup.deleteMany({ where: { userId } });
        await tx.leaveBalance.deleteMany({ where: { membershipId } });
        await tx.membership.deleteMany({ where: { id: membershipId } });
        await tx.leaveType.deleteMany({ where: { id: leaveTypeId } });
        await tx.organisation.deleteMany({ where: { id: organisationId } });
        await tx.user.deleteMany({ where: { id: userId } });
      }, { timeout: 30000 });
    } finally { await db.$disconnect(); }
  }, 40000);

  it('draft makes zero writes; final submission still checks changed balance, then explicitly persists', async () => {
    const app = appWith(async () => ready);
    const before = await counts();
    const draft = await request(app).post('/api/v1/ai/leave-draft').set('Authorization', 'Bearer fixture-token').send(body);
    expect(draft.status).toBe(200);
    expect(draft.body.data.workingDays).toBe(2);
    expect(await counts()).toEqual(before);
    await db.leaveBalance.updateMany({ where: { membershipId }, data: { allocatedDays: 0 } });
    const rejected = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer fixture-token').send(draft.body.data.draft);
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await counts()).toEqual(before);
    await db.leaveBalance.updateMany({ where: { membershipId }, data: { allocatedDays: 15 } });
    const saved = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer fixture-token').send(draft.body.data.draft);
    expect(saved.status).toBe(201);
    const stored = await db.leaveRequest.findFirstOrThrow({ where: { userId, organisationId } });
    expect(stored.status).toBe('PENDING');
    expect(Number(stored.workingDays)).toBe(2);
  }, 40000);

  it.skipIf(process.env.TEST_GEMINI_LIVE !== '1' || !process.env.GEMINI_API_KEY)('real Gemini → validated draft → explicit submission → persisted request', async () => {
    // Separate dates avoid the deterministic fixture's pending request.
    const text = 'Annual leave from 26 October 2026 to 27 October 2026';
    const app = appWith(createGeminiProvider(readAiEnvironment()));
    const before = await counts();
    const draft = await request(app).post('/api/v1/ai/leave-draft').set('Authorization', 'Bearer fixture-token').send({ ...body, text });
    expect(draft.status).toBe(200);
    expect(draft.body.data).toMatchObject({ status: 'READY', workingDays: 2, draft: { startDate: '2026-10-26', endDate: '2026-10-27', leaveTypeCode: 'ANNUAL' } });
    expect(await counts()).toEqual(before);
    const saved = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer fixture-token').send(draft.body.data.draft);
    expect(saved.status).toBe(201);
    expect(await db.leaveRequest.count({ where: { userId, startDate: new Date('2026-10-26T00:00:00Z'), status: 'PENDING' } })).toBe(1);
    const beforeClarification = await counts();
    const clarification = await request(app).post('/api/v1/ai/leave-draft').set('Authorization', 'Bearer fixture-token')
      .send({ ...body, text: 'I want annual leave in November 2026' });
    expect(clarification.status).toBe(200);
    expect(clarification.body.data).toMatchObject({ status: 'NEEDS_CLARIFICATION', draft: null });
    expect(clarification.body.data.questions.length).toBeGreaterThan(0);
    expect(await counts()).toEqual(beforeClarification);
  }, 40000);
});
