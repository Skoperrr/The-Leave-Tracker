import { z } from 'zod';

const year = z.coerce.number().int().min(2000).max(9999);
export const balanceQuery = z.object({ organisationId: z.uuid(), year: year.optional() }).strict();
export const createLeaveBody = z.object({
  organisationIds: z.array(z.uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'Organisation IDs must be unique'),
  leaveTypeCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(2000).optional(),
}).strict();
export const historyQuery = z.object({
  organisationId: z.uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const requestIdParams = z.object({ id: z.uuid() });
export type CreateLeave = z.infer<typeof createLeaveBody>;
export type HistoryQuery = z.infer<typeof historyQuery>;
