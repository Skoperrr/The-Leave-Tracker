import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
export function CalendarConnectionBanner() {
  const [params, setParams] = useSearchParams();
  const result = params.get("calendarConnection");
  if (!result) return null;
  const text =
    result === "connected"
      ? "Google connected. Open calendar settings to choose this organisation's shared calendar."
      : result === "cancelled"
        ? "Google connection was cancelled. You can try again."
        : "Google connection could not be completed. Refresh calendar settings and reconnect.";
  return (
    <div className="notice" role="status">
      <p>{text}</p>
      <Link to="/admin/calendar">Open calendar settings</Link>{" "}
      <button
        type="button"
        className="secondary"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.delete("calendarConnection");
          setParams(next, { replace: true });
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
