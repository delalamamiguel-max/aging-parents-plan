/**
 * AI Summary Service — Aging Parents Plan
 * Source: masterplan.md §7.2; implementation-plan.md §Sprint 1
 *
 * Stub implementation for Sprint 1. Returns a structured draft from raw input.
 * In Sprint 2: connect to real LLM, add readability guardrails, uncertainty flagging.
 *
 * CONTRACTS ENFORCED:
 * - Never invent drug names, dosages, dates, providers, tests, or referral instructions
 * - Flag uncertainty rather than silently resolve it
 * - Plain language at or below 6th-grade reading level (enforced in Sprint 2)
 * - Sentences under 20 words (enforced in Sprint 2)
 * - Generation p95 target: under 60 seconds
 */

import {
  SummarySection,
  ActionItem,
  AccuracyFlag,
  SectionType,
  SECTION_ORDER,
  TaskStatus,
} from '../contracts/schema';

export interface GenerateSummaryInput {
  rawText?: string;
  rawAudioTranscript?: string;
  language?: 'en' | 'es';
  visitDate?: string;
}

export interface GenerateSummaryOutput {
  sections: SummarySection[];
  actionItems: ActionItem[];
  flags: AccuracyFlag[];
  generatedAt: string;
}

// ─── Stub generator (Sprint 1) ────────────────────────────────────────────────
// Parses raw text input into a structured draft.
// No hallucination — only uses what the user provided.

export async function generateSummaryFromInput(
  visitId: string,
  input: GenerateSummaryInput
): Promise<GenerateSummaryOutput> {
  // Simulate processing latency (50-500ms for stub)
  await delay(800 + Math.random() * 400);

  const rawContent = input.rawText ?? input.rawAudioTranscript ?? '';
  const now = new Date().toISOString();

  // Build sections from input — stub only extracts what is present
  const sections: SummarySection[] = SECTION_ORDER.map((sectionType) => {
    const content = extractSection(sectionType, rawContent);
    return {
      sectionType,
      content,
      sourceType: content ? 'ai_generated' : 'empty',
      isEmpty: !content,
    };
  });

  // Extract action items from what happened / next steps content
  const actionItems: ActionItem[] = extractActionItems(visitId, rawContent);

  // Uncertainty flags — stub: flag anything that looks like a number/dosage
  const flags: AccuracyFlag[] = extractUncertaintyFlags(visitId, rawContent);

  return { sections, actionItems, flags, generatedAt: now };
}

// ─── Extraction helpers (stub) ────────────────────────────────────────────────
// These are intentionally conservative: they do not invent.
// Sprint 2 replaces these with LLM-structured extraction.

function extractSection(sectionType: SectionType, raw: string): string {
  if (!raw.trim()) return '';

  // Simple heuristics — look for keyword presence in raw text
  const lower = raw.toLowerCase();

  switch (sectionType) {
    case 'visit_date_provider':
      // Don't invent — only surface if clearly stated
      return '';

    case 'what_happened':
      // Everything the user said is "what happened" in the stub
      if (raw.trim().length > 20) {
        return truncateToSentences(raw, 3);
      }
      return '';

    case 'medication_changes':
      if (lower.includes('medication') || lower.includes('prescription') ||
          lower.includes('drug') || lower.includes('pill') || lower.includes('mg')) {
        return 'Please verify: medication details were mentioned but could not be confirmed automatically.';
      }
      return '';

    case 'next_steps':
      if (lower.includes('need to') || lower.includes('should') ||
          lower.includes('follow up') || lower.includes('next') || lower.includes('schedule')) {
        return truncateToSentences(raw, 2);
      }
      return '';

    case 'referrals_tests':
      if (lower.includes('referral') || lower.includes('specialist') ||
          lower.includes('test') || lower.includes('lab') || lower.includes('blood')) {
        return 'A referral or test may have been mentioned. Please review and confirm.';
      }
      return '';

    case 'follow_up_appointment':
      if (lower.includes('appointment') || lower.includes('follow') || lower.includes('schedule')) {
        return 'A follow-up appointment may have been discussed. Please add the date if known.';
      }
      return '';

    default:
      return '';
  }
}

function extractActionItems(visitId: string, raw: string): ActionItem[] {
  const lower = raw.toLowerCase();
  const items: ActionItem[] = [];

  if (lower.includes('medication') || lower.includes('prescription') || lower.includes('mg')) {
    items.push({
      id: `action-${Date.now()}-1`,
      visitId,
      type: 'medication',
      content: 'Review and confirm medication details with your doctor.',
      status: 'open',
      isFlagged: true, // flagged until parent confirms
    });
  }

  if (lower.includes('follow up') || lower.includes('appointment')) {
    items.push({
      id: `action-${Date.now()}-2`,
      visitId,
      type: 'follow_up',
      content: 'Schedule or confirm your follow-up appointment.',
      status: 'not_scheduled',
      isFlagged: false,
    });
  }

  if (lower.includes('referral') || lower.includes('specialist') ||
      lower.includes('test') || lower.includes('lab')) {
    items.push({
      id: `action-${Date.now()}-3`,
      visitId,
      type: 'referral_test',
      content: 'A referral or test may need to be scheduled.',
      status: 'open',
      isFlagged: false,
    });
  }

  return items;
}

function extractUncertaintyFlags(visitId: string, raw: string): AccuracyFlag[] {
  const flags: AccuracyFlag[] = [];
  // Flag anything that looks like a dosage (number + mg/mcg/ml pattern)
  const dosagePattern = /\d+\s*(mg|mcg|ml|units?)\b/gi;
  let match;
  while ((match = dosagePattern.exec(raw)) !== null) {
    flags.push({
      id: `flag-${Date.now()}-${flags.length}`,
      sectionType: 'medication_changes',
      rawPhrase: match[0],
      interpretedPhrase: `Possible dosage: "${match[0]}" — please verify with your prescription.`,
      confidenceScore: 0.4,
    });
    break; // limit to first match for stub
  }
  return flags;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function truncateToSentences(text: string, n: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, n).join(' ');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
