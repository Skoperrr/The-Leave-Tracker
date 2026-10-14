import { MonthCalendar } from "./MonthCalendar";
import { EmptyState } from "./ui";
import { formatDate } from "../hooks/dates";
import type { CalendarEvent } from "../types/api";

export function CalendarWorkspace({
  month,
  events,
  selectedDate,
  onSelectDate,
}: {
  month: string;
  events: CalendarEvent[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const onSelectedDay = events.filter(
    (event) => event.startDate <= selectedDate && event.endDate >= selectedDate,
  );
  return (
    <div className="calendar-workbench">
      <div className="calendar-month-grid">
        <MonthCalendar
          month={month}
          events={events}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      </div>
      <aside className="calendar-agenda" aria-labelledby="agenda-heading">
        <p className="eyebrow">YOUR TEAM'S TIME AWAY</p>
        <h3 id="agenda-heading">Approved leave this month</h3>
        <div className="selected-day-summary" role="status">
          <strong>{formatDate(selectedDate)}</strong>
          <span>
            {onSelectedDay.length}{" "}
            {onSelectedDay.length === 1 ? "person" : "people"} on approved leave
          </span>
        </div>
        {events.length === 0 ? (
          <EmptyState title="A clear calendar">
            No approved leave overlaps this month.
          </EmptyState>
        ) : (
          <ul>
            {[...events]
              .sort(
                (a, b) =>
                  a.startDate.localeCompare(b.startDate) ||
                  a.id.localeCompare(b.id),
              )
              .map((event) => (
                <li
                  key={event.id}
                  className={
                    onSelectedDay.includes(event) ? "agenda-selected" : ""
                  }
                >
                  <span className="agenda-event-bar" aria-hidden="true" />
                  <strong>{event.employeeDisplayName} — On leave</strong>
                  <span>
                    {formatDate(event.startDate)} — {formatDate(event.endDate)}
                  </span>
                  <span className="agenda-all-day">All-day leave</span>
                </li>
              ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
