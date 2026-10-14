import { useState, type ReactNode } from "react";
import { supabase } from "../auth/supabase";
import { errorMessage } from "../api/errors";
import type { ApiEnvelope, LeaveStatus } from "../types/api";
// Domino loader adapted from the user-provided Uiverse.io snippet by satyamchaudharydev.
export function DominoSpinner({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`domino-spinner${compact ? " compact" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}
export function Loading({
  label = "Loading your workspace",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-heading">
        <DominoSpinner />
        <span>{label}…</span>
      </div>
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <p>{errorMessage(error)}</p>
      {retry && (
        <button type="button" className="secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        ○
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {action}
    </header>
  );
}
export function StatusChip({ status }: { status: LeaveStatus }) {
  return (
    <span className={`status ${status.toLowerCase()}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  ) : null;
}
export function Pagination({
  meta,
  page,
  count,
  onPage,
  busy,
}: {
  meta?: ApiEnvelope<unknown>["meta"];
  page: number;
  count: number;
  onPage: (page: number) => void;
  busy: boolean;
}) {
  const hasNext = meta ? page * meta.pageSize < meta.total : count === 20;
  return (
    <nav className="pagination" aria-label="Results pages">
      <button
        type="button"
        className="secondary"
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page}
        {meta ? ` · ${meta.total} results` : ""}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={!hasNext || busy}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function SignOutButton() {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {error ? <ErrorNotice error={error} /> : null}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          if (!supabase) return;
          setBusy(true);
          setError(null);
          try {
            const result = await supabase.auth.signOut({ scope: "local" });
            if (result.error) throw result.error;
          } catch (error) {
            setError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
