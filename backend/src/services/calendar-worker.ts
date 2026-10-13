import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { CalendarCipher } from '../lib/calendar-crypto.js';
import type { GoogleProvider } from '../lib/google-calendar.js';
import { classifyGoogleError } from '../lib/google-calendar.js';
import { buildGoogleEvent } from '../lib/calendar-event.js';

export type ConfirmRecipients = (members: { id: string; email: string }[]) => Promise<string[]>;
export const retryDelay = (attempt: number, random = Math.random()) => Math.min(3_600_000, 30_000 * 2 ** Math.min(attempt, 7)) + Math.floor(random * 10_000);
export function createCalendarWorker(database: PrismaClient, cipher: CalendarCipher, provider: GoogleProvider, confirmRecipients: ConfirmRecipients, recipientLimit = 100) {
  return {
    async run(limit = 5, organisationId?: string) {
      const summary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, cancelled: 0 };
      for (let index = 0; index < Math.min(limit, 20); index++) {
        const owner = randomUUID();
        const job = await database.$transaction(async tx => {
          const candidates = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CalendarSyncJob"
            WHERE (${organisationId ?? null}::uuid IS NULL OR "organisationId" = ${organisationId ?? null}::uuid)
              AND ((state IN ('PENDING','RETRY') AND "nextAttemptAt" <= NOW())
              OR (state = 'PROCESSING' AND "leaseExpiresAt" <= NOW()))
            ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
          if (!candidates[0]) return null;
          return tx.calendarSyncJob.update({ where: { id: candidates[0].id }, data: { state: 'PROCESSING',
            attempts: { increment: 1 }, attemptedAt: new Date(), leaseOwner: owner, leaseExpiresAt: new Date(Date.now() + 300_000) } });
        }, { timeout: 30_000 });
        if (!job) break;
        summary.claimed++;
        if (job.attempts > 6) {
          await database.calendarSyncJob.updateMany({ where: { id: job.id, leaseOwner: owner }, data: { state: 'FAILED',
            lastErrorCode: 'GOOGLE_UNAVAILABLE', leaseOwner: null, leaseExpiresAt: null } });
          summary.failed++; continue;
        }
        try {
          const loaded = await database.calendarSyncJob.findUniqueOrThrow({ where: { id: job.id }, include: {
            integration: true, calendarEvent: { include: { request: { select: { status: true,
              membership: { select: { active: true, user: { select: { fullName: true, active: true } } } } } } } }, organisation: { select: { active: true } },
          } });
          const integration = loaded.integration, event = loaded.calendarEvent;
          if (!loaded.organisation.active || integration.status !== 'CONNECTED' || !integration.calendarId || !integration.encryptedRefreshToken
            || integration.revision !== job.integrationRevision || event.revision !== job.eventRevision || (job.operation === 'UPSERT'
              && (!event.active || event.request.status !== 'APPROVED' || !event.request.membership.active || !event.request.membership.user.active))) {
            await database.calendarSyncJob.updateMany({ where: { id: job.id, leaseOwner: owner }, data: { state: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null } });
            summary.cancelled++; continue;
          }
          const refreshToken = cipher.decrypt(integration.encryptedRefreshToken, job.organisationId);
          if (job.operation === 'DELETE') {
            const mapping = await database.externalCalendarEvent.findUnique({ where: { integrationId_calendarEventId_integrationRevision: {
              integrationId: integration.id, calendarEventId: event.id, integrationRevision: job.integrationRevision } } });
            if (mapping) await provider.remove(refreshToken, mapping.googleCalendarId, mapping.googleEventId);
            await database.calendarSyncJob.updateMany({ where: { id: job.id, leaseOwner: owner }, data: { state: 'SUCCEEDED', leaseOwner: null, leaseExpiresAt: null } });
            summary.succeeded++; continue;
          }
          let attendees: string[] = [], invitationStatus = integration.invitationsEnabled ? 'NOTIFICATIONS_REQUESTED' : 'DISABLED';
          if (integration.invitationsEnabled) {
            const members = await database.membership.findMany({ where: { organisationId: job.organisationId, active: true,
              user: { active: true }, organisation: { active: true } }, select: { user: { select: { id: true, email: true } } }, take: recipientLimit + 1 });
            if (members.length > recipientLimit) invitationStatus = 'RECIPIENT_LIMIT';
            else {
              const candidates = members.map(entry => entry.user);
              const authorised = new Set(candidates.map(entry => entry.email.toLowerCase()));
              attendees = [...new Set(await confirmRecipients(candidates))].map(email => email.toLowerCase()).filter(email => authorised.has(email));
              if (attendees.length !== candidates.length) invitationStatus = 'PARTIAL_UNCONFIRMED';
            }
          }
          if (attendees.length) {
            const currentRecipients = await database.membership.findMany({ where: { organisationId: job.organisationId, active: true,
              organisation: { active: true }, user: { active: true, email: { in: attendees } } }, select: { user: { select: { email: true } } } });
            const allowed = new Set(currentRecipients.map(member => member.user.email.toLowerCase()));
            attendees = attendees.filter(email => allowed.has(email));
          }
          // Recheck configuration immediately before an outbound write after email checks.
          const current = await database.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: integration.id } });
          if (current.status !== 'CONNECTED' || current.revision !== integration.revision) {
            await database.calendarSyncJob.updateMany({ where: { id: job.id, leaseOwner: owner }, data: { state: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null } });
            summary.cancelled++; continue;
          }
          const payload = buildGoogleEvent({ organisationId: job.organisationId, integrationId: integration.id, calendarId: integration.calendarId,
            calendarEventId: event.id, eventRevision: event.revision, employeeName: event.request.membership.user.fullName,
            startDate: event.startDate.toISOString().slice(0, 10), endDate: event.endDate.toISOString().slice(0, 10), attendees });
          const synced = await provider.upsert(refreshToken, integration.calendarId, payload, attendees.length > 0);
          await database.$transaction(async tx => {
            const connection = await tx.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: integration.id } });
            const lease = await tx.calendarSyncJob.findUniqueOrThrow({ where: { id: job.id } });
            const stale = connection.revision !== integration.revision || connection.status !== 'CONNECTED';
            const key = { integrationId: integration.id, calendarEventId: event.id, integrationRevision: job.integrationRevision };
            const result = { googleCalendarId: integration.calendarId!, googleEventId: synced.id, etag: synced.etag,
              payloadHash: payload.extendedProperties.private.payloadHash, syncStatus: stale ? 'STALE' : 'SUCCEEDED', invitationStatus, recipientCount: attendees.length };
            await tx.externalCalendarEvent.upsert({ where: { integrationId_calendarEventId_integrationRevision: key },
              create: { ...key, ...result, organisationId: job.organisationId }, update: result });
            if (lease.leaseOwner === owner) await tx.calendarSyncJob.update({ where: { id: job.id }, data: { state: stale ? 'CANCELLED' : 'SUCCEEDED',
              lastErrorCode: invitationStatus === 'RECIPIENT_LIMIT' ? 'INVITATION_RECIPIENT_LIMIT' : null, leaseOwner: null, leaseExpiresAt: null } });
          }, { timeout: 30_000 });
          summary.succeeded++;
        } catch (error) {
          const classified = classifyGoogleError(error), retry = classified.retryable && job.attempts < 6;
          await database.$transaction(async tx => {
            const connection = await tx.organisationCalendarIntegration.findUniqueOrThrow({ where: { id: job.integrationId } });
            if (classified.code === 'GOOGLE_REAUTH_REQUIRED' && connection.revision === job.integrationRevision) await tx.organisationCalendarIntegration.update({ where: { id: connection.id }, data: { status: 'REAUTH_REQUIRED' } });
            await tx.calendarSyncJob.updateMany({ where: { id: job.id, leaseOwner: owner }, data: { state: retry ? 'RETRY' : 'FAILED',
              nextAttemptAt: new Date(Date.now() + Math.max(retryDelay(job.attempts), classified.retryAfterMs)), lastErrorCode: classified.code, leaseOwner: null, leaseExpiresAt: null } });
          }, { timeout: 30_000 });
          if (retry) summary.retried++; else summary.failed++;
        }
      }
      return summary;
    },
  };
}
export type CalendarWorker = ReturnType<typeof createCalendarWorker>;
