import { createClient } from '@supabase/supabase-js';
import type { readDatabaseEnvironment } from '../config/database-env.js';
import { ApiError } from '../utils/api-error.js';

export type TokenVerifier = (token: string) => Promise<string | null>;

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
