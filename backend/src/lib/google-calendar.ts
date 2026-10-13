import { calendar } from 'googleapis/build/src/apis/calendar/index.js';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import type { GoogleConfiguration } from '../config/google.js';
import type { GoogleEventPayload } from './calendar-event.js';

export const calendarScopes = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];
export class GoogleCalendarError extends Error {
  constructor(public code: 'GOOGLE_REAUTH_REQUIRED' | 'GOOGLE_UNAVAILABLE' | 'GOOGLE_CALENDAR_NOT_AUTHORISED' | 'GOOGLE_EVENT_CONFLICT', public retryable: boolean, public retryAfterMs = 0) { super(code); }
}
export function classifyGoogleError(error: unknown): GoogleCalendarError {
  if (error instanceof GoogleCalendarError) return error;
  const value = error as { response?: { status?: number; headers?: { get?: (name: string) => string | null; 'retry-after'?: string }; data?: { error?: string | { errors?: { reason?: string }[] } } }; code?: number };
  const status = value?.response?.status ?? (typeof value?.code === 'number' ? value.code : undefined);
  const detail = value?.response?.data?.error;
  if (detail === 'invalid_grant' || status === 401) return new GoogleCalendarError('GOOGLE_REAUTH_REQUIRED', false);
  if (status === 403 && typeof detail === 'object' && detail.errors?.some(entry => ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(entry.reason ?? ''))) return new GoogleCalendarError('GOOGLE_UNAVAILABLE', true);
  if (status === 403 || status === 404) return new GoogleCalendarError('GOOGLE_CALENDAR_NOT_AUTHORISED', false);
  if (status === 409 || status === 412) return new GoogleCalendarError('GOOGLE_EVENT_CONFLICT', true);
  const retryAfter = value?.response?.headers?.get?.('retry-after') ?? value?.response?.headers?.['retry-after'];
  const wait = retryAfter ? /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now() : 0;
  return new GoogleCalendarError('GOOGLE_UNAVAILABLE', !status || status === 429 || Number(status) >= 500, Number.isFinite(wait) ? Math.max(0, Math.min(wait, 86_400_000)) : 0);
}
export type WritableCalendar = { id: string; summary: string; timeZone: string; accessRole: string };
export function createGoogleProvider(config: GoogleConfiguration) {
  const client = () => {
    const oauth = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
    oauth.transporter.defaults.timeout = 15_000;
    return oauth;
  };
  const api = (refreshToken: string) => { const oauth = client(); oauth.setCredentials({ refresh_token: refreshToken }); return calendar({ version: 'v3', auth: oauth, timeout: 15_000 }); };
  return {
    authorisationUrl(state: string, challenge: string) {
      return client().generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: false,
        scope: calendarScopes, state, code_challenge: challenge, code_challenge_method: CodeChallengeMethod.S256 });
    },
    async exchange(code: string, verifier: string) {
      const oauth = client();
      const { tokens } = await oauth.getToken({ code, codeVerifier: verifier });
      const scopes = new Set(tokens.scope?.split(' ') ?? []);
      if (!tokens.id_token || !scopes.has('https://www.googleapis.com/auth/calendar.events') || !scopes.has('https://www.googleapis.com/auth/calendar.calendarlist.readonly')) throw new GoogleCalendarError('GOOGLE_CALENDAR_NOT_AUTHORISED', false);
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID });
      const identity = ticket.getPayload();
      if (!identity?.sub || !identity.email_verified) throw new GoogleCalendarError('GOOGLE_CALENDAR_NOT_AUTHORISED', false);
      return { subject: identity.sub, refreshToken: tokens.refresh_token ?? null };
    },
    async calendars(refreshToken: string, pageToken?: string) {
      const { data } = await api(refreshToken).calendarList.list({ minAccessRole: 'writer', maxResults: 100, ...(pageToken ? { pageToken } : {}) });
      return { calendars: (data.items ?? []).filter(entry => entry.id && ['writer', 'owner'].includes(entry.accessRole ?? '')).map(entry => ({
        id: entry.id!, summary: entry.summary ?? 'Calendar', timeZone: entry.timeZone ?? 'UTC', accessRole: entry.accessRole!,
      })), nextPageToken: data.nextPageToken ?? null };
    },
    async writable(refreshToken: string, calendarId: string) {
      const { data } = await api(refreshToken).calendarList.get({ calendarId });
      if (!data.id || !['writer', 'owner'].includes(data.accessRole ?? '')) throw new GoogleCalendarError('GOOGLE_CALENDAR_NOT_AUTHORISED', false);
      return data.id;
    },
    async upsert(refreshToken: string, calendarId: string, payload: GoogleEventPayload, notify: boolean) {
      const google = api(refreshToken);
      const get = async () => {
        try { return (await google.events.get({ calendarId, eventId: payload.id })).data; }
        catch (error) { if ((error as { response?: { status?: number } }).response?.status === 404) return null; throw error; }
      };
      let existing = await get();
      if (!existing) {
        try {
          const { data } = await google.events.insert({ calendarId, requestBody: payload, sendUpdates: notify ? 'all' : 'none' });
          return { id: data.id ?? payload.id, etag: data.etag ?? null };
        } catch (error) {
          if ((error as { response?: { status?: number } }).response?.status !== 409) throw error;
          existing = await get();
        }
      }
      const markers = existing?.extendedProperties?.private;
      for (const key of ['organisationId', 'integrationId', 'calendarEventId'] as const) if (markers?.[key] !== payload.extendedProperties.private[key]) throw new GoogleCalendarError('GOOGLE_EVENT_CONFLICT', false);
      if (existing?.status !== 'cancelled' && markers?.payloadHash === payload.extendedProperties.private.payloadHash) return { id: payload.id, etag: existing?.etag ?? null };
      const { data } = await google.events.update({ calendarId, eventId: payload.id, requestBody: payload, sendUpdates: notify ? 'all' : 'none' },
        existing?.etag ? { headers: { 'If-Match': existing.etag } } : {});
      return { id: data.id ?? payload.id, etag: data.etag ?? null };
    },
    async remove(refreshToken: string, calendarId: string, eventId: string) {
      try { await api(refreshToken).events.delete({ calendarId, eventId, sendUpdates: 'all' }); }
      catch (error) { if (![404, 410].includes((error as { response?: { status?: number } }).response?.status ?? 0)) throw error; }
    },
  };
}
export type GoogleProvider = ReturnType<typeof createGoogleProvider>;
