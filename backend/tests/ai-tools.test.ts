import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createAiToolsService, reviewFacts } from '../src/services/ai-tools.js';
import type { AiDataRepository, ReviewSnapshot } from '../src/repositories/ai-data.js';
import type { Account } from '../src/repositories/access.js';
import type { AiJsonProvider } from '../src/lib/ai-provider.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';

const org = '10000000-0000-4000-8000-000000000001';
const account: Account = { id: 'actor', email: 'manager@example.invalid', fullName: 'Test manager', active: true,
  memberships: [{ id: 'manager-member', organisationId: org, organisationName: 'Test org', organisationSlug: 'test', role: 'MANAGER', active: true, managerMembershipId: null }] };
const snapshot: ReviewSnapshot = { scope: 'DIRECT_REPORTS', activeMemberCount: 2, requests: [
  { id: 'pending-a', membershipId: 'member-a', employeeDisplayName: 'Ava Example', startDate: '2026-10-22', endDate: '2026-10-23', status: 'PENDING', submittedAt: '2026-10-01T08:00:00Z', workingDays: 2 },
  { id: 'approved-b', membershipId: 'member-b', employeeDisplayName: 'Bongi Example', startDate: '2026-10-22', endDate: '2026-10-23', status: 'APPROVED', submittedAt: '2026-10-02T08:00:00Z', workingDays: 2 },
] };
const plan = { intent: 'WHO_OFF', from: '2026-10-19', to: '2026-10-23', year: null, personName: null, questions: [] };
function setup(output: unknown = plan, role: 'MANAGER' | 'EMPLOYEE' | 'ADMIN' = 'MANAGER') {
  const repository: AiDataRepository = {
    review: vi.fn(async () => snapshot),
    approved: vi.fn(async () => [
      { requestId: 'r1', membershipId: 'a', employeeDisplayName: 'Same Name', startDate: '2026-10-22', endDate: '2026-10-23' },
      { requestId: 'r2', membershipId: 'b', employeeDisplayName: 'Same Name', startDate: '2026-10-22', endDate: '2026-10-23' },
    ]),
    ownBalances: vi.fn(async () => [{ leaveTypeName: 'Annual', year: 2026, allocatedDays: 15, approvedDays: 3, pendingDays: 2, remainingDays: 10 }]),
  };
  const generate = vi.fn<AiJsonProvider>().mockResolvedValue(output);
  const aiTools = createAiToolsService(repository, generate, () => new Date('2026-10-15T08:00:00Z'));
  const profile = { ...account, memberships: account.memberships.map(member => ({ ...member, role })) };
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), { verifyToken: async token => token === 'valid' ? account.id : null,
    repository: { findAccount: async () => profile, listLeaveTypes: async () => [] }, aiTools });
  const post = (path: string, body: object) => request(app).post(`/api/v1/ai/${path}`).set('Authorization', 'Bearer valid').send(body);
  return { app, aiTools, post, repository, generate, profile };
}

