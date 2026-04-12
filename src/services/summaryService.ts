/**
 * AI Summary Service — Aging Parents Plan
 * Source: masterplan.md §7.2; implementation-plan.md §Sprint 2
 *
 * Sprint 2: real LLM integration via llmClient (Gemini or Ollama).
 *
 * CONTRACTS ENFORCED (masterplan.md §7.2, §7.6):
 * - Never invent drug names, dosages, dates, providers, tests, or referral instructions
 * - Flag uncertainty rather than silently resolve it
 * - Plain language at or below 6th-grade reading level (enforced by readabilityGuard)
 * - Sentences under 20 words (enforced by readabilityGuard)
 * - Generation p95 target: under 60 seconds
 * - If LLM fails or output is invalid: safe fallback (all sections empty, one capture-again flag)
 */

import { format } from 'date-fns';
import {
  SummarySection,
  ActionItem,
  AccuracyFlag,
  SectionType,
  SECTION_ORDER,
  PipelineErrorCode,
  type PipelineFallbackMetadata,
  type PipelineOutcomeStatus,
} from '../contracts/schema';
import { summarizeViaBackend, isApiClientError } from '../api/client';
import type { SummarizeApiResult } from '../api/endpoints';
import { callLLM, LLMError } from './llmClient';
import { SUMMARY_SYSTEM_PROMPT, buildUserPrompt, buildCorrectionPrompt } from './promptTemplates';
import { parseLLMResponse, validateLLMOutput, RawActionItem, RawFlag } from './outputValidator';
import { applyReadabilityToSections } from './readabilityGuard';
import { ENV, isLegacyClientLLMConfigured, getAIConfigSummary } from '../config/env';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GenerateSummaryInput {
  rawText?: string;
  rawAudioTranscript?: string;
  language?: 'en' | 'es';
  visitDate?: string; // ISO date — defaults to today if absent
}

export interface GenerateSummaryOutput {
  sections: SummarySection[];
  actionItems: ActionItem[];
  flags: AccuracyFlag[];
  generatedAt: string;
  /** Validation warnings logged internally — not shown to user */
  _validationWarnings?: string[];
  /** Set when using backend or unified pipeline contract (ADR-001). */
  pipelineOutcome?: Extract<PipelineOutcomeStatus, 'success' | 'fallback_used'>;
  pipelineReasonCode?: (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode];
  pipelineFallback?: PipelineFallbackMetadata;
}

/**
 * Returns true if the output is a skeletal fallback (no content in most sections).
 */
export function isFallbackResult(output: GenerateSummaryOutput): boolean {
  // If we have validation warnings like 'parse_error' or 'no_input', it's a fallback
  if (output._validationWarnings && output._validationWarnings.length > 0) {
    return true;
  }
  // If all core sections are empty, treat as fallback
  return output.sections.every((s) => s.isEmpty);
}

// ─── Main entry: generate summary ────────────────────────────────────────────

export async function generateSummaryFromInput(
  visitId: string,
  input: GenerateSummaryInput
): Promise<GenerateSummaryOutput> {
  const rawContent = input.rawText ?? input.rawAudioTranscript ?? '';
  const visitDate = input.visitDate ?? format(new Date(), 'yyyy-MM-dd');
  const language = input.language ?? 'en';
  const generatedAt = new Date().toISOString();

  // Guard: empty input
  if (!rawContent.trim()) {
    return annotatePipelineFallback(buildFallback(visitId, 'no_input', generatedAt), PipelineErrorCode.NoInput);
  }

  if (ENV.USE_BACKEND_PIPELINE && ENV.BACKEND_API_BASE.length > 0) {
    try {
      const { result } = await summarizeViaBackend({
        visitId,
        rawText: input.rawText,
        rawAudioTranscript: input.rawAudioTranscript,
        language,
        visitDate: input.visitDate,
      });
      return mapBackendSummarizeResult(result);
    } catch (err) {
      if (isApiClientError(err)) {
        console.warn(
          `[summaryService] Backend summarize failed (${err.code}), using legacy client path. requestId=${err.requestId ?? 'n/a'}`
        );
      } else {
        console.warn('[summaryService] Backend summarize threw, using legacy client path:', err);
      }
    }
  }

  return generateSummaryFromInputLegacy(visitId, input, rawContent, visitDate, language, generatedAt);
}

