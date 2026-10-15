import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/application.js";
import { readEnvironment } from "../../src/config/env.js";
import { createInsightsService } from "../../src/services/insights.js";
import { fixture, org } from "./fixture.js";
// Permanent regression: the real application must register Insights after auth.
describe("actual createApp insights wiring", () => {
  function app(configured = true) {
    const snapshot = vi.fn(async () => {
      return fixture();
    });
    const services = {
      verifyToken: async (token: string) =>
        token === "valid" ? "verified-actor" : null,
      repository: {
        findAccount: async () => ({
          id: "verified-actor",
          email: "private@example.invalid",
          fullName: "Actor",
          active: true,
          memberships: [],
        }),
        listLeaveTypes: async () => [],
      },
      ...(configured ? { insights: createInsightsService({ snapshot }) } : {}),
    };
    return {
      app: createApp(readEnvironment({ NODE_ENV: "test" }), services),
      snapshot,
    };
  }
  const url = `/api/v1/insights?organisationId=${org}&from=2026-10-30&to=2026-11-04&allocationYear=2026`;
  it("mounts the authenticated endpoint in the real application", async () => {
    const h = app();
    const res = await request(h.app)
      .get(url)
      .set("Authorization", "Bearer valid");
    expect(res.status).toBe(200);
    expect(res.body.data.summary.approvedPersonDays).toBe(3);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("rejects invalid authentication before invoking insights", async () => {
    const h = app();
    expect(
      (await request(h.app).get(url).set("Authorization", "Bearer invalid"))
        .status,
    ).toBe(401);
    expect(h.snapshot).not.toHaveBeenCalled();
  });
  it("validates query input in the actual route", async () => {
    expect(
      (
        await request(app().app)
          .get(url + "&teamId=spoof")
          .set("Authorization", "Bearer valid")
      ).status,
    ).toBe(400);
  });
  it("keeps Insights available when AI has no configured service", async () => {
    const h = app();
    const ai = await request(h.app)
      .post("/api/v1/ai/leave-draft")
      .set("Authorization", "Bearer valid")
      .send({
        organisationIds: [org],
        text: "Annual leave from 22 October 2026 to 23 October 2026.",
      });
    expect(ai.status).toBe(503);
    expect(ai.body.error.code).toBe("AI_NOT_CONFIGURED");
    expect(
      (await request(h.app).get(url).set("Authorization", "Bearer valid"))
        .status,
    ).toBe(200);
  });
  it("returns the documented service-unavailable envelope when not injected", async () => {
    const res = await request(app(false).app)
      .get(url)
      .set("Authorization", "Bearer valid");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("INSIGHTS_NOT_CONFIGURED");
  });
});
