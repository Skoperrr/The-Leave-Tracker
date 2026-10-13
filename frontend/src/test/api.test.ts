import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../api/client";
import { ApiClientError, errorMessage, shouldRetry } from "../api/errors";
describe("Authenticated API transport", () => {
  it("uses the exact base and Bearer token, preserving pagination and payload fields", async () => {
    const payload = {
      organisationIds: ["org-dlab", "org-field"],
      leaveTypeCode: "ANNUAL",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
      reason: "Personal leave",
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        }),
      ),
    );
    const client = createApiClient({
      baseUrl: "http://localhost:3001/",
      getToken: async () => "supabase-access-token",
      fetcher,
    });
    const result = await client("/leave-requests", {
      method: "POST",
      body: payload,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/leave-requests",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer supabase-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(result.meta?.total).toBe(0);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty(
      "role",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty(
      "userId",
    );
  });
  it("expires the session when the token source rejects invalid authentication", async () => {
    const expired = vi.fn();
    const client = createApiClient({
      baseUrl: "",
      getToken: async () => {
        throw new ApiClientError(401, "UNAUTHENTICATED", "Invalid session");
      },
      onUnauthenticated: expired,
    });
    await expect(client("/me")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(expired).toHaveBeenCalledOnce();
  });
  it("never calls the protected API without a session token", async () => {
    const fetcher = vi.fn();
    const expired = vi.fn();
    const client = createApiClient({
      baseUrl: "http://localhost:3001",
      getToken: async () => null,
      onUnauthenticated: expired,
      fetcher,
    });
    await expect(client("/me")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(expired).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 404, 409, 422, 500])(
    "renders HTTP %s without losing server error details",
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "STATUS_CONFLICT",
              message: "Already decided",
              details: { requestId: "r1" },
            },
          }),
          { status },
        ),
      );
      const expired = vi.fn();
      const client = createApiClient({
        baseUrl: "http://localhost:3001",
        getToken: async () => "token",
        onUnauthenticated: expired,
        fetcher,
      });
      await expect(client("/me")).rejects.toMatchObject({
        status,
        code: "STATUS_CONFLICT",
        details: { requestId: "r1" },
      });
      expect(expired).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    },
  );
  it("handles non-JSON errors and network outages", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3001",
      getToken: async () => "token",
      fetcher: vi
        .fn()
        .mockResolvedValue(new Response("gateway down", { status: 500 })),
    });
    await expect(client("/me")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    const offline = createApiClient({
      baseUrl: "http://localhost:3001",
      getToken: async () => "token",
      fetcher: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    await expect(offline("/me")).rejects.toMatchObject({
      code: "SERVER_UNAVAILABLE",
    });
  });
  it("does not turn query cancellation into a server outage", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createApiClient({
      baseUrl: "",
      getToken: async () => "token",
      fetcher: vi
        .fn()
        .mockRejectedValue(new DOMException("Aborted", "AbortError")),
    });
    await expect(
      client("/me", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("maps every binding error code and avoids retrying business rule errors", () => {
    for (const code of [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
      "INVALID_DATE_RANGE",
      "OVERLAPPING_REQUEST",
      "INSUFFICIENT_BALANCE",
      "STATUS_CONFLICT",
      "ORGANISATION_MEMBERSHIP_REQUIRED",
      "INTERNAL_ERROR",
    ])
      expect(
        errorMessage(new ApiClientError(400, code, "raw message")),
      ).not.toBe("raw message");
    expect(
      shouldRetry(
        0,
        new ApiClientError(422, "INSUFFICIENT_BALANCE", "balance"),
      ),
    ).toBe(false);
  });
});
