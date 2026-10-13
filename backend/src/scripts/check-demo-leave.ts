import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../application.js';
import { readEnvironment } from '../config/env.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { createDatabase } from '../lib/database.js';
import { createTokenVerifier } from '../lib/supabase.js';
import { createAccessRepository } from '../repositories/access.js';
import { createLeaveRepository } from '../repositories/leave.js';
import { createLeaveService } from '../services/leave.js';

// Explicit demo smoke: leaves two CANCELLED history records and their audit trail.
async function main() {
  const configuration = readDatabaseEnvironment();
  const file = JSON.parse(fs.readFileSync('.demo-credentials.json', 'utf8')) as {
    projectUrl: string; accounts: { email: string; password: string }[];
  };
  if (file.projectUrl !== configuration.SUPABASE_URL) throw new Error('Credential project mismatch');
  const credential = file.accounts.find((account) => account.email === 'ayanda.demo@example.com');
  if (!credential) throw new Error('Demo account not provisioned');
  const client = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
  });
  const { data, error } = await client.auth.signInWithPassword(credential);
  if (error || !data.session) throw new Error('Demo sign-in failed');
  const database = createDatabase();
  const server = createApp(readEnvironment(), { verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    leave: createLeaveService(createLeaveRepository(database)) }).listen(0, '127.0.0.1');
  const ids: string[] = [];
  let base = '';
  const headers = { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Smoke server not listening');
    base = `http://127.0.0.1:${address.port}/api/v1`;
    const orgs = await database.organisation.findMany({ where: { slug: { in: ['dlab', 'field-institute'] } }, orderBy: { slug: 'asc' } });
    if (orgs.length !== 2) throw new Error('Demo organisations missing');
    async function getAnnual(organisationId: string) {
      const response = await fetch(`${base}/balances?organisationId=${organisationId}&year=2026`, { headers });
      if (!response.ok) throw new Error('Balance smoke failed');
      const body = await response.json() as { data: { leaveTypeId: string; pendingDays: number; remainingDays: number }[] };
      const type = await database.leaveType.findUniqueOrThrow({ where: { organisationId_code: { organisationId, code: 'ANNUAL' } } });
      const balance = body.data.find((entry) => entry.leaveTypeId === type.id);
      if (!balance) throw new Error('Annual allocation missing');
      return balance;
    }
    const before = [];
    for (const org of orgs) before.push(await getAnnual(org.id));
    const response = await fetch(`${base}/leave-requests`, { method: 'POST', headers, body: JSON.stringify({
      organisationIds: orgs.map((org) => org.id), leaveTypeCode: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-06', reason: 'Fictional demonstration smoke test',
    }) });
    const created = await response.json() as { data?: { groupId: string; requests: { id: string; workingDays: number; status: string }[] } };
    if (response.status !== 201 || !created.data || created.data.requests.length !== 2) throw new Error('Submission smoke failed: check existing overlap/balance');
    ids.push(...created.data.requests.map((entry) => entry.id));
    if (!created.data.groupId || !created.data.requests.every((entry) => entry.workingDays === 5 && entry.status === 'PENDING')) throw new Error('Linked request smoke failed');
    for (const [index, org] of orgs.entries()) {
      const pending = await getAnnual(org.id);
      if (pending.pendingDays !== before[index]!.pendingDays + 5 || pending.remainingDays !== before[index]!.remainingDays - 5) throw new Error('Reservation smoke failed');
    }
    const cancelled = await fetch(`${base}/leave-requests/${ids[0]}/cancel`, { method: 'POST', headers });
    if (!cancelled.ok) throw new Error('Cancellation smoke failed');
    if ((await database.leaveRequest.findUniqueOrThrow({ where: { id: ids[1]! } })).status !== 'PENDING') throw new Error('Sibling independence smoke failed');
    const secondCancellation = await fetch(`${base}/leave-requests/${ids[1]}/cancel`, { method: 'POST', headers });
    if (!secondCancellation.ok) throw new Error('Second child cancellation failed');
    for (const [index, org] of orgs.entries()) {
      const restored = await getAnnual(org.id);
      if (restored.pendingDays !== before[index]!.pendingDays || restored.remainingDays !== before[index]!.remainingDays) throw new Error('Reservation release smoke failed');
    }
    console.info('Real Supabase sign-in and multi-organisation submission verified: two linked five-day reservations, independent child cancellation.');
  } finally {
    let cleanupFailed = false;
    for (const id of ids) {
      try {
        const stored = await database.leaveRequest.findUnique({ where: { id } });
        if (stored?.status === 'PENDING') {
          const response = await fetch(`${base}/leave-requests/${id}/cancel`, { method: 'POST', headers });
          if (!response.ok) cleanupFailed = true;
        }
      } catch { cleanupFailed = true; }
    }
    await client.auth.signOut({ scope: 'local' });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.$disconnect();
    if (cleanupFailed) throw new Error('Demo smoke cleanup needs review');
    if (ids.length) console.info('Both demo children are cancelled; no pending smoke reservations remain. Cancelled history and audits are preserved.');
  }
}
main().catch(() => { console.error('Demo leave smoke failed; no credentials, tokens or private notes displayed.'); process.exitCode = 1; });
