import { parseDateOnly } from './dates.js';

export type DateInterpretation = { startDate: string; endDate: string; explanation: string };

// Date-only arithmetic follows the server's Johannesburg reference date, never
// the browser's locale or the model's idea of today's date.
export function interpretRelativeDates(text: string, referenceDate: string): DateInterpretation | null {
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const weekdayMatch = /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(and|&|to|through)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?\b/i.exec(text);
  if (weekdayMatch) {
    const rest = text.replace(weekdayMatch[0], ' ');
    const startIndex = weekdays.indexOf(weekdayMatch[1]!.toLowerCase());
    const endIndex = weekdays.indexOf((weekdayMatch[3] ?? weekdayMatch[1])!.toLowerCase());
    const contiguous = !weekdayMatch[2] || ['to', 'through'].includes(weekdayMatch[2].toLowerCase()) || endIndex === startIndex + 1;
    if (contiguous && endIndex >= startIndex && !/\d|\b(?:today|tomorrow|next|except|excluding|half|morning|afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|days?|weeks?)\b/i.test(rest)) {
      const date = parseDateOnly(referenceDate);
      const nextMonday = 8 - (date.getUTCDay() || 7);
      const shifted = (offset: number) => new Date(date.getTime() + (nextMonday + offset) * 86_400_000).toISOString().slice(0, 10);
      const startDate = shifted(startIndex), endDate = shifted(endIndex);
      return { startDate, endDate, explanation: `Interpreted “${weekdayMatch[0]}” in the following calendar week as ${startDate} through ${endDate}, using ${referenceDate} in Africa/Johannesburg. Review these dates before submitting.` };
    }
    return null;
  }
  const nextWeek = /\bnext\s+(?:the\s+)?(?:(?:whole|full|entire)\s+)?week\b|\b(?:whole|full|entire)\s+(?:of\s+)?next\s+week\b/gi;
  const tomorrow = /\btomorrow\b/gi;
  const today = /\btoday\b/gi;
  const matches = [
    ...[...text.matchAll(nextWeek)].map(match => ({ kind: 'nextWeek', phrase: match[0] })),
    ...[...text.matchAll(tomorrow)].map(match => ({ kind: 'tomorrow', phrase: match[0] })),
    ...[...text.matchAll(today)].map(match => ({ kind: 'today', phrase: match[0] })),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const rest = text.replace(match.phrase, ' ');
  // A second date, duration or qualifier needs the model to interpret the full
  // expression: do not turn "tomorrow to Friday" into one day or "except" into a full week.
  if (/\d|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|yesterday|week|month|year|days?|except|excluding|only|until|through|before|after|half|morning|afternoon|two|three|four|five|six|seven|couple|few)\b/i.test(rest)) return null;
  const reference = parseDateOnly(referenceDate);
  const shifted = (days: number) => new Date(reference.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  if (match.kind === 'nextWeek') {
    const isoWeekday = reference.getUTCDay() || 7;
    const startDate = shifted(8 - isoWeekday);
    const endDate = shifted(12 - isoWeekday);
    return { startDate, endDate, explanation: `Interpreted “${match.phrase}” as Monday ${startDate} through Friday ${endDate} (5 weekdays), using ${referenceDate} in Africa/Johannesburg.` };
  }
  const date = shifted(match.kind === 'tomorrow' ? 1 : 0);
  return { startDate: date, endDate: date,
    explanation: `Interpreted “${match.phrase}” as ${date}, using ${referenceDate} in Africa/Johannesburg.` };
}
