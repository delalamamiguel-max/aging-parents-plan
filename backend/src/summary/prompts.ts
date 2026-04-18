/**
 * @deprecated This file predates the two-stage extraction pipeline.
 *
 * Summarisation now runs in two stages:
 *   Stage 1 — `OLLAMA_EXTRACTION_MODEL` (default `gemma4:31b-cloud`) handles
 *     OCR / PDF text / audio-to-text and produces NormalizedText.
 *   Stage 2 — `OLLAMA_STRUCTURED_MODEL` (default `qwen3.5:cloud`) consumes
 *     Stage 1's output and produces the structured visit summary.
 *
 * The new prompts live in `backend/src/extraction/prompts.ts`. This module
 * re-exports Stage 2's prompts under their old names so existing tests and
 * tooling that imported `SUMMARY_SYSTEM_PROMPT` / `buildUserPrompt` keep
 * compiling. New code should import from `../extraction/prompts.js`.
 */

import {
  STAGE2_SYSTEM_PROMPT,
  buildStage2UserPrompt,
} from '../extraction/prompts.js';
import type { NormalizedSegment } from '../extraction/types.js';

export const SUMMARY_SYSTEM_PROMPT = STAGE2_SYSTEM_PROMPT;

export function buildUserPrompt(params: {
  rawText: string;
  visitDate: string;
  language: 'en' | 'es';
}): string {
  const segments: NormalizedSegment[] = [
    {
      id: 's-text-0',
      text: params.rawText.trim(),
      sourceRef: { kind: 'text', offset: 0 },
    },
  ];
  return buildStage2UserPrompt({
    segments,
    visitDate: params.visitDate,
    language: params.language,
  });
}
