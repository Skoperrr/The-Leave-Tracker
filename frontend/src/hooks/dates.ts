export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseDate(value);
  return Number.isFinite(date.getTime()) && dateOnly(date) === value;
}
export function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function formatDate(value: string): string {
  if (!isDateOnly(value)) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}
export function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : value;
}
export function workingDays(start: string, end: string): number {
  if (!isDateOnly(start) || !isDateOnly(end) || end < start) return 0;
  const from = parseDate(start);
  const days =
    Math.round((parseDate(end).getTime() - from.getTime()) / 86400000) + 1;
  let count = Math.floor(days / 7) * 5;
  for (let i = 0; i < days % 7; i++) {
    const day = (from.getUTCDay() + i) % 7;
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
export function monthRange(value: string): {
  from: string;
  to: string;
  cells: (string | null)[];
} {
  const start = parseDate(`${value}-01`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const cells: (string | null)[] = Array.from(
    { length: (start.getUTCDay() + 6) % 7 },
    () => null,
  );
  for (let day = 1; day <= end.getUTCDate(); day++)
    cells.push(`${value}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return { from: dateOnly(start), to: dateOnly(end), cells };
}
export function shiftMonth(value: string, delta: number): string {
  const date = parseDate(`${value}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return dateOnly(date).slice(0, 7);
}
