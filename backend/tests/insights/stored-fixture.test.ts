import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { insightsTestDatabase } from "./pglite.js";
import { createInsightsRepository } from "../../src/repositories/insights.js";
import { createInsightsService } from "../../src/services/insights.js";
import { createLeaveRepository } from "../../src/repositories/leave.js";
import { createLeaveService } from "../../src/services/leave.js";
import { createManagerService } from "../../src/services/manager.js";
import { input, org, ava, bongi, annual, now } from "./fixture.js";
let database: Awaited<ReturnType<typeof insightsTestDatabase>>;
import { actor, other, seedInsightsFixture } from "./seed.js";
beforeAll(async () => {
  database = await insightsTestDatabase();
  await seedInsightsFixture(database.db);
}, 30_000);
afterAll(async () => {
  vi.useRealTimers();
  await database?.close();
});
describe("actual Prisma queries against stored PostgreSQL-in-WASM fixtures", () => {
  it("reconciles source rows with the exact specification and measures a scoped read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const repository = createInsightsRepository(database.db),
      service = createInsightsService(repository);
    const startQueries = database.queries.length,
      start = performance.now();
    const result = await service.report(actor, input);
    const elapsed = performance.now() - start;
    const readQueries = database.queries.slice(startQueries);
    expect(result.summary).toEqual({
      approvedRequestCount: 2,
      pendingRequestCount: 1,
      approvedPersonDays: 3,
      upcomingApprovedPersonDays: 3,
      coverageWarningDays: 1,
      unallocatedMemberCount: 0,
    });
    expect(result.monthly.map((month) => month.approvedPersonDays)).toEqual([
      1, 2,
    ]);
    expect(result.lowBalances[0]).toMatchObject({
      employeeDisplayName: "Ava",
      remainingDays: 11,
      approvedDays: 2,
      pendingDays: 2,
    });
    expect(
      result.dailyCoverage.find((day) => day.date === "2026-11-02"),
    ).toMatchObject({ approvedPeople: 2, approvedPercent: 100, warning: true });
    expect(result.byType[0]).toMatchObject({
      approvedRequestCount: 2,
      approvedWorkingDays: 3,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|example.invalid/);
    expect(
      readQueries.filter((query) => query.startsWith("SELECT")),
    ).toHaveLength(8);
    const sourceRows = await database.db.leaveRequest.findMany({
      where: { organisationId: org },
      select: { membershipId: true, status: true, workingDays: true },
    });
    expect(
      sourceRows
        .filter((row) => row.status === "APPROVED")
        .reduce((sum, row) => sum + row.workingDays, 0),
    ).toBe(result.summary.approvedPersonDays);
    console.info(
      `INSIGHTS_FIXTURE_TIMING members=2 requests=3 allocations=2 types=1 selects=8 elapsedMs=${elapsed.toFixed(2)} approvedPersonDays=${result.summary.approvedPersonDays}`,
    );
    vi.useRealTimers();
  });
  it("enforces live stored roles, direct reports, missing scope and current activity", async () => {
    const service = createInsightsService(
      createInsightsRepository(database.db),
    );
    await database.db.membership.update({
      where: { id: ava },
      data: { role: "MANAGER" },
    });
    let result = await service.report(actor, input);
    expect(result.scope).toBe("DIRECT_REPORTS");
    expect(result.activeMemberCount).toBe(1);
    expect(result.summary.approvedPersonDays).toBe(1);
    await expect(service.report(other, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.report(actor, { ...input, organisationId: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
    await database.db.user.update({
      where: { id: other },
      data: { active: false },
    });
    result = await service.report(actor, input);
    expect(result.activeMemberCount).toBe(0);
    expect(
      result.dailyCoverage.every(
        (day) => day.projectedPercent === 0 && !day.warning,
      ),
    ).toBe(true);
    await database.db.user.update({
      where: { id: other },
      data: { active: true },
    });
    await database.db.membership.update({
      where: { id: bongi },
      data: { active: false },
    });
    expect((await service.report(actor, input)).activeMemberCount).toBe(0);
    await database.db.organisation.update({
      where: { id: org },
      data: { active: false },
    });
    await expect(service.report(actor, input)).rejects.toMatchObject({
      status: 403,
    });
    await database.db.organisation.update({
      where: { id: org },
      data: { active: true },
    });
    await database.db.membership.update({
      where: { id: ava },
      data: { role: "ADMIN" },
    });
    await database.db.membership.update({
      where: { id: bongi },
      data: { active: true },
    });
  });
  it("changes pending/approved metrics only when persisted requests change", async () => {
    const service = createInsightsService(
      createInsightsRepository(database.db),
    );
    const existing = await service.report(actor, input);
    const leave = createLeaveService(createLeaveRepository(database.db));
    const created = await leave.create(other, {
      organisationIds: [org],
      leaveTypeCode: "ANNUAL",
      startDate: "2026-11-04",
      endDate: "2026-11-04",
    });
    const pending = created.requests[0]!;
    const beforeApproval = await service.report(actor, input);
    expect(beforeApproval.summary.pendingRequestCount).toBe(
      existing.summary.pendingRequestCount + 1,
    );
    expect(beforeApproval.summary.approvedPersonDays).toBe(3);
    await createManagerService(createLeaveRepository(database.db)).decide(
      actor,
      pending.id,
      { decision: "APPROVE" },
    );
    const afterApproval = await service.report(actor, input);
    expect(afterApproval.summary.approvedPersonDays).toBe(4);
    expect(afterApproval.summary.pendingRequestCount).toBe(
      existing.summary.pendingRequestCount,
    );
  });
  it("keeps the query count constant for a larger stored workforce", async () => {
    const people = Array.from({ length: 100 }, (_, index) => ({
      id: randomUUID(),
      membershipId: randomUUID(),
      fullName: `Temporary member ${index}`,
    }));
    await database.db.user.createMany({
      data: people.map((person) => ({
        id: person.id,
        fullName: person.fullName,
        email: `${person.id}@example.invalid`,
      })),
    });
    await database.db.membership.createMany({
      data: people.map((person) => ({
        id: person.membershipId,
        userId: person.id,
        organisationId: org,
        managerMembershipId: ava,
      })),
    });
    await database.db.leaveBalance.createMany({
      data: people.map((person) => ({
        membershipId: person.membershipId,
        organisationId: org,
        leaveTypeId: annual.id,
        year: 2026,
        allocatedDays: 15,
      })),
    });
    await database.db.leaveRequest.createMany({
      data: people.flatMap((person) => [
        {
          membershipId: person.membershipId,
          userId: person.id,
          organisationId: org,
          leaveTypeId: annual.id,
          status: "APPROVED" as const,
          startDate: new Date("2026-11-02"),
          endDate: new Date("2026-11-02"),
          workingDays: 1,
          approverMembershipId: ava,
          decidedAt: now,
        },
        {
          membershipId: person.membershipId,
          userId: person.id,
          organisationId: org,
          leaveTypeId: annual.id,
          status: "PENDING" as const,
          startDate: new Date("2026-11-03"),
          endDate: new Date("2026-11-04"),
          workingDays: 2,
        },
      ]),
    });
    const queryStart = database.queries.length,
      start = performance.now();
    const report = await createInsightsService(
      createInsightsRepository(database.db),
    ).report(actor, input);
    const elapsed = performance.now() - start;
    const selects = database.queries
      .slice(queryStart)
      .filter((query) => query.startsWith("SELECT")).length;
    expect(report.activeMemberCount).toBe(102);
    expect(selects).toBe(8);
    expect(report.summary.approvedPersonDays).toBe(104);
    console.info(
      `INSIGHTS_SCALED_TIMING members=102 requests=204 allocations=102 types=1 selects=${selects} elapsedMs=${elapsed.toFixed(2)}`,
    );
  });
});
