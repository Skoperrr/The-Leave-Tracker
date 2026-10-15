import { z } from 'zod';

export const aiDraftBody = z.object({
  organisationIds: z.array(z.uuid()).min(1).max(20)
    .refine(ids => new Set(ids).size === ids.length, 'Organisation IDs must be unique'),
  text: z.string().trim().min(1).max(1000),
}).strict();
export type AiDraftInput = z.infer<typeof aiDraftBody>;

const draft = z.object({
  reason: z.string().trim().min(1).max(2000).nullable().optional(),
  leaveTypeCode: z.string().min(1).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export const aiProviderOutput = z.discriminatedUnion('status', [
  z.object({ status: z.literal('READY'), draft, questions: z.array(z.string()).max(0) }).strict(),
  z.object({ status: z.literal('NEEDS_CLARIFICATION'), draft: z.null(),
    questions: z.array(z.string().trim().min(1).max(240)).min(1).max(4) }).strict(),
]);
