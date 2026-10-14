import { describe, expect, it } from "vitest";
import { membershipLabel } from "../hooks/membership-label";
import type { Membership } from "../types/api";
const member: Membership = {
  id: "stable-id",
  organisationId: "org",
  organisationName: "D-Lab",
  role: "EMPLOYEE",
  active: true,
  managerMembershipId: null,
  employeeDisplayName: "Ayanda Demo",
};
describe("Membership display labels", () => {
  it.each([
    ["D-Lab", "DLB"],
    ["StrideShift Global", "SSG"],
    ["The Field Institute", "TFI"],
    ["Field Institute", "TFI"],
  ])("uses the organisation code for %s", (organisationName, code) => {
    expect(membershipLabel({ ...member, organisationName })).toBe(
      `EMPLOYEE-Ayanda-Demo-${code}`,
    );
  });
  it("preserves full names and does not invent surnames", () => {
    expect(
      membershipLabel({
        ...member,
        employeeDisplayName: "  Zoë   van der Merwe ",
      }),
    ).toBe("EMPLOYEE-Zoë-van-der-Merwe-DLB");
    expect(membershipLabel({ ...member, employeeDisplayName: "Neo" })).toBe(
      "EMPLOYEE-Neo-DLB",
    );
  });
  it("retains a distinct ID fallback when a name is unavailable", () => {
    expect(membershipLabel({ ...member, employeeDisplayName: undefined })).toBe(
      "EMPLOYEE-Member-stable-id-DLB",
    );
    expect(member.id).toBe("stable-id");
  });
});
