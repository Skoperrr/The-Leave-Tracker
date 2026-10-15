import type { Account, AccessRepository } from '../repositories/access.js';
import { requireMembership } from '../middleware/auth.js';
import type { AiProvider } from '../lib/ai-provider.js';
import { invalidOutput } from '../lib/ai-provider.js';
import { aiProviderOutput, type AiDraftInput } from '../validators/ai.js';
import { calculateWorkingDays, parseDateOnly } from '../utils/dates.js';
import { ApiError } from '../utils/api-error.js';
import { interpretRelativeDates } from '../utils/ai-date-context.js';

const timezone = 'Africa/Johannesburg' as const;
export type AiDraftResult = { referenceDate: string; timezone: typeof timezone } & (
  | { status: 'READY'; draft: { organisationIds: string[]; leaveTypeCode: string; startDate: string; endDate: string }; workingDays: number; warnings: string[] }
  | { status: 'NEEDS_CLARIFICATION'; draft: null; questions: string[] }
);

// Instance-local protection only. Vercel instances do not share these counters.
// Google project quota is the external upper bound; never retry against a paid model.
export function createDraftLimiter(now: () => number = Date.now) {
  const users = new Map<string, { count: number; until: number }>();
  let minute = { count: 0, until: 0 };
  let day = { count: 0, until: 0 };
  return (userId: string) => {
    const time = now();
    for (const [id, entry] of users) if (entry.until <= time) users.delete(id);
    if (minute.until <= time) minute = { count: 0, until: time + 60_000 };
    if (day.until <= time) day = { count: 0, until: time + 86_400_000 };
    const user = users.get(userId) ?? { count: 0, until: time + 60_000 };
    if (user.count >= 5 || minute.count >= 10 || day.count >= 200) {
      throw new ApiError(429, 'AI_RATE_LIMITED', 'AI drafting is busy. Wait before trying again, or use the manual form.');
    }
    user.count++; minute.count++; day.count++; users.set(userId, user);
  };
}

export function createAiLeaveDraftService(repository: Pick<AccessRepository, 'listLeaveTypes'>, provider: AiProvider,
  now: () => Date = () => new Date(), limit = createDraftLimiter()) {
  return {
    async draft(account: Account, input: AiDraftInput): Promise<AiDraftResult> {
      // Check every organisation before any read or provider call.
      for (const id of input.organisationIds) requireMembership(id, account);
      limit(account.id);
      const referenceDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now());
      const common = { referenceDate, timezone };
      const dateInterpretation = interpretRelativeDates(input.text, referenceDate);
      const clarify = (...questions: string[]): AiDraftResult => ({ ...common, status: 'NEEDS_CLARIFICATION', draft: null,
        questions: dateInterpretation ? [dateInterpretation.explanation, ...questions].slice(0, 4) : questions });
      if (dateInterpretation && dateInterpretation.startDate.slice(0, 4) !== dateInterpretation.endDate.slice(0, 4)) {
        return clarify('This week crosses policy years. Please submit a separate request for each year.');
      }
      // Reject explicit impossible dates even if a model might normalise them.
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const explicitDates: string[] = [];
      try {
        for (const match of input.text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
          parseDateOnly(match[0]); explicitDates.push(match[0]);
        }
        for (const match of input.text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?\b/gi)) {
          const month = String(monthNames.indexOf(match[2]!.toLowerCase()) + 1).padStart(2, '0');
          const explicit = `${match[3] ?? referenceDate.slice(0, 4)}-${month}-${match[1]!.padStart(2, '0')}`;
          parseDateOnly(explicit); explicitDates.push(explicit);
        }
      } catch { throw invalidOutput(); }
      if (new Set(explicitDates).size > 1 && /\b(?:and|also)\b|,|&/i.test(input.text)
        && !/\b(?:to|through|until|thru|between)\b|[–—]/i.test(input.text)) {
        return clarify('Do you mean one continuous date range? Please specify the start and end dates; separate dates need separate requests.');
      }
      const groups = await Promise.all(input.organisationIds.map(id => repository.listLeaveTypes(id)));
      const types = (groups[0] ?? []).filter(type => groups.every(group => group.some(item => item.code === type.code)))
        .map(({ code, name }) => ({ code, name }));
      if (!types.length) return clarify('Which organisation would you like to request leave from? The selected organisations have no shared active leave type.');
      // Explicit unsupported input never becomes a broadened or guessed request.
      if (/\b(?:half[ -]?day|morning only|afternoon only|few days|sometime|soon)\b/i.test(input.text)
        || (!dateInterpretation && /\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(input.text))) {
        return clarify('Please specify the leave type and exact start and end dates (including the year), for one full-day date range.');
      }
      const parsed = aiProviderOutput.safeParse(await provider({ ...common, text: input.text, leaveTypes: types,
        ...(dateInterpretation ? { dateInterpretation } : {}) }));
      if (!parsed.success) throw invalidOutput();
      if (parsed.data.status === 'NEEDS_CLARIFICATION') return clarify(...parsed.data.questions);
      const draft = { ...parsed.data.draft, ...(dateInterpretation ? {
        startDate: dateInterpretation.startDate, endDate: dateInterpretation.endDate,
      } : {}) };
      const type = types.find(type => type.code === draft.leaveTypeCode);
      if (!type) throw invalidOutput();
      // A valid JSON enum alone is not evidence that the employee chose a type.
      const normalise = (value: string) => value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
      const text = ` ${normalise(input.text).replace(/[^a-z0-9 ]/g, ' ')} `;
      const typeTerms = [normalise(type.code), normalise(type.name).replace(/\s+leave$/, '')];
      if (type.code === 'ANNUAL') typeTerms.push('vacation');
      if (!typeTerms.some(term => term && text.includes(` ${term} `))) return clarify('Which leave type should this request use? Please include it in your description.');
      if (!/\b\d{4}\b/.test(input.text) && !dateInterpretation
        && !/\b(?:today|tomorrow|next|following)\b|\bin\s+\w+\s+(?:days?|weeks?|months?)\b/i.test(input.text)
        && (draft.startDate.slice(0, 4) !== referenceDate.slice(0, 4) || draft.endDate.slice(0, 4) !== referenceDate.slice(0, 4))) throw invalidOutput();
      let workingDays: number;
      try { workingDays = calculateWorkingDays(parseDateOnly(draft.startDate), parseDateOnly(draft.endDate)); }
      catch { throw invalidOutput(); }
      if (explicitDates.some(date => date !== draft.startDate && date !== draft.endDate)) throw invalidOutput();
      return { ...common, status: 'READY', draft: { ...draft, organisationIds: [...input.organisationIds] }, workingDays,
        warnings: [
          ...(dateInterpretation ? [dateInterpretation.explanation] : []),
          ...(!/\b\d{4}\b/.test(input.text) && !dateInterpretation
            ? [`Dates interpreted using the current year, ${referenceDate.slice(0, 4)}, unless your description specifies a relative date. Review the dates carefully.`] : []),
          'Review the leave type and inclusive dates before applying this suggestion.',
          'Weekends are excluded; public holidays are included. Full days only.',
          'Balances and overlaps are checked when you submit. This draft reserves no leave.',
        ] };
    },
  };
}
export type AiLeaveDraftService = ReturnType<typeof createAiLeaveDraftService>;
