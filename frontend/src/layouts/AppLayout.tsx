import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { SignOutButton } from "../components/ui";
export function AppLayout() {
  const { me, memberships, membership, selectOrganisation } = useOrganisation();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus();
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="The Leave Tracker home">
          <span className="brand-symbol" aria-hidden="true">
            LT
          </span>
          <span>
            The Leave Tracker<small>LEAVE, TOGETHER</small>
          </span>
        </NavLink>
        <div className="org-control">
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
            Overview
          </NavLink>
          <NavLink to="/requests/new">Request leave</NavLink>
          <NavLink to="/requests" end>
            My requests
          </NavLink>
          <NavLink to="/calendar">Team calendar</NavLink>
          {["MANAGER", "ADMIN"].includes(membership.role) && (
            <NavLink to="/manager">Manager inbox</NavLink>
          )}
          {membership.role === "ADMIN" && (
            <NavLink to="/admin">Administration</NavLink>
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
          <span>{membership.organisationName}</span>
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
          The Leave Tracker · D-Lab Blitz Day 6 <span>Time away. Peace of mind.</span>
        </footer>
      </div>
    </div>
  );
}
