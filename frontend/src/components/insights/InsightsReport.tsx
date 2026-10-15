import type { InsightsResult } from "../../types/insights";
const fmt = (value: number) =>
  new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(value);
export function InsightsReport({ report }: { report: InsightsResult }) {
  const monthlyMax = Math.max(
    1,
    ...report.monthly.map((month) => month.approvedPersonDays),
  );
  const cards = [
    [
      "Approved person-days",
      report.summary.approvedPersonDays,
      "Distinct active members × weekdays with approved leave.",
    ],
    [
      "Pending requests",
      report.summary.pendingRequestCount,
      "Distinct overlapping pending child requests, not approved absences.",
    ],
    [
      "Upcoming approved person-days",
      report.summary.upcomingApprovedPersonDays,
      "Within the selected period, from today in Africa/Johannesburg.",
    ],
    [
      "Coverage warning days",
      report.summary.coverageWarningDays,
      `Weekdays where approved absences meet the ${report.thresholds.coveragePercent}% planning threshold.`,
    ],
  ] as const;
  return (
    <div className="insights-results">
      <p>
        {report.scope === "ORGANISATION"
          ? "Organisation-wide"
          : "Direct reports only"}{" "}
        · <strong>{report.activeMemberCount} currently active members</strong>.
        This workforce scope also applies to historical periods.
      </p>
      <p className="muted">
        Inclusive period: {report.period.from} to {report.period.to} ·
        Allocation year: {report.allocationYear} · Data generated at{" "}
        <time dateTime={report.generatedAt}>
          {new Date(report.generatedAt).toLocaleString("en-ZA", {
            timeZone: report.timezone,
          })}
        </time>{" "}
        ({report.timezone}).
      </p>
      {report.activeMemberCount === 0 && (
        <div className="notice" role="status">
          No eligible active members in this scope. Counts and percentages are
          zero; there are no coverage warnings.
        </div>
      )}
      <div className="insights-summary">
        {cards.map(([title, value, note]) => (
          <article className="panel" key={title}>
            <h2>{title}</h2>
            <p className="insights-stat">{fmt(value)}</p>
            <p className="muted">{note}</p>
          </article>
        ))}
      </div>
      <section className="panel" aria-labelledby="insights-balance-heading">
        <h2 id="insights-balance-heading">Low remaining balances</h2>
        <p>
          At or below {report.thresholds.lowBalanceDays} days. Full-year
          approved and pending usage is reserved against allocated days,
          independently of the chart period.
        </p>
        <p className="notice">
          <strong>
            {report.summary.unallocatedMemberCount} members missing allocations
          </strong>{" "}
          for at least one active balance-limited leave type in{" "}
          {report.allocationYear}. Missing entitlement is not counted as
          zero-day leave.
        </p>
        {!report.lowBalances.length ? (
          <p>No allocated balances meet this planning threshold.</p>
        ) : (
          <div
            className="insights-table-scroll"
            tabIndex={0}
            aria-label="Low balance table"
          >
            <table>
              <caption>Allocated low balances in days</caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Leave type</th>
                  <th scope="col">Allocated</th>
                  <th scope="col">Approved</th>
                  <th scope="col">Reserved pending</th>
                  <th scope="col">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {report.lowBalances.map((row) => (
                  <tr key={`${row.membershipId}-${row.leaveTypeCode}`}>
                    <th scope="row">{row.employeeDisplayName}</th>
                    <td>{row.leaveTypeName}</td>
                    <td>{fmt(row.allocatedDays)}</td>
                    <td>{fmt(row.approvedDays)}</td>
                    <td>{fmt(row.pendingDays)}</td>
                    <td>{fmt(row.remainingDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="insights-month-heading">
        <h2 id="insights-month-heading">Monthly approved leave load</h2>
        <p>
          Approved person-days, clipped to the selected period. Bar scale starts
          at 0 and ends at {fmt(monthlyMax)} person-days.
        </p>
        <div
          className="insights-bars"
          role="img"
          aria-label={`Monthly approved person-days: ${report.monthly.map((month) => `${month.month}: ${month.approvedPersonDays}`).join("; ")}. Scale zero to ${monthlyMax}.`}
        >
          {report.monthly.map((month) => (
            <div className="insights-bar-row" key={month.month}>
              <span>{month.month}</span>
              <div className="insights-bar-track">
                <span
                  style={{
                    width: `${(month.approvedPersonDays / monthlyMax) * 100}%`,
                  }}
                />
              </div>
              <strong>{fmt(month.approvedPersonDays)}</strong>
            </div>
          ))}
        </div>
        <details>
          <summary>View monthly data table</summary>
          <table>
            <caption>Monthly approved person-days</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Person-days</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{fmt(month.approvedPersonDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
      <section className="panel" aria-labelledby="insights-coverage-heading">
        <h2 id="insights-coverage-heading">Potential coverage pressure</h2>
        <p>
          Denominator: {report.activeMemberCount} currently active members.
          Warning threshold: approved absences ≥{" "}
          {report.thresholds.coveragePercent}%, using the unrounded percentage.
          Pending projections do not count as approved leave.
        </p>
        <p>
          These are planning signals, not confirmed understaffing; shift rosters
          and required staffing are unavailable.
        </p>
        {!report.dailyCoverage.length ? (
          <p>The selected period contains no weekdays.</p>
        ) : (
          <>
            <p>
              {report.summary.coverageWarningDays
                ? `${report.summary.coverageWarningDays} weekdays worth reviewing.`
                : "No weekday meets the approved coverage threshold."}
            </p>
            <div
              className="insights-table-scroll"
              tabIndex={0}
              aria-label="Daily coverage table"
            >
              <table>
                <caption>Weekday coverage including zero-load days</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Approved people</th>
                    <th scope="col">Pending people</th>
                    <th scope="col">Projected people</th>
                    <th scope="col">Approved %</th>
                    <th scope="col">Projected %</th>
                    <th scope="col">Planning signal</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dailyCoverage.map((day) => (
                    <tr
                      key={day.date}
                      className={day.warning ? "insights-warning" : ""}
                    >
                      <th scope="row">{day.date}</th>
                      <td>
                        {day.approvedPeople} of {report.activeMemberCount}
                      </td>
                      <td>{day.pendingPeople}</td>
                      <td>{day.projectedPeople}</td>
                      <td>{day.approvedPercent.toFixed(1)}%</td>
                      <td>{day.projectedPercent.toFixed(1)}%</td>
                      <td>
                        {day.warning ? "Review coverage" : "Below threshold"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="insights-type-heading">
        <h2 id="insights-type-heading">Approved request-days by leave type</h2>
        <p>
          {report.summary.approvedRequestCount} distinct approved requests
          overlap this period. These request-days count each approved request;
          person-days above deduplicate people and dates.
        </p>
        {!report.byType.length ? (
          <p>No approved requests overlap the selected period.</p>
        ) : (
          <div
            className="insights-table-scroll"
            tabIndex={0}
            aria-label="Leave type breakdown table"
          >
            <table>
              <caption>Clipped weekday request-days by leave type</caption>
              <thead>
                <tr>
                  <th scope="col">Leave type</th>
                  <th scope="col">Approved requests</th>
                  <th scope="col">Approved request-days</th>
                </tr>
              </thead>
              <tbody>
                {report.byType.map((type) => (
                  <tr key={type.leaveTypeCode}>
                    <th scope="row">{type.leaveTypeName}</th>
                    <td>{type.approvedRequestCount}</td>
                    <td>{fmt(type.approvedWorkingDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>How to interpret these figures</h2>
        <ul>
          {report.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
