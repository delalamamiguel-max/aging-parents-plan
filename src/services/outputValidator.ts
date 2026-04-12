/**
 * Output Validator — Aging Parents Plan
 * Source: masterplan.md §7.2 "AI cannot invent"; §7.6 "flag uncertainty"
 *
 * Validates the raw LLM JSON response before it is written to state.
 * - **Errors** block the response (sanitisedOutput null).
 * - **Warnings** are logged and attached to the summary; output may still ship.
 *
 * Deterministic checks only — no statistical NLP. Remaining risk is paraphrasing
 * that evades substring checks (documented as heuristic gap).
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
  /** Blocking issues — sanitisedOutput will be null */
  errors: string[];
  /** Non-blocking issues — still logged on successful output */
  warnings: string[];
  sanitisedOutput: RawLLMOutput | null;
}

const VALID_ACTION_TYPES = new Set(['medication', 'follow_up', 'referral_test', 'next_step']);
const VALID_SECTION_TYPES = new Set<string>(SECTION_ORDER);
const MAX_SECTION_LENGTH = 600;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

/**
 * Verifies numeric / unit snippets are supported by the transcript (deterministic).
 * Heuristic gap: paraphrased numbers without digits (e.g. "ten mg") are not checked.
 */
/** Normalise common unit words so "10 mg" can match "10 milligrams" in the transcript. */
function normalizeUnitsForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bmilligrams?\b/g, 'mg')
    .replace(/\bmicrograms?\b/g, 'mcg')
    .replace(/\bmilliliters?\b/g, 'ml');
}

function verifyNumericGrounding(
  text: string,
  label: string,
  rawInput: string,
  visitDate: string,
  errors: string[]
): void {
  const ctx = normalizeUnitsForMatch(`${rawInput} ${visitDate}`);

  const reDosage = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|units?|milligrams?)\b/gi;
  let m: RegExpExecArray | null;
  const d = new RegExp(reDosage.source, 'gi');
  const textNorm = normalizeUnitsForMatch(text);
  while ((m = d.exec(textNorm)) !== null) {
    const frag = m[0].trim().toLowerCase();
    if (!ctx.includes(frag)) {
      errors.push(`ungrounded_dosage_in_${label}:${truncateForLog(frag)}`);
    }
  }

  const reBp = /\b(\d+)\s*\/\s*(\d+)\b/g;
  let bp: RegExpExecArray | null;
  const bpr = new RegExp(reBp.source, 'g');
  while ((bp = bpr.exec(text)) !== null) {
    const a = bp[1];
    const b = bp[2];
    if (!ctx.includes(a) || !ctx.includes(b)) {
      errors.push(`ungrounded_bp_reading_in_${label}:${bp[0]}`);
    }
  }

  const reLong = /\b\d{4,}\b/g;
  let lm: RegExpExecArray | null;
  const lr = new RegExp(reLong.source, 'g');
  while ((lm = lr.exec(text)) !== null) {
    if (!ctx.includes(lm[0])) {
      errors.push(`ungrounded_long_number_in_${label}:${lm[0]}`);
    }
  }
}

// ─── Parse raw LLM text → RawLLMOutput ───────────────────────────────────────

