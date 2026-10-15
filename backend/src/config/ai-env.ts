import { z } from 'zod';

const schema = z.object({
  AI_PROVIDER: z.literal('gemini').default('gemini'),
  AI_MODEL: z.string().regex(/^gemini-[a-z0-9.-]+$/).default('gemini-3.5-flash-lite'),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(15000).default(12000),
});

export function readAiEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse({ ...input, GEMINI_API_KEY: input.GEMINI_API_KEY?.trim() || undefined });
  if (!result.success) {
    throw new Error(`Invalid AI configuration: ${[...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', ')}`);
  }
  return result.data;
}
export type AiEnvironment = ReturnType<typeof readAiEnvironment>;
