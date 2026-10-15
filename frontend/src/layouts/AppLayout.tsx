import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useOrganisation } from "../auth/OrganizationProvider";
import { SignOutButton } from "../components/ui";
import { Brand } from "../components/Brand";
import { NavIcon, type NavIconName } from "../components/NavIcon";
import { OrganisationBrand } from "../components/OrganisationBrand";
import { getOrganisationTheme } from "../theme/organisations";
import type { Me, Membership } from "../types/api";

function useMobileLayout() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.("(max-width: 760px)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function AppLayout() {
  const organisation = useOrganisation();
  return (
    <WorkspaceShell {...organisation}>
      <Outlet />
    </WorkspaceShell>
  );
}

type ShellProps = {
  me: Me;
  memberships: Membership[];
  membership: Membership;
  selectOrganisation: (id: string) => void;
  children: ReactNode;
  preview?: boolean;
};

export function WorkspaceShell({
  me,
  memberships,
  membership,
  selectOrganisation,
  children,
  preview = false,
}: ShellProps) {
  const location = useLocation();
  const mobile = useMobileLayout();
  const [collapsed, setCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const theme = getOrganisationTheme(membership.organisationName);
  const reviewer = membership.role === "ADMIN" || membership.role === "MANAGER";
  const previewActive =
    location.pathname === "/preview/calendar" ? "/calendar" : "/";
  const reviewPath =
    membership.role === "ADMIN" ? "/admin/approvals" : "/manager";
  const openPanel = () => {
    opener.current = document.activeElement as HTMLElement;
    setPanelOpen(true);
  };
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme.colour);
    return () => {
      meta?.setAttribute("content", "#123d36");
    };
  }, [theme.colour]);
  useEffect(() => {
    setPanelOpen(false);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname, membership.organisationId]);
  useEffect(() => {
    if (!mobile) setPanelOpen(false);
  }, [mobile]);
  useEffect(() => {
    if (sidebar.current) sidebar.current.inert = mobile && !panelOpen;
    if (workspace.current) workspace.current.inert = mobile && panelOpen;
    if (bottomNav.current) bottomNav.current.inert = mobile && panelOpen;
    if (!mobile || !panelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPanelOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ) ?? []),
      ];
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      if (workspace.current) workspace.current.inert = false;
      if (bottomNav.current) bottomNav.current.inert = false;
      opener.current?.focus({ preventScroll: true });
    };
  }, [mobile, panelOpen]);

  const navigation = [
    { path: "/", label: "Overview", icon: "overview", end: true },
    { path: "/requests/new", label: "Request leave", icon: "request" },
    { path: "/requests", label: "My requests", icon: "history", end: true },
    { path: "/calendar", label: "Team calendar", icon: "calendar" },
    ...(reviewer
      ? [
          { path: reviewPath, label: "Leave approvals", icon: "approval" },
          { path: "/insights", label: "Insights", icon: "overview" },
        ]
      : []),
    ...(membership.role === "ADMIN"
      ? [
          {
            path: "/admin/calendar",
            label: "Calendar settings",
            icon: "settings",
          },
          { path: "/admin", label: "Administration", icon: "admin", end: true },
        ]
      : []),
  ] as { path: string; label: string; icon: NavIconName; end?: boolean }[];
  const bottomLink = (
    path: string,
    label: string,
    icon: NavIconName,
    centre = false,
  ) =>
    preview ? (
      <button
        className={`${centre ? "bottom-action" : ""}${path === previewActive ? " active" : ""}`}
        disabled
        type="button"
      >
        <NavIcon name={icon} />
        <span>{label}</span>
      </button>
    ) : (
      <NavLink to={path} end className={centre ? "bottom-action" : ""}>
        <NavIcon name={icon} />
        <span>{label}</span>
      </NavLink>
    );
  return (
    <div
      className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${panelOpen ? " panel-open" : ""}`}
      data-theme={theme.key}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && panelOpen && (
        <button
          className="panel-backdrop"
          aria-label="Close navigation panel"
          tabIndex={-1}
          onClick={() => setPanelOpen(false)}
        />
      )}
      <aside
        id="workspace-sidebar"
        className="sidebar"
        ref={sidebar}
        role={mobile && panelOpen ? "dialog" : undefined}
        aria-modal={mobile && panelOpen ? true : undefined}
        aria-label="Workspace navigation"
        aria-hidden={mobile && !panelOpen ? true : undefined}
      >
        <div className="sidebar-brand-row">
          <NavLink
            to={preview ? "/preview/dashboard" : "/"}
            className="brand"
            aria-label="The Leave Tracker home"
          >
            <Brand />
          </NavLink>
          {!mobile && (
            <button
              type="button"
              className="sidebar-toggle sidebar-rail-toggle icon-button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-controls="workspace-sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              <NavIcon name={collapsed ? "expand" : "collapse"} />
            </button>
          )}
          {mobile && (
            <button
              className="sidebar-close icon-button"
              ref={closeButton}
              aria-label="Close navigation panel"
              onClick={() => setPanelOpen(false)}
            >
              <NavIcon name="close" />
            </button>
          )}
        </div>
        <div className="org-control">
          <OrganisationBrand name={membership.organisationName} />
          <label htmlFor="organisation">
            {preview ? "PREVIEW ORGANISATION" : "YOUR ORGANISATION"}
          </label>
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
          <span className="role-label">
            {membership.role.toLowerCase()}
            {preview ? " preview" : ""}
          </span>
        </div>
        <nav
          className="main-nav"
          aria-label={preview ? "Preview navigation" : "Main navigation"}
        >
          {navigation.map((item) =>
            preview ? (
              <button
                className={`preview-nav${item.path === previewActive ? " active" : ""}`}
                key={item.path}
                type="button"
                disabled
                title={item.label}
                aria-label={item.label}
              >
                <NavIcon name={item.icon} />
                <span className="nav-label">{item.label}</span>
              </button>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                title={item.label}
                aria-label={item.label}
              >
                <NavIcon name={item.icon} />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <p className="profile-name">{me.fullName}</p>
          <p className="profile-email">
            {preview ? `Sample ${membership.role.toLowerCase()}` : me.email}
          </p>
          {preview ? (
            <NavLink className="secondary button" to="/sign-in">
              Back to sign in
            </NavLink>
          ) : (
            <SignOutButton />
          )}
        </div>
      </aside>
      <div className="workspace" ref={workspace}>
        <div className="topbar">
          {mobile && (
            <button
              className="sidebar-toggle icon-button"
              aria-label={
                mobile
                  ? "Open navigation panel"
                  : collapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"
              }
              aria-controls="workspace-sidebar"
              aria-expanded={mobile ? panelOpen : !collapsed}
              onClick={() =>
                mobile ? openPanel() : setCollapsed((value) => !value)
              }
            >
              <NavIcon
                name={mobile ? "menu" : collapsed ? "expand" : "collapse"}
              />
            </button>
          )}
          <span className="workspace-institution">
            <span className="institution-code">{theme.code}</span>
            {theme.logo && (
              <span className={`header-logo header-logo-${theme.key}`}>
                <img src={theme.logo} alt={`${theme.name} header logo`} />
              </span>
            )}
            <span className="institution-name">
              {membership.organisationName}
            </span>
          </span>
          <span className="live-indicator">
            {preview
              ? previewActive === "/calendar"
                ? "Calendar preview"
                : "Dashboard preview"
              : "Your leave workspace"}
          </span>
        </div>
        <main
          id="main"
          tabIndex={-1}
          ref={main}
          key={membership.organisationId}
          className="main-content"
        >
          {children}
        </main>
        <footer className="app-footer">
          The Leave Tracker · {membership.organisationName}
          <span>
            {preview
              ? "Development preview · Sample data"
              : "Time away. Peace of mind."}
          </span>
        </footer>
      </div>
      {mobile && (
        <nav
          className="bottom-nav"
          aria-label="Mobile navigation"
          ref={bottomNav}
        >
          {bottomLink("/", "Overview", "overview")}
          {bottomLink("/requests", "My requests", "history")}
          {bottomLink(
            reviewer ? reviewPath : "/requests/new",
            reviewer ? "Leave approvals" : "Request leave",
            reviewer ? "approval" : "request",
            true,
          )}
          {bottomLink("/calendar", "Calendar", "calendar")}
          {membership.role === "ADMIN" ? (
            bottomLink("/admin/calendar", "Calendar settings", "settings")
          ) : (
            <button
              type="button"
              onClick={openPanel}
              aria-controls="workspace-sidebar"
              aria-expanded={panelOpen}
            >
              <NavIcon name="menu" />
              <span>Menu</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
