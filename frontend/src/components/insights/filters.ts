import type { InsightsFilters } from "../../types/insights";
export type InsightsFilterForm = Omit<
  InsightsFilters,
  | "organisationId"
  | "allocationYear"
  | "lowBalanceThreshold"
  | "coverageThresholdPercent"
> & {
  allocationYear: string;
  lowBalanceThreshold: string;
  coverageThresholdPercent: string;
};
export function defaultInsightsFilters(now = new Date()): InsightsFilterForm {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  const from = `${value("year")}-${value("month")}-${value("day")}`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    from,
    to: end.toISOString().slice(0, 10),
    allocationYear: value("year"),
    lowBalanceThreshold: "3",
    coverageThresholdPercent: "30",
  };
}
function date(value: string): number {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? parsed.getTime()
    : NaN;
}
export function parseInsightsFilters(
  form: InsightsFilterForm,
  organisationId: string,
): InsightsFilters | string {
  const from = date(form.from),
    to = date(form.to);
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return "Enter real dates in YYYY-MM-DD format, from year 2000 onward.";
  if (to < from || (to - from) / 86_400_000 + 1 > 366)
    return "Choose an inclusive period of 1 to 366 calendar days.";
  for (const [name, value, min, max] of [
    ["Allocation year", form.allocationYear, 2000, 9999],
    ["Low balance threshold", form.lowBalanceThreshold, 0, 365],
    ["Coverage threshold", form.coverageThresholdPercent, 1, 100],
  ] as const) {
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
      return `${name} must be an integer from ${min} to ${max}.`;
  }
  return {
    organisationId,
    from: form.from,
    to: form.to,
    allocationYear: Number(form.allocationYear),
    lowBalanceThreshold: Number(form.lowBalanceThreshold),
    coverageThresholdPercent: Number(form.coverageThresholdPercent),
  };
}
