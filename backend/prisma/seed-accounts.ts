import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createDatabase } from '../src/lib/database.js';
import { readDatabaseEnvironment } from '../src/config/database-env.js';
import { demoUsers } from '../src/config/demo-users.js';
import { ensureDemoIdentity } from '../src/services/demo-accounts.js';

const credentialSchema = z.object({
  projectUrl: z.string().url(),
  accounts: z.array(z.object({ id: z.uuid().optional(), email: z.email(), password: z.string().min(20) })),
});

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo account seeding is disabled in production');
  const configuration = readDatabaseEnvironment();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Set a backend-only privileged Supabase key locally before seeding Auth accounts');
  const client = createClient(configuration.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
  });
  // Persist generated passwords before provider creation so an interrupted run is resumable.
  const credentialPath = '.demo-credentials.json';
  if (fs.existsSync(credentialPath) && fs.lstatSync(credentialPath).isSymbolicLink()) throw new Error('Refusing a symlink credential file');
  const credentials: z.infer<typeof credentialSchema> = fs.existsSync(credentialPath)
    ? credentialSchema.parse(JSON.parse(fs.readFileSync(credentialPath, 'utf8')))
    : { projectUrl: configuration.SUPABASE_URL, accounts: demoUsers.map((user) => ({ email: user.email, password: randomBytes(24).toString('base64url') })) };
  if (credentials.projectUrl !== configuration.SUPABASE_URL) throw new Error('Demo credentials belong to another Supabase project');
  const persistCredentials = () => {
    fs.writeFileSync(credentialPath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
    fs.chmodSync(credentialPath, 0o600);
  };
  persistCredentials();
  const database = createDatabase();
  try {
    const organisations = await database.organisation.findMany({ where: { slug: { in: ['dlab', 'field-institute', 'strideshift-global'] } }, include: { leaveTypes: true } });
    if (organisations.length !== 3 || organisations.some((org) => !['ANNUAL', 'SICK'].every((code) => org.leaveTypes.some((type) => type.code === code)))) {
      throw new Error('Run the baseline organisation/type seed first');
    }
    const identities = new Map<string, string>();
    for (const user of demoUsers) {
      const credential = credentials.accounts.find((entry) => entry.email === user.email);
      if (!credential) throw new Error('Local credential file is missing a required demo account');
      const id = await ensureDemoIdentity(client, credential, user.fullName);
      credential.id = id;
      identities.set(user.email, id);
      persistCredentials();
    }
    const year = 2026; // Explicit assessment demo policy year, not the host clock.
    await database.$transaction(async (transaction) => {
      for (const user of demoUsers) {
        const userId = identities.get(user.email)!;
        await transaction.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: user.email, fullName: user.fullName } });
        for (const setting of user.memberships) {
          const organisation = organisations.find((entry) => entry.slug === setting.slug)!;
          let managerMembershipId: string | null = null;
          if (setting.managerEmail) {
            const manager = await transaction.membership.findUnique({ where: { userId_organisationId: { userId: identities.get(setting.managerEmail)!, organisationId: organisation.id } } });
            if (!manager) throw new Error('Demo manager membership must be seeded before its team');
            managerMembershipId = manager.id;
          }
          const membership = await transaction.membership.upsert({
            where: { userId_organisationId: { userId, organisationId: organisation.id } }, update: {},
            create: { userId, organisationId: organisation.id, role: setting.role, managerMembershipId },
          });
          for (const [code, allocatedDays] of [['ANNUAL', 15], ['SICK', 10]] as const) {
            const leaveType = organisation.leaveTypes.find((entry) => entry.code === code)!;
            await transaction.leaveBalance.upsert({
              where: { membershipId_leaveTypeId_year: { membershipId: membership.id, leaveTypeId: leaveType.id, year } }, update: {},
              create: { membershipId: membership.id, organisationId: organisation.id, leaveTypeId: leaveType.id, year, allocatedDays },
            });
          }
        }
      }
    }, { timeout: 60_000 });
    console.info('Demo accounts seeded: six Auth identities, profiles, organisation memberships and 2026 allocations.');
    console.info('Generated login credentials are saved locally in backend/.demo-credentials.json; no passwords are printed.');
  } finally { await database.$disconnect(); }
}

main().catch(() => {
  console.error('Demo account seed failed. Check local privileged configuration, baseline seed and demo credential file. Existing accounts are not overwritten; no secrets are displayed.');
  process.exitCode = 1;
});
