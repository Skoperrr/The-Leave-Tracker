import { z } from 'zod';

const origin = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}, 'Use an HTTP(S) origin without a trailing slash or path');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173')
    .transform((value) => value.split(',').map((entry) => entry.trim()))
    .pipe(z.array(origin).min(1)),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.FRONTEND_ORIGINS.some((entry) => !entry.startsWith('https://'))) {
    context.addIssue({ code: 'custom', path: ['FRONTEND_ORIGINS'], message: 'Production origins must use HTTPS' });
  }
});

export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}

export type Environment = ReturnType<typeof readEnvironment>;
