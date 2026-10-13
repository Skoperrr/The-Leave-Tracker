import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createApp } from '../application.js';
import { readEnvironment } from '../config/env.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { createDatabase } from '../lib/database.js';
import { createTokenVerifier } from '../lib/supabase.js';
import { createAccessRepository } from '../repositories/access.js';
import { demoUsers } from '../config/demo-users.js';
import { createAdminService } from '../services/admin.js';
import { createLeaveRepository } from '../repositories/leave.js';

async function main() {
  const configuration = readDatabaseEnvironment();
  const credentials = z.object({ projectUrl: z.string(), accounts: z.array(z.object({ id: z.uuid(), email: z.email(), password: z.string() })) })
    .parse(JSON.parse(fs.readFileSync('.demo-credentials.json', 'utf8')));
  if (credentials.projectUrl !== configuration.SUPABASE_URL) throw new Error('Demo credential project mismatch');
  const database = createDatabase();
  const server = createApp(readEnvironment(), { verifyToken: createTokenVerifier(configuration), repository: createAccessRepository(database),
    admin: createAdminService(createLeaveRepository(database)) }).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Smoke server not listening');
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const organisations = await database.organisation.findMany();
    for (const expected of demoUsers) {
      const credential = credentials.accounts.find((entry) => entry.email === expected.email);
      if (!credential) throw new Error('Missing demo credential');
      const client = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
      if (error || !data.session || data.user?.id !== credential.id) throw new Error('Demo login failed');
      try {
        const headers = { Authorization: `Bearer ${data.session.access_token}` };
        const meResponse = await fetch(`${base}/me`, { headers });
        const me = await meResponse.json() as { data?: { id: string; memberships: { organisationId: string; role: string; managerMembershipId: string | null }[] } };
        if (meResponse.status !== 200 || me.data?.id !== credential.id) throw new Error('Profile smoke failed');
        const memberships = me.data.memberships;
        if (memberships.length !== expected.memberships.length) throw new Error('Demo membership count mismatch');
        for (const setting of expected.memberships) {
          const organisation = organisations.find((entry) => entry.slug === setting.slug);
          const membership = memberships.find((entry) => entry.organisationId === organisation?.id);
          if (membership?.role !== setting.role) throw new Error('Demo organisation role mismatch');
          if (setting.managerEmail) {
            const managerIdentity = credentials.accounts.find((entry) => entry.email === setting.managerEmail);
            if (!organisation || !managerIdentity) throw new Error('Missing demo manager binding');
            const manager = await database.membership.findUnique({ where: { userId_organisationId: { userId: managerIdentity.id, organisationId: organisation.id } } });
            if (!manager || membership.managerMembershipId !== manager.id) throw new Error('Demo manager assignment mismatch');
          }
        }
        const orgResponse = await fetch(`${base}/organisations`, { headers });
        const orgs = await orgResponse.json() as { data?: { id: string }[] };
        if (orgResponse.status !== 200 || orgs.data?.length !== memberships.length
          || !orgs.data.every((entry) => memberships.some((membership) => membership.organisationId === entry.id))) throw new Error('Organisation smoke failed');
        for (const organisation of organisations) {
          const response = await fetch(`${base}/organisations/${organisation.id}/leave-types`, { headers });
          const permitted = memberships.some((entry) => entry.organisationId === organisation.id);
          if (response.status !== (permitted ? 200 : 403)) throw new Error('Organisation isolation smoke failed');
          const adminResponse = await fetch(`${base}/admin/memberships?organisationId=${organisation.id}`, { headers });
          const isAdmin = memberships.some(entry => entry.organisationId === organisation.id && entry.role === 'ADMIN');
          if (adminResponse.status !== (isAdmin ? 200 : 403)) throw new Error('Admin isolation smoke failed');
          if (isAdmin) {
            const result = await adminResponse.json() as { data: { organisationId: string }[] };
            if (!result.data.length || result.data.some(entry => entry.organisationId !== organisation.id)) throw new Error('Admin membership scope mismatch');
          }
        }
        if (credential.email === 'ayanda.demo@example.com' && memberships.length !== 2) throw new Error('Multi-org demo profile missing');
        console.info(`${credential.email}: real sign-in, profile, ${memberships.length} organisation membership(s), and organisation isolation verified`);
      } finally { await client.auth.signOut({ scope: 'local' }); }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.$disconnect();
  }
}
main().catch(() => {
  console.error('Real demo authentication smoke failed; credentials and tokens are not displayed.');
  process.exitCode = 1;
});
