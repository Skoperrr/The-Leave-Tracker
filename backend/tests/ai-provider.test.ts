import { describe, expect, it, vi } from 'vitest';
import { readAiEnvironment } from '../src/config/ai-env.js';
import { createGeminiProvider } from '../src/lib/ai-provider.js';

const config = readAiEnvironment({ GEMINI_API_KEY: 'test-key-not-real' });
const context = { text: 'Annual leave from 22 October 2026 to 23 October 2026', referenceDate: '2026-10-15',
  timezone: 'Africa/Johannesburg' as const, leaveTypes: [{ code: 'ANNUAL', name: 'Annual leave' }] };
const ready = { status: 'READY', draft: { leaveTypeCode: 'ANNUAL', startDate: '2026-10-22', endDate: '2026-10-23' }, questions: [] };

describe('Gemini REST adapter (mock HTTP)', () => {
  it('uses structured JSON, a bounded output and server-only header; sends no mutation tools', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(ready) }] } }] }));
    expect(await createGeminiProvider(config, fetcher)(context)).toEqual(ready);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key-not-real' });
    const body = JSON.parse(init!.body as string);
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 1024, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
    expect(body.tools).toBeUndefined();
    expect(init!.body).not.toContain('test-key-not-real');
  });
  it('missing credentials disables only AI without calling Google', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createGeminiProvider(readAiEnvironment({}), fetcher)(context)).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([429, 400, 401, 403, 404, 500, 503])('sanitises upstream status %i with no automatic retry or model fallback', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream message', { status }));
    await expect(createGeminiProvider(config, fetcher)(context)).rejects.toMatchObject({ status: status === 429 ? 429 : 503, code: status === 429 ? 'AI_RATE_LIMITED' : 'AI_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    {}, { candidates: [{ finishReason: 'MAX_TOKENS' }] }, { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] },
  ])('fails closed on empty, blocked, truncated or non-JSON output', async payload => {
    await expect(createGeminiProvider(config, vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)))(context))
      .rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });
  it('sanitises network errors', async () => {
    const provider = createGeminiProvider(config, vi.fn<typeof fetch>().mockRejectedValue(new Error('private provider detail')));
    await expect(provider(context)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(provider(context)).rejects.not.toThrow('private provider detail');
  });
  it('aborts a slow request with a safe timeout', async () => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await expect(createGeminiProvider({ ...config, AI_TIMEOUT_MS: 100 }, fetcher)(context)).rejects.toMatchObject({ code: 'AI_TIMEOUT', status: 504 });
  });
  it('validates configuration without echoing secret values', () => {
    expect(readAiEnvironment({}).AI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(() => readAiEnvironment({ AI_PROVIDER: 'invalid-secret' })).toThrow('Invalid AI configuration: AI_PROVIDER');
    expect(() => readAiEnvironment({ AI_TIMEOUT_MS: '16000' })).toThrow('AI_TIMEOUT_MS');
    expect(() => readAiEnvironment({ AI_MODEL: '../escape' })).toThrow('AI_MODEL');
  });
});
