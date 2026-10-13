import { z } from "zod";
import { isDateOnly } from "./dates";
export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
export const requestSchema = z
  .object({
    organisationIds: z
      .array(z.string().min(1))
      .min(1, "Choose at least one organisation.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose each organisation once.",
      ),
    leaveTypeCode: z.string().min(1, "Choose a leave type."),
    startDate: z.string().refine(isDateOnly, "Enter a valid start date."),
    endDate: z.string().refine(isDateOnly, "Enter a valid end date."),
    reason: z.string().trim().optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });
export const decisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "DECLINE"]),
    comment: z.string().trim().optional(),
  })
  .refine((value) => value.decision !== "DECLINE" || Boolean(value.comment), {
    path: ["comment"],
    message: "A comment is required when declining leave.",
  });
export type SignInValues = z.infer<typeof signInSchema>;
export type RequestValues = z.infer<typeof requestSchema>;
export type DecisionValues = z.infer<typeof decisionSchema>;
