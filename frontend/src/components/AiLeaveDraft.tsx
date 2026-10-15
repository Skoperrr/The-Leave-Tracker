import { useEffect, useRef, useState } from "react";
import { generateLeaveDraft } from "../api/ai";
import type { AiDraftResult, ReadyAiDraft } from "../types/ai";
import { ErrorNotice } from "./ui";
import { AiLoader } from "./AiLoader";
import "./ai-leave-draft.css";

type Props = {
  organisationIds: string[];
  organisations: Array<{ organisationId: string; organisationName: string }>;
  leaveTypes: Array<{ code: string; name: string }>;
  formRevision: string;
  disabled: boolean;
  onApply: (result: ReadyAiDraft) => void;
};

export function AiLeaveDraft({
  organisationIds,
  organisations,
  leaveTypes,
  formRevision,
  disabled,
  onApply,
}: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AiDraftResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const current = useRef<AbortController | null>(null);
  const scope = [...organisationIds].sort().join(",");
  const typesKey = leaveTypes
    .map((type) => type.code)
    .sort()
    .join(",");
  useEffect(() => {
    setApplied(false);
  }, [scope]);
  useEffect(() => {
    current.current?.abort();
    current.current = null;
    setBusy(false);
    setResult(null);
    setError(null);
    return () => {
      current.current?.abort();
      current.current = null;
    };
  }, [scope, formRevision, typesKey]);

  async function generate() {
    if (current.current || disabled || !text.trim() || !organisationIds.length)
      return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setResult(null);
    setError(null);
    setApplied(false);
    try {
      const response = await generateLeaveDraft(
        organisationIds,
        text.trim(),
        controller.signal,
      );
      if (current.current !== controller || controller.signal.aborted) return;
      setResult(response);
    } catch (caught) {
      if (current.current === controller && !controller.signal.aborted)
        setError(caught);
    } finally {
      if (current.current === controller) {
        current.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section
      className="ai-draft ai-surface"
      aria-labelledby="ai-draft-title"
      aria-busy={busy}
    >
      <div className="ai-draft-heading">
        <h2 id="ai-draft-title">Describe your time away</h2>
        <span className="ai-draft-badge">Gemini draft</span>
      </div>
      <p className="muted">
        Turn a sentence into leave details, then review before submitting. You
        can always fill in the form yourself.
      </p>
      <label htmlFor="ai-leave-description">What leave would you like?</label>
      <textarea
        id="ai-leave-description"
        value={text}
        rows={3}
        maxLength={1000}
        disabled={disabled}
        aria-describedby="ai-privacy ai-length"
        placeholder="Annual leave next week, or sick leave tomorrow."
        onChange={(event) => {
          current.current?.abort();
          current.current = null;
          setBusy(false);
          setText(event.target.value);
          setResult(null);
          setError(null);
          setApplied(false);
        }}
      />
      <p className="caption" id="ai-privacy">
        Your description is sent to Google Gemini. Include only the leave type
        and dates; keep medical and other private details out. Google may use
        free-tier input to improve its products.
      </p>
      <div className="ai-draft-actions">
        <span className="caption" id="ai-length">
          {text.length}/1000 · South Africa time
        </span>
        <button
          type="button"
          className="secondary"
          disabled={
            disabled ||
            busy ||
            !text.trim() ||
            !organisationIds.length ||
            !leaveTypes.length
          }
          onClick={() => void generate()}
        >
          {busy ? "Generating draft…" : "Generate draft"}
        </button>
      </div>
      {busy && (
        <AiLoader
          label="Gemini is preparing your draft"
          detail="Your leave has not been submitted. Review the suggestion before sending."
        />
      )}
      {error ? <ErrorNotice error={error} /> : null}
      {applied && (
        <p className="notice success" role="status">
          Details applied. Review the form, then choose Submit request to send
          it.
        </p>
      )}
      {result?.status === "NEEDS_CLARIFICATION" && (
        <div className="ai-draft-review ai-result" role="status">
          <h3>A little more detail, please</h3>
          <ul>
            {result.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
          <p className="caption">
            Update your description above and generate a new draft. Nothing has
            been saved.
          </p>
        </div>
      )}
      {result?.status === "READY" && (
        <div className="ai-draft-review ai-result">
          <h3>AI suggestion — review before submitting</h3>
          <dl className="ai-draft-details">
            <div>
              <dt>Organisations</dt>
              <dd>
                {organisations
                  .filter((org) =>
                    result.draft.organisationIds.includes(org.organisationId),
                  )
                  .map((org) => org.organisationName)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt>Leave type</dt>
              <dd>
                {leaveTypes.find(
                  (type) => type.code === result.draft.leaveTypeCode,
                )?.name ?? result.draft.leaveTypeCode}
              </dd>
            </div>
            <div>
              <dt>Inclusive dates</dt>
              <dd>
                {result.draft.startDate} → {result.draft.endDate}
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>
                {result.workingDays} working{" "}
                {result.workingDays === 1 ? "day" : "days"}
              </dd>
            </div>
          </dl>
          <ul className="caption">
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <p className="caption">
            Applying replaces the form’s leave type and dates. Your private
            reason stays unchanged. Reference date: {result.referenceDate} (
            {result.timezone}).
          </p>
          <div className="ai-draft-actions">
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => setResult(null)}
            >
              Discard suggestion
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                disabled ||
                !leaveTypes.some(
                  (type) => type.code === result.draft.leaveTypeCode,
                )
              }
              onClick={() => {
                onApply(result);
                setResult(null);
                setApplied(true);
              }}
            >
              Use these details
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
