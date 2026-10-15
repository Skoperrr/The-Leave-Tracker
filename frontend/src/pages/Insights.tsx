import { useState } from "react";
import { useOrganisation } from "../auth/OrganizationProvider";
import { useApiQuery } from "../hooks/queries";
import { fetchInsights } from "../api/insights";
import { Loading, ErrorNotice, PageHeading } from "../components/ui";
import {
  defaultInsightsFilters,
  parseInsightsFilters,
  type InsightsFilterForm,
} from "../components/insights/filters";
import { InsightsReport } from "../components/insights/InsightsReport";
import "./insights.css";
export function Insights() {
  const { membership } = useOrganisation();
  if (!["ADMIN", "MANAGER"].includes(membership.role))
    return (
      <section className="panel">
        <h1>Permission required</h1>
        <p>Insights require manager or admin access in this organisation.</p>
      </section>
    );
  return (
    <InsightsPage
      key={`${membership.organisationId}-${membership.role}`}
      organisationId={membership.organisationId}
      organisationName={membership.organisationName}
      cacheScope={`${membership.id}-${membership.role}`}
    />
  );
}
function InsightsPage({
  organisationId,
  organisationName,
  cacheScope,
}: {
  organisationId: string;
  organisationName: string;
  cacheScope: string;
}) {
  const [form, setForm] = useState<InsightsFilterForm>(() =>
    defaultInsightsFilters(),
  );
  const [filters, setFilters] = useState(() =>
    parseInsightsFilters(defaultInsightsFilters(), organisationId),
  );
  const [error, setError] = useState("");
  const valid = typeof filters !== "string" ? filters : null;
  const report = useApiQuery(
    [
      "insights",
      organisationId,
      valid?.from,
      valid?.to,
      valid?.allocationYear,
      valid?.lowBalanceThreshold,
      valid?.coverageThresholdPercent,
      cacheScope,
    ],
    (signal) => fetchInsights(valid!, signal),
    Boolean(valid),
  );
  const field = (name: keyof InsightsFilterForm) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [name]: event.target.value })),
  });
  return (
    <div className="insights-page">
      <PageHeading eyebrow="LEAVE PLANNING" title="Insights">
        Real stored leave data for {organisationName}. Thresholds are planning
        settings, not HR policy.
      </PageHeading>
      <form
        className="panel insights-filters"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const next = parseInsightsFilters(form, organisationId);
          if (typeof next === "string") setError(next);
          else {
            setError("");
            setFilters(next);
          }
        }}
      >
        <div>
          <label htmlFor="insights-from">From date</label>
          <input id="insights-from" type="date" required {...field("from")} />
        </div>
        <div>
          <label htmlFor="insights-to">To date inclusive</label>
          <input id="insights-to" type="date" required {...field("to")} />
        </div>
        <div>
          <label htmlFor="insights-year">Allocation year</label>
          <input
            id="insights-year"
            type="number"
            min="2000"
            max="9999"
            required
            {...field("allocationYear")}
          />
        </div>
        <div>
          <label htmlFor="insights-low">Low balance days</label>
          <input
            id="insights-low"
            type="number"
            min="0"
            max="365"
            required
            {...field("lowBalanceThreshold")}
          />
        </div>
        <div>
          <label htmlFor="insights-coverage">Coverage threshold %</label>
          <input
            id="insights-coverage"
            type="number"
            min="1"
            max="100"
            required
            {...field("coverageThresholdPercent")}
          />
        </div>
        <button className="primary" type="submit">
          Apply filters
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </form>
      {report.isPending ? (
        <Loading label="Loading scoped leave insights" />
      ) : report.isError ? (
        <ErrorNotice
          error={report.error}
          retry={() => {
            void report.refetch();
          }}
        />
      ) : report.data.data.organisationId !== organisationId ? (
        <p className="notice error" role="alert">
          The server returned a different organisation. Refresh before
          continuing.
        </p>
      ) : (
        <>
          <button
            className="secondary insights-refresh"
            disabled={report.isFetching}
            onClick={() => {
              void report.refetch();
            }}
          >
            {report.isFetching ? "Refreshing…" : "Refresh insights"}
          </button>
          <InsightsReport report={report.data.data} />
        </>
      )}
    </div>
  );
}
