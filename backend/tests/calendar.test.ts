import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { createCalendarCipher } from '../src/lib/calendar-crypto.js';
import { buildGoogleEvent } from '../src/lib/calendar-event.js';
import { classifyGoogleError } from '../src/lib/google-calendar.js';
import { retryDelay, createCalendarWorker } from '../src/services/calendar-worker.js';
import type { GoogleProvider } from '../src/lib/google-calendar.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import { readGoogleConfiguration } from '../src/config/google.js';

const cipher = createCalendarCipher({ '1': randomBytes(32) }, '1');
const org = randomUUID();
describe('calendar credential protection', () => {
  it('uses random authenticated encryption and binds organisation and purpose', () => {
    const first = cipher.encrypt('refresh-secret', org), second = cipher.encrypt('refresh-secret', org);
    expect(first).not.toBe(second); expect(first).not.toContain('refresh-secret');
    expect(cipher.decrypt(first, org)).toBe('refresh-secret');
    expect(() => cipher.decrypt(first, randomUUID())).toThrow('could not be decrypted');
    expect(() => cipher.decrypt(first, org, 'oauth-verifier')).toThrow('could not be decrypted');
    const tampered = JSON.parse(first); tampered.ciphertext = Buffer.from('changed').toString('base64url');
    expect(() => cipher.decrypt(JSON.stringify(tampered), org)).toThrow('could not be decrypted');
  });
  it('can read an earlier key during rotation', () => {
    const previous = randomBytes(32), current = randomBytes(32);
    const encrypted = createCalendarCipher({ old: previous }, 'old').encrypt('secret', org);
    expect(createCalendarCipher({ old: previous, new: current }, 'new').decrypt(encrypted, org)).toBe('secret');
    expect(() => createCalendarCipher({ new: current }, 'new').decrypt(encrypted, org)).toThrow();
  });
  it('rejects short keys and unsafe production callback URLs', () => {
    expect(() => createCalendarCipher({ '1': Buffer.alloc(8) }, '1')).toThrow('32-byte');
    expect(() => readGoogleConfiguration({ GOOGLE_CLIENT_ID: 'client-id-12345', GOOGLE_CLIENT_SECRET: 'secret-12345',
      GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/v1/integrations/google/callback',
      GOOGLE_FRONTEND_RETURN_URL: 'https://app.example/admin', NODE_ENV: 'production' })).toThrow('HTTP(S)');
  });
});
describe('Google payload and failure policy', () => {
  const input = { organisationId: org, integrationId: randomUUID(), calendarId: 'shared@example.com', calendarEventId: randomUUID(),
    eventRevision: 1, employeeName: 'Test Employee', startDate: '2026-11-02', endDate: '2026-11-06', attendees: ['ONE@example.com', 'one@example.com'] };
  it('uses an exclusive all-day end, private payload and deterministic identifiers', () => {
    const payload = buildGoogleEvent(input);
    expect(payload.end.date).toBe('2026-11-07'); expect(payload.id).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.id).toBe(buildGoogleEvent({ ...input, attendees: [] }).id);
    expect(payload.extendedProperties.private.payloadHash).not.toBe(buildGoogleEvent({ ...input, attendees: [] }).extendedProperties.private.payloadHash);
    expect(payload.attendees).toEqual([{ email: 'one@example.com' }]);
    expect(payload.guestsCanSeeOtherGuests).toBe(false); expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('reason'); expect(payload).not.toHaveProperty('leaveType');
    expect(payload.id).not.toBe(buildGoogleEvent({ ...input, organisationId: randomUUID() }).id);
  });
  it('handles month/year boundaries without a timezone shift', () => {
    expect(buildGoogleEvent({ ...input, endDate: '2026-12-31' }).end.date).toBe('2027-01-01');
  });
  it.each([429, 500, 503])('retries transient Google status %s', status => {
    expect(classifyGoogleError({ response: { status } }).retryable).toBe(true);
  });
  it('distinguishes quota errors from denied permissions and invalid grants', () => {
    expect(classifyGoogleError({ response: { status: 403, data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } } }).retryable).toBe(true);
    expect(classifyGoogleError({ response: { status: 403 } }).retryable).toBe(false);
    expect(classifyGoogleError({ response: { status: 400, data: { error: 'invalid_grant' } } }).code).toBe('GOOGLE_REAUTH_REQUIRED');
    expect(retryDelay(2, 0)).toBeGreaterThan(retryDelay(1, 0)); expect(retryDelay(100, 0)).toBeLessThanOrEqual(3_600_000);
  });
});
function workerFixture(options: { fail?: unknown; invitations?: boolean; stale?: boolean; recipients?: string[]; cap?: number } = {}) {
  const integrationId = randomUUID(), eventId = randomUUID();
  const integration = { id: integrationId, organisationId: org, status: 'CONNECTED', calendarId: 'shared', revision: 1,
    invitationsEnabled: options.invitations ?? true, encryptedRefreshToken: cipher.encrypt('org-refresh', org) };
  const job = { id: randomUUID(), organisationId: org, integrationId, calendarEventId: eventId, state: 'PROCESSING', operation: 'UPSERT',
    attempts: 1, integrationRevision: 1, eventRevision: 1, leaseOwner: '' };
  const loaded = { ...job, integration, organisation: { active: true }, calendarEvent: { id: eventId, revision: 1, active: true,
    startDate: new Date('2026-11-02'), endDate: new Date('2026-11-06'), request: { status: 'APPROVED', membership: { active: true, user: { active: true, fullName: 'Employee' } } } } };
  const queue = vi.fn().mockResolvedValueOnce([{ id: job.id }]).mockResolvedValue([]);
  const jobUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const attempts = job.attempts;
    Object.assign(job, data);
    if (data.attempts && typeof data.attempts === 'object') job.attempts = attempts + 1;
    return job;
  });
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const members = vi.fn(async () => [{ user: { id: 'active-user', email: 'active@example.com' } }]);
  const externalUpsert = vi.fn(async () => ({}));
  const transaction = { $queryRaw: queue, calendarSyncJob: { update: jobUpdate, updateMany,
    findUniqueOrThrow: vi.fn(async () => job) }, organisationCalendarIntegration: {
    findUniqueOrThrow: vi.fn(async () => options.stale ? { ...integration, revision: 2 } : integration), update: vi.fn(async () => ({})),
  }, externalCalendarEvent: { upsert: externalUpsert }, membership: { findMany: members } };
  const database = { ...transaction, $transaction: async (callback: (tx: unknown) => unknown) => callback(transaction),
    calendarSyncJob: { ...transaction.calendarSyncJob, findUniqueOrThrow: vi.fn(async () => loaded) } } as unknown as PrismaClient;
  const provider = { upsert: vi.fn(async () => { if (options.fail) throw options.fail; return { id: 'event-id', etag: 'etag' }; }) } as unknown as GoogleProvider;
  const confirm = vi.fn(async () => options.recipients ?? ['active@example.com', 'unrelated@example.com']);
  return { worker: createCalendarWorker(database, cipher, provider, confirm, options.cap ?? 100), provider, members, confirm, updateMany, externalUpsert };
}
describe('outbox worker (Google and database mocked)', () => {
  it('uses only the job organisation and filters unapproved recipient addresses', async () => {
    const fixture = workerFixture(); const result = await fixture.worker.run();
    expect(result.succeeded).toBe(1);
    expect(fixture.members).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ organisationId: org, active: true, user: { active: true } }) }));
    expect(fixture.members).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ organisationId: org, active: true, user: { active: true, email: { in: ['active@example.com'] } } }) }));
    const args = vi.mocked(fixture.provider.upsert).mock.calls[0]!;
    expect(args[0]).toBe('org-refresh'); expect(args[2].attendees).toEqual([{ email: 'active@example.com' }]);
    expect(fixture.externalUpsert).toHaveBeenCalled();
  });
  it('does not query recipients or notify when invitations are disabled', async () => {
    const fixture = workerFixture({ invitations: false }); await fixture.worker.run();
    expect(fixture.members).not.toHaveBeenCalled(); expect(fixture.confirm).not.toHaveBeenCalled();
    expect(vi.mocked(fixture.provider.upsert).mock.calls[0]![3]).toBe(false);
  });
  it('cancels stale settings before calling Google', async () => {
    const fixture = workerFixture({ stale: true }); const result = await fixture.worker.run();
    expect(result.cancelled).toBe(1); expect(fixture.provider.upsert).not.toHaveBeenCalled();
  });
  it('stores a sanitised retry instead of rolling back approved leave', async () => {
    const fixture = workerFixture({ fail: { response: { status: 503, data: { secret: 'never-store' } } } });
    expect((await fixture.worker.run()).retried).toBe(1);
    expect(fixture.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'RETRY', lastErrorCode: 'GOOGLE_UNAVAILABLE' }) }));
  });
});
describe('calendar HTTP authentication', () => {
  const app = createApp(readEnvironment({ NODE_ENV: 'test' }));
  it.each(['/integrations/google/status', '/integrations/google/connect', '/integrations/google/calendars'])('requires a bearer for %s', async path => {
    expect((await request(app).get(`/api/v1${path}?organisationId=${org}`)).status).toBe(401);
  });
  it('requires scheduler credentials, not an employee bearer', async () => {
    expect((await request(app).get('/api/v1/internal/google-calendar-sync').set('Authorization', 'Bearer employee')).status).toBe(401);
  });
  it('rejects employee calendar configuration even while Google is disabled', async () => {
    const restricted = createApp(readEnvironment({ NODE_ENV: 'test' }), {
      verifyToken: async () => 'employee', repository: { findAccount: async () => ({ id: 'employee', active: true,
        email: 'employee@company.test', fullName: 'Employee', memberships: [{ id: 'membership', organisationId: org,
          organisationName: 'Org', organisationSlug: 'org', role: 'EMPLOYEE', active: true, managerMembershipId: null }] }), listLeaveTypes: async () => [] },
    });
    const response = await request(restricted).get(`/api/v1/integrations/google/status?organisationId=${org}`).set('Authorization', 'Bearer employee');
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
describe('calendar migration constraints on PostgreSQL in WASM', () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(await readFile(new URL('../prisma/migrations/20261013090000_initial/migration.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../prisma/migrations/20261013170000_calendar_integration/migration.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../prisma/migrations/20261013180000_unique_org_google_calendar/migration.sql', import.meta.url), 'utf8'));
  }, 30_000);
  afterAll(async () => { await db.close(); });
  it('adds credential/outbox tables with RLS and composite organisation foreign keys', async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('OrganisationCalendarIntegration','GoogleOAuthState','CalendarSyncJob','ExternalCalendarEvent')`);
    expect(rows.rows).toHaveLength(4); expect(rows.rows.every(row => row.relrowsecurity)).toBe(true);
    const keys = await db.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE contype='f' AND conrelid='"CalendarSyncJob"'::regclass`);
    expect(keys.rows).toHaveLength(3);
  });
  it('prevents reusing a canonical Google calendar across organisations', async () => {
    const first = randomUUID(), second = randomUUID();
    await db.query('INSERT INTO "Organisation" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,NOW()),($4,$2,$5,NOW())', [first, 'Test org', first, second, second]);
    await db.query('INSERT INTO "OrganisationCalendarIntegration" (id,"organisationId","calendarId","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), first, 'shared-canonical-calendar']);
    await expect(db.query('INSERT INTO "OrganisationCalendarIntegration" (id,"organisationId","calendarId","updatedAt") VALUES ($1,$2,$3,NOW())', [randomUUID(), second, 'shared-canonical-calendar'])).rejects.toMatchObject({ code: '23505' });
  });
});
