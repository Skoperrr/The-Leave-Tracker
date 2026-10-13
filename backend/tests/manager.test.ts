import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { decisionBody, managerQuery, calendarQuery } from '../src/validators/manager.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import type { ManagerService } from '../src/services/manager.js';

const org = '10000000-0000-4000-8000-000000000001';
describe('manager input validation', () => {
  it.each([{ decision: 'DECLINE' }, { decision: 'DECLINE', comment: ' ' }, { decision: 'OTHER' }, { decision: 'APPROVE', role: 'ADMIN' }, { decision: 'APPROVE', comment: 'x'.repeat(2001) }])('rejects invalid decision input', (input) => {
    expect(decisionBody.safeParse(input).success).toBe(false);
  });
  it('trims decline comments and accepts approval without a comment', () => {
    expect(decisionBody.parse({ decision: 'DECLINE', comment: ' reason ' })).toEqual({ decision: 'DECLINE', comment: 'reason' });
    expect(decisionBody.parse({ decision: 'APPROVE' })).toEqual({ decision: 'APPROVE' });
  });
  it('requires organisation and defaults manager queue to pending', () => {
    expect(managerQuery.safeParse({}).success).toBe(false);
    expect(managerQuery.parse({ organisationId: org })).toEqual({ organisationId: org, status: 'PENDING', page: 1, pageSize: 20 });
  });
  it('requires organisation and date fields for a calendar', () => {
    expect(calendarQuery.safeParse({ organisationId: org }).success).toBe(false);
  });
});
describe('manager/calendar route validation', () => {
  const manager = { decide: vi.fn(async () => ({ status: 'APPROVED' })) } as unknown as ManagerService;
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), {
    verifyToken: async () => 'verified-actor', repository: { findAccount: async () => ({ id: 'verified-actor', active: true, email: 'test@example.invalid', fullName: 'Test', memberships: [] }), listLeaveTypes: async () => [] }, manager,
  });
  it('passes only verified actor, UUID and parsed decision to the service', async () => {
    const response = await request(app).post(`/api/v1/manager/leave-requests/${org}/decision`).set('Authorization', 'Bearer token').send({ decision: 'APPROVE' });
    expect(response.status).toBe(200);
    expect(manager.decide).toHaveBeenCalledWith('verified-actor', org, { decision: 'APPROVE' });
  });
  it('rejects missing decline comment before service execution', async () => {
    vi.mocked(manager.decide).mockClear();
    const response = await request(app).post(`/api/v1/manager/leave-requests/${org}/decision`).set('Authorization', 'Bearer token').send({ decision: 'DECLINE' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(manager.decide).not.toHaveBeenCalled();
  });
  it.each(['/calendar-events', '/manager/leave-requests'])('requires authentication for %s', async (path) => {
    expect((await request(app).get(`/api/v1${path}`)).status).toBe(401);
  });
});
