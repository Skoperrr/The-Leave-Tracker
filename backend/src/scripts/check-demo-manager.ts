import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../app.js';
import { readEnvironment } from '../config/env.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { createDatabase } from '../lib/database.js';
import { createTokenVerifier } from '../lib/supabase.js';
import { createAccessRepository } from '../repositories/access.js';
import { createLeaveRepository } from '../repositories/leave.js';
import { createLeaveService } from '../services/leave.js';
import { createManagerService } from '../services/manager.js';

// Demo-only smoke. Successful runs preserve two approved child requests/events and a decline.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo smoke disabled in production');
  const configuration = readDatabaseEnvironment();
  const credentials = JSON.parse(fs.readFileSync('.demo-credentials.json', 'utf8')) as {
    projectUrl: string; accounts: { email: string; password: string }[];
  };
  if (credentials.projectUrl !== configuration.SUPABASE_URL) throw new Error('Credential project mismatch');
  const sessions: SupabaseClient[] = [];
  const tokens = new Map<string, string>();
  const database = createDatabase();
  const repository = createLeaveRepository(database);
  const server = createApp(readEnvironment(), { verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    leave: createLeaveService(repository), manager: createManagerService(repository) }).listen(0, '127.0.0.1');
  let base = '';
  const pendingIds: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Smoke server not listening');
    base = `http://127.0.0.1:${address.port}/api/v1`;
    for (const name of ['ayanda', 'thabo', 'lerato', 'neo']) {
      const credential = credentials.accounts.find((entry) => entry.email === `${name}.demo@example.com`);
      if (!credential) throw new Error('Missing demo credential');
      const client = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
      });
      const { data, error } = await client.auth.signInWithPassword(credential);
      if (error || !data.session) throw new Error('Demo login failed');
      sessions.push(client);
      tokens.set(name, data.session.access_token);
    }
    const organisation = await database.organisation.findMany({ where: { slug: { in: ['dlab', 'field-institute'] } } });
    const dlab = organisation.find((entry) => entry.slug === 'dlab')!, field = organisation.find((entry) => entry.slug === 'field-institute')!;
    if (!dlab || !field) throw new Error('Missing demo organisations');
    async function call(name: string, path: string, method = 'GET', body?: unknown) {
      return fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(name)}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    }
    const range = (orgId: string) => `/calendar-events?organisationId=${orgId}&from=2026-11-01&to=2026-11-30`;
    const createdResponse = await call('ayanda', '/leave-requests', 'POST', {
      organisationIds: [dlab.id, field.id], leaveTypeCode: 'ANNUAL', startDate: '2026-11-16', endDate: '2026-11-20', reason: 'Fictional manager workflow demo',
    });
    if (createdResponse.status !== 201) throw new Error('Demo submission failed: check free dates and allocations');
    const created = await createdResponse.json() as { data: { requests: { id: string; organisationId: string }[] } };
    const dlabRequest = created.data.requests.find((entry) => entry.organisationId === dlab.id)!, fieldRequest = created.data.requests.find((entry) => entry.organisationId === field.id)!;
    pendingIds.push(...created.data.requests.map((entry) => entry.id));
    const queue = await call('thabo', `/manager/leave-requests?organisationId=${dlab.id}`);
    const queueBody = await queue.json() as { data: { id: string }[] };
    if (!queue.ok || !queueBody.data.some((entry) => entry.id === dlabRequest.id)) throw new Error('Assigned-team queue smoke failed');
    if ((await call('thabo', `/manager/leave-requests/${dlabRequest.id}/decision`, 'POST', { decision: 'APPROVE' })).status !== 200) throw new Error('D-Lab approval failed');
    if ((await database.leaveRequest.findUniqueOrThrow({ where: { id: fieldRequest.id } })).status !== 'PENDING') throw new Error('Sibling decision changed');
    const firstCalendar = await (await call('ayanda', range(dlab.id))).json() as { data: { requestId: string; title: string }[] };
    const secondCalendar = await (await call('ayanda', range(field.id))).json() as { data: { requestId: string }[] };
    if (!firstCalendar.data.some((entry) => entry.requestId === dlabRequest.id) || secondCalendar.data.some((entry) => entry.requestId === fieldRequest.id)) throw new Error('Partial calendar isolation failed');
    if ((await call('neo', range(dlab.id))).status !== 403 || (await call('neo', range(field.id))).status !== 403) throw new Error('StrideShift calendar access leaked');
    if ((await call('thabo', `/manager/leave-requests/${fieldRequest.id}/decision`, 'POST', { decision: 'APPROVE' })).status !== 404) throw new Error('Cross-org decision was allowed');
    if ((await call('lerato', `/manager/leave-requests/${fieldRequest.id}/decision`, 'POST', { decision: 'APPROVE' })).status !== 200) throw new Error('Field Institute approval failed');
    if ((await call('thabo', `/manager/leave-requests/${dlabRequest.id}/decision`, 'POST', { decision: 'APPROVE' })).status !== 409) throw new Error('Duplicate decision accepted');
    for (const [org, id] of [[dlab, dlabRequest.id], [field, fieldRequest.id]] as const) {
      const response = await call('ayanda', range(org.id));
      const calendar = await response.json() as { data: { requestId: string }[] };
      if (!response.ok || !calendar.data.some((entry) => entry.requestId === id) || JSON.stringify(calendar).includes('Fictional manager workflow demo')) throw new Error('Approved calendar smoke failed');
      if (await database.calendarEvent.count({ where: { requestId: id } }) !== 1) throw new Error('Duplicate calendar event');
      const balanceResponse = await call('ayanda', `/balances?organisationId=${org.id}&year=2026`);
      const balances = await balanceResponse.json() as { data: { leaveTypeId: string; approvedDays: number; pendingDays: number }[] };
      const type = await database.leaveType.findUniqueOrThrow({ where: { organisationId_code: { organisationId: org.id, code: 'ANNUAL' } } });
      const balance = balances.data.find((entry) => entry.leaveTypeId === type.id);
      if (!balanceResponse.ok || !balance || balance.approvedDays < 5) throw new Error('Approved balance smoke failed');
    }
    const declineResponse = await call('ayanda', '/leave-requests', 'POST', { organisationIds: [dlab.id], leaveTypeCode: 'ANNUAL', startDate: '2026-11-23', endDate: '2026-11-24' });
    if (declineResponse.status !== 201) throw new Error('Decline sample creation failed');
    const decline = await declineResponse.json() as { data: { requests: { id: string }[] } };
    const declineId = decline.data.requests[0]!.id;
    pendingIds.push(declineId);
    if ((await call('thabo', `/manager/leave-requests/${declineId}/decision`, 'POST', { decision: 'DECLINE' })).status !== 400) throw new Error('Missing decline comment accepted');
    if ((await call('thabo', `/manager/leave-requests/${declineId}/decision`, 'POST', { decision: 'DECLINE', comment: 'Fictional demo decision' })).status !== 200) throw new Error('Decline smoke failed');
    if (await database.calendarEvent.count({ where: { requestId: declineId } }) !== 0) throw new Error('Decline created event');
    console.info('Real employee/manager smoke passed: independent D-Lab/Field approvals, approved-only calendars, StrideShift isolation, duplicate rejection, and decline comment validation.');
    console.info('Preserved demo data: two APPROVED requests/events and one DECLINED request. Approved leave now counts against Ayanda’s 2026 balances. No Google events or invitations were sent.');
  } finally {
    // If a smoke step fails, release pending reservations only; never revoke successful approvals.
    let cleanupFailed = false;
    for (const id of pendingIds) {
      try {
        const stored = await database.leaveRequest.findUnique({ where: { id } });
        if (stored?.status === 'PENDING' && tokens.has('ayanda') && base) {
          const response = await fetch(`${base}/leave-requests/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.get('ayanda')}` } });
          if (!response.ok) cleanupFailed = true;
        }
      } catch { cleanupFailed = true; }
    }
    for (const client of sessions) {
      try { await client.auth.signOut({ scope: 'local' }); } catch { cleanupFailed = true; }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.$disconnect();
    if (cleanupFailed) {
      console.error('Demo cleanup needs review; no credentials displayed.');
      process.exitCode = 1;
    }
  }
}
main().catch(() => { console.error('Manager demo smoke failed. Review local demo dates/allocations and logs; credentials, tokens and private notes are not displayed.'); process.exitCode = 1; });
