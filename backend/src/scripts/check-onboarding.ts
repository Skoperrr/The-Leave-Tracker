import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../application.js';
import { createDatabase } from '../lib/database.js';
import { createTokenVerifier, createConfirmedIdentityVerifier } from '../lib/supabase.js';
import { readEnvironment } from '../config/env.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { createAccessRepository } from '../repositories/access.js';
import { createLeaveRepository } from '../repositories/leave.js';
import { createOnboardingService } from '../services/onboarding.js';
import { createAdminService } from '../services/admin.js';
import { createLeaveService } from '../services/leave.js';

// A confirmed temporary Auth fixture tests backend onboarding, not SMTP delivery.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Use a test environment');
  const configuration = readDatabaseEnvironment();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Configure the server Auth Admin key');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const privileged = createClient(configuration.SUPABASE_URL, key, options);
  const employee = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, options);
  const administrator = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, options);
  const database = createDatabase();
  const repository = createLeaveRepository(database);
  const server = createApp(readEnvironment(), { verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    onboarding: createOnboardingService(database, createConfirmedIdentityVerifier(configuration)),
    admin: createAdminService(repository), leave: createLeaveService(repository) }).listen(0, '127.0.0.1');
  let identityId: string | undefined;
  const entityIds: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const email = `${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url');
    const created = await privileged.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { leave_tracker_test: 'onboarding-temporary-v1' } });
    if (created.error || !created.data.user) throw new Error('Fixture creation failed');
    identityId = created.data.user.id;
    const login = await employee.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw new Error('Fixture login failed');
    const headers = { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' };
    if ((await fetch(`${base}/me`, { headers })).status !== 404) throw new Error('Expected an unprovisioned profile');
    const provision = await fetch(`${base}/auth/profile`, { headers, method: 'POST', body: JSON.stringify({ fullName: 'Temporary signup check' }) });
    const profile = await provision.json() as { data: { id: string; memberships: unknown[] } };
    if (provision.status !== 200 || profile.data.id !== identityId || profile.data.memberships.length) throw new Error('Unsafe profile provisioning');
    const denied = await fetch(`${base}/auth/profile`, { headers, method: 'POST', body: JSON.stringify({ fullName: 'Temporary signup check', role: 'ADMIN' }) });
    if (denied.status !== 400) throw new Error('Browser role was accepted');
    const credentialFile = JSON.parse(fs.readFileSync('.demo-credentials.json', 'utf8')) as { projectUrl: string; accounts: { email: string; password: string }[] };
    if (credentialFile.projectUrl !== configuration.SUPABASE_URL) throw new Error('Project mismatch');
    const adminLogin = await administrator.auth.signInWithPassword(credentialFile.accounts.find(entry => entry.email === 'naledi.admin.demo@example.com')!);
    if (adminLogin.error || !adminLogin.data.session) throw new Error('Admin login failed');
    const adminHeaders = { Authorization: `Bearer ${adminLogin.data.session.access_token}`, 'Content-Type': 'application/json' };
    const me = await (await fetch(`${base}/me`, { headers: adminHeaders })).json() as { data: { memberships: { organisationId: string; organisationName: string }[] } };
    const org = me.data.memberships.find(entry => entry.organisationName === 'D-Lab')!.organisationId;
    const assignment = await fetch(`${base}/admin/memberships`, { headers: adminHeaders, method: 'POST', body: JSON.stringify({ organisationId: org, email }) });
    const membership = await assignment.json() as { data: { id: string; role: string } };
    if (assignment.status !== 201 || membership.data.role !== 'EMPLOYEE') throw new Error('Admin assignment failed');
    entityIds.push(membership.data.id);
    if ((await fetch(`${base}/admin/memberships`, { headers, method: 'POST', body: JSON.stringify({ organisationId: org, email }) })).status !== 403) throw new Error('Employee could assign memberships');
    const type = await database.leaveType.findUniqueOrThrow({ where: { organisationId_code: { organisationId: org, code: 'ANNUAL' } } });
    const allocation = await fetch(`${base}/admin/allocations`, { headers: adminHeaders, method: 'POST', body: JSON.stringify({ organisationId: org,
      membershipId: membership.data.id, leaveTypeId: type.id, year: 2026, allocatedDays: 15 }) });
    const allocated = await allocation.json() as { data: { id: string } };
    if (allocation.status !== 201) throw new Error('Allocation failed'); entityIds.push(allocated.data.id);
    const balances = await (await fetch(`${base}/balances?organisationId=${org}&year=2026`, { headers })).json() as { data: { remainingDays: number }[] };
    if (balances.data[0]?.remainingDays !== 15) throw new Error('New employee balance unavailable');
    console.info('Real Auth-backed onboarding verified: zero initial memberships, rejected role injection, scoped ADMIN assignment and allocation, employee denial and usable balance.');
  } finally {
    try { if (identityId) {
      const fixtureId = identityId;
      await database.$transaction(async tx => {
        const memberships = await tx.membership.findMany({ where: { userId: fixtureId }, select: { id: true } });
        const balances = await tx.leaveBalance.findMany({ where: { membershipId: { in: memberships.map(member => member.id) } }, select: { id: true } });
        await tx.auditLog.deleteMany({ where: { entityId: { in: [...entityIds, ...memberships.map(member => member.id), ...balances.map(balance => balance.id)] } } });
        await tx.leaveBalance.deleteMany({ where: { membershipId: { in: memberships.map(member => member.id) } } });
        await tx.membership.deleteMany({ where: { userId: fixtureId } });
        await tx.user.deleteMany({ where: { id: fixtureId } });
      });
      const removed = await privileged.auth.admin.deleteUser(identityId);
      if (removed.error) throw new Error('Temporary Auth fixture cleanup failed');
    } } finally {
      await Promise.allSettled([employee.auth.signOut({ scope: 'local' }), administrator.auth.signOut({ scope: 'local' })]);
      await new Promise<void>(resolve => server.close(() => resolve())); await database.$disconnect();
    }
  }
}
main().catch(() => { console.error('Onboarding check failed; credentials and provider errors are not displayed.'); process.exitCode = 1; });
