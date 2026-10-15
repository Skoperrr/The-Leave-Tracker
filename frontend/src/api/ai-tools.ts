import { apiClient } from "./client";
import { ApiClientError } from "./errors";
import { managerSummarySchema, askDataSchema } from "../types/ai-tools";
import type { z } from "zod";

async function request<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal: AbortSignal,
) {
  const response = await apiClient<unknown>(path, {
    method: "POST",
    body,
    signal,
  });
  const result = schema.safeParse(response.data);
  if (!result.success)
    throw new ApiClientError(
      422,
      "AI_INVALID_OUTPUT",
      "The AI response could not be validated. Try again or use the normal leave tools.",
    );
  return result.data;
}
export const generateManagerSummary = (
  organisationId: string,
  from: string,
  to: string,
  signal: AbortSignal,
) =>
  request(
    "/ai/manager-summary",
    { organisationId, from, to },
    managerSummarySchema,
    signal,
  );
export const askLeaveData = (
  organisationId: string,
  question: string,
  signal: AbortSignal,
) =>
  request("/ai/ask-data", { organisationId, question }, askDataSchema, signal);
