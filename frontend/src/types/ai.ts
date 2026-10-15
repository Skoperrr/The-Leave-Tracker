import { z } from "zod";

export const aiDraftResultSchema = z.intersection(
  z.object({
    referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.literal("Africa/Johannesburg"),
  }),
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("READY"),
      draft: z.object({
        organisationIds: z.array(z.string()).min(1),
        leaveTypeCode: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      workingDays: z.number().int().positive(),
      warnings: z.array(z.string()),
    }),
    z.object({
      status: z.literal("NEEDS_CLARIFICATION"),
      draft: z.null(),
      questions: z.array(z.string()).min(1),
    }),
  ]),
);
export type AiDraftResult = z.infer<typeof aiDraftResultSchema>;
export type ReadyAiDraft = Extract<AiDraftResult, { status: "READY" }>;
