import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createInsightsRepository } from "../../src/repositories/insights.js";
import { createInsightsService } from "../../src/services/insights.js";
import { createInsightsRouter } from "../../src/routes/insights.js";
import { authenticate } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errors.js";
import { insightsQuery } from "../../src/validators/insights.js";
import { fixture, input, org } from "./fixture.js";
function repositoryHarness(role: string | null = "ADMIN", empty = false) {
  const memberFind = vi
    .fn()
    .mockResolvedValueOnce(role ? { id: "actor-member", role } : null)
    .mockResolvedValueOnce(
      empty ? [] : [{ id: "member", user: { fullName: "Ava" } }],
    );
  const tx = {
    membership: { findFirst: memberFind, findMany: memberFind },
    leaveType: {
      findMany: vi.fn(async () => [
        { id: "annual", code: "ANNUAL", name: "Annual leave" },
      ]),
    },
    leaveRequest: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    leaveBalance: { findMany: vi.fn(async () => []) },
  };
  const transaction = vi.fn(async (operation: (tx: unknown) => unknown) =>
    operation(tx),
  );
  return {
    tx,
    transaction,
    repository: createInsightsRepository({
      $transaction: transaction,
    } as unknown as PrismaClient),
  };
}
describe("server authorised insights repository", () => {
  it.each(["ADMIN", "MANAGER"])(
    "scopes %s using current database membership and bounded queries",
    async (role) => {
      const h = repositoryHarness(role);
      await h.repository.snapshot("verified-actor", input);
      expect(h.tx.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "verified-actor",
            organisationId: org,
            active: true,
            user: { active: true },
            organisation: { active: true },
          }),
        }),
      );
      const where = h.tx.membership.findMany.mock.calls[1]![0].where;
      expect(where).toMatchObject({
        organisationId: org,
        active: true,
        user: { active: true },
      });
      if (role === "MANAGER")
        expect(where).toMatchObject({
          managerMembershipId: "actor-member",
          id: { not: "actor-member" },
        });
      else expect(where).not.toHaveProperty("managerMembershipId");
      expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "RepeatableRead",
        timeout: 30000,
      });
      expect(h.tx.leaveRequest.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: {
              gte: new Date("2026-01-01"),
              lte: new Date("2026-12-31"),
            },
          }),
        }),
      );
    },
  );
  it.each(["EMPLOYEE", null])(
    "denies inactive/missing or employee scope %s",
    async (role) => {
      const h = repositoryHarness(role);
      await expect(h.repository.snapshot("actor", input)).rejects.toMatchObject(
        { status: 403 },
      );
      expect(h.tx.leaveType.findMany).not.toHaveBeenCalled();
    },
  );
  it("skips request/allocation queries for zero workforce", async () => {
    const h = repositoryHarness("MANAGER", true);
    expect((await h.repository.snapshot("actor", input)).members).toEqual([]);
    expect(h.tx.leaveRequest.findMany).not.toHaveBeenCalled();
  });
});
function harness() {
  const snapshot = vi.fn(async (_actor: string, _query: typeof input) =>
    fixture(),
  );
  const services = {
    verifyToken: async (token: string) =>
      token === "valid" ? "verified-actor" : null,
    repository: {
      findAccount: async () => ({
        id: "verified-actor",
        email: "never-return@example.com",
        fullName: "Actor",
        active: true,
        memberships: [],
      }),
      listLeaveTypes: async () => [],
    },
    insights: createInsightsService({ snapshot }),
  };
  const app = express();
  app.use("/api/v1", authenticate(services), createInsightsRouter(services));
  app.use(errorHandler);
  return { app, snapshot };
}
const url = `/api/v1/insights?organisationId=${org}&from=2026-10-30&to=2026-11-04&allocationYear=2026`;
describe("isolated router harness with existing bearer middleware (not central registration)", () => {
  it("uses verified actor and emits only the frozen DTO with no cache", async () => {
    const h = harness();
    const response = await request(h.app)
      .get(url)
      .set("Authorization", "Bearer valid");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(h.snapshot.mock.calls[0]![0]).toBe("verified-actor");
    expect(Object.keys(response.body.data).sort()).toEqual(
      [
        "organisationId",
        "generatedAt",
        "timezone",
        "period",
        "allocationYear",
        "scope",
        "activeMemberCount",
        "thresholds",
        "summary",
        "lowBalances",
        "monthly",
        "dailyCoverage",
        "byType",
        "limitations",
      ].sort(),
    );
    expect(JSON.stringify(response.body)).not.toContain(
      "never-return@example.com",
    );
  });
  it.each([undefined, "Bearer invalid"])(
    "rejects missing/invalid bearer before aggregation",
    async (bearer) => {
      const h = harness();
      const call = request(h.app).get(url);
      if (bearer) call.set("Authorization", bearer);
      expect((await call).status).toBe(401);
      expect(h.snapshot).not.toHaveBeenCalled();
    },
  );
  it.each(["&teamId=spoofed", "&role=ADMIN", "&from=bad"])(
    "rejects unknown/repeated query input %s",
    async (suffix) => {
      const h = harness();
      expect(
        (
          await request(h.app)
            .get(url + suffix)
            .set("Authorization", "Bearer valid")
        ).status,
      ).toBe(400);
      expect(h.snapshot).not.toHaveBeenCalled();
    },
  );
  it.each([
    { from: "2026-02-30" },
    { from: "2026-11-05" },
    { to: "2027-11-05" },
    { allocationYear: 1999 },
    { allocationYear: 2026.5 },
    { allocationYear: "2026e0" },
    { lowBalanceThreshold: "" },
    { coverageThresholdPercent: " 30 " },
    { lowBalanceThreshold: -1 },
    { lowBalanceThreshold: 366 },
    { coverageThresholdPercent: 0 },
    { coverageThresholdPercent: 101 },
    { organisationId: "not-a-uuid" },
  ])("rejects invalid filters %j", (invalid) => {
    expect(insightsQuery.safeParse({ ...input, ...invalid }).success).toBe(
      false,
    );
  });
  it("allows 366 days, leap days, cross-year and weekend-only reports", () => {
    for (const dates of [
      { from: "2024-01-01", to: "2024-12-31" },
      { from: "2026-12-31", to: "2027-01-04" },
      { from: "2026-10-31", to: "2026-11-01" },
    ])
      expect(insightsQuery.safeParse({ ...input, ...dates }).success).toBe(
        true,
      );
  });
});
