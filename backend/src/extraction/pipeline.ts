/**
 * Two-stage extraction pipeline orchestrator.
 *
 *   Stage 1 (`OLLAMA_EXTRACTION_MODEL`, default `gemma4:31b-cloud`)
 *     → produces NormalizedText (OCR/PDF text/audio-to-text).
 *
 *   Stage 2 (`OLLAMA_STRUCTURED_MODEL`, default `qwen3.5:cloud`)
 *     → consumes NormalizedText and produces the structured visit summary.
 *
 * Ordering rules enforced here (not by caller):
 *   1. Stage 2 NEVER runs without Stage 1. If Stage 1 produced no usable
 *      text, Stage 2 is short-circuited with `no_input`.
 *   2. Stage 2 NEVER sees the raw `Stage1RawInputs` object. It only receives
 *      `NormalizedText.segments`.
 *   3. The two models MUST be distinct at config time (checked in env.ts).
 *
 * The minimum-length / boilerplate gate previously applied in the handler
 * has been moved here so that Stage 1 always runs first (per the "do not
 * skip OCR/transcription" rule) and the gate operates on the Stage 1 output.
 */

import type { RequestLogger } from '../logger.js';
import { serverEnv } from '../config/env.js';
import { runStage1 } from './stage1Extract.js';
import { runStage2 } from './stage2Structure.js';
import type {
  NormalizedText,
  PipelineResult,
  Stage1RawInputs,
} from './types.js';

/**
 * Minimum useful character count for the Stage 1 output. Below this we
 * short-circuit with `insufficient_detail` rather than hallucinating via
 * Stage 2.
 */
const MIN_FULLTEXT_CHARS = 40;

/**
 * Substrings that unambiguously identify placeholder/mock transcripts or
 * obvious non-visit input. If any appears in Stage 1's fullText we
 * short-circuit — Stage 2 would otherwise faithfully paraphrase the
 * placeholder, which looks like generic AI filler.
 */
const MOCK_TRANSCRIPT_MARKERS: readonly string[] = [
  '[mock transcript]',
  'please replace with real transcript output',
];

export interface PipelineOptions {
  visitDate: string;
  language: 'en' | 'es';
}

export async function runExtractionPipeline(
  inputs: Stage1RawInputs,
  opts: PipelineOptions,
  log: RequestLogger
): Promise<PipelineResult> {
  const stage1Model = serverEnv.OLLAMA_EXTRACTION_MODEL.trim();
  const stage2Model = serverEnv.OLLAMA_STRUCTURED_MODEL.trim();

  if (!hasAnyRawInput(inputs)) {
    log.info('pipeline.no_input');
    return {
      status: 'failure',
      reason: 'no_input',
      warnings: [],
      errors: ['no_input'],
    };
  }

  // ── Stage 1 (always runs; never skipped) ─────────────────────────────────
  const normalized: NormalizedText = await runStage1(
    inputs,
    { model: stage1Model, language: opts.language },
    log
  );

  if (
    normalized.fullText.length < MIN_FULLTEXT_CHARS ||
    isBoilerplate(normalized.fullText)
  ) {
    const boilerplate = isBoilerplate(normalized.fullText);
    log.warn('pipeline.insufficient_detail', {
      fullTextLen: normalized.fullText.length,
      boilerplate,
    });
    const reason = boilerplate
      ? 'insufficient_detail_boilerplate'
      : `insufficient_detail_too_short:${normalized.fullText.length}`;
    return {
      status: 'failure',
      reason: 'insufficient_detail',
      normalized,
      warnings: normalized.warnings,
      errors: [reason],
    };
  }

  // ── Stage 2 (only after Stage 1 produced usable text) ────────────────────
  const stage2 = await runStage2(
    normalized,
    { model: stage2Model, visitDate: opts.visitDate, language: opts.language },
    log
  );

  if (stage2.status === 'unparseable') {
    return {
      status: 'failure',
      reason: 'stage2_unparseable',
      normalized,
      warnings: normalized.warnings,
      errors: ['parse_error', 'llm_json_unparseable'],
    };
  }

  if (stage2.status === 'validation_failed') {
    return {
      status: 'failure',
      reason: 'stage2_validation_failed',
      normalized,
      warnings: [...normalized.warnings, ...stage2.warnings],
      errors: stage2.errors,
    };
  }

  return {
    status: 'success',
    normalized,
    structured: stage2.output,
    stage1Model,
    stage2Model,
    warnings: [...normalized.warnings, ...stage2.warnings],
  };
}

function hasAnyRawInput(inputs: Stage1RawInputs): boolean {
  if (inputs.rawText && inputs.rawText.trim()) return true;
  if (inputs.rawAudioTranscript && inputs.rawAudioTranscript.trim()) return true;
  if (inputs.audioSegments && inputs.audioSegments.length > 0) return true;
  if (inputs.pdfPages && inputs.pdfPages.length > 0) return true;
  if (inputs.images && inputs.images.length > 0) return true;
  return false;
}

function isBoilerplate(fullText: string): boolean {
  const lower = fullText.toLowerCase();
  return MOCK_TRANSCRIPT_MARKERS.some((marker) => lower.includes(marker));
}
