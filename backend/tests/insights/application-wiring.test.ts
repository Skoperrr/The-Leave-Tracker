import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/application.js";
import { readEnvironment } from "../../src/config/env.js";
import { createInsightsService } from "../../src/services/insights.js";
import { fixture, org } from "./fixture.js";
// Enable only after Victor's central registration is present, or in an isolated
// rehearsal with docs/day8/insights-wiring.patch applied. Feature branch alone
// intentionally leaves shared-file registration to its integration owner.
describe.skipIf(process.env.INSIGHTS_INTEGRATION_REHEARSAL !== "1")(
  "actual createApp insights wiring",
  () => {
    function app(deny = false) {
      const snapshot = vi.fn(async () => {
        if (deny)
          throw Object.assign(new Error("Forbidden"), {
            status: 403,
            code: "FORBIDDEN",
          });
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
        insights: createInsightsService({ snapshot }),
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
  },
);
