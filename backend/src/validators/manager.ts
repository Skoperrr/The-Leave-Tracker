import { z } from 'zod';
import { historyQuery } from './leave.js';

export const managerQuery = historyQuery.extend({ organisationId: z.uuid(), status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED']).default('PENDING') });
export const decisionBody = z.object({ decision: z.enum(['APPROVE', 'DECLINE']), comment: z.string().trim().max(2000).optional() }).strict()
  .superRefine((input, context) => {
    if (input.decision === 'DECLINE' && !input.comment) context.addIssue({ code: 'custom', path: ['comment'], message: 'A decline comment is required' });
  });
export const calendarQuery = z.object({
  organisationId: z.uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export type ManagerQuery = z.infer<typeof managerQuery>;
export type Decision = z.infer<typeof decisionBody>;
export type CalendarQuery = z.infer<typeof calendarQuery>;
