import { describe, expect, it } from "vitest";
import {
  isDateOnly,
  monthRange,
  shiftMonth,
  workingDays,
} from "../hooks/dates";
import { decisionSchema, requestSchema } from "../hooks/validation";
const valid = {
  organisationIds: ["org-dlab"],
  leaveTypeCode: "ANNUAL",
  startDate: "2026-11-02",
  endDate: "2026-11-06",
  reason: "",
};
describe("Inclusive date-only semantics", () => {
  it("counts the contractual Mon–Fri range as five working days", () =>
    expect(workingDays(valid.startDate, valid.endDate)).toBe(5));
  it("excludes weekends, handles a single day and rejects reversed dates", () => {
    expect(workingDays("2026-11-06", "2026-11-09")).toBe(2);
    expect(workingDays("2026-11-07", "2026-11-08")).toBe(0);
    expect(workingDays("2026-11-02", "2026-11-02")).toBe(1);
    expect(workingDays("2026-11-06", "2026-11-02")).toBe(0);
  });
  it("rejects nonexistent dates and accepts actual leap days", () => {
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-13-01")).toBe(false);
  });
  it("builds month boundaries and Monday-first cells without timezone shifts", () => {
    const range = monthRange("2026-11");
    expect(range.from).toBe("2026-11-01");
    expect(range.to).toBe("2026-11-30");
    expect(range.cells[6]).toBe("2026-11-01");
    expect(range.cells.length % 7).toBe(0);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
describe("Contract validations", () => {
  it("requires real dates and an end on or after the start", () => {
    expect(
      requestSchema.safeParse({ ...valid, endDate: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...valid, startDate: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("requires an organisation, leave code, and unique selectors", () => {
    expect(
      requestSchema.safeParse({ ...valid, organisationIds: [] }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...valid, organisationIds: ["a", "a"] })
        .success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...valid, leaveTypeCode: "" }).success,
    ).toBe(false);
  });
  it("requires nonempty decline comments and permits optional approval comments", () => {
    expect(
      decisionSchema.safeParse({ decision: "DECLINE", comment: "  " }).success,
    ).toBe(false);
    expect(
      decisionSchema.parse({
        decision: "DECLINE",
        comment: " Schedule conflict ",
      }).comment,
    ).toBe("Schedule conflict");
    expect(decisionSchema.safeParse({ decision: "APPROVE" }).success).toBe(
      true,
    );
  });
});
