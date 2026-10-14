import type { Membership } from "../types/api";

const organisationCodes: Record<string, string> = {
  "d-lab": "DLB",
  "strideshift global": "SSG",
  "the field institute": "TFI",
  "field institute": "TFI",
};

// Labels are display text only; IDs remain the API and relationship keys.
export function membershipLabel(
  member: Membership,
  displayName = member.employeeDisplayName,
) {
  const organisation = member.organisationName.trim();
  const code =
    organisationCodes[organisation.toLowerCase()] ??
    organisation.replace(/\s+/g, "-");
  const name =
    displayName?.trim().replace(/\s+/g, "-") || `Member-${member.id}`;
  return `${member.role}-${name}-${code}`;
}
