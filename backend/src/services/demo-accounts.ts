import type { SupabaseClient } from '@supabase/supabase-js';

export const DEMO_SEED_MARKER = 'leave-tracker-fictional-demo-v1';
export type DemoCredential = { id?: string | undefined; email: string; password: string };

export async function ensureDemoIdentity(client: SupabaseClient, credential: DemoCredential, fullName: string): Promise<string> {
  let page = 1;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('Auth admin listing failed; verify local privileged configuration');
    const existing = data.users.find((user) => user.email?.toLowerCase() === credential.email.toLowerCase());
    if (existing) {
      if (existing.app_metadata.leave_tracker_demo !== DEMO_SEED_MARKER) {
        throw new Error('A demo email belongs to an unmarked Auth identity; refusing to modify it');
      }
      if (credential.id && existing.id !== credential.id) throw new Error('Local demo identity binding differs from Supabase');
      return existing.id;
    }
    if (data.users.length < 100) break;
    page++;
  }
  const { data, error } = await client.auth.admin.createUser({
    email: credential.email,
    password: credential.password,
    email_confirm: true,
    app_metadata: { leave_tracker_demo: DEMO_SEED_MARKER },
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error('Fictional Auth identity creation failed; no credentials displayed');
  return data.user.id;
}
