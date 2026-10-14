import { useState } from "react";
import { Link } from "react-router-dom";
import {
  formatDate,
  monthRange,
  parseDate,
  shiftMonth,
  today,
} from "../hooks/dates";
import type { LeaveRequest } from "../types/api";

export function DashboardCalendar({
  requests,
  preview = false,
  markersState = "ready",
}: {
  requests: LeaveRequest[];
  preview?: boolean;
  markersState?: "ready" | "loading" | "unavailable";
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { cells, from } = monthRange(month);
  const title = new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(from));
  return (
    <section
      className="panel dashboard-calendar"
      aria-label="Your leave calendar"
    >
      <div className="mini-calendar-toolbar">
        <h2 aria-live="polite">{title}</h2>
        <div className="button-row">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous calendar month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next calendar month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="mini-calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span className="mini-weekday" key={day}>
            {day}
          </span>
        ))}
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} aria-hidden="true" />;
          const approved = requests.some(
            (request) =>
              request.status === "APPROVED" &&
              request.startDate <= date &&
              request.endDate >= date,
          );
          return (
            <Link
              key={date}
              className={`mini-day${date === today() ? " mini-today" : ""}${approved ? " mini-on-leave" : ""}`}
              to={preview ? "/preview/calendar" : `/calendar?date=${date}`}
              aria-label={`Open calendar for ${formatDate(date)}${approved ? ", your approved leave" : ""}`}
              aria-current={date === today() ? "date" : undefined}
            >
              {Number(date.slice(8))}
              {approved && (
                <span className="mini-leave-dot" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </div>
      <div className="mini-calendar-footer">
        <span>
          <span className="mini-leave-dot" aria-hidden="true" />
          {markersState === "ready"
            ? "Your approved leave"
            : markersState === "loading"
              ? "Loading leave markers…"
              : "Leave markers unavailable"}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => setMonth(today().slice(0, 7))}
        >
          This month
        </button>
      </div>
    </section>
  );
}
