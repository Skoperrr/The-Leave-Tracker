import { apiClient } from "./client";
import { ApiClientError } from "./errors";
import { aiDraftResultSchema } from "../types/ai";

export async function generateLeaveDraft(
  organisationIds: string[],
  text: string,
  signal: AbortSignal,
) {
  const response = await apiClient<unknown>("/ai/leave-draft", {
    method: "POST",
    body: { organisationIds, text },
    signal,
  });
  const result = aiDraftResultSchema.safeParse(response.data);
  if (!result.success)
    throw new ApiClientError(
      422,
      "AI_INVALID_OUTPUT",
      "The AI suggestion could not be validated. Use the manual form or try again.",
    );
  if (
    result.data.status === "READY" &&
    (result.data.draft.organisationIds.length !== organisationIds.length ||
      !result.data.draft.organisationIds.every((id) =>
        organisationIds.includes(id),
      ))
  ) {
    throw new ApiClientError(
      422,
      "AI_INVALID_OUTPUT",
      "The suggestion belongs to a different organisation selection. Generate it again.",
    );
  }
  return result.data;
}
