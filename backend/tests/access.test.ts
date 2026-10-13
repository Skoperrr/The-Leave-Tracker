import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readEnvironment } from '../src/config/env.js';
import type { AccessRepository, Account } from '../src/repositories/access.js';
import { requireMembership, requireRole } from '../src/middleware/auth.js';
import { ApiError } from '../src/utils/api-error.js';

const dlab = '10000000-0000-4000-8000-000000000001';
const field = '10000000-0000-4000-8000-000000000002';
const stride = '10000000-0000-4000-8000-000000000003';
const profile: Account = {
  id: '20000000-0000-4000-8000-000000000001', email: 'test@example.invalid', fullName: 'Test employee', active: true,
  memberships: [
    { id: 'member-dlab', organisationId: dlab, organisationName: 'D-Lab', organisationSlug: 'dlab', role: 'MANAGER', managerMembershipId: null, active: true },
    { id: 'member-field', organisationId: field, organisationName: 'The Field Institute', organisationSlug: 'field-institute', role: 'EMPLOYEE', managerMembershipId: null, active: true },
  ],
};

function setup(account: Account | null = profile) {
  const verifyToken = vi.fn(async (token: string) => token === 'verified-token' ? profile.id : null);
  const repository: AccessRepository = {
    findAccount: vi.fn(async () => account),
    listLeaveTypes: vi.fn(async (organisationId: string) => [{ id: 'annual', organisationId, code: 'ANNUAL', name: 'Annual leave' }]),
  };
  return { app: createApp(readEnvironment({ NODE_ENV: 'test' }), { verifyToken, repository }), verifyToken, repository };
}

describe('authenticated access endpoints (provider mocked)', () => {
  it.each([undefined, 'Basic abc', 'Bearer', 'Bearer invalid', 'Bearer two tokens'])('rejects absent or invalid authentication: %s', async (header) => {
    const { app } = setup();
    const query = request(app).get('/api/v1/me');
    if (header) query.set('Authorization', header);
    const response = await query;
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
  it('returns the exact profile/membership shape from the verified identity', async () => {
    const { app, repository } = setup();
    const response = await request(app).get('/api/v1/me').set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: {
      id: profile.id, email: profile.email, fullName: profile.fullName,
      memberships: profile.memberships.map(({ organisationSlug: _slug, ...membership }) => membership),
    } });
    expect(repository.findAccount).toHaveBeenCalledWith(profile.id);
  });
  it('ignores client-supplied identity and role flags', async () => {
    const { app, repository } = setup();
    const response = await request(app).get('/api/v1/me?userId=other&role=ADMIN').set('Authorization', 'Bearer verified-token');
    expect(response.body.data.id).toBe(profile.id);
    expect(repository.findAccount).toHaveBeenCalledWith(profile.id);
  });
  it.each([null, { ...profile, active: false }])('requires an active database profile', async (account) => {
    const response = await request(setup(account).app).get('/api/v1/me').set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
  it('returns only the multi-organisation account memberships', async () => {
    const response = await request(setup().app).get('/api/v1/organisations').set('Authorization', 'Bearer verified-token');
    expect(response.body).toEqual({ data: [
      { id: dlab, name: 'D-Lab', slug: 'dlab' },
      { id: field, name: 'The Field Institute', slug: 'field-institute' },
    ] });
  });
  it('supports a single-organisation employee', async () => {
    const account = { ...profile, memberships: [profile.memberships[1]!] };
    const response = await request(setup(account).app).get('/api/v1/organisations').set('Authorization', 'Bearer verified-token');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(field);
  });
  it('reads leave types only after membership verification', async () => {
    const { app, repository } = setup();
    const response = await request(app).get(`/api/v1/organisations/${dlab}/leave-types`).set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(200);
    expect(repository.listLeaveTypes).toHaveBeenCalledWith(dlab);
  });
  it('denies an unrelated organisation before fetching its leave types', async () => {
    const { app, repository } = setup();
    const response = await request(app).get(`/api/v1/organisations/${stride}/leave-types`).set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORGANISATION_MEMBERSHIP_REQUIRED');
    expect(repository.listLeaveTypes).not.toHaveBeenCalled();
  });
  it('validates organisation IDs', async () => {
    const response = await request(setup().app).get('/api/v1/organisations/not-a-uuid/leave-types').set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('does not carry a manager role across organisations', () => {
    expect(() => requireRole(requireMembership(dlab, profile), ['MANAGER', 'ADMIN'])).not.toThrow();
    expect(() => requireRole(requireMembership(field, profile), ['MANAGER', 'ADMIN'])).toThrow('organisation role');
  });
  it('rejects inactive memberships', () => {
    expect(() => requireMembership(dlab, { ...profile, memberships: [{ ...profile.memberships[0]!, active: false }] }))
      .toThrow('Active organisation membership');
  });
  it('fails closed on verifier outages without leaking provider errors', async () => {
    const { repository } = setup();
    const app = createApp(readEnvironment({ NODE_ENV: 'test' }), {
      repository, verifyToken: async () => { throw new ApiError(500, 'INTERNAL_ERROR', 'Authentication service is temporarily unavailable'); },
    });
    const response = await request(app).get('/api/v1/me').set('Authorization', 'Bearer verified-token');
    expect(response.status).toBe(500);
    expect(repository.findAccount).not.toHaveBeenCalled();
  });
});
