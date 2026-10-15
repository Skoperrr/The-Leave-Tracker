import { describe, expect, it } from 'vitest';
import { interpretRelativeDates } from '../src/utils/ai-date-context.js';

describe('server-grounded natural-language dates', () => {
  it.each([
    ['Annual leave tomorrow', '2026-10-15', '2026-10-16', '2026-10-16'],
    ['Annual leave today', '2026-10-15', '2026-10-15', '2026-10-15'],
    ['Annual leave next week', '2026-10-15', '2026-10-19', '2026-10-23'],
    ['Annual leave next the whole week', '2026-10-15', '2026-10-19', '2026-10-23'],
    ['Annual leave the whole of next week', '2026-10-15', '2026-10-19', '2026-10-23'],
    ['Annual leave next week', '2026-10-18', '2026-10-19', '2026-10-23'],
    ['Annual leave next week', '2026-10-19', '2026-10-26', '2026-10-30'],
    ['Annual leave tomorrow', '2026-12-31', '2027-01-01', '2027-01-01'],
    ['Annual leave tomorrow', '2028-02-28', '2028-02-29', '2028-02-29'],
    ['Annual leave next week', '2026-12-27', '2026-12-28', '2027-01-01'],
    ['Annual leave next Thursday and Friday', '2026-10-15', '2026-10-22', '2026-10-23'],
    ['I need next Thursday and Friday off', '2026-10-15', '2026-10-22', '2026-10-23'],
    ['Annual leave next Friday', '2026-10-15', '2026-10-23', '2026-10-23'],
    ['Annual leave next Monday to Wednesday', '2026-10-15', '2026-10-19', '2026-10-21'],
  ])('interprets %s relative to %s', (text, referenceDate, startDate, endDate) => {
    expect(interpretRelativeDates(text, referenceDate)).toMatchObject({ startDate, endDate });
  });
  it.each(['Annual leave tomorrow to Friday', 'Annual leave tomorrow for two days', 'Annual leave next week except Wednesday',
    'Annual leave today and tomorrow', 'Annual leave next week and 26 October', 'Annual leave on 22 October',
    'Annual leave next week only Monday', 'Annual leave tomorrow morning', 'Annual leave next Thursday and Monday',
    'Annual leave next Monday and Friday'])('leaves a qualified expression to full interpretation: %s', text => {
    expect(interpretRelativeDates(text, '2026-10-15')).toBeNull();
  });
});
