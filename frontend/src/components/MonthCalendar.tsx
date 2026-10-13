import type { CalendarEvent } from "../types/api";
import { formatDate, monthRange, parseDate } from "../hooks/dates";
export function MonthCalendar({
  month,
  events,
}: {
  month: string;
  events: CalendarEvent[];
}) {
  const { cells } = monthRange(month);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
  const title = new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(`${month}-01`));
  return (
    <table className="month-calendar">
      <caption className="sr-only">
        Approved team leave for {title}. Dates include both the start and end
        day.
      </caption>
      <thead>
        <tr>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <th key={day} scope="col">
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((date, column) => (
              <td
                key={date ?? `blank-${column}`}
                className={date ? "" : "outside-month"}
              >
                {date && (
                  <>
                    <time dateTime={date}>{Number(date.slice(8))}</time>
                    <div className="day-events">
                      {events
                        .filter(
                          (event) =>
                            event.startDate <= date && event.endDate >= date,
                        )
                        .map((event) => (
                          <span
                            key={event.id}
                            className="calendar-event"
                            aria-label={`${event.employeeDisplayName}, on leave, ${formatDate(event.startDate)} to ${formatDate(event.endDate)}`}
                          >
                            <span className="event-dot" aria-hidden="true" />
                            <span className="event-name">
                              {event.employeeDisplayName}
                            </span>
                            <span className="sr-only"> on leave</span>
                          </span>
                        ))}
                    </div>
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
