import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { authenticate, authenticatedAccount, requireMembership, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import type { AccessServices } from '../services/access.js';
import { ApiError } from '../utils/api-error.js';

const orgQuery = z.object({ organisationId: z.uuid() }).strict();
export function createCalendarRouter(services?: AccessServices) {
  const router = Router();
  const service = () => { if (!services?.google) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'An administrator must configure Google Calendar'); return services.google; };
  router.get('/internal/google-calendar-sync', async (req, res) => {
    const expected = process.env.CRON_SECRET, token = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!expected || !token || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new ApiError(401, 'UNAUTHENTICATED', 'Scheduler authentication is required');
    if (!services?.calendarWorker) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Calendar worker is not configured');
    res.set('Cache-Control', 'no-store').json({ data: await services.calendarWorker.run(1) });
  });
  router.get('/integrations/google/callback', async (req, res) => {
    const integration = service(); res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    const input = z.object({ state: z.string().min(20).max(128), code: z.string().min(1).max(4096).optional(), error: z.string().max(256).optional() }).passthrough().safeParse(req.query);
    const nonce = req.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('lt_calendar_oauth='))?.slice('lt_calendar_oauth='.length) ?? '';
    res.clearCookie('lt_calendar_oauth', { path: '/api/v1/integrations/google/callback' });
    if (!input.success || !nonce) return res.redirect(303, integration.returnUrl('invalid-state'));
    try { return res.redirect(303, integration.returnUrl(await integration.callback(input.data.state, nonce, input.data.error ? undefined : input.data.code))); }
    catch (error) { return res.redirect(303, integration.returnUrl(error instanceof ApiError ? error.code : 'failed')); }
  });
  // Google callback uses expiring single-use state, not a browser bearer header.
  router.use('/integrations/google', authenticate(services));
  router.use('/integrations/google', (req, res, next) => {
    const organisationId = req.path.endsWith('/retry') ? req.body?.organisationId : req.query.organisationId;
    if (typeof organisationId === 'string' && z.uuid().safeParse(organisationId).success) {
      requireRole(requireMembership(organisationId, authenticatedAccount(res)), ['ADMIN']);
    }
    next();
  });
  router.get('/integrations/google/status', validate(orgQuery, 'query'), async (_req, res) => {
    res.json({ data: await service().status(authenticatedAccount(res).id, res.locals.validated.organisationId) });
  });
  router.get('/integrations/google/connect', validate(orgQuery, 'query'), async (_req, res) => {
    const { browserNonce, ...data } = await service().connect(authenticatedAccount(res).id, res.locals.validated.organisationId);
    res.cookie('lt_calendar_oauth', browserNonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      maxAge: 10 * 60_000, path: '/api/v1/integrations/google/callback' }); res.json({ data });
  });
  router.get('/integrations/google/calendars', validate(orgQuery.extend({ cursor: z.string().min(1).max(2048).optional() }), 'query'), async (_req, res) => {
    const result = await service().calendars(authenticatedAccount(res).id, res.locals.validated.organisationId, res.locals.validated.cursor);
    res.json({ data: result.calendars, meta: { nextPageToken: result.nextPageToken } });
  });
  router.patch('/integrations/google/settings', validate(orgQuery, 'query'), validate(z.object({ calendarId: z.string().min(1).max(1024).optional(),
    invitationsEnabled: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0)), async (_req, res) => {
    // Each middleware stores a separate parsed value: parse the query explicitly here.
    const organisationId = orgQuery.parse(_req.query).organisationId;
    res.json({ data: await service().settings(authenticatedAccount(res).id, organisationId, res.locals.validated) });
  });
  router.delete('/integrations/google/disconnect', validate(orgQuery, 'query'), async (_req, res) => {
    res.json({ data: await service().disconnect(authenticatedAccount(res).id, res.locals.validated.organisationId) });
  });
  router.post('/integrations/google/test', validate(orgQuery, 'query'), async (_req, res) => {
    res.json({ data: await service().test(authenticatedAccount(res).id, res.locals.validated.organisationId) });
  });
  router.post('/integrations/google/retry', validate(z.object({ organisationId: z.uuid(), jobId: z.uuid() }).strict()), async (_req, res) => {
    res.json({ data: await service().retry(authenticatedAccount(res).id, res.locals.validated.organisationId, res.locals.validated.jobId) });
  });
  return router;
}
