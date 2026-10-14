import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useOrganisation } from "../auth/OrganizationProvider";
import { useAuth } from "../auth/AuthProvider";
import { useApiQuery } from "../hooks/queries";
import { api } from "../api/endpoints";
import { ErrorNotice, Loading, PageHeading } from "../components/ui";
import { CalendarConnectionBanner } from "../components/CalendarConnectionBanner";

export async function connectGoogleCalendar(
  org: string,
  navigate: (url: string) => void = (url) => window.location.assign(url),
) {
  const { data } = await api.googleConnect(org);
  const url = new URL(data.authorisationUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "accounts.google.com" ||
    url.username ||
    url.password
  )
    throw new Error("The server returned an invalid Google connection URL.");
  navigate(url.toString());
}
const invitationMessages: Record<string, string> = {
  NOTIFICATIONS_REQUESTED:
    "Google accepted the notification request. Email delivery and acceptance are not verified.",
  PARTIAL_UNCONFIRMED:
    "Some recipients were excluded because their addresses could not be confirmed.",
  DISABLED: "Invitations are disabled.",
  INVITATION_RECIPIENT_LIMIT:
    "The recipient limit was exceeded. The shared event was created without invitations.",
};
export function CalendarSettings() {
  const { membership } = useOrganisation();
  const { session } = useAuth();
  const org = membership.organisationId;
  const status = useApiQuery(["google-status", org], (signal) =>
    api.googleStatus(org, signal),
  );
  const connected = status.data?.data.connectionStatus === "CONNECTED";
  const calendars = useInfiniteQuery({
    queryKey: ["api", session?.user.id, "google-calendars", org],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.googleCalendars(org, pageParam, signal),
    getNextPageParam: (result) => result.meta?.nextPageToken || undefined,
    enabled: Boolean(session) && connected,
  });
  const [calendarId, setCalendarId] = useState("");
  const [invitations, setInvitations] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setCalendarId(status.data?.data.calendarId ?? "");
    setInvitations(status.data?.data.invitationsEnabled ?? false);
  }, [status.data]);
  const writable =
    calendars.data?.pages
      .flatMap((page) => page.data)
      .filter(
        (calendar) =>
          calendar.accessRole === "owner" || calendar.accessRole === "writer",
      ) ?? [];
  const unique = writable.filter(
    (calendar, index) =>
      writable.findIndex((item) => item.id === calendar.id) === index,
  );
  const action = useMutation({
    mutationFn: async (
      kind: "connect" | "save" | "test" | "disconnect" | "retry",
    ) => {
      setMessage("");
      if (kind === "connect") {
        await connectGoogleCalendar(org);
        return;
      }
      if (kind === "save") {
        await api.googleSettings(org, {
          calendarId,
          invitationsEnabled: invitations,
        });
        setMessage(
          "Settings saved. Upcoming approved leave has been queued for sync.",
        );
      }
      if (kind === "test") {
        await api.googleTest(org);
        setMessage(
          "Calendar access verified. No event or invitation was sent.",
        );
      }
      if (kind === "disconnect") {
        await api.googleDisconnect(org);
        setConfirmDisconnect(false);
        setMessage(
          "Disconnected. Existing Google events remain; an in-progress write may finish.",
        );
      }
      if (kind === "retry" && status.data?.data.lastSync) {
        await api.googleRetry(org, status.data.data.lastSync.jobId);
        setMessage("Retry queued. Refresh status to check progress.");
      }
      await status.refetch();
      if (kind === "save") await calendars.refetch();
    },
  });
  const data = status.data?.data;
  return (
    <>
      <PageHeading eyebrow="ORGANISATION INTEGRATIONS" title="Google Calendar">
        Manage the shared calendar for {membership.organisationName}. Internal
        leave and calendar features work independently of Google.
      </PageHeading>
      <CalendarConnectionBanner />
      {status.isPending ? (
        <Loading label="Loading calendar connection" />
      ) : status.isError ? (
        <ErrorNotice
          error={status.error}
          retry={() => {
            void status.refetch();
          }}
        />
      ) : (
        data && (
          <>
            <section className="panel">
              <h2>Connection</h2>
              <p role="status">
                {data.connectionStatus === "CONNECTED"
                  ? "Connected"
                  : data.connectionStatus === "REAUTH_REQUIRED"
                    ? "Reconnection required"
                    : "Not connected"}
              </p>
              <button
                className="primary"
                disabled={action.isPending}
                onClick={() => action.mutate("connect")}
              >
                {connected ? "Reconnect Google" : "Connect Google"}
              </button>{" "}
              <button
                className="secondary"
                disabled={action.isPending || status.isFetching}
                onClick={() => {
                  void status.refetch();
                }}
              >
                Refresh status
              </button>
            </section>
            {connected && (
              <section className="panel">
                <h2>Shared calendar & invitations</h2>
                <p>
                  Choose a separate writable calendar for this organisation.
                  Changing calendars keeps earlier Google events intact.
                </p>
                {calendars.isPending ? (
                  <Loading label="Loading writable calendars" />
                ) : calendars.isError ? (
                  <ErrorNotice
                    error={calendars.error}
                    retry={() => {
                      void calendars.refetch();
                    }}
                  />
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!action.isPending) action.mutate("save");
                    }}
                  >
                    <fieldset disabled={action.isPending}>
                      <label htmlFor="shared-calendar">Shared calendar</label>
                      <select
                        id="shared-calendar"
                        value={calendarId}
                        onChange={(event) => setCalendarId(event.target.value)}
                        required
                      >
                        <option value="">Choose a calendar</option>
                        {calendarId &&
                          !unique.some((item) => item.id === calendarId) && (
                            <option value={calendarId} disabled>
                              Current calendar (load more to select)
                            </option>
                          )}
                        {unique.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {calendar.summary} · {calendar.timeZone}
                          </option>
                        ))}
                      </select>
                      {!unique.length && (
                        <p>No writable calendars were found on this page.</p>
                      )}
                      {calendars.hasNextPage && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={calendars.isFetchingNextPage}
                          onClick={() => {
                            void calendars.fetchNextPage();
                          }}
                        >
                          {calendars.isFetchingNextPage
                            ? "Loading…"
                            : "Load more calendars"}
                        </button>
                      )}
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={invitations}
                          onChange={(event) =>
                            setInvitations(event.target.checked)
                          }
                        />
                        Enable invitations to confirmed active members of this
                        organisation
                      </label>
                      <p className="muted">
                        Invitations default off. Sync reports show recipient
                        counts, never email addresses. A notification request
                        does not guarantee delivery.
                      </p>
                      <button
                        className="primary"
                        disabled={
                          !unique.some((item) => item.id === calendarId)
                        }
                      >
                        Save calendar settings
                      </button>
                    </fieldset>
                  </form>
                )}
                <button
                  className="secondary"
                  disabled={action.isPending || !data.calendarId}
                  onClick={() => action.mutate("test")}
                >
                  Verify calendar access
                </button>
              </section>
            )}
            <section className="panel">
              <h2>Last sync</h2>
              {data.lastSync ? (
                <>
                  <dl className="membership-details">
                    <div>
                      <dt>Status</dt>
                      <dd>{data.lastSync.status}</dd>
                    </div>
                    <div>
                      <dt>Last attempt</dt>
                      <dd>
                        {data.lastSync.attemptedAt
                          ? new Date(data.lastSync.attemptedAt).toLocaleString()
                          : "Not attempted yet"}
                      </dd>
                    </div>
                    <div>
                      <dt>Recipient count</dt>
                      <dd>{data.lastSync.recipientCount ?? "Not available"}</dd>
                    </div>
                    {data.lastSync.errorCode && (
                      <div>
                        <dt>Sync issue</dt>
                        <dd>{data.lastSync.errorCode}</dd>
                      </div>
                    )}
                  </dl>
                  <p>
                    {data.lastSync.invitationStatus
                      ? (invitationMessages[data.lastSync.invitationStatus] ??
                        "Notification status is available; email delivery is not verified.")
                      : "No invitation result is available yet."}
                  </p>
                  {connected &&
                    ["FAILED", "RETRY"].includes(data.lastSync.status) && (
                      <button
                        className="secondary"
                        disabled={action.isPending}
                        onClick={() => action.mutate("retry")}
                      >
                        Retry last sync
                      </button>
                    )}
                </>
              ) : (
                <p>No sync has been recorded yet.</p>
              )}
            </section>
            {data.connectionStatus !== "DISCONNECTED" && (
              <section className="panel">
                <h2>Disconnect</h2>
                <p>
                  Stops future sync for this organisation. Existing Google
                  events remain and an already-running write may finish.
                </p>
                {confirmDisconnect ? (
                  <>
                    <p>Disconnect this organisation's Google Calendar?</p>
                    <button
                      className="danger"
                      disabled={action.isPending}
                      onClick={() => action.mutate("disconnect")}
                    >
                      Confirm disconnect
                    </button>{" "}
                    <button
                      className="secondary"
                      disabled={action.isPending}
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep connection
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary"
                    disabled={action.isPending}
                    onClick={() => setConfirmDisconnect(true)}
                  >
                    Disconnect Google
                  </button>
                )}
              </section>
            )}
          </>
        )
      )}
      {action.isError && <ErrorNotice error={action.error} />}
      {action.isPending && <p role="status">Updating calendar connection…</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
