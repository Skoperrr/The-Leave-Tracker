import type { ApiEnvelope, ApiError, PaginationMeta } from "../types/api";
import { supabase } from "../auth/supabase";
import { ApiClientError } from "./errors";
type ClientOptions = {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onUnauthenticated?: () => void;
  fetcher?: typeof fetch;
};
export function createApiClient({
  baseUrl,
  getToken,
  onUnauthenticated,
  fetcher = (...args) => fetch(...args),
}: ClientOptions) {
  return async function request<T, Meta = PaginationMeta>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      credentials?: RequestCredentials;
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<ApiEnvelope<T, Meta>> {
    let token: string | null;
    try {
      token = await getToken();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401)
        onUnauthenticated?.();
      throw error;
    }
    if (!token) {
      onUnauthenticated?.();
      throw new ApiClientError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }
    let response: Response;
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/v1${path}`, {
        method: options.method ?? "GET",
        signal: options.signal,
        ...(options.credentials ? { credentials: options.credentials } : {}),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
      });
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      throw new ApiClientError(0, "SERVER_UNAVAILABLE", "Cannot reach server.");
    }
    if (response.status === 401) onUnauthenticated?.();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      const code =
        response.status === 401
          ? "UNAUTHENTICATED"
          : response.status === 403
            ? "FORBIDDEN"
            : "INVALID_RESPONSE";
      throw new ApiClientError(
        response.status,
        code,
        "Unexpected server response.",
      );
    }
    if (!response.ok) {
      const fallback: Record<number, string> = {
        400: "VALIDATION_ERROR",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "STATUS_CONFLICT",
        422: "INSUFFICIENT_BALANCE",
      };
      const apiError = (payload as ApiError | null)?.error;
      throw new ApiClientError(
        response.status,
        apiError?.code ?? fallback[response.status] ?? "INTERNAL_ERROR",
        apiError?.message ?? "Request failed.",
        apiError?.details,
      );
    }
    if (!payload || typeof payload !== "object" || !("data" in payload))
      throw new ApiClientError(
        response.status,
        "INVALID_RESPONSE",
        "Missing data envelope.",
      );
    return payload as ApiEnvelope<T, Meta>;
  };
}
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL || "",
  getToken: async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ApiClientError(401, "UNAUTHENTICATED", error.message);
    return data.session?.access_token ?? null;
  },
  onUnauthenticated: () =>
    window.dispatchEvent(new Event("kopano:session-expired")),
});
