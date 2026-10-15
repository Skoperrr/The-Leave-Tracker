import { z } from "zod";
import { parseDateOnly } from "../utils/dates.js";
export const INSIGHTS_TIMEZONE = "Africa/Johannesburg" as const;
export const DAY_MS = 86_400_000;
export function validInsightDate(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}
const date = z
  .string()
  .refine(
    validInsightDate,
    "Use a real date from year 2000 in YYYY-MM-DD format",
  );
// Query strings must contain decimal integers, not blank/whitespace values
// that JavaScript Number() would silently turn into zero.
const queryInteger = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
    z.number().int().min(minimum).max(maximum),
  );
export const insightsQuery = z
  .object({
    organisationId: z.uuid(),
    from: date,
    to: date,
    allocationYear: queryInteger(2000, 9999),
    lowBalanceThreshold: queryInteger(0, 365).default(3),
    coverageThresholdPercent: queryInteger(1, 100).default(30),
  })
  .strict()
  .superRefine((input, context) => {
    if (!validInsightDate(input.from) || !validInsightDate(input.to)) return;
    const days =
      (parseDateOnly(input.to).getTime() -
        parseDateOnly(input.from).getTime()) /
        DAY_MS +
      1;
    if (days < 1 || days > 366)
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "Choose an inclusive period of 1 to 366 calendar days",
      });
  });
export type InsightsQuery = z.infer<typeof insightsQuery>;
