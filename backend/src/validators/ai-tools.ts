import { z } from 'zod';
export const managerAssistantBody = z.object({ organisationId: z.uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict()
  .refine(input => Boolean(input.from) === Boolean(input.to), 'Provide both dates');
export const askDataBody = z.object({ organisationId: z.uuid(), question: z.string().trim().min(1).max(500) }).strict();
export const questionPlan = z.object({
  intent: z.enum(['WHO_OFF', 'COUNT_OFF', 'PENDING_REQUESTS', 'MY_BALANCE', 'CLARIFY']),
  from: z.string().nullable(), to: z.string().nullable(), year: z.number().int().min(2000).max(9999).nullable(),
  personName: z.string().trim().min(1).max(120).nullable(), questions: z.array(z.string().trim().min(1).max(240)).max(3),
}).strict();
export type ManagerAssistantInput = z.infer<typeof managerAssistantBody>;
export type AskDataInput = z.infer<typeof askDataBody>;
