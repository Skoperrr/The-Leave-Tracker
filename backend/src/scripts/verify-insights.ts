// Read-only B-10 verification. Requires an authorised manager/admin's current
// bearer token. Does not create accounts, requests, allocations or Google events.
import { readDatabaseEnvironment } from "../config/database-env.js";
import { createDatabase } from "../lib/database.js";
import { createTokenVerifier } from "../lib/supabase.js";
import { createAccessRepository } from "../repositories/access.js";
import { authenticateAccount } from "../services/access.js";
import { createInsightsRepository } from "../repositories/insights.js";
import { aggregateInsights } from "../services/insights.js";
import { insightsQuery, DAY_MS } from "../validators/insights.js";
async function main() {
  const token = process.env.INSIGHTS_BEARER_TOKEN;
  if (!token) throw new Error("An authorised bearer token is required");
  const input = insightsQuery.parse({
    organisationId: process.env.INSIGHTS_ORGANISATION_ID,
    from: process.env.INSIGHTS_FROM,
    to: process.env.INSIGHTS_TO,
    allocationYear: process.env.INSIGHTS_ALLOCATION_YEAR,
    lowBalanceThreshold: process.env.INSIGHTS_LOW_BALANCE_DAYS,
    coverageThresholdPercent: process.env.INSIGHTS_COVERAGE_PERCENT,
  });
  const configuration = readDatabaseEnvironment();
  const db = createDatabase(configuration.DATABASE_URL);
  try {
    const account = await authenticateAccount(
      {
        verifyToken: createTokenVerifier(configuration),
        repository: createAccessRepository(db),
      },
      token,
    );
    const start = performance.now();
    const snapshot = await createInsightsRepository(db).snapshot(
      account.id,
      input,
    );
    const report = aggregateInsights(snapshot, input, new Date());
    const elapsedMs = performance.now() - start;
    // Independent source-row reconciliation; no names, emails or private notes.
    const pairs = new Set<string>();
    const approvedRows = snapshot.requests
      .filter((row) => row.status === "APPROVED")
      .map((row) => {
        const from = row.startDate.toISOString().slice(0, 10),
          to = row.endDate.toISOString().slice(0, 10);
        const startDate = from < input.from ? input.from : from,
          endDate = to > input.to ? input.to : to;
        let clippedWeekdays = 0;
        for (
          let day = Date.parse(startDate);
          day <= Date.parse(endDate);
          day += DAY_MS
        ) {
          const date = new Date(day);
          if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
          clippedWeekdays++;
          pairs.add(`${row.membershipId}|${date.toISOString().slice(0, 10)}`);
        }
        return {
          requestId: row.id,
          membershipId: row.membershipId,
          startDate: from,
          endDate: to,
          clippedWeekdays,
        };
      });
    if (pairs.size !== report.summary.approvedPersonDays)
      throw new Error("Reconciliation mismatch");
    console.info(
      JSON.stringify(
        {
          verifiedAt: report.generatedAt,
          scope: report.scope,
          period: report.period,
          activeMembers: report.activeMemberCount,
          scopedIntervalRequests: snapshot.requests.length,
          allocations: snapshot.allocations.length,
          activeBalanceLimitedTypes: snapshot.types.length,
          elapsedMs: Number(elapsedMs.toFixed(2)),
          summary: report.summary,
          monthly: report.monthly,
          approvedSourceRows: approvedRows,
          reconciledApprovedPersonDays: pairs.size,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Insights read-only verification failed. Check authorised access and configuration; credentials and private records are not logged.",
  );
  process.exitCode = 1;
});
