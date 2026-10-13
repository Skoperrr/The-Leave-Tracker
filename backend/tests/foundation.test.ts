import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import { z } from 'zod';
import { createApp } from '../src/application.js';
import { readEnvironment } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errors.js';
import { validate } from '../src/middleware/validate.js';

const app = createApp(readEnvironment({ NODE_ENV: 'test' }));

describe('HTTP foundation', () => {
  it('serves the exact public health contract without a token', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('returns a JSON 404 for unknown unversioned routes', async () => {
    const response = await request(app).get('/unknown-route');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Endpoint not found', details: {} } });
  });
  it('allows the configured Vite origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('allows bearer-token preflight', async () => {
    const response = await request(app).options('/api/v1/leave-requests')
      .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  });
  it('rejects an unlisted origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'https://unknown.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('handles malformed JSON without returning the original body', async () => {
    const response = await request(app).post('/api/v1/leave-requests')
      .set('Content-Type', 'application/json').send('{"secret":"private",');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  it('rejects oversized JSON consistently', async () => {
    const response = await request(app).post('/api/v1/leave-requests').send({ reason: 'x'.repeat(40_000) });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('configuration', () => {
  it('uses documented development defaults', () => {
    expect(readEnvironment({})).toEqual({ NODE_ENV: 'development', PORT: 3001, FRONTEND_ORIGINS: ['http://localhost:5173'] });
  });
  it.each(['0', '65536', 'abc', '3001.5'])('rejects invalid port %s', (PORT) => {
    expect(() => readEnvironment({ PORT })).toThrow('PORT');
  });
  it.each(['*', '', 'http://localhost:5173/path', 'http://localhost:5173/', 'ftp://example.com'])('rejects invalid origin %s', (FRONTEND_ORIGINS) => {
    expect(() => readEnvironment({ FRONTEND_ORIGINS })).toThrow('FRONTEND_ORIGINS');
  });
  it('supports multiple configured origins', () => {
    expect(readEnvironment({ FRONTEND_ORIGINS: 'http://localhost:5173, https://leave.example' }).FRONTEND_ORIGINS)
      .toEqual(['http://localhost:5173', 'https://leave.example']);
  });
  it('rejects insecure production origins', () => {
    expect(() => readEnvironment({ NODE_ENV: 'production' })).toThrow('FRONTEND_ORIGINS');
  });
  it('does not echo invalid configuration values', () => {
    expect(() => readEnvironment({ PORT: 'private-value' })).toThrow('Invalid environment configuration: PORT');
  });
});

describe('reusable validation and error handling', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.post('/input', validate(z.object({ name: z.string().min(1) }).strict()), (_req, res) => {
    res.json({ data: res.locals.validated });
  });
  testApp.get('/failure', async () => { throw new Error('database-password=private'); });
  testApp.use(errorHandler);

  it('returns parsed validated input', async () => {
    const response = await request(testApp).post('/input').send({ name: 'Victor' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { name: 'Victor' } });
  });
  it('returns field errors without leaking input', async () => {
    const response = await request(testApp).post('/input').send({ name: 123, secret: 'private' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields).toContainEqual({ path: 'name', code: 'invalid_type' });
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  it('handles asynchronous failures with a safe 500 response', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(testApp).get('/failure');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: {} } });
      expect(log).toHaveBeenCalledWith('Unhandled API error');
    } finally { log.mockRestore(); }
  });
});


describe('Vercel generated origins', () => {
  it('allows generated production origins', () => {
    expect(readEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'production',
      VERCEL_URL: 'leave-abc.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'leave.vercel.app',
    }).FRONTEND_ORIGINS).toEqual(['https://leave-abc.vercel.app', 'https://leave.vercel.app']);
  });
  it('scopes previews to their deployment and branch', () => {
    expect(readEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'preview',
      VERCEL_URL: 'leave-preview.vercel.app', VERCEL_BRANCH_URL: 'leave-git-feature.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'leave.vercel.app',
    }).FRONTEND_ORIGINS).toEqual(['https://leave-preview.vercel.app', 'https://leave-git-feature.vercel.app']);
  });
  it('preserves an explicit override', () => {
    expect(readEnvironment({ FRONTEND_ORIGINS: 'https://leave.example',
      VERCEL_URL: 'leave.vercel.app',
    }).FRONTEND_ORIGINS).toEqual(['https://leave.example']);
  });
});
