import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createLeaveRepository, activeMemberships, type LeaveTransaction } from '../repositories/leave.js';
import type { GoogleConfiguration } from '../config/google.js';
import type { CalendarCipher } from '../lib/calendar-crypto.js';
import type { GoogleProvider } from '../lib/google-calendar.js';
import { classifyGoogleError } from '../lib/google-calendar.js';
import { digest } from '../lib/calendar-event.js';
import { ApiError } from '../utils/api-error.js';

export async function requireCalendarAdmin(tx: LeaveTransaction, userId: string, organisationId: string) {
  const [actor] = await activeMemberships(tx, userId, [organisationId]);
  if (actor?.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'An active organisation admin role is required');
}
export async function enqueueCalendarEvent(tx: LeaveTransaction, event: { id: string; organisationId: string; revision: number }) {
  // Serialize approval enqueue with connection/settings changes so a backfill
  // cannot miss an approval committed while the selected calendar changes.
  await tx.$queryRaw`SELECT id FROM "OrganisationCalendarIntegration" WHERE "organisationId" = ${event.organisationId}::uuid FOR UPDATE`;
  const integration = await tx.organisationCalendarIntegration.findUnique({ where: { organisationId: event.organisationId } });
  if (integration?.status !== 'CONNECTED' || !integration.calendarId) return;
  const key = { integrationId: integration.id, calendarEventId: event.id, integrationRevision: integration.revision,
    eventRevision: event.revision, operation: 'UPSERT' };
  await tx.calendarSyncJob.upsert({ where: { integrationId_calendarEventId_integrationRevision_eventRevision_operation: key },
    update: {}, create: { ...key, organisationId: event.organisationId } });
}
export function createCalendarIntegrationService(database: PrismaClient, config: GoogleConfiguration, cipher: CalendarCipher, provider: GoogleProvider) {
  const repository = createLeaveRepository(database);
  const connected = async (actorId: string, org: string) => repository.read(async tx => {
    await requireCalendarAdmin(tx, actorId, org);
    const integration = await tx.organisationCalendarIntegration.findUnique({ where: { organisationId: org } });
    if (!integration || integration.status !== 'CONNECTED' || !integration.encryptedRefreshToken) throw new ApiError(409,
      integration?.status === 'REAUTH_REQUIRED' ? 'GOOGLE_REAUTH_REQUIRED' : 'GOOGLE_NOT_CONNECTED', 'Connect this organisation to Google Calendar first');
    return integration;
  });
  const providerCall = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) {
      const classified = classifyGoogleError(error);
      throw new ApiError(classified.code === 'GOOGLE_CALENDAR_NOT_AUTHORISED' ? 403 : classified.code === 'GOOGLE_REAUTH_REQUIRED' ? 409 : 500, classified.code, 'Google Calendar could not complete this action');
    }
  };
  const backfill = async (tx: LeaveTransaction, organisationId: string) => {
    const integration = await tx.organisationCalendarIntegration.findUnique({ where: { organisationId } });
    if (integration?.status !== 'CONNECTED' || !integration.calendarId) return;
    const events = await tx.calendarEvent.findMany({ where: { organisationId, active: true, request: { status: 'APPROVED' },
      endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, select: { id: true, organisationId: true, revision: true } });
    if (events.length) await tx.calendarSyncJob.createMany({ skipDuplicates: true, data: events.map(event => ({
      organisationId, integrationId: integration.id, calendarEventId: event.id, integrationRevision: integration.revision,
      eventRevision: event.revision, operation: 'UPSERT',
    })) });
  };
  const service = {
    async status(actorId: string, organisationId: string) {
      return repository.read(async tx => {
        await requireCalendarAdmin(tx, actorId, organisationId);
        const integration = await tx.organisationCalendarIntegration.findUnique({ where: { organisationId } });
        const last = integration ? await tx.calendarSyncJob.findFirst({ where: { integrationId: integration.id }, orderBy: { updatedAt: 'desc' },
          select: { id: true, state: true, attemptedAt: true, lastErrorCode: true, calendarEventId: true, integrationRevision: true } }) : null;
        const external = integration && last ? await tx.externalCalendarEvent.findUnique({ where: { integrationId_calendarEventId_integrationRevision: {
          integrationId: integration.id, calendarEventId: last.calendarEventId, integrationRevision: last.integrationRevision } },
          select: { invitationStatus: true, recipientCount: true } }) : null;
        return { organisationId, provider: 'GOOGLE' as const, connectionStatus: integration?.status ?? 'DISCONNECTED',
          calendarId: integration?.calendarId ?? null, invitationsEnabled: integration?.invitationsEnabled ?? false,
          lastSync: last ? { jobId: last.id, status: last.state, attemptedAt: last.attemptedAt?.toISOString() ?? null, errorCode: last.lastErrorCode,
            invitationStatus: external?.invitationStatus ?? null, recipientCount: external?.recipientCount ?? null } : null };
      });
    },
    async connect(actorId: string, organisationId: string) {
      const state = randomBytes(32).toString('base64url'), browserNonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const challenge = Buffer.from(digest(verifier), 'hex').toString('base64url');
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      await repository.write(async tx => {
        await requireCalendarAdmin(tx, actorId, organisationId);
        const integration = await tx.organisationCalendarIntegration.upsert({ where: { organisationId }, update: {}, create: { organisationId } });
        await tx.googleOAuthState.create({ data: { organisationId, integrationId: integration.id, integrationRevision: integration.revision,
          actorUserId: actorId, stateHash: digest(state), browserNonceHash: digest(browserNonce),
          encryptedVerifier: cipher.encrypt(verifier, organisationId, 'oauth-verifier'), expiresAt } });
      });
      return { authorisationUrl: provider.authorisationUrl(state, challenge), expiresAt: expiresAt.toISOString(), browserNonce };
    },
    async callback(state: string, browserNonce: string, code?: string) {
      const stored = await repository.write(async tx => {
        const record = await tx.googleOAuthState.findUnique({ where: { stateHash: digest(state) } });
        if (!record || record.consumedAt || record.expiresAt <= new Date() || !timingSafeEqual(Buffer.from(record.browserNonceHash), Buffer.from(digest(browserNonce)))) throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Calendar connection expired or does not match this browser');
        await requireCalendarAdmin(tx, record.actorUserId, record.organisationId);
        const updated = await tx.googleOAuthState.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
        if (updated.count !== 1) throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Calendar connection was already used');
        return record;
      });
      if (!code) return 'cancelled';
      const tokens = await providerCall(() => provider.exchange(code, cipher.decrypt(stored.encryptedVerifier, stored.organisationId, 'oauth-verifier')));
      await repository.write(async tx => {
        await tx.$queryRaw`SELECT id FROM "OrganisationCalendarIntegration" WHERE id = ${stored.integrationId}::uuid FOR UPDATE`;
        await requireCalendarAdmin(tx, stored.actorUserId, stored.organisationId);
        const current = await tx.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: stored.integrationId } });
        if (current.revision !== stored.integrationRevision) throw new ApiError(409, 'STATUS_CONFLICT', 'Calendar settings changed; connect again');
        const sameAccount = current.googleSubject === tokens.subject;
        const encrypted = tokens.refreshToken ? cipher.encrypt(tokens.refreshToken, stored.organisationId) : sameAccount ? current.encryptedRefreshToken : null;
        if (!encrypted) throw new ApiError(409, 'GOOGLE_REFRESH_TOKEN_REQUIRED', 'Google did not grant offline access; reconnect with consent');
        await tx.organisationCalendarIntegration.update({ where: { id: current.id }, data: { status: 'CONNECTED', googleSubject: tokens.subject,
          encryptedRefreshToken: encrypted, connectedByUserId: stored.actorUserId, revision: { increment: 1 },
          ...(sameAccount ? {} : { calendarId: null, invitationsEnabled: false }) } });
        await tx.calendarSyncJob.updateMany({ where: { integrationId: current.id, state: { in: ['PENDING', 'RETRY'] } }, data: { state: 'CANCELLED' } });
        await tx.auditLog.create({ data: { organisationId: stored.organisationId, actorUserId: stored.actorUserId,
          action: 'GOOGLE_CALENDAR_CONNECTED', entityType: 'OrganisationCalendarIntegration', entityId: current.id } });
        if (sameAccount && current.calendarId) await backfill(tx, stored.organisationId);
      });
      return 'connected';
    },
    async calendars(actorId: string, org: string, cursor?: string) {
      const integration = await connected(actorId, org);
      return providerCall(() => provider.calendars(cipher.decrypt(integration.encryptedRefreshToken!, org), cursor));
    },
    async settings(actorId: string, org: string, input: { calendarId?: string; invitationsEnabled?: boolean }) {
      const integration = await connected(actorId, org);
      const selected = input.calendarId ?? integration.calendarId;
      if (!selected) throw new ApiError(400, 'VALIDATION_ERROR', 'Select an authorised calendar first');
      const canonicalId = await providerCall(() => provider.writable(cipher.decrypt(integration.encryptedRefreshToken!, org), selected));
      await repository.write(async tx => {
        await tx.$queryRaw`SELECT id FROM "OrganisationCalendarIntegration" WHERE id = ${integration.id}::uuid FOR UPDATE`;
        await requireCalendarAdmin(tx, actorId, org);
        const current = await tx.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: integration.id } });
        if (current.revision !== integration.revision || current.status !== 'CONNECTED') throw new ApiError(409, 'STATUS_CONFLICT', 'Calendar settings changed; refresh first');
        const busy = await tx.calendarSyncJob.count({ where: { integrationId: integration.id, state: 'PROCESSING', leaseExpiresAt: { gt: new Date() } } });
        if (busy) throw new ApiError(409, 'CALENDAR_SYNC_BUSY', 'A calendar sync is running; retry settings shortly');
        const invitationsEnabled = input.invitationsEnabled ?? current.invitationsEnabled;
        const other = await tx.organisationCalendarIntegration.findFirst({ where: { calendarId: canonicalId, organisationId: { not: org } } });
        if (other) throw new ApiError(409, 'GOOGLE_CALENDAR_ALREADY_ASSIGNED', 'Select a separate calendar for this organisation');
        if (canonicalId === current.calendarId && invitationsEnabled === current.invitationsEnabled) return;
        await tx.organisationCalendarIntegration.update({ where: { id: integration.id }, data: { calendarId: canonicalId, invitationsEnabled, revision: { increment: 1 } } });
        await tx.calendarSyncJob.updateMany({ where: { integrationId: integration.id, state: { in: ['PENDING', 'RETRY'] } }, data: { state: 'CANCELLED' } });
        await tx.auditLog.create({ data: { organisationId: org, actorUserId: actorId, action: 'GOOGLE_CALENDAR_SETTINGS_CHANGED',
          entityType: 'OrganisationCalendarIntegration', entityId: integration.id, metadata: { invitationsEnabled } } });
        await backfill(tx, org);
      }).catch((error: unknown) => {
        if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'GOOGLE_CALENDAR_ALREADY_ASSIGNED', 'Select a separate calendar for this organisation');
        throw error;
      });
      return service.status(actorId, org);
    },
    async disconnect(actorId: string, org: string) {
      await repository.write(async tx => {
        await requireCalendarAdmin(tx, actorId, org);
        const integration = await tx.organisationCalendarIntegration.findUnique({ where: { organisationId: org } });
        if (!integration) return;
        await tx.organisationCalendarIntegration.update({ where: { id: integration.id }, data: { status: 'DISCONNECTED',
          encryptedRefreshToken: null, googleSubject: null, connectedByUserId: null, calendarId: null, invitationsEnabled: false, revision: { increment: 1 } } });
        await tx.calendarSyncJob.updateMany({ where: { integrationId: integration.id, state: { in: ['PENDING', 'RETRY'] } }, data: { state: 'CANCELLED' } });
        await tx.auditLog.create({ data: { organisationId: org, actorUserId: actorId, action: 'GOOGLE_CALENDAR_DISCONNECTED', entityType: 'OrganisationCalendarIntegration', entityId: integration.id } });
      });
      return service.status(actorId, org);
    },
    async test(actorId: string, org: string) {
      const integration = await connected(actorId, org);
      if (!integration.calendarId) throw new ApiError(409, 'GOOGLE_NOT_CONNECTED', 'Select a shared calendar first');
      await providerCall(() => provider.writable(cipher.decrypt(integration.encryptedRefreshToken!, org), integration.calendarId!));
      return { calendarId: integration.calendarId, writable: true, checkedAt: new Date().toISOString() };
    },
    async retry(actorId: string, org: string, jobId: string) {
      await repository.write(async tx => {
        await requireCalendarAdmin(tx, actorId, org);
        const job = await tx.calendarSyncJob.findFirst({ where: { id: jobId, organisationId: org } });
        if (!job) throw new ApiError(404, 'NOT_FOUND', 'Calendar sync job not found');
        const integration = await tx.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: job.integrationId } });
        if (integration.status !== 'CONNECTED' || integration.revision !== job.integrationRevision) throw new ApiError(409, 'GOOGLE_REAUTH_REQUIRED', 'Reconnect or refresh calendar settings before retrying');
        const result = await tx.calendarSyncJob.updateMany({ where: { id: job.id, state: { in: ['FAILED', 'RETRY'] } },
          data: { state: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastErrorCode: null, leaseOwner: null, leaseExpiresAt: null } });
        if (!result.count) throw new ApiError(409, 'STATUS_CONFLICT', 'Only failed or waiting retry jobs can be retried');
        await tx.auditLog.create({ data: { organisationId: org, actorUserId: actorId, action: 'GOOGLE_CALENDAR_SYNC_RETRIED', entityType: 'CalendarSyncJob', entityId: job.id } });
      });
      return service.status(actorId, org);
    },
    returnUrl(result: string) { const url = new URL(config.GOOGLE_FRONTEND_RETURN_URL); url.searchParams.set('calendarConnection', result); return url.toString(); },
  };
  return service;
}
export type CalendarIntegrationService = ReturnType<typeof createCalendarIntegrationService>;
