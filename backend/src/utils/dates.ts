import { ApiError } from './api-error.js';

export function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', 'Use a valid date in YYYY-MM-DD format, from year 2000 onward');
  }
  return date;
}

// A future holiday provider can supply date-only exclusions without changing UTC arithmetic.
export function calculateWorkingDays(start: Date, end: Date, excludedDates: ReadonlySet<string> = new Set()): number {
  if (end < start || start.getUTCFullYear() !== end.getUTCFullYear()) {
    throw new ApiError(400, 'INVALID_DATE_RANGE', 'Dates must be ordered and within the same policy year');
  }
  let days = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    const date = new Date(time);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !excludedDates.has(date.toISOString().slice(0, 10))) days++;
  }
  if (!days) throw new ApiError(400, 'INVALID_DATE_RANGE', 'The request must include at least one working day');
  return days;
}

export function currentPolicyYear(): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Johannesburg', year: 'numeric' }).format(new Date()));
}
