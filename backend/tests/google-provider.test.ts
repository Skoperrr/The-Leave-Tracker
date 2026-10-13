import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ events: { get: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }, calendarList: { list: vi.fn(), get: vi.fn() } }));
vi.mock('googleapis/build/src/apis/calendar/index.js', () => ({ calendar: () => mocks }));
import { createGoogleProvider, classifyGoogleError } from '../src/lib/google-calendar.js';
import { buildGoogleEvent } from '../src/lib/calendar-event.js';
import type { GoogleConfiguration } from '../src/config/google.js';
const provider = createGoogleProvider({ GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://app.example/callback' } as GoogleConfiguration);
const payload = buildGoogleEvent({ organisationId: 'org-a', integrationId: 'connection-a', calendarId: 'shared-a', calendarEventId: 'internal-event',
  eventRevision: 1, employeeName: 'Employee', startDate: '2026-11-02', endDate: '2026-11-06', attendees: ['person@company.test'] });
beforeEach(() => { vi.resetAllMocks(); });
describe('official Google adapter (HTTP client mocked)', () => {
  it('creates an all-day event and requests attendee notifications', async () => {
    mocks.events.get.mockRejectedValue({ response: { status: 404 } });
    mocks.events.insert.mockResolvedValue({ data: { id: payload.id, etag: 'etag' } });
    expect((await provider.upsert('refresh', 'shared-a', payload, true)).id).toBe(payload.id);
    expect(mocks.events.insert).toHaveBeenCalledWith({ calendarId: 'shared-a', requestBody: payload, sendUpdates: 'all' });
  });
  it('recognises a completed insertion after a timeout without duplicate invitations', async () => {
    mocks.events.get.mockResolvedValue({ data: { ...payload, etag: 'etag' } });
    await provider.upsert('refresh', 'shared-a', payload, true);
    expect(mocks.events.insert).not.toHaveBeenCalled(); expect(mocks.events.update).not.toHaveBeenCalled();
  });
  it('recovers from a duplicate insert response by reading the deterministic ID', async () => {
    mocks.events.get.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data: payload });
    mocks.events.insert.mockRejectedValue({ response: { status: 409 } });
    await provider.upsert('refresh', 'shared-a', payload, true);
    expect(mocks.events.get).toHaveBeenCalledTimes(2); expect(mocks.events.update).not.toHaveBeenCalled();
  });
  it('refuses an event collision with another organisation', async () => {
    mocks.events.get.mockResolvedValue({ data: { ...payload, extendedProperties: { private: { ...payload.extendedProperties.private, organisationId: 'wrong-org' } } } });
    await expect(provider.upsert('refresh', 'shared-a', payload, true)).rejects.toMatchObject({ code: 'GOOGLE_EVENT_CONFLICT', retryable: false });
    expect(mocks.events.update).not.toHaveBeenCalled();
  });
  it('uses etags when updating changed event details', async () => {
    mocks.events.get.mockResolvedValue({ data: { ...payload, etag: 'old', extendedProperties: { private: { ...payload.extendedProperties.private, payloadHash: 'old' } } } });
    mocks.events.update.mockResolvedValue({ data: { id: payload.id, etag: 'new' } });
    await provider.upsert('refresh', 'shared-a', payload, false);
    expect(mocks.events.update).toHaveBeenCalledWith(expect.objectContaining({ sendUpdates: 'none' }), { headers: { 'If-Match': 'old' } });
  });
  it('treats missing event deletion as idempotent success', async () => {
    mocks.events.delete.mockRejectedValue({ response: { status: 410 } });
    await expect(provider.remove('refresh', 'shared-a', 'event')).resolves.toBeUndefined();
  });
  it('rejects read-only calendar selection and follows writable calendar pagination', async () => {
    mocks.calendarList.get.mockResolvedValue({ data: { accessRole: 'reader' } });
    await expect(provider.writable('refresh', 'calendar')).rejects.toMatchObject({ code: 'GOOGLE_CALENDAR_NOT_AUTHORISED' });
    mocks.calendarList.list.mockResolvedValue({ data: { items: [{ id: 'writable', accessRole: 'writer' }, { id: 'read-only', accessRole: 'reader' }], nextPageToken: 'next' } });
    const list = await provider.calendars('refresh');
    expect(list.calendars.map(calendar => calendar.id)).toEqual(['writable']); expect(list.nextPageToken).toBe('next');
  });
  it('honours retry-after and retries named network errors', () => {
    expect(classifyGoogleError({ response: { status: 429, headers: { 'retry-after': '180' } } }).retryAfterMs).toBe(180_000);
    expect(classifyGoogleError({ code: 'ECONNRESET' }).retryable).toBe(true);
  });
  it('normalises Google calendar aliases to the canonical ID', async () => {
    mocks.calendarList.get.mockResolvedValue({ data: { id: 'canonical-owner@example.com', accessRole: 'owner' } });
    expect(await provider.writable('refresh', 'primary')).toBe('canonical-owner@example.com');
  });
});
