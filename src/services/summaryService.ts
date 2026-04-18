/**
 * AI Summary Service — Aging Parents Plan
 * Source: masterplan.md §7.2; implementation-plan.md §Sprint 2
 *
 * POLICY: summarisation runs on the backend (Ollama Cloud or equivalent).
 * No LLM call happens from the Expo bundle (ADR-002). If the backend is
 * unreachable, we return an empty safe fallback — never a heuristic stub.
 *
 * CONTRACTS ENFORCED (masterplan.md §7.2, §7.6):
 * - Never invent drug names, dosages, dates, providers, tests, or referral instructions
 * - Flag uncertainty rather than silently resolve it
 * - Plain language at or below 6th-grade reading level (enforced server-side)
 * - Sentences under 20 words (enforced server-side)
 * - Generation p95 target: under 60 seconds
 * - If backend fails or output is invalid: safe fallback (all sections empty)
 */

import {
  SummarySection,
  ActionItem,
  AccuracyFlag,
  SECTION_ORDER,
  PipelineErrorCode,
  type PipelineFallbackMetadata,
  type PipelineOutcomeStatus,
} from '../contracts/schema';
import { summarizeViaBackend, isApiClientError } from '../api/client';
import type { SummarizeApiResult } from '../api/endpoints';
import { ENV, getAIConfigSummary } from '../config/env';

// ─── Public types ─────────────────────────────────────────────────────────────

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
  _validationWarnings?: string[];
  pipelineOutcome?: Extract<PipelineOutcomeStatus, 'success' | 'fallback_used'>;
  pipelineReasonCode?: (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode];
  pipelineFallback?: PipelineFallbackMetadata;
}

// ─── Main entry: generate summary via backend ────────────────────────────────

export async function generateSummaryFromInput(
  visitId: string,
  input: GenerateSummaryInput
): Promise<GenerateSummaryOutput> {
  const rawContent = input.rawText ?? input.rawAudioTranscript ?? '';
  const language = input.language ?? 'en';
  const generatedAt = new Date().toISOString();

  if (!rawContent.trim()) {
    return annotatePipelineFallback(buildFallback(generatedAt), PipelineErrorCode.NoInput);
  }

  if (!ENV.BACKEND_API_BASE) {
    console.warn('[summaryService] BACKEND_API_BASE not set. Config:', getAIConfigSummary());
    return annotatePipelineFallback(buildFallback(generatedAt), PipelineErrorCode.NotConfigured);
  }

  console.log('[summaryService] Generating via backend. Config:', getAIConfigSummary());

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
    const code = isApiClientError(err) ? err.code : PipelineErrorCode.Unknown;
    const requestId = isApiClientError(err) ? err.requestId ?? 'n/a' : 'n/a';
    console.error(`[summaryService] Backend summarize failed (${code}). requestId=${requestId}`, err);
    return annotatePipelineFallback(buildFallback(generatedAt), reasonStringToPipelineCode(code));
  }
}

// ─── Internal mapping ─────────────────────────────────────────────────────────

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

// ─── Safe fallback (empty summary) ────────────────────────────────────────────

/**
 * Empty fallback — all sections empty. Used when the backend is unreachable
 * or returns invalid output. The ProcessingScreen surfaces a user-friendly
 * error state; the review flow shows empty sections.
 */
function buildFallback(generatedAt: string): GenerateSummaryOutput {
  const sections: SummarySection[] = SECTION_ORDER.map((sectionType) => ({
    sectionType,
    content: '',
    sourceType: 'empty',
    isEmpty: true,
  }));

  return { sections, actionItems: [], flags: [], generatedAt };
}
