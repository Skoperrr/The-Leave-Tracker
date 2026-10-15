import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/lib/database.js";
import { createInsightsRepository } from "../../src/repositories/insights.js";
import { createInsightsService } from "../../src/services/insights.js";
import { actor, seedInsightsFixture, cleanInsightsFixture } from "./seed.js";
import { input, now } from "./fixture.js";
// Explicit opt-in: use a migrated disposable test database, never a live workforce.
const enabled =
  process.env.INSIGHTS_RUN_POSTGRES === "1" &&
  Boolean(process.env.INSIGHTS_TEST_DATABASE_URL);
describe.skipIf(!enabled)("native PostgreSQL stored insights fixture", () => {
  let db: ReturnType<typeof createDatabase>;
  beforeAll(async () => {
    db = createDatabase(process.env.INSIGHTS_TEST_DATABASE_URL!);
    await seedInsightsFixture(db);
  }, 30_000);
  afterAll(async () => {
    vi.useRealTimers();
    if (db) {
      try {
        await cleanInsightsFixture(db);
      } finally {
        await db.$disconnect();
      }
    }
  });
  it("reconciles the hand calculation through the native pg adapter", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const report = await createInsightsService(
      createInsightsRepository(db),
    ).report(actor, input);
    expect(report.activeMemberCount).toBe(2);
    expect(report.summary).toEqual({
      approvedRequestCount: 2,
      pendingRequestCount: 1,
      approvedPersonDays: 3,
      upcomingApprovedPersonDays: 3,
      coverageWarningDays: 1,
      unallocatedMemberCount: 0,
    });
    expect(report.monthly.map((row) => row.approvedPersonDays)).toEqual([1, 2]);
    expect(
      report.lowBalances.map((row) => [
        row.employeeDisplayName,
        row.remainingDays,
      ]),
    ).toEqual([["Ava", 11]]);
    expect(
      report.dailyCoverage.find((row) => row.date === "2026-11-02")
        ?.approvedPercent,
    ).toBe(100);
    expect(report.byType[0]?.approvedWorkingDays).toBe(3);
  });
});
