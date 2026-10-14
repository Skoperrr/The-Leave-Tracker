import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { SignOutButton } from "../components/ui";
import { Brand } from "../components/Brand";
import { NavIcon } from "../components/NavIcon";
import { OrganisationBrand } from "../components/OrganisationBrand";
import { getOrganisationTheme } from "../theme/organisations";
export function AppLayout() {
  const { me, memberships, membership, selectOrganisation } = useOrganisation();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const theme = getOrganisationTheme(membership.organisationName);
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme.colour);
    return () => {
      meta?.setAttribute("content", "#123d36");
    };
  }, [theme.colour]);
  useEffect(() => {
    main.current?.focus();
  }, [location.pathname]);
  return (
    <div className="app-shell" data-theme={theme.key}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="The Leave Tracker home">
          <Brand />
        </NavLink>
        <div className="org-control">
          <OrganisationBrand name={membership.organisationName} />
          <label htmlFor="organisation">YOUR ORGANISATION</label>
          <select
            id="organisation"
            value={membership.organisationId}
            onChange={(event) => selectOrganisation(event.target.value)}
          >
            {memberships.map((item) => (
              <option key={item.id} value={item.organisationId}>
                {item.organisationName}
              </option>
            ))}
          </select>
          <span className="role-label">{membership.role.toLowerCase()}</span>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end>
            <NavIcon name="overview" />
            Overview
          </NavLink>
          <NavLink to="/requests/new">
            <NavIcon name="request" />
            Request leave
          </NavLink>
          <NavLink to="/requests" end>
            <NavIcon name="history" />
            My requests
          </NavLink>
          <NavLink to="/calendar">
            <NavIcon name="calendar" />
            Team calendar
          </NavLink>
          {membership.role === "MANAGER" && (
            <NavLink to="/manager">
              <NavIcon name="approval" />
              Manager inbox
            </NavLink>
          )}
          {membership.role === "ADMIN" && (
            <>
              <NavLink to="/admin/approvals">
                <NavIcon name="approval" />
                Leave approvals
              </NavLink>
              <NavLink to="/admin/calendar">
                <NavIcon name="settings" />
                Calendar settings
              </NavLink>
              <NavLink to="/admin" end>
                <NavIcon name="admin" />
                Administration
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <p className="profile-name">{me.fullName}</p>
          <p className="profile-email">{me.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span className="workspace-institution">
            <span className="institution-code">{theme.code}</span>
            {membership.organisationName}
          </span>
          <span className="live-indicator">Your leave workspace</span>
        </div>
        <main
          id="main"
          tabIndex={-1}
          ref={main}
          key={membership.organisationId}
          className="main-content"
        >
          <Outlet />
        </main>
        <footer className="app-footer">
          The Leave Tracker · {membership.organisationName}{" "}
          <span>Time away. Peace of mind.</span>
        </footer>
      </div>
    </div>
  );
}
