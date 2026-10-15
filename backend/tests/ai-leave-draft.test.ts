import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import { createAiLeaveDraftService, createDraftLimiter } from '../src/services/ai-leave-draft.js';
import type { Account } from '../src/repositories/access.js';
import { ApiError } from '../src/utils/api-error.js';

const org = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const input = { organisationIds: [org], text: 'Annual leave from 22 October 2026 to 23 October 2026.' };
const ready = { status: 'READY', draft: { leaveTypeCode: 'ANNUAL', startDate: '2026-10-22', endDate: '2026-10-23' }, questions: [] };
const account: Account = { id: 'employee', email: 'employee@example.invalid', fullName: 'Test Employee', active: true,
  memberships: [org, other].map(organisationId => ({ id: `member-${organisationId}`, organisationId, organisationName: 'Test org',
    organisationSlug: 'test', role: 'EMPLOYEE' as const, managerMembershipId: null, active: true })) };

function setup(output: unknown = ready) {
  const provider = vi.fn(async () => output);
  const repository = { findAccount: vi.fn(async () => account), listLeaveTypes: vi.fn(async (organisationId: string) => [
    { id: 'annual', organisationId, code: 'ANNUAL', name: 'Annual leave' },
  ]) };
  // Deliberately no write-capable dependency is provided to the draft service.
  const ai = createAiLeaveDraftService(repository, provider, () => new Date('2026-10-14T22:30:00Z'));
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), { repository, ai, verifyToken: async token => token === 'valid' ? account.id : null });
  const post = (body: object = input) => request(app).post('/api/v1/ai/leave-draft').set('Authorization', 'Bearer valid').send(body);
  return { app, provider, repository, ai, post };
}

describe('AI draft route and validation (mock provider, no persistence)', () => {
  it('returns exactly two weekdays with Johannesburg reference date and server-owned organisation IDs', async () => {
    const { post, provider } = setup();
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({ status: 'READY', referenceDate: '2026-10-15', timezone: 'Africa/Johannesburg',
      draft: { ...ready.draft, organisationIds: [org] }, workingDays: 2 });
    expect(provider).toHaveBeenCalledWith({ text: input.text, referenceDate: '2026-10-15', timezone: 'Africa/Johannesburg',
      leaveTypes: [{ code: 'ANNUAL', name: 'Annual leave' }] });
    expect(JSON.stringify(provider.mock.calls)).not.toContain(account.email);
  });
  it('uses the intersection of active type codes for all selected organisations', async () => {
    const { post, provider, repository } = setup();
    repository.listLeaveTypes.mockImplementation(async organisationId => organisationId === other ? [] : [{ id: 'a', organisationId, code: 'ANNUAL', name: 'Annual leave' }]);
    const response = await post({ ...input, organisationIds: [org, other] });
    expect(response.body.data.status).toBe('NEEDS_CLARIFICATION');
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(['I need a few days off soon', 'Annual leave next Thursday and Friday', 'Half-day annual leave on 22 October 2026', 'Annual leave on 22 October 2026 and 26 October 2026'])('clarifies unsupported or ambiguous input: %s', async text => {
    const { post, provider } = setup();
    const response = await post({ ...input, text });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'NEEDS_CLARIFICATION', draft: null });
    expect(provider).not.toHaveBeenCalled();
  });
  it('passes through valid provider clarification rather than creating a guessed draft', async () => {
    const { post } = setup({ status: 'NEEDS_CLARIFICATION', draft: null, questions: ['Which exact dates and year?'] });
    expect((await post({ ...input, text: 'I want annual leave' })).body.data).toMatchObject({ status: 'NEEDS_CLARIFICATION', draft: null });
  });
  it.each(['Leave from 22 October 2026 to 23 October 2026', 'Annual leave from 22 October to 23 October'])('does not trust a provider that invents a missing type or year', async text => {
    const { post } = setup();
    expect((await post({ ...input, text })).body.data.status).toBe('NEEDS_CLARIFICATION');
  });
  it.each([
    { ...input, organisationIds: [] }, { ...input, organisationIds: [org, org] },
    { ...input, organisationIds: ['invalid'] }, { ...input, userId: 'spoof' }, { ...input, role: 'ADMIN' },
    { ...input, model: 'other' }, { ...input, text: '' }, { ...input, text: 'x'.repeat(1001) },
  ])('rejects invalid/forged input before provider use', async body => {
    const { post, provider } = setup();
    expect((await post(body)).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it('rejects missing authentication before any provider call', async () => {
    const { app, provider } = setup();
    expect((await request(app).post('/api/v1/ai/leave-draft').send(input)).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it('checks every membership before any provider call or type lookup', async () => {
    const { post, provider, repository } = setup();
    const response = await post({ ...input, organisationIds: [org, '10000000-0000-4000-8000-000000000099'] });
    expect(response.status).toBe(403);
    expect(repository.listLeaveTypes).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
  it('rejects inactive membership', async () => {
    const { ai, provider } = setup();
    await expect(ai.draft({ ...account, memberships: account.memberships.map(member => ({ ...member, active: false })) }, input)).rejects.toMatchObject({ status: 403 });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    null, { status: 'READY', draft: ready.draft },
    { ...ready, userId: 'spoof' }, { ...ready, draft: { ...ready.draft, leaveTypeCode: 'UNKNOWN' } },
    { ...ready, draft: { ...ready.draft, startDate: '2026-02-30' } },
    { ...ready, draft: { ...ready.draft, startDate: '2026-10-24', endDate: '2026-10-25' } },
    { ...ready, draft: { ...ready.draft, startDate: '2026-10-23', endDate: '2026-10-22' } },
    { ...ready, draft: { ...ready.draft, startDate: '2026-12-31', endDate: '2027-01-04' } },
    { ...ready, draft: { ...ready.draft, startDate: '2026-10-26', endDate: '2026-10-27' } },
    { status: 'NEEDS_CLARIFICATION', draft: null, questions: [] },
  ])('rejects invalid provider output without exposing it', async output => {
    const { post } = setup(output);
    const response = await post();
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('AI_INVALID_OUTPUT');
    expect(response.body.error.details).toEqual({});
  });
  it.each(['Annual leave from 2026-02-30 to 2026-03-02', 'Annual leave on 31 February 2026'])('rejects impossible explicit dates even when the provider would normalise them', async text => {
    const { post, provider } = setup();
    expect((await post({ ...input, text })).body.error.code).toBe('AI_INVALID_OUTPUT');
    expect(provider).not.toHaveBeenCalled();
  });
  it('protects quota per verified user and expires the bounded window', () => {
    let now = 0;
    const limit = createDraftLimiter(() => now);
    for (let i = 0; i < 5; i++) limit('employee');
    expect(() => limit('employee')).toThrow(ApiError);
    now = 60_001;
    expect(() => limit('employee')).not.toThrow();
  });
  it('surfaces a safe provider failure while ordinary endpoints remain available', async () => {
    const { app, post, provider } = setup();
    provider.mockRejectedValue(new ApiError(503, 'AI_NOT_CONFIGURED', 'AI is not configured. Use the manual form.'));
    expect((await post()).body.error.code).toBe('AI_NOT_CONFIGURED');
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer valid')).status).toBe(200);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});