async function generateSummaryFromInputLegacy(
  visitId: string,
  input: GenerateSummaryInput,
  rawContent: string,
  visitDate: string,
  language: 'en' | 'es',
  generatedAt: string
): Promise<GenerateSummaryOutput> {
  // Guard: legacy client LLM not configured (backend path already attempted above)
  if (!isLegacyClientLLMConfigured()) {
    console.warn('[summaryService] Legacy LLM not configured — falling back to stub. Config:', getAIConfigSummary());
    return annotatePipelineFallback(buildStubFallback(visitId, rawContent, generatedAt), PipelineErrorCode.StubLlmUnconfigured);
  }

  console.log('[summaryService] Generating (legacy client). Config:', getAIConfigSummary());

  try {
    const userPrompt = buildUserPrompt({ rawText: rawContent, visitDate, language });
    const rawResponse = await callLLM(SUMMARY_SYSTEM_PROMPT, userPrompt);

    return annotatePipelineSuccess(processLLMResponse(rawResponse, rawContent, visitId, visitDate, generatedAt));
  } catch (err) {
    const code = err instanceof LLMError ? err.code : 'unknown';
    console.error(`[summaryService] LLM call failed (${code}):`, err);
    return annotatePipelineFallback(buildFallback(visitId, code, generatedAt), reasonStringToPipelineCode(code));
  }
}

function mapBackendSummarizeResult(result: SummarizeApiResult): GenerateSummaryOutput {
  const { summary } = result;
  const base: GenerateSummaryOutput = {
    sections: summary.sections as SummarySection[],
    actionItems: summary.actionItems,
    flags: summary.flags,
    generatedAt: summary.generatedAt,
    _validationWarnings: summary.validationWarnings ? [...summary.validationWarnings] : undefined,
  };
  if (result.outcome === 'success') {
    return { ...base, pipelineOutcome: 'success' };
  }
  return {
    ...base,
    pipelineOutcome: 'fallback_used',
    pipelineReasonCode: result.fallback.reasonCode,
    pipelineFallback: result.fallback,
  };
}

function annotatePipelineSuccess(out: GenerateSummaryOutput): GenerateSummaryOutput {
  return { ...out, pipelineOutcome: 'success' };
}

function annotatePipelineFallback(
  out: GenerateSummaryOutput,
  reasonCode: (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode]
): GenerateSummaryOutput {
  return { ...out, pipelineOutcome: 'fallback_used', pipelineReasonCode: reasonCode };
}

function reasonStringToPipelineCode(reason: string): (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode] {
  const known = new Set<string>(Object.values(PipelineErrorCode));
  if (known.has(reason)) return reason as (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode];
  return PipelineErrorCode.Unknown;
}

// ─── One-time regeneration with parent correction ─────────────────────────────

export async function regenerateSummaryWithCorrection(
  visitId: string,
  originalSections: SummarySection[],
  correction: string,
  visitDate: string,
  language: 'en' | 'es' = 'en'
): Promise<GenerateSummaryOutput> {
  const generatedAt = new Date().toISOString();

  if (!isLegacyClientLLMConfigured()) {
    return buildFallback(visitId, 'not_configured', generatedAt);
  }

  const originalSummaryJSON = JSON.stringify(
    Object.fromEntries(originalSections.map(s => [s.sectionType, s.content]))
  );

  const userPrompt = buildCorrectionPrompt({ originalSummary: originalSummaryJSON, correction, visitDate });

  try {
    const rawResponse = await callLLM(SUMMARY_SYSTEM_PROMPT, userPrompt);
    return processLLMResponse(rawResponse, correction, visitId, visitDate, generatedAt);
  } catch (err) {
    console.error('[summaryService] Regeneration failed:', err);
    return buildFallback(visitId, 'regeneration_failed', generatedAt);
  }
}

// ─── Internal: process LLM response → GenerateSummaryOutput ─────────────────

function processLLMResponse(
  rawResponse: string,
  rawInput: string,
  visitId: string,
  visitDate: string,
  generatedAt: string
): GenerateSummaryOutput {
  // Parse
  const parsed = parseLLMResponse(rawResponse);
  if (!parsed) {
    console.error('[summaryService] Failed to parse LLM JSON response');
    return buildFallback(visitId, 'parse_error', generatedAt);
  }

  // Validate
  const validation = validateLLMOutput(parsed, rawInput, visitDate);
  const sanitised = validation.sanitisedOutput;

  if (!sanitised || validation.errors.length > 0) {
    console.warn('[processLLMResponse] Validation failed:', validation.errors, validation.warnings);
    return buildFallback(visitId, 'validation_failed', generatedAt);
  }

  // Apply readability guardrails
  const { sections: readableSections, reports: readabilityReports } =
    applyReadabilityToSections(sanitised.sections as Record<string, string | null>);

  // Log internally (Sprint 3: send to analytics)
  if (readabilityReports.some(r => r.finalGradeEstimate > 8)) {
    console.warn('[readabilityGuard] Some sections still above grade 8 after processing', readabilityReports);
  }
  if (validation.warnings.length > 0) {
    console.warn('[outputValidator] Validation warnings:', validation.warnings);
  }

  // Build SummarySection[]
  const sections: SummarySection[] = SECTION_ORDER.map((sectionType) => {
    const content = (readableSections[sectionType] as string | null | undefined) ?? null;
    return {
      sectionType,
      content: content ?? '',
      sourceType: content ? 'ai_generated' : 'empty',
      isEmpty: !content,
    };
  });

  // Build ActionItem[]
  const actionItems: ActionItem[] = sanitised.actionItems.map((item: RawActionItem, i: number) => ({
    id: `action-${visitId}-${Date.now()}-${i}`,
    visitId,
    type: item.type,
    content: item.content,
    status: 'open' as const,
    isFlagged: item.isFlagged,
    dueDate: item.dueDate ?? undefined,
  }));

  // Build AccuracyFlag[]
  const flags: AccuracyFlag[] = sanitised.flags.map((flag: RawFlag, i: number) => ({
    id: `flag-${visitId}-${Date.now()}-${i}`,
    sectionType: flag.sectionType as SectionType,
    rawPhrase: flag.rawPhrase,
    interpretedPhrase: flag.interpretedPhrase,
    confidenceScore: flag.confidenceScore,
  }));

  return {
    sections,
    actionItems,
    flags,
    generatedAt,
    _validationWarnings: [
      ...validation.warnings,
      ...readabilityReports
        .filter((r) => r.finalGradeEstimate > 8)
        .map((r) => `readability_${r.sectionType}_grade_est_${r.finalGradeEstimate}`),
    ],
  };
}

