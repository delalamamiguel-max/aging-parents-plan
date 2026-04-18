/**
 * Date Parser — backend copy of app `src/services/dateParser.ts`.
 * Anchors relative phrases to visitDate (not server wall clock).
 */

import { addDays, addWeeks, addMonths, parseISO, isValid, format } from 'date-fns';

export function isValidISODate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const fullISO = /^\d{4}-\d{2}-\d{2}T/.test(value);
  if (!dateOnly && !fullISO) return false;
  const parsed = parseISO(value);
  return isValid(parsed);
}

export function resolveRelativeDate(phrase: string, visitDate: string): string | null {
  if (!phrase || !visitDate) return null;

  const anchor = parseValidDate(visitDate);
  if (!anchor) return null;

  const lower = phrase.toLowerCase().trim();

  const daysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/) ?? lower.match(/^(\d+)\s+days?$/);
  if (daysMatch) {
    return toISODate(addDays(anchor, parseInt(daysMatch[1], 10)));
  }

  const weeksMatch = lower.match(/\bin\s+(\d+)\s+weeks?\b/) ?? lower.match(/^(\d+)\s+weeks?$/);
  if (weeksMatch) {
    return toISODate(addWeeks(anchor, parseInt(weeksMatch[1], 10)));
  }

  const monthsMatch = lower.match(/\bin\s+(\d+)\s+months?\b/) ?? lower.match(/^(\d+)\s+months?$/);
  if (monthsMatch) {
    return toISODate(addMonths(anchor, parseInt(monthsMatch[1], 10)));
  }

  const wordNumbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  for (const [word, num] of Object.entries(wordNumbers)) {
    if (lower.includes(`${word} week`)) return toISODate(addWeeks(anchor, num));
    if (lower.includes(`${word} month`)) return toISODate(addMonths(anchor, num));
    if (lower.includes(`${word} day`)) return toISODate(addDays(anchor, num));
  }

  if (lower.includes('next week')) return toISODate(addWeeks(anchor, 1));
  if (lower.includes('next month')) return toISODate(addMonths(anchor, 1));
  if (lower.includes('next year')) return toISODate(addMonths(anchor, 12));

  const monthNames: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  for (const [name, monthIndex] of Object.entries(monthNames)) {
    const re = new RegExp(`${name}\\.?\\s+(\\d{1,2})`, 'i');
    const m = phrase.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      let year = anchor.getFullYear();
      const candidate = new Date(year, monthIndex, day);
      if (candidate < anchor) candidate.setFullYear(year + 1);
      if (isValid(candidate)) return toISODate(candidate);
    }
  }

  const mdMatch = phrase.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1], 10) - 1;
    const day = parseInt(mdMatch[2], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let year = anchor.getFullYear();
      const candidate = new Date(year, month, day);
      if (candidate < anchor) candidate.setFullYear(year + 1);
      if (isValid(candidate)) return toISODate(candidate);
    }
  }

  if (isValidISODate(phrase)) {
    return toISODate(parseISO(phrase));
  }

  return null;
}

function parseValidDate(dateStr: string): Date | null {
  const parsed = parseISO(dateStr);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(dateStr);
  if (isValid(fallback)) return fallback;
  return null;
}

function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
