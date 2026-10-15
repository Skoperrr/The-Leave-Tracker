import { useState } from "react";
import { generateManagerSummary } from "../api/ai-tools";
import { useOrganisation } from "../auth/OrganizationProvider";
import { useAiTool } from "../hooks/useAiTool";
import type { ManagerSummary } from "../types/ai-tools";
import { ErrorNotice } from "./ui";
import { AiLoader } from "./AiLoader";
import "./ai-tools.css";

export function ManagerAssistant() {
  const { membership } = useOrganisation();
  const [from, setFrom] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [to, setTo] = useState(() =>
    new Date(new Date(`${from}T00:00:00Z`).getTime() + 30 * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const { result, error, busy, run } = useAiTool<ManagerSummary>(
    `${membership.id}|${from}|${to}`,
  );
  const [showAll, setShowAll] = useState(false);
  return (
    <section
      className="panel ai-tool ai-surface"
      aria-labelledby="manager-assistant-title"
      aria-busy={busy}
    >
      <div className="ai-tool-heading">
        <h2 id="manager-assistant-title">Manager assistant</h2>
        <span className="ai-draft-badge">Review support</span>
      </div>
      <p className="muted">
        A plain-language review of pending requests, overlaps and potential
        coverage pressure in your authorised{" "}
        {membership.role === "ADMIN"
          ? "organisation review scope"
          : "direct reports"}
        .
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setShowAll(false);
          void run((signal) =>
            generateManagerSummary(membership.organisationId, from, to, signal),
          );
        }}
      >
        <div className="ai-tool-actions">
          <div>
            <label htmlFor="assistant-from">Planning from</label>
            <input
              id="assistant-from"
              type="date"
              value={from}
              required
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="assistant-to">Planning to</label>
            <input
              id="assistant-to"
              type="date"
              value={to}
              min={from}
              required
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <button className="primary" disabled={busy || !from || !to}>
            {busy ? "Preparing review…" : "Generate manager summary"}
          </button>
        </div>
        <p className="caption">
          Up to 93 calendar days. Gemini prioritises anonymous facts; employee
          names and private reasons are not sent to it. Free-tier inputs may be
          used by Google to improve its products. You decide each request
          separately.
        </p>
      </form>
      {busy && (
        <AiLoader
          label="Gemini is preparing your review"
          detail="Finding overlaps and prioritising authorised team facts."
        />
      )}
      {error ? <ErrorNotice error={error} /> : null}
      {result && (
        <div className="ai-tool-answer ai-result" aria-live="polite">
          <h3>
            {result.aiUsed
              ? "AI-assisted review summary"
              : "Database review overview"}
          </h3>
          <p>{result.summary}</p>
          {result.highlights.length > 0 && (
            <>
              <h4>Prioritised highlights</h4>
              <ul className="ai-tool-facts">
                {result.highlights.map((fact) => (
                  <li key={fact.id}>
                    {fact.text}
                    <small>
                      {fact.requestIds.length} supporting request(s)
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <details>
            <summary>
              All calculated attention flags ({result.attention.length})
            </summary>
            <ul className="ai-tool-facts">
              {(showAll ? result.attention : result.attention.slice(0, 20)).map(
                (fact) => (
                  <li key={fact.id}>
                    {fact.text}
                    <small>
                      {fact.requestIds.length} supporting request(s)
                    </small>
                  </li>
                ),
              )}
            </ul>
            {result.attention.length > 20 && !showAll && (
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAll(true)}
              >
                Show remaining flags
              </button>
            )}
          </details>
          <details>
            <summary>Source requests ({result.sources.length})</summary>
            <ul className="ai-tool-records">
              {result.sources.map((row) => (
                <li key={row.id}>
                  <strong>{row.employeeDisplayName}</strong>
                  <span>
                    {row.startDate} → {row.endDate} · {row.status}
                  </span>
                  <small>Request {row.id}</small>
                </li>
              ))}
            </ul>
          </details>
          {result.limitations.map((item, index) => (
            <p className="caption" key={index}>
              {item}
            </p>
          ))}
          <p className="caption">
            Snapshot:{" "}
            {new Date(result.generatedAt).toLocaleString("en-ZA", {
              timeZone: "Africa/Johannesburg",
            })}{" "}
            SAST. Generate again to refresh; leave changes clear this summary.
          </p>
        </div>
      )}
    </section>
  );
}
