import { z } from 'zod';

const postgresUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.username && url.password)
      && !/YOUR_|\[.*PASSWORD.*\]/i.test(value);
  } catch { return false; }
}, 'A PostgreSQL connection string is required');

const schema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
  SUPABASE_URL: z.string().url().refine((value) => value.startsWith('https://')),
  SUPABASE_PUBLISHABLE_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().min(20).optional()),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
}).superRefine((value, context) => {
  if (!value.SUPABASE_PUBLISHABLE_KEY && !value.SUPABASE_ANON_KEY) {
    context.addIssue({ code: 'custom', path: ['SUPABASE_PUBLISHABLE_KEY'], message: 'A public Supabase project key is required' });
  }
}).transform(value => ({
  DATABASE_URL: value.DATABASE_URL,
  DIRECT_URL: value.DIRECT_URL ?? value.DATABASE_URL,
  SUPABASE_URL: value.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: value.SUPABASE_PUBLISHABLE_KEY ?? value.SUPABASE_ANON_KEY!,
}));

export function readDatabaseEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid database/Auth configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  return result.data;
}
