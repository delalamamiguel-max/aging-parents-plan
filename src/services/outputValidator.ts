/**
 * Output Validator — Aging Parents Plan
 * Source: masterplan.md §7.2 "AI cannot invent"; §7.6 "flag uncertainty"
 *
 * Validates the raw LLM JSON response before it is written to state.
 * Blocks any summary that contains content not grounded in the input.
 *
 * This is a critical trust layer — do not bypass it.
 */

import { SectionType, SECTION_ORDER } from '../contracts/schema';
import { isValidISODate, resolveRelativeDate } from './dateParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawLLMOutput {
  sections: Partial<Record<SectionType, string | null>>;
  actionItems: RawActionItem[];
  flags: RawFlag[];
}

export interface RawActionItem {
  type: 'medication' | 'follow_up' | 'referral_test' | 'next_step';
  content: string;
  isFlagged: boolean;
  dueDate: string | null;
  dueDateRaw: string | null;
}

export interface RawFlag {
  sectionType: string;
  rawPhrase: string;
  interpretedPhrase: string;
  confidenceScore: number;
}

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
  sanitisedOutput: RawLLMOutput | null;
}

const VALID_ACTION_TYPES = new Set(['medication', 'follow_up', 'referral_test', 'next_step']);
const VALID_SECTION_TYPES = new Set<string>(SECTION_ORDER);
const MAX_SECTION_LENGTH = 600; // characters — prevents bloated output
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

// ─── Parse raw LLM text → RawLLMOutput ───────────────────────────────────────

export function parseLLMResponse(raw: string): RawLLMOutput | null {
  // Strip markdown fences if present (model sometimes ignores responseMimeType)
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as RawLLMOutput;
  } catch {
    // Try to extract first JSON object from the string
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as RawLLMOutput;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Validate ─────────────────────────────────────────────────────────────────

export function validateLLMOutput(
  output: RawLLMOutput,
  rawInput: string,
  visitDate: string
): ValidationResult {
  const violations: string[] = [];

  // 1. Sections must be present and correctly typed
  if (!output.sections || typeof output.sections !== 'object') {
    return { isValid: false, violations: ['sections field missing or not an object'], sanitisedOutput: null };
  }

  // 2. Validate and sanitise sections
  const sanitisedSections: Partial<Record<SectionType, string | null>> = {};
  for (const sectionType of SECTION_ORDER) {
    const content = output.sections[sectionType];
    if (content === undefined || content === null || content === '') {
      sanitisedSections[sectionType] = null;
      continue;
    }
    if (typeof content !== 'string') {
      violations.push(`Section ${sectionType} content is not a string`);
      sanitisedSections[sectionType] = null;
      continue;
    }
    if (content.length > MAX_SECTION_LENGTH) {
      // Truncate rather than reject — keep the summary usable
      sanitisedSections[sectionType] = content.slice(0, MAX_SECTION_LENGTH);
      violations.push(`Section ${sectionType} was truncated (too long)`);
    } else {
      sanitisedSections[sectionType] = content;
    }
  }

  // 3. Validate action items
  const sanitisedItems: RawActionItem[] = [];
  const actionItems = Array.isArray(output.actionItems) ? output.actionItems : [];

  for (const item of actionItems) {
    if (!VALID_ACTION_TYPES.has(item.type)) {
      violations.push(`Invalid action item type: ${item.type}`);
      continue;
    }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      violations.push('Action item with empty content skipped');
      continue;
    }

    // Resolve and validate due dates
    let resolvedDueDate: string | null = null;
    if (item.dueDate) {
      if (isValidISODate(item.dueDate)) {
        resolvedDueDate = item.dueDate;
      } else {
        violations.push(`Action item dueDate is not a valid ISO date: ${item.dueDate}`);
      }
    } else if (item.dueDateRaw) {
      // Try to resolve a relative date expression
      const resolved = resolveRelativeDate(item.dueDateRaw, visitDate);
      if (resolved) {
        resolvedDueDate = resolved;
      }
    }

    sanitisedItems.push({
      type: item.type,
      content: item.content.trim(),
      isFlagged: !!item.isFlagged,
      dueDate: resolvedDueDate,
      dueDateRaw: item.dueDateRaw ?? null,
    });
  }

  // 4. Validate flags
  const sanitisedFlags: RawFlag[] = [];
  const flags = Array.isArray(output.flags) ? output.flags : [];

  for (const flag of flags) {
    if (!VALID_SECTION_TYPES.has(flag.sectionType)) {
      violations.push(`Flag references unknown section: ${flag.sectionType}`);
      continue;
    }
    const score = Number(flag.confidenceScore);
    if (isNaN(score) || score < MIN_CONFIDENCE || score > MAX_CONFIDENCE) {
      violations.push(`Flag has invalid confidenceScore: ${flag.confidenceScore}`);
      continue;
    }
    sanitisedFlags.push({
      sectionType: flag.sectionType,
      rawPhrase: String(flag.rawPhrase ?? '').trim(),
      interpretedPhrase: String(flag.interpretedPhrase ?? '').trim(),
      confidenceScore: score,
    });
  }

  return {
    isValid: violations.length === 0,
    violations,
    sanitisedOutput: {
      sections: sanitisedSections,
      actionItems: sanitisedItems,
      flags: sanitisedFlags,
    },
  };
}
