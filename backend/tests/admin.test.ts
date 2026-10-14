import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createAdminService } from '../src/services/admin.js';
import type { LeaveRepository, LeaveTransaction } from '../src/repositories/leave.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';

const organisationId = '10000000-0000-4000-8000-000000000001';
function setup(role: string | null) {
  const findMany = vi.fn().mockResolvedValueOnce(role ? [{ role }] : []).mockResolvedValueOnce([
    { id: 'membership', organisationId, role: 'EMPLOYEE', active: false, managerMembershipId: null,
      organisation: { name: 'D-Lab' }, user: { fullName: 'Ayanda Demo', email: 'private@example.invalid' }, userId: 'private-user-id' },
  ]);
  const transaction = { membership: { findMany } } as unknown as LeaveTransaction;
  const repository = { read: (operation: (tx: LeaveTransaction) => unknown) => operation(transaction) } as LeaveRepository;
  const admin = createAdminService(repository);
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), {
    verifyToken: async () => 'actor', repository: { findAccount: async () => ({ id: 'actor', email: 'test@example.invalid',
      fullName: 'Test', active: true, memberships: [] }), listLeaveTypes: async () => [] }, admin,
  });
  return { app, findMany, admin };
}
describe('organisation admin memberships', () => {
  it.each(['EMPLOYEE', 'MANAGER', null])('denies %s and missing membership before listing rows', async role => {
    const { app, findMany } = setup(role);
    const response = await request(app).get(`/api/v1/admin/memberships?organisationId=${organisationId}`)
      .set('Authorization', 'Bearer token');
    expect(response.status).toBe(403);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ userId: 'actor', active: true,
      organisationId: { in: [organisationId] }, user: { active: true }, organisation: { active: true } });
  });
  it('lists scoped member names including inactive records without exposing private identity fields', async () => {
    const { app, findMany } = setup('ADMIN');
    const response = await request(app).get(`/api/v1/admin/memberships?organisationId=${organisationId}`)
      .set('Authorization', 'Bearer token');
    expect(response.status).toBe(200);
    expect(findMany.mock.calls[1]![0].where).toEqual({ organisationId });
    expect(response.body).toEqual({ data: [{ id: 'membership', organisationId, organisationName: 'D-Lab',
      role: 'EMPLOYEE', active: false, managerMembershipId: null, employeeDisplayName: 'Ayanda Demo' }] });
    expect(findMany.mock.calls[1]![0].select.user).toEqual({ select: { fullName: true } });
  });
  it.each(['', '?organisationId=bad', `?organisationId=${organisationId}&role=ADMIN`])('rejects invalid or extra parameters %s', async query => {
    const { app, findMany } = setup('ADMIN');
    expect((await request(app).get(`/api/v1/admin/memberships${query}`).set('Authorization', 'Bearer token')).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    const { app, findMany } = setup('ADMIN');
    expect((await request(app).get(`/api/v1/admin/memberships?organisationId=${organisationId}`)).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
