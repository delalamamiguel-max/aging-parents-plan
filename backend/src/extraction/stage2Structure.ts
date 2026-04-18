/**
 * Stage 2 — context-aware structured extraction.
 *
 * Runs `OLLAMA_STRUCTURED_MODEL` (default `ministral-3:14b-cloud`) against the
 * `NormalizedText` produced by Stage 1. Returns the validated structured
 * output (sections, actionItems, flags) — or a typed failure reason when the
 * response is unparseable or fails grounding checks.
 *
 * Policy: Stage 2 NEVER sees raw OCR/audio. It consumes only the segment
 * list Stage 1 emitted. The pipeline enforces this by wiring stage 2 to the
 * `NormalizedText.segments`, never to the original `Stage1RawInputs`.
 */

import type { RequestLogger } from '../logger.js';
import { ollamaChat } from '../summary/ollamaChat.js';
import {
  parseLLMResponse,
  validateLLMOutput,
  type RawLLMOutput,
} from '../summary/outputValidator.js';
import { STAGE2_SYSTEM_PROMPT, buildStage2UserPrompt } from './prompts.js';
import type { NormalizedText } from './types.js';

export interface Stage2Options {
  model: string;
  visitDate: string;
  language: 'en' | 'es';
}

export type Stage2Result =
  | {
      status: 'success';
      output: RawLLMOutput;
      warnings: readonly string[];
    }
  | {
      status: 'unparseable';
      rawResponse: string;
    }
  | {
      status: 'validation_failed';
      warnings: readonly string[];
      errors: readonly string[];
    };

export async function runStage2(
  normalized: NormalizedText,
  opts: Stage2Options,
  log: RequestLogger
): Promise<Stage2Result> {
  log.info('stage2.request', {
    model: opts.model,
    segmentCount: normalized.segments.length,
    fullTextLen: normalized.fullText.length,
  });

  const raw = await ollamaChat({
    model: opts.model,
    system: STAGE2_SYSTEM_PROMPT,
    user: buildStage2UserPrompt({
      segments: normalized.segments,
      visitDate: opts.visitDate,
      language: opts.language,
    }),
    format: 'json',
  });

  const parsed = parseLLMResponse(raw);
  if (!parsed) {
    log.warn('stage2.unparseable', { rawLen: raw.length });
    return { status: 'unparseable', rawResponse: raw };
  }

  const validation = validateLLMOutput(parsed, normalized.fullText, opts.visitDate);
  if (!validation.sanitisedOutput || validation.errors.length > 0) {
    log.warn('stage2.validation_failed', {
      errors: validation.errors,
      warnings: validation.warnings,
    });
    return {
      status: 'validation_failed',
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  return {
    status: 'success',
    output: validation.sanitisedOutput,
    warnings: validation.warnings,
  };
}
