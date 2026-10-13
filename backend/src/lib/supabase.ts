import { createClient } from '@supabase/supabase-js';
import type { readDatabaseEnvironment } from '../config/database-env.js';
import { ApiError } from '../utils/api-error.js';

export type TokenVerifier = (token: string) => Promise<string | null>;
export type ConfirmedIdentityVerifier = (token: string) => Promise<{ id: string; email: string; confirmed: boolean } | null>;

export function createConfirmedIdentityVerifier(configuration: ReturnType<typeof readDatabaseEnvironment>): ConfirmedIdentityVerifier {
  const client = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  });
  return async token => {
    const { data, error } = await client.auth.getUser(token);
    if (error && (!error.status || error.status >= 500 || error.status === 429)) throw new ApiError(500, 'INTERNAL_ERROR', 'Authentication service is temporarily unavailable');
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email.toLowerCase(), confirmed: Boolean(data.user.email_confirmed_at) };
  };
}

export function createTokenVerifier(configuration: ReturnType<typeof readDatabaseEnvironment>): TokenVerifier {
  const supabase = createClient(configuration.SUPABASE_URL, configuration.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      }),
    },
  });
  return async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if (!error.status || error.status >= 500 || error.status === 429) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Authentication service is temporarily unavailable');
      }
      return null;
    }
    return data.user?.id ?? null;
  };
}
