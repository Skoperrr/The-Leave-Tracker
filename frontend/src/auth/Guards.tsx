import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { OrganizationProvider, useOrganisation } from "./OrganizationProvider";
import { api } from "../api/endpoints";
import { ErrorNotice, Loading, SignOutButton } from "../components/ui";
import type { Role } from "../types/api";
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const me = useQuery({
    queryKey: ["me", session?.user.id],
    queryFn: ({ signal }) => api.me(signal),
    enabled: Boolean(session),
  });
  if (loading) return <Loading />;
  if (!session)
    return (
      <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
    );
  if (me.isPending) return <Loading label="Loading your profile" />;
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