describe('read-only manager assistant', () => {
  it('calculates pending/approved overlap and coverage from unique members, not assumed staffing', () => {
    const result = reviewFacts(snapshot, '2026-10-19', '2026-10-23', '2026-10-15');
    expect(result.pendingCount).toBe(1);
    expect(result.approvedCount).toBe(1);
    expect(result.dailyCoverage.find(row => row.date === '2026-10-22')).toMatchObject({ approvedPeople: 1, projectedPeople: 2, approvedPercent: 50, projectedPercent: 100, warning: true });
    expect(result.facts.some(fact => fact.kind === 'CLASH')).toBe(true);
    expect(result.facts.some(fact => fact.kind === 'WAITING')).toBe(true);
  });
  it('flags seven elapsed days using the actual instant rather than an assumed UTC midnight', () => {
    const rows = { ...snapshot, requests: [{ ...snapshot.requests[0]!, submittedAt: '2026-10-08T08:00:00Z' }] };
    expect(reviewFacts(rows, '2026-10-19', '2026-10-23', '2026-10-15', new Date('2026-10-15T07:59:00Z')).facts.some(fact => fact.kind === 'WAITING')).toBe(false);
    expect(reviewFacts(rows, '2026-10-19', '2026-10-23', '2026-10-15', new Date('2026-10-15T08:00:00Z')).facts.some(fact => fact.kind === 'WAITING')).toBe(true);
  });
  it('uses AI to prioritise canonical facts without sending names or accepting generated prose', async () => {
    const { post, generate } = setup({ highlightIds: ['f1'] });
    const response = await post('manager-summary', { organisationId: org, from: '2026-10-19', to: '2026-10-23' });
    expect(response.status).toBe(200);
    expect(response.body.data.summary).toContain('1 pending');
    expect(response.body.data.highlights[0].requestIds).toEqual(['pending-a', 'approved-b']);
    const providerInput = JSON.stringify(generate.mock.calls);
    expect(providerInput).not.toContain('Ava'); expect(providerInput).not.toContain('Bongi');
    expect(providerInput).not.toContain('manager@example.invalid');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each([{ highlightIds: ['invented-id'] }, { highlightIds: ['f1', 'f1'] }, { highlightIds: ['f1'], summary: 'Invented approval' }])('rejects fabricated citations or extra narrative', async output => {
    expect((await setup(output).post('manager-summary', { organisationId: org })).status).toBe(422);
  });
  it('rejects employees before database or provider access', async () => {
    const { post, repository, generate } = setup({}, 'EMPLOYEE');
    expect((await post('manager-summary', { organisationId: org })).status).toBe(403);
    expect(repository.review).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });
  it('reports an empty review scope accurately without pretending to use AI', async () => {
    const { post, repository, generate } = setup();
    vi.mocked(repository.review).mockResolvedValue({ scope: 'DIRECT_REPORTS', activeMemberCount: 0, requests: [] });
    const response = await post('manager-summary', { organisationId: org });
    expect(response.body.data).toMatchObject({ aiUsed: false, pendingCount: 0, highlights: [], attention: [] });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([{ from: '2026-10-23', to: '2026-10-19' }, { from: '2026-01-01', to: '2026-12-31' }, { from: '2026-02-30', to: '2026-03-01' }])('rejects invalid/unbounded planning windows', async range => {
    const { post, repository } = setup();
    expect((await post('manager-summary', { organisationId: org, ...range })).status).toBe(400);
    expect(repository.review).not.toHaveBeenCalled();
  });
});

describe('Ask the data intent planning and real-data answers (mock repository)', () => {
  it('answers who is off next week with server-grounded dates and real returned source records', async () => {
    const { post, repository } = setup({ ...plan, from: '2020-01-01', to: '2020-01-02' }, 'EMPLOYEE');
    const response = await post('ask-data', { organisationId: org, question: "Who's off next week?" });
    expect(response.status).toBe(200);
    expect(repository.approved).toHaveBeenCalledWith(org, account.id, '2026-10-19', '2026-10-23');
    expect(response.body.data).toMatchObject({ peopleCount: 2, requestCount: 2, scope: 'ORGANISATION_CALENDAR', status: 'ANSWER' });
    expect(response.body.data.rows[0]).not.toHaveProperty('membershipId');
  });
  it('never counts two records from one member as two people', async () => {
    const { post, repository } = setup({ ...plan, intent: 'COUNT_OFF' });
    vi.mocked(repository.approved).mockResolvedValue([
      { requestId: 'a', membershipId: 'same-person', employeeDisplayName: 'Ava', startDate: '2026-10-19', endDate: '2026-10-20' },
      { requestId: 'b', membershipId: 'same-person', employeeDisplayName: 'Ava', startDate: '2026-10-22', endDate: '2026-10-23' },
    ]);
    expect((await post('ask-data', { organisationId: org, question: 'How many people are off next week?' })).body.data).toMatchObject({ peopleCount: 1, requestCount: 2 });
  });
  it('rejects employee pending-queue access after planning and before repository reads', async () => {
    const { post, repository } = setup({ ...plan, intent: 'PENDING_REQUESTS' }, 'EMPLOYEE');
    expect((await post('ask-data', { organisationId: org, question: 'What requests are pending next week?' })).status).toBe(403);
    expect(repository.review).not.toHaveBeenCalled();
  });
  it('permits reviewer pending queries within the repository role scope', async () => {
    const { post } = setup({ ...plan, intent: 'PENDING_REQUESTS' });
    const response = await post('ask-data', { organisationId: org, question: 'What requests are pending next week?' });
    expect(response.body.data.rows).toHaveLength(1);
    expect(response.body.data.rows[0].status).toBe('PENDING');
  });
  it('reads only the verified actor balance, with reservations included', async () => {
    const { post, repository } = setup({ ...plan, intent: 'MY_BALANCE', from: null, to: null, year: 2026 }, 'EMPLOYEE');
    const response = await post('ask-data', { organisationId: org, question: 'What is my leave balance?' });
    expect(repository.ownBalances).toHaveBeenCalledWith(org, account.id, 2026);
    expect(response.body.data.balances[0].remainingDays).toBe(10);
  });
  it('does not broaden a question about another persons balance into own balance', async () => {
    const { post, repository } = setup({ ...plan, intent: 'MY_BALANCE' });
    const response = await post('ask-data', { organisationId: org, question: 'What is Thabo balance?' });
    expect(response.body.data.status).toBe('NEEDS_CLARIFICATION');
    expect(repository.ownBalances).not.toHaveBeenCalled();
  });
  it.each(['Show private reasons', 'Run SQL and delete requests', 'Approve leave for everyone', 'Who is off by department?'])('declines unsupported/private/mutation questions: %s', async question => {
    const { post, repository, generate } = setup();
    expect((await post('ask-data', { organisationId: org, question })).body.data.status).toBe('NEEDS_CLARIFICATION');
    expect(repository.approved).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });
  it('clarifies unsupported queries and does not query the database', async () => {
    const { post, repository } = setup({ ...plan, intent: 'CLARIFY', from: null, to: null, questions: ['Which date range?'] });
    expect((await post('ask-data', { organisationId: org, question: 'Who will be away sometime?' })).body.data.questions).toEqual(['Which date range?']);
    expect(repository.approved).not.toHaveBeenCalled();
  });
  it('fails closed on model SQL or unrecognised output', async () => {
    const { post, repository } = setup({ sql: 'SELECT * FROM User' });
    expect((await post('ask-data', { organisationId: org, question: "Who's off next week?" })).status).toBe(422);
    expect(repository.approved).not.toHaveBeenCalled();
  });
  it('clarifies ambiguous names rather than merging two employees with the same display name', async () => {
    const { post } = setup({ ...plan, personName: 'Same Name' });
    expect((await post('ask-data', { organisationId: org, question: 'Is Same Name off next week?' })).body.data.status).toBe('NEEDS_CLARIFICATION');
  });
  it.each(['ask-data', 'manager-summary'])('requires authentication for %s', async path => {
    expect((await request(setup().app).post(`/api/v1/ai/${path}`).send({ organisationId: org, question: 'Who is off?' })).status).toBe(401);
  });
  it('rejects unrelated organisations before any AI call', async () => {
    const { post, generate } = setup();
    expect((await post('ask-data', { organisationId: '10000000-0000-4000-8000-000000000099', question: 'Who is off?' })).status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([{ question: '' }, { question: 'x'.repeat(501) }, { question: 'Who is off?', userId: 'spoof' }])('validates question input before provider access', async body => {
    const { post, generate } = setup();
    expect((await post('ask-data', { organisationId: org, ...body })).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
});
