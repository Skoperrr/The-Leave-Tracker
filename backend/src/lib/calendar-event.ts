import { createHash } from 'node:crypto';
import { parseDateOnly } from '../utils/dates.js';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function buildGoogleEvent(input: { organisationId: string; integrationId: string; calendarId: string;
  calendarEventId: string; eventRevision: number; employeeName: string; startDate: string; endDate: string; attendees: string[] }) {
  const end = parseDateOnly(input.endDate); end.setUTCDate(end.getUTCDate() + 1);
  const payload = {
    id: digest(JSON.stringify([input.organisationId, input.integrationId, input.calendarId, input.calendarEventId])),
    summary: `${input.employeeName} — On Leave`, start: { date: input.startDate }, end: { date: end.toISOString().slice(0, 10) },
    visibility: 'private', guestsCanModify: false, guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false,
    attendees: [...new Set(input.attendees.map(email => email.trim().toLowerCase()))].sort().map(email => ({ email })),
    extendedProperties: { private: { organisationId: input.organisationId, integrationId: input.integrationId,
      calendarEventId: input.calendarEventId, eventRevision: String(input.eventRevision), payloadHash: '' } },
  };
  payload.extendedProperties.private.payloadHash = digest(JSON.stringify(payload));
  return payload;
}
export type GoogleEventPayload = ReturnType<typeof buildGoogleEvent>;
