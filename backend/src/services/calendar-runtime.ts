import { createClient } from '@supabase/supabase-js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { readDatabaseEnvironment } from '../config/database-env.js';
import { readGoogleConfiguration } from '../config/google.js';
import { createCalendarCipher } from '../lib/calendar-crypto.js';
import { createGoogleProvider, GoogleCalendarError } from '../lib/google-calendar.js';
import { createCalendarIntegrationService } from './calendar-integration.js';
import { createCalendarWorker } from './calendar-worker.js';

export function createCalendarRuntime(database: PrismaClient, authConfig: ReturnType<typeof readDatabaseEnvironment>) {
  if (!process.env.GOOGLE_CLIENT_ID) return {};
  const configuration = readGoogleConfiguration();
  const keys: Record<string, Buffer> = { [configuration.GOOGLE_TOKEN_KEY_VERSION]: Buffer.from(configuration.GOOGLE_TOKEN_ENCRYPTION_KEY, 'base64') };
  if (process.env.GOOGLE_TOKEN_PREVIOUS_KEYS) {
    try {
      const previous = JSON.parse(process.env.GOOGLE_TOKEN_PREVIOUS_KEYS) as Record<string, string>;
      for (const [version, key] of Object.entries(previous)) {
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version) || typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error();
        if (version !== configuration.GOOGLE_TOKEN_KEY_VERSION) keys[version] = Buffer.from(key, 'base64');
      }
    } catch { throw new Error('Invalid Google encryption key history'); }
  }
  const cipher = createCalendarCipher(keys, configuration.GOOGLE_TOKEN_KEY_VERSION), provider = createGoogleProvider(configuration);
  const confirmRecipients = async (members: { id: string; email: string }[]) => {
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new GoogleCalendarError('GOOGLE_CALENDAR_NOT_AUTHORISED', false);
    const client = createClient(authConfig.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } });
    const emails: string[] = [];
    for (let start = 0; start < members.length; start += 10) {
      const batch = await Promise.all(members.slice(start, start + 10).map(async member => {
        const { data, error } = await client.auth.admin.getUserById(member.id);
        if (error && (!error.status || error.status === 429 || error.status >= 500)) throw new GoogleCalendarError('GOOGLE_UNAVAILABLE', true);
        const reserved = ['example.com', 'example.net', 'example.org', 'example.invalid'].includes(member.email.split('@')[1]?.toLowerCase() ?? '');
        return !error && !reserved && data.user?.id === member.id && data.user.email_confirmed_at && data.user.email?.toLowerCase() === member.email.toLowerCase() ? member.email.toLowerCase() : null;
      }));
      emails.push(...batch.filter((email): email is string => Boolean(email)));
    }
    return emails;
  };
  return { google: createCalendarIntegrationService(database, configuration, cipher, provider),
    calendarWorker: createCalendarWorker(database, cipher, provider, confirmRecipients, configuration.GOOGLE_INVITATION_LIMIT) };
}
