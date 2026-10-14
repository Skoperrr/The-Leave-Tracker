import { useState } from "react";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useApiQuery } from "../hooks/queries";
import { today, monthRange, shiftMonth, parseDate } from "../hooks/dates";
import { ErrorNotice, Loading, PageHeading } from "../components/ui";
import { CalendarWorkspace } from "../components/CalendarWorkspace";
export function Calendar() {
  const { membership } = useOrganisation();
  const org = membership.organisationId;
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today());
  const { from, to } = monthRange(month);
  const events = useApiQuery(["calendar", org, from, to], (signal) =>
    api.calendar(org, from, to, signal),
  );
  const monthTitle = new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(from));
  return (
    <>
      <PageHeading eyebrow="PLAN AROUND YOUR PEOPLE" title="Team calendar">
        Approved time away at {membership.organisationName}. Private reasons
        stay private.
      </PageHeading>
      <section
        className="panel calendar-panel"
        aria-label="Organisation leave calendar"
      >
        <div className="calendar-toolbar">
          <h2 aria-live="polite">{monthTitle}</h2>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ←
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMonth(today().slice(0, 7));
                setSelectedDate(today());
              }}
            >
              Today
            </button>
            <label className="sr-only" htmlFor="calendar-month">
              Calendar month
            </label>
            <input
              id="calendar-month"
              type="month"
              value={month}
              onChange={(event) => {
                if (/^\d{4}-\d{2}$/.test(event.target.value))
                  setMonth(event.target.value);
              }}
            />
            <button
              type="button"
              className="secondary"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              →
            </button>
          </div>
        </div>
        {events.isPending ? (
          <Loading label="Loading team calendar" />
        ) : events.isError ? (
          <ErrorNotice
            error={events.error}
            retry={() => {
              void events.refetch();
            }}
          />
        ) : (
          <CalendarWorkspace
            month={month}
            events={events.data.data}
            selectedDate={selectedDate.startsWith(month) ? selectedDate : from}
            onSelectDate={setSelectedDate}
          />
        )}
        <p className="caption">
          Each calendar belongs to one organisation. Date ranges include both
          dates.
        </p>
      </section>
    </>
  );
}
