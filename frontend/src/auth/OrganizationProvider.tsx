import { createContext, useContext, useState, type ReactNode } from "react";
import type { Me, Membership } from "../types/api";
import { SignOutButton } from "../components/ui";
type OrganizationState = {
  me: Me;
  memberships: Membership[];
  membership: Membership;
  selectOrganisation: (id: string) => void;
};
const OrganizationContext = createContext<OrganizationState | null>(null);
export function OrganizationProvider({
  me,
  children,
}: {
  me: Me;
  children: ReactNode;
}) {
  const memberships = me.memberships.filter((item) => item.active);
  const storageKey = `kopano:organisation:${me.id}`;
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const membership =
    memberships.find((item) => item.organisationId === selected) ??
    memberships[0];
  if (!membership)
    return (
      <main className="standalone">
        <div className="panel">
          <h1>No active organisation</h1>
          <p>
            Your account has no active memberships. Ask your organisation
            administrator to add or reactivate your membership.
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  const selectOrganisation = (id: string) => {
    if (!memberships.some((item) => item.organisationId === id)) return;
    setSelected(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* Preference storage is optional. */
    }
  };
  return (
    <OrganizationContext.Provider
      value={{ me, memberships, membership, selectOrganisation }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
export function useOrganisation() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("OrganizationProvider is required.");
  return context;
}
