import fs from 'node:fs';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createDatabase } from '../lib/database.js';
import { readDatabaseEnvironment } from '../config/database-env.js';
import { activeMemberships, lockMembershipIds } from '../repositories/leave.js';

// Explicit, audited promotion; the idempotent seed never overwrites existing roles.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo promotion is unavailable in production');
  const config = readDatabaseEnvironment();
  const credentials = z.object({ projectUrl: z.string(), accounts: z.array(z.object({
    id: z.uuid(), email: z.email(), password: z.string(),
  })) }).parse(JSON.parse(fs.readFileSync('.demo-credentials.json', 'utf8')));
  if (credentials.projectUrl !== config.SUPABASE_URL) throw new Error('Credential project mismatch');
  const administrator = credentials.accounts.find(entry => entry.email === 'naledi.admin.demo@example.com');
  if (!administrator) throw new Error('Missing demo administrator');
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const database = createDatabase();
  try {
    const { data, error } = await client.auth.signInWithPassword(administrator);
    if (error || data.user?.id !== administrator.id
      || data.user.app_metadata.leave_tracker_demo !== 'leave-tracker-fictional-demo-v1') throw new Error('Administrator login failed');
    await database.$transaction(async tx => {
      for (const [email, slug] of [
        ['thabo.demo@example.com', 'dlab'], ['lerato.demo@example.com', 'field-institute'],
        ['sibusiso.demo@example.com', 'strideshift-global'],
      ] as const) {
        const identity = credentials.accounts.find(entry => entry.email === email);
        if (!identity) throw new Error('Missing demo identity');
        const target = await tx.membership.findFirst({ where: {
          userId: identity.id, user: { email, active: true }, active: true, organisation: { slug, active: true },
        } });
        if (!target) throw new Error('Missing demo membership');
        const [actor] = await activeMemberships(tx, administrator.id, [target.organisationId]);
        if (!actor) throw new Error('Missing administrator membership');
        await lockMembershipIds(tx, [actor.id, target.id]);
        const [currentActor] = await activeMemberships(tx, administrator.id, [target.organisationId]);
        const current = await tx.membership.findUniqueOrThrow({ where: { id: target.id } });
        if (currentActor?.role !== 'ADMIN' || !current.active) throw new Error('Administrator access required');
        if (current.role === 'ADMIN') continue;
        if (current.role !== 'MANAGER') throw new Error('Expected a demo manager');
        await tx.membership.update({ where: { id: current.id }, data: { role: 'ADMIN' } });
        await tx.auditLog.create({ data: {
          actorUserId: administrator.id, organisationId: current.organisationId,
          action: 'MEMBERSHIP_ROLE_CHANGED', entityType: 'Membership', entityId: current.id,
          metadata: { previousRole: 'MANAGER', newRole: 'ADMIN', source: 'demo-manager-promotion' },
        } });
      }
    }, { timeout: 60_000 });
    console.info('Three demo managers have ADMIN access in their respective organisations; changes audited.');
  } finally {
    await client.auth.signOut({ scope: 'local' });
    await database.$disconnect();
  }
}
main().catch(() => {
  console.error('Demo promotion failed; no credentials or provider details are displayed.');
  process.exitCode = 1;
});
