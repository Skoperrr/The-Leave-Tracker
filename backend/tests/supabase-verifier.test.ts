import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTokenVerifier } from '../src/lib/supabase.js';

const configuration = {
  DATABASE_URL: 'postgresql://test:fictional@localhost/test',
  DIRECT_URL: 'postgresql://test:fictional@localhost/test',
  SUPABASE_URL: 'https://fictional.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fictional_test',
};

afterEach(() => vi.unstubAllGlobals());
describe('Supabase token adapter (HTTP mocked)', () => {
  it('sends the supplied token to the configured Auth server', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'verified-user', email: 'test@example.invalid' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await createTokenVerifier(configuration)('token-under-test')).toBe('verified-user');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fictional.supabase.co/auth/v1/user');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-under-test');
    expect(new Headers(init.headers).get('apikey')).toBe(configuration.SUPABASE_PUBLISHABLE_KEY);
  });
  it('rejects tokens the provider rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'invalid jwt', code: 'bad_jwt' }), { status: 401 })));
    expect(await createTokenVerifier(configuration)('invalid-token')).toBeNull();
  });
  it('treats rate limiting as an unavailable verifier', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 })));
    await expect(createTokenVerifier(configuration)('token')).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
