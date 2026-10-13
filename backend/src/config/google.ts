import { z } from 'zod';
const schema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(10), GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_REDIRECT_URI: z.url(), GOOGLE_FRONTEND_RETURN_URL: z.url(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().refine(value => /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32),
  GOOGLE_TOKEN_KEY_VERSION: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).default('1'),
  GOOGLE_INVITATION_LIMIT: z.coerce.number().int().min(1).max(100).default(100),
});
export function readGoogleConfiguration(input: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid Google configuration: ${[...new Set(result.error.issues.map(issue => issue.path[0]))].join(', ')}`);
  for (const value of [result.data.GOOGLE_REDIRECT_URI, result.data.GOOGLE_FRONTEND_RETURN_URL]) {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(input.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Google callback and return URLs must use approved HTTP(S) origins');
  }
  if (new URL(result.data.GOOGLE_REDIRECT_URI).pathname !== '/api/v1/integrations/google/callback') throw new Error('Google redirect path must match the calendar callback');
  return result.data;
}
export type GoogleConfiguration = ReturnType<typeof readGoogleConfiguration>;
