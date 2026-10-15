import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { askLeaveData } from "../api/ai-tools";
import { useAiTool } from "../hooks/useAiTool";
import type { AskDataResult } from "../types/ai-tools";
import { ErrorNotice } from "./ui";
import "./ai-tools.css";

export function AskLeaveData() {
  const { membership } = useOrganisation();
  const [question, setQuestion] = useState("");
  const { result, error, busy, run } = useAiTool<AskDataResult>(
    `${membership.id}|${question}`,
  );
  const reviewer = ["MANAGER", "ADMIN"].includes(membership.role);
  return (
    <section
      className="panel ai-tool"
      aria-labelledby="ask-data-title"
      aria-busy={busy}
    >
      <div className="ai-tool-heading">
        <h2 id="ask-data-title">Ask the data</h2>
        <span className="ai-draft-badge">Gemini + database</span>
      </div>
      <p className="muted">
        Ask about approved time away, your own balance
        {reviewer ? ", or pending requests you can review" : ""} at{" "}
        {membership.organisationName}.
      </p>
      <div className="ai-tool-examples">
        {[
          "Who's off next week?",
          "What is my leave balance?",
          ...(reviewer ? ["What requests are pending next week?"] : []),
        ].map((example) => (
          <button
            type="button"
            className="secondary"
            key={example}
            onClick={() => setQuestion(example)}
          >
            {example}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim())
            void run((signal) =>
              askLeaveData(membership.organisationId, question.trim(), signal),
            );
        }}
      >
        <label htmlFor="leave-data-question">Your leave question</label>
        <textarea
          id="leave-data-question"
          rows={2}
          maxLength={500}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          aria-describedby="ask-data-privacy"
          placeholder="Who's off next week?"
        />
        <p className="caption" id="ask-data-privacy">
          Your question is sent to Google Gemini. Avoid private details. Answers
          use records you can access; no changes are made. Free-tier questions
          may be used by Google to improve its products.
        </p>
        <div className="ai-tool-actions">
          <span className="caption">
            {question.length}/500 · South Africa time
          </span>
          <button className="primary" disabled={busy || !question.trim()}>
            {busy ? "Checking the data…" : "Ask the data"}
          </button>
        </div>
      </form>
      {busy && (
        <p role="status">
          Interpreting your question and checking authorised records…
        </p>
      )}
      {error ? <ErrorNotice error={error} /> : null}
      {result?.status === "NEEDS_CLARIFICATION" && (
        <div className="notice" role="status">
          <ul>
            {result.questions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {result?.status === "ANSWER" && (
        <div className="ai-tool-answer" aria-live="polite">
          <h3>From your leave records</h3>
          <p>{result.answer}</p>
          {result.interpretation && (
            <p className="caption">{result.interpretation}</p>
          )}
          {result.balances.length > 0 && (
            <div className="table-scroll">
              <table>
                <caption>Your allocated balances</caption>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Year</th>
                    <th>Allocated</th>
                    <th>Approved</th>
                    <th>Pending</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {result.balances.map((row, index) => (
                    <tr key={index}>
                      <td>{row.leaveTypeName}</td>
                      <td>{row.year}</td>
                      <td>{row.allocatedDays}</td>
                      <td>{row.approvedDays}</td>
                      <td>{row.pendingDays}</td>
                      <td>{row.remainingDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.rows.length > 0 && (
            <details open>
              <summary>Source records ({result.rows.length})</summary>
              <ul className="ai-tool-records">
                {result.rows.map((row, index) => (
                  <li key={row.id ?? row.requestId ?? index}>
                    <strong>{row.employeeDisplayName}</strong>
                    <span>
                      {row.startDate} → {row.endDate} ·{" "}
                      {row.status ?? "APPROVED"}
                    </span>
                    <Link to={`/calendar?date=${row.startDate}`}>
                      View calendar
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.intent === "PENDING_REQUESTS" && reviewer && (
            <Link
              className="text-button"
              to={membership.role === "ADMIN" ? "/admin/approvals" : "/manager"}
            >
              Open leave approvals →
            </Link>
          )}
          {result.limitations?.map((item, index) => (
            <p className="caption" key={index}>
              {item}
            </p>
          ))}
          <p className="caption">
            Snapshot:{" "}
            {new Date(result.generatedAt).toLocaleString("en-ZA", {
              timeZone: "Africa/Johannesburg",
            })}{" "}
            SAST. Scope: {result.scope.replaceAll("_", " ").toLowerCase()}. Ask
            again to refresh.
          </p>
        </div>
      )}
    </section>
  );
}
