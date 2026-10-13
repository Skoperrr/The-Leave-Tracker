import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { parseDateOnly, calculateWorkingDays } from '../src/utils/dates.js';
import { createLeaveBody, historyQuery } from '../src/validators/leave.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import type { LeaveService } from '../src/services/leave.js';

const org = '10000000-0000-4000-8000-000000000001';
const input = { organisationIds: [org], leaveTypeCode: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-06' };

describe('date-only leave calculations', () => {
  it.each([
    ['2026-11-02', '2026-11-02', 1], ['2026-11-02', '2026-11-06', 5],
    ['2026-11-06', '2026-11-09', 2], ['2026-11-02', '2026-11-15', 10],
    ['2028-02-28', '2028-02-29', 2],
  ])('counts %s to %s as %i weekdays', (start, end, expected) => {
    expect(calculateWorkingDays(parseDateOnly(start), parseDateOnly(end))).toBe(expected);
  });
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', 'invalid', '1999-12-31'])('rejects invalid date %s', (date) => {
    expect(() => parseDateOnly(date)).toThrow('valid date');
  });
  it.each([['2026-11-06', '2026-11-02'], ['2026-12-31', '2027-01-04'], ['2026-11-07', '2026-11-08']])('rejects invalid range %s/%s', (start, end) => {
    expect(() => calculateWorkingDays(parseDateOnly(start), parseDateOnly(end))).toThrow();
  });
  it('supports future holiday exclusions without local timezone arithmetic', () => {
    expect(calculateWorkingDays(parseDateOnly('2026-11-02'), parseDateOnly('2026-11-06'), new Set(['2026-11-04']))).toBe(4);
  });
});

describe('leave payload validation', () => {
  it.each([
    { ...input, organisationIds: [] }, { ...input, organisationIds: [org, org] },
    { ...input, workingDays: 1 }, { ...input, userId: 'someone-else' }, { ...input, role: 'ADMIN' },
    { ...input, organisationIds: ['invalid'] }, { ...input, reason: 'x'.repeat(2001) },
  ])('rejects invalid/forged inputs', (body) => { expect(createLeaveBody.safeParse(body).success).toBe(false); });
  it('sets safe pagination defaults', () => { expect(historyQuery.parse({})).toEqual({ page: 1, pageSize: 20 }); });
  it.each([{ page: '0' }, { pageSize: '101' }, { status: 'OTHER' }, { userId: 'other' }])('rejects invalid filters', (query) => {
    expect(historyQuery.safeParse(query).success).toBe(false);
  });
});

describe('employee route wiring', () => {
  const leave = { create: vi.fn(async () => ({ groupId: null, requests: [] })) } as unknown as LeaveService;
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), {
    verifyToken: async () => 'verified-user', repository: {
      findAccount: async () => ({ id: 'verified-user', email: 'demo@example.invalid', fullName: 'Test', active: true, memberships: [] }),
      listLeaveTypes: async () => [],
    }, leave,
  });
  it('passes the verified identity and validated input to leave services', async () => {
    const response = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer token').send(input);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { groupId: null, requests: [] } });
    expect(leave.create).toHaveBeenCalledWith('verified-user', input);
  });
  it.each(['/balances', '/leave-requests', `/leave-requests/${org}/cancel`])('protects %s without a bearer', async (path) => {
    const response = await request(app).post(`/api/v1${path}`);
    expect(response.status).toBe(401);
  });
  it('rejects fabricated working days before service execution', async () => {
    vi.mocked(leave.create).mockClear();
    const response = await request(app).post('/api/v1/leave-requests').set('Authorization', 'Bearer token').send({ ...input, workingDays: 1 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(leave.create).not.toHaveBeenCalled();
  });
});
