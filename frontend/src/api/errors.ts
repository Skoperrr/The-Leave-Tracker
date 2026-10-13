const messages: Record<string, string> = {
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You do not have permission to view or change this resource.",
  NOT_FOUND: "This resource is unavailable or you do not have access to it.",
  VALIDATION_ERROR: "Please check your entries and try again.",
  INVALID_DATE_RANGE: "Choose valid dates with the end on or after the start.",
  OVERLAPPING_REQUEST:
    "These dates overlap an existing pending or approved request.",
  INSUFFICIENT_BALANCE:
    "There is not enough leave available in one or more selected organisations.",
  STATUS_CONFLICT:
    "This request has already changed. Refresh to see its current status.",
  ORGANISATION_MEMBERSHIP_REQUIRED:
    "An active membership is required in every selected organisation.",
  INTERNAL_ERROR:
    "The server could not complete this action. Please try again.",
  SERVER_UNAVAILABLE:
    "We cannot reach the leave server. Check your connection and try again.",
  INVALID_RESPONSE:
    "The server returned an unexpected response. Please try again.",
};
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError)
    return messages[error.code] ?? error.message;
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function shouldRetry(count: number, error: unknown) {
  if (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500
  )
    return false;
  return count < 1;
}
