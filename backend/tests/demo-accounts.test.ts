import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ensureDemoIdentity, DEMO_SEED_MARKER } from '../src/services/demo-accounts.js';

const credential = { email: 'fictional.demo@example.com', password: 'fictional-test-only-password' };
function clientFor(users: object[], error: object | null = null) {
  const admin = {
    listUsers: vi.fn(async () => ({ data: { users }, error })),
    createUser: vi.fn(async () => ({ data: { user: { id: 'created-id' } }, error: null })),
  };
  return { client: { auth: { admin } } as unknown as SupabaseClient, admin };
}

describe('safe fictional Auth provisioning', () => {
  it('creates a marked fictional account with confirmed email without sending an invitation', async () => {
    const { client, admin } = clientFor([]);
    expect(await ensureDemoIdentity(client, credential, 'Fictional Demo')).toBe('created-id');
    expect(admin.createUser).toHaveBeenCalledWith({
      ...credential, email_confirm: true,
      app_metadata: { leave_tracker_demo: DEMO_SEED_MARKER }, user_metadata: { full_name: 'Fictional Demo' },
    });
  });
  it('reuses a marked identity without resetting its password', async () => {
    const { client, admin } = clientFor([{ id: 'existing-id', email: credential.email, app_metadata: { leave_tracker_demo: DEMO_SEED_MARKER } }]);
    expect(await ensureDemoIdentity(client, credential, 'Fictional Demo')).toBe('existing-id');
    expect(admin.createUser).not.toHaveBeenCalled();
  });
  it('refuses an unmarked account with the same email', async () => {
    const { client, admin } = clientFor([{ id: 'real-id', email: credential.email, app_metadata: {} }]);
    await expect(ensureDemoIdentity(client, credential, 'Fictional Demo')).rejects.toThrow('refusing to modify');
    expect(admin.createUser).not.toHaveBeenCalled();
  });
  it('refuses a different provider identity than the saved binding', async () => {
    const { client } = clientFor([{ id: 'different-id', email: credential.email, app_metadata: { leave_tracker_demo: DEMO_SEED_MARKER } }]);
    await expect(ensureDemoIdentity(client, { ...credential, id: 'saved-id' }, 'Fictional Demo')).rejects.toThrow('binding differs');
  });
  it('fails before creation when admin access is rejected', async () => {
    const { client, admin } = clientFor([], { message: 'private provider error' });
    await expect(ensureDemoIdentity(client, credential, 'Fictional Demo')).rejects.toThrow('Auth admin listing failed');
    expect(admin.createUser).not.toHaveBeenCalled();
  });
  it('checks subsequent pages before creating', async () => {
    const { client, admin } = clientFor([]);
    admin.listUsers.mockResolvedValueOnce({ data: { users: Array.from({ length: 100 }, (_, index) => ({ email: `other-${index}@example.com` })) }, error: null });
    admin.listUsers.mockResolvedValueOnce({ data: { users: [{ id: 'page-two-id', email: credential.email, app_metadata: { leave_tracker_demo: DEMO_SEED_MARKER } }] }, error: null });
    expect(await ensureDemoIdentity(client, credential, 'Fictional Demo')).toBe('page-two-id');
    expect(admin.listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 100 });
    expect(admin.createUser).not.toHaveBeenCalled();
  });
});
