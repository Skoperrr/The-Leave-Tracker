import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createOnboardingService } from '../src/services/onboarding.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import type { ConfirmedIdentityVerifier } from '../src/lib/supabase.js';
import { createCalendarIntegrationService } from '../src/services/calendar-integration.js';
import { createCalendarCipher } from '../src/lib/calendar-crypto.js';
import { digest } from '../src/lib/calendar-event.js';
import type { GoogleProvider } from '../src/lib/google-calendar.js';
import type { GoogleConfiguration } from '../src/config/google.js';
import { randomBytes, randomUUID } from 'node:crypto';

function fixture(confirmed = true, existing: { active: boolean } | null = null) {
  let user: Record<string, unknown> | null = existing ? { id: 'verified-user', email: 'verified@example.com', fullName: 'Existing name', memberships: [], ...existing } : null;
  const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => { user ??= { ...create, active: true, memberships: [] }; return user; });
  const tx = { user: { findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => where.email ? null : user), upsert } };
  const database = { ...tx, $transaction: async (operation: (transaction: typeof tx) => unknown) => operation(tx) } as unknown as PrismaClient;
  const identity: ConfirmedIdentityVerifier = vi.fn(async token => token === 'real-token' ? { id: 'verified-user', email: 'verified@example.com', confirmed } : null);
  const onboarding = createOnboardingService(database, identity);
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }), { onboarding, verifyToken: async () => null,
    repository: { findAccount: async () => null, listLeaveTypes: async () => [] } });
  return { app, onboarding, identity, upsert };
}
describe('confirmed email signup provisioning', () => {
  it('creates only the verified identity profile with zero memberships', async () => {
    const { app, upsert } = fixture();
    const result = await request(app).post('/api/v1/auth/profile').set('Authorization', 'Bearer real-token').send({ fullName: '  New Person  ' });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ id: 'verified-user', email: 'verified@example.com', fullName: 'New Person', memberships: [] });
    expect(upsert.mock.calls[0]![0].create).not.toHaveProperty('memberships');
  });
  it('does not overwrite existing profile names or reactivate disabled users', async () => {
    expect((await fixture(true, { active: true }).onboarding.profile('real-token', 'Change')).fullName).toBe('Existing name');
    await expect(fixture(true, { active: false }).onboarding.profile('real-token', 'Change')).rejects.toMatchObject({ status: 403 });
  });
  it('blocks unconfirmed email and invalid tokens without creating a profile', async () => {
    const unconfirmed = fixture(false);
    await expect(unconfirmed.onboarding.profile('real-token', 'Name')).rejects.toMatchObject({ code: 'EMAIL_CONFIRMATION_REQUIRED' });
    expect(unconfirmed.upsert).not.toHaveBeenCalled();
    await expect(fixture().onboarding.profile('invalid', 'Name')).rejects.toMatchObject({ status: 401 });
  });
  it('is idempotent and never grants roles supplied by a browser', async () => {
    const { app, onboarding } = fixture();
    const profile = await onboarding.profile('real-token', 'Person');
    expect(await onboarding.profile('real-token', 'Another')).toEqual(profile);
    const response = await request(app).post('/api/v1/auth/profile').set('Authorization', 'Bearer real-token').send({ fullName: 'Person', role: 'ADMIN', organisationIds: ['other'] });
    expect(response.status).toBe(400);
  });
  it('requires a bearer before using the provisioning service', async () => {
    const { app, identity } = fixture();
    expect((await request(app).post('/api/v1/auth/profile').send({ fullName: 'Person' })).status).toBe(401);
    expect(identity).not.toHaveBeenCalled();
  });
});
describe('single-use calendar OAuth state', () => {
  const org = randomUUID(), cipher = createCalendarCipher({ '1': randomBytes(32) }, '1');
  function oauthFixture(options: { expired?: boolean; inactive?: boolean } = {}) {
    const state = { id: randomUUID(), stateHash: digest('state-value'), browserNonceHash: digest('browser-value'), organisationId: org,
      integrationId: randomUUID(), integrationRevision: 1, actorUserId: randomUUID(), consumedAt: null as Date | null,
      expiresAt: new Date(Date.now() + (options.expired ? -1 : 60_000)), encryptedVerifier: cipher.encrypt('verifier', org, 'oauth-verifier') };
    const tx = { googleOAuthState: { findUnique: vi.fn(async () => state), updateMany: vi.fn(async () => { state.consumedAt = new Date(); return { count: 1 }; }) },
      membership: { findMany: vi.fn(async () => options.inactive ? [] : [{ role: 'ADMIN' }]) } };
    const database = { $transaction: async (operation: (transaction: typeof tx) => unknown) => operation(tx) } as unknown as PrismaClient;
    const provider = { exchange: vi.fn() } as unknown as GoogleProvider;
    const service = createCalendarIntegrationService(database, { GOOGLE_FRONTEND_RETURN_URL: 'https://app.example/admin' } as GoogleConfiguration, cipher, provider);
    return { service, provider };
  }
  it('consumes consent cancellation once and rejects replay', async () => {
    const { service, provider } = oauthFixture();
    expect(await service.callback('state-value', 'browser-value')).toBe('cancelled');
    await expect(service.callback('state-value', 'browser-value')).rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    expect(provider.exchange).not.toHaveBeenCalled();
  });
  it('rejects expired state, wrong browser and revoked admin role before exchange', async () => {
    await expect(oauthFixture({ expired: true }).service.callback('state-value', 'browser-value', 'code')).rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    await expect(oauthFixture().service.callback('state-value', 'other-browser', 'code')).rejects.toMatchObject({ code: 'INVALID_OAUTH_STATE' });
    const revoked = oauthFixture({ inactive: true });
    await expect(revoked.service.callback('state-value', 'browser-value', 'code')).rejects.toMatchObject({ status: 403 });
    expect(revoked.provider.exchange).not.toHaveBeenCalled();
  });
});
