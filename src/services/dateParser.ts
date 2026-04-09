/**
 * Date Parser — Aging Parents Plan
 * Source: masterplan.md §7.5 "Follow-up date resolution"
 *
 * Resolves relative date expressions from visit transcript text
 * into ISO 8601 date strings, anchored to the visit date.
 *
 * Used by outputValidator to populate ActionItem.dueDate correctly.
 *
 * Rules:
 * - All dates resolved relative to visitDate, not device clock
 * - If resolution is ambiguous, returns null (forces isFlagged on the item)
 * - Never guesses; if uncertain, returns null
 */

import { addDays, addWeeks, addMonths, parseISO, isValid, format } from 'date-fns';

// ─── ISO date validation ───────────────────────────────────────────────────────

export function isValidISODate(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  // Accept YYYY-MM-DD or full ISO 8601 datetime
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const fullISO = /^\d{4}-\d{2}-\d{2}T/.test(value);
  if (!dateOnly && !fullISO) return false;
  const parsed = parseISO(value);
  return isValid(parsed);
}

// ─── Relative date resolver ───────────────────────────────────────────────────

/**
 * Resolves a natural-language date phrase into an ISO date string.
 * Anchored to visitDate, not the current device time.
 *
 * Examples:
 *   "in two weeks"     → visitDate + 14 days
 *   "next month"       → visitDate + 1 month
 *   "in 3 months"      → visitDate + 3 months
 *   "July 17"          → current year July 17 (or next year if already passed)
 *   "07/17"            → same
 *   "follow up in 30 days" → visitDate + 30 days
 */
export function resolveRelativeDate(phrase: string, visitDate: string): string | null {
  if (!phrase || !visitDate) return null;

  const anchor = parseValidDate(visitDate);
  if (!anchor) return null;

  const lower = phrase.toLowerCase().trim();

  // ── "in N days" / "N days" ──────────────────────────────────────────────────
  const daysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/) ??
                    lower.match(/^(\d+)\s+days?$/);
  if (daysMatch) {
    return toISODate(addDays(anchor, parseInt(daysMatch[1], 10)));
  }

  // ── "in N weeks" / "N weeks" ────────────────────────────────────────────────
  const weeksMatch = lower.match(/\bin\s+(\d+)\s+weeks?\b/) ??
                     lower.match(/^(\d+)\s+weeks?$/);
  if (weeksMatch) {
    return toISODate(addWeeks(anchor, parseInt(weeksMatch[1], 10)));
  }

  // ── "in N months" / "N months" ──────────────────────────────────────────────
  const monthsMatch = lower.match(/\bin\s+(\d+)\s+months?\b/) ??
                      lower.match(/^(\d+)\s+months?$/);
  if (monthsMatch) {
    return toISODate(addMonths(anchor, parseInt(monthsMatch[1], 10)));
  }

  // ── Word-number variants ("two weeks", "three months") ──────────────────────
  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12,
  };
  for (const [word, num] of Object.entries(wordNumbers)) {
    if (lower.includes(`${word} week`)) return toISODate(addWeeks(anchor, num));
    if (lower.includes(`${word} month`)) return toISODate(addMonths(anchor, num));
    if (lower.includes(`${word} day`)) return toISODate(addDays(anchor, num));
  }

  // ── "next week" / "next month" ───────────────────────────────────────────────
  if (lower.includes('next week')) return toISODate(addWeeks(anchor, 1));
  if (lower.includes('next month')) return toISODate(addMonths(anchor, 1));
  if (lower.includes('next year')) return toISODate(addMonths(anchor, 12));

  // ── Explicit month + day (e.g. "July 17", "Jul 17", "07/17") ────────────────
  const monthNames: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
    sep: 8, oct: 9, nov: 10, dec: 11,
  };

  for (const [name, monthIndex] of Object.entries(monthNames)) {
    const re = new RegExp(`${name}\\.?\\s+(\\d{1,2})`, 'i');
    const m = phrase.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      let year = anchor.getFullYear();
      const candidate = new Date(year, monthIndex, day);
      // If the date has already passed relative to anchor, use next year
      if (candidate < anchor) candidate.setFullYear(year + 1);
      if (isValid(candidate)) return toISODate(candidate);
    }
  }

  // ── MM/DD or MM-DD ───────────────────────────────────────────────────────────
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

  // ── Already a valid ISO date ─────────────────────────────────────────────────
  if (isValidISODate(phrase)) {
    return toISODate(parseISO(phrase));
  }

  return null; // ambiguous — forces isFlagged on the action item
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseValidDate(dateStr: string): Date | null {
  // Accept ISO date or datetime
  const parsed = parseISO(dateStr);
  if (isValid(parsed)) return parsed;
  // Fallback: try JS date parsing
  const fallback = new Date(dateStr);
  if (isValid(fallback)) return fallback;
  return null;
}

function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