export function parseLLMResponse(raw: string): RawLLMOutput | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as RawLLMOutput;
  } catch {
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
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!output.sections || typeof output.sections !== 'object') {
    return {
      errors: ['sections field missing or not an object'],
      warnings: [],
      sanitisedOutput: null,
    };
  }

  const unknownSectionKeys = Object.keys(output.sections).filter((k) => !VALID_SECTION_TYPES.has(k));
  if (unknownSectionKeys.length > 0) {
    warnings.push(`unknown_section_keys_ignored:${unknownSectionKeys.join(',')}`);
  }

  const sanitisedSections: Partial<Record<SectionType, string | null>> = {};
  for (const sectionType of SECTION_ORDER) {
    const content = output.sections[sectionType];
    if (content === undefined || content === null || content === '') {
      sanitisedSections[sectionType] = null;
      continue;
    }
    if (typeof content !== 'string') {
      warnings.push(`section_${sectionType}_not_string_cleared`);
      sanitisedSections[sectionType] = null;
      continue;
    }
    if (content.length > MAX_SECTION_LENGTH) {
      sanitisedSections[sectionType] = content.slice(0, MAX_SECTION_LENGTH);
      warnings.push(`section_${sectionType}_truncated_to_${MAX_SECTION_LENGTH}_chars`);
    } else {
      sanitisedSections[sectionType] = content;
    }
  }

  const sanitisedItems: RawActionItem[] = [];
  const actionItems = Array.isArray(output.actionItems) ? output.actionItems : [];
  if (!Array.isArray(output.actionItems)) {
    warnings.push('actionItems_not_array_treated_as_empty');
  }

  for (const item of actionItems) {
    if (!VALID_ACTION_TYPES.has(item.type)) {
      warnings.push(`skipped_action_invalid_type:${String(item.type)}`);
      continue;
    }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      warnings.push('skipped_action_empty_content');
      continue;
    }

    let resolvedDueDate: string | null = null;
    if (item.dueDate) {
      if (isValidISODate(item.dueDate)) {
        resolvedDueDate = item.dueDate;
      } else {
        warnings.push(`action_dueDate_invalid_iso:${item.dueDate}`);
      }
    } else if (item.dueDateRaw) {
      const resolved = resolveRelativeDate(item.dueDateRaw, visitDate);
      if (resolved) {
        resolvedDueDate = resolved;
      } else {
        warnings.push(`action_dueDateRaw_unresolved:${item.dueDateRaw}`);
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

  const sanitisedFlags: RawFlag[] = [];
  const flags = Array.isArray(output.flags) ? output.flags : [];
  if (!Array.isArray(output.flags)) {
    warnings.push('flags_not_array_treated_as_empty');
  }

  for (const flag of flags) {
    if (!VALID_SECTION_TYPES.has(flag.sectionType)) {
      warnings.push(`skipped_flag_unknown_section:${flag.sectionType}`);
      continue;
    }
    const score = Number(flag.confidenceScore);
    if (isNaN(score) || score < MIN_CONFIDENCE || score > MAX_CONFIDENCE) {
      warnings.push(`skipped_flag_invalid_confidence:${flag.confidenceScore}`);
      continue;
    }
    const rawPhrase = String(flag.rawPhrase ?? '').trim();
    const interpretedPhrase = String(flag.interpretedPhrase ?? '').trim();
    if (rawPhrase.length >= 3 && !phraseGroundedInInput(rawPhrase, rawInput)) {
      warnings.push(`flag_dropped_ungrounded_rawphrase:${truncateForLog(rawPhrase)}`);
      continue;
    }
    sanitisedFlags.push({
      sectionType: flag.sectionType,
      rawPhrase,
      interpretedPhrase,
      confidenceScore: score,
    });
  }

  const provisional: RawLLMOutput = {
    sections: sanitisedSections,
    actionItems: sanitisedItems,
    flags: sanitisedFlags,
  };

  errors.push(...collectGroundingErrors(provisional, rawInput, visitDate));

  if (errors.length > 0) {
    return { errors, warnings, sanitisedOutput: null };
  }

  return { errors: [], warnings, sanitisedOutput: provisional };
}

// ─── Grounding (deterministic) ────────────────────────────────────────────────

function normalizeLoose(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function phraseGroundedInInput(phrase: string, rawInput: string): boolean {
  const p = normalizeLoose(phrase);
  const i = normalizeLoose(rawInput);
  return p.length === 0 || i.includes(p);
}

function collectGroundingErrors(
  output: RawLLMOutput,
  rawInput: string,
  visitDate: string
): string[] {
  const errors: string[] = [];

  for (const st of SECTION_ORDER) {
    const t = output.sections[st];
    if (t) verifyNumericGrounding(t, `section_${st}`, rawInput, visitDate, errors);
  }
  for (let i = 0; i < output.actionItems.length; i++) {
    verifyNumericGrounding(output.actionItems[i].content, `action_${i}`, rawInput, visitDate, errors);
  }

  return errors;
}

function truncateForLog(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