// ─── Fallback builders ────────────────────────────────────────────────────────

/**
 * Full failure fallback — all sections empty, one flag prompting re-capture.
 * Used when LLM fails or output is invalid.
 */
function buildFallback(
  visitId: string,
  reason: string,
  generatedAt: string
): GenerateSummaryOutput {
  const sections: SummarySection[] = SECTION_ORDER.map((sectionType) => ({
    sectionType,
    content: '',
    sourceType: 'empty',
    isEmpty: true,
  }));

  const flags: AccuracyFlag[] = [];
  const actionItems: ActionItem[] = [];

  console.warn(`[summaryService] Using empty fallback. Reason: ${reason}`);

  return { sections, actionItems, flags, generatedAt, _validationWarnings: [reason] };
}

/**
 * Conservative stub fallback — used when no API key is configured.
 * Mirrors the Sprint 1 stub behaviour so the app remains usable in dev
 * without credentials.
 */
function buildStubFallback(
  visitId: string,
  rawContent: string,
  generatedAt: string
): GenerateSummaryOutput {
  const lower = rawContent.toLowerCase();

  const sections: SummarySection[] = SECTION_ORDER.map((sectionType): SummarySection => {
    let content = '';

    switch (sectionType) {
      case 'what_happened':
        if (rawContent.trim().length > 20) {
          content = truncateToSentences(rawContent, 3);
        }
        break;
      case 'medication_changes':
        if (lower.includes('medication') || lower.includes('mg') || lower.includes('pill')) {
          content = 'Medication details were mentioned. Please review and confirm.';
        }
        break;
      case 'next_steps':
        if (lower.includes('follow up') || lower.includes('next') || lower.includes('should')) {
          content = truncateToSentences(rawContent, 2);
        }
        break;
      case 'referrals_tests':
        if (lower.includes('referral') || lower.includes('test') || lower.includes('lab')) {
          content = 'A referral or test may have been mentioned. Please confirm.';
        }
        break;
      case 'follow_up_appointment':
        if (lower.includes('appointment') || lower.includes('follow')) {
          content = 'A follow-up appointment may have been discussed. Please add the date if known.';
        }
        break;
    }

    return {
      sectionType,
      content,
      sourceType: content ? 'ai_generated' : 'empty',
      isEmpty: !content,
    };
  });

  const actionItems: ActionItem[] = [];
  if (lower.includes('medication') || lower.includes('mg')) {
    actionItems.push({
      id: `action-${visitId}-stub-1`,
      visitId,
      type: 'medication',
      content: 'Review and confirm medication details with your doctor.',
      status: 'open',
      isFlagged: true,
    });
  }
  if (lower.includes('follow up') || lower.includes('appointment')) {
    actionItems.push({
      id: `action-${visitId}-stub-2`,
      visitId,
      type: 'follow_up',
      content: 'Schedule or confirm your follow-up appointment.',
      status: 'not_scheduled',
      isFlagged: false,
    });
  }

  const flags: AccuracyFlag[] = [];
  const dosagePattern = /\d+\s*(mg|mcg|ml|units?)\b/gi;
  const match = dosagePattern.exec(rawContent);
  if (match) {
    flags.push({
      id: `flag-${visitId}-stub-1`,
      sectionType: 'medication_changes',
      rawPhrase: match[0],
      interpretedPhrase: `Possible dosage: "${match[0]}" — please verify with your prescription.`,
      confidenceScore: 0.4,
    });
  }

  return { sections, actionItems, flags, generatedAt };
}

function truncateToSentences(text: string, n: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, n).join(' ');
}
