import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { OrganizationProvider, useOrganisation } from "./OrganizationProvider";
import { api } from "../api/endpoints";
import { ErrorNotice, Loading, SignOutButton } from "../components/ui";
import { ApiClientError } from "../api/errors";
import type { Role } from "../types/api";
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const me = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: async ({ signal }) => {
      const name = session?.user.user_metadata?.full_name;
      if (
        typeof name === "string" &&
        name.trim().length >= 2 &&
        name.trim().length <= 120
      )
        return api.profile(name.trim(), signal);
      const existing = await api.me(signal);
      return api.profile(existing.data.fullName, signal);
    },
    enabled: Boolean(session),
  });
  if (loading) return <Loading />;
  if (!session)
    return (
      <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
    );
  if (me.isPending) return <Loading label="Loading your profile" />;
  if (
    me.isError &&
    me.error instanceof ApiClientError &&
    me.error.code === "NOT_FOUND"
  )
    return (
      <ProfileSetup
        onComplete={() => {
          void me.refetch();
        }}
      />
    );
  if (me.isError)
    return (
      <main className="standalone">
        <div className="panel">
          <h1>Unable to open your workspace</h1>
          <ErrorNotice
            error={me.error}
            retry={() => {
              void me.refetch();
            }}
          />
          <SignOutButton />
        </div>
      </main>
    );
  return (
    <OrganizationProvider key={session.user.id} me={me.data.data}>
      <Outlet />
    </OrganizationProvider>
  );
}
export function RequireRole({ roles }: { roles: Role[] }) {
  const { membership } = useOrganisation();
  if (!roles.includes(membership.role))
    return (
      <section className="panel">
        <h1>Permission required</h1>
        <p>
          Your role in {membership.organisationName} does not give access to
          this page. Choose an organisation where you have the required role, or
          use the navigation to return to your dashboard.
        </p>
      </section>
    );
  return <Outlet />;
}

function ProfileSetup({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <main className="standalone">
      <section className="panel">
        <h1>Complete your profile</h1>
        <p>
          Enter your name to create your profile. An administrator will assign
          organisation access.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            try {
              await api.profile(name.trim());
              onComplete();
            } catch (error) {
              setError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="profile-name">Full name</label>
          <input
            id="profile-name"
            value={name}
            minLength={2}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
          {error ? <ErrorNotice error={error} /> : null}
          <button className="primary" disabled={busy || name.trim().length < 2}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
        <SignOutButton />
      </section>
    </main>
  );
}
