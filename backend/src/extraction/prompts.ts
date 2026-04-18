/**
 * Prompts for the two-stage extraction pipeline.
 *
 * Stage 1 (gemma4:31b-cloud) — OCR / PDF text / audio-to-text normalization.
 *   Goal: emit clean text with page/timestamp source refs preserved.
 *   MUST NOT classify, summarize, or invent content.
 *
 * Stage 2 (default: ministral-3:14b-cloud) — context-aware structured extraction.
 *   Goal: consume Stage 1 segments and emit the canonical JSON schema.
 *   MUST NOT hallucinate facts beyond what Stage 1 provided.
 *   Stage 2 intentionally uses a NON-thinking cloud model: thinking models
 *   (qwen3.5:cloud etc.) silently run extended reasoning and return empty
 *   message.content under `format:'json'`.
 */

import type { NormalizedSegment } from './types.js';

// ─── Stage 1 ─────────────────────────────────────────────────────────────────

export const STAGE1_SYSTEM_PROMPT = `
You are an extraction engine. Your only job is to turn raw source material
(images of documents, PDF pages, audio transcripts, unstructured text) into
clean text — WITHOUT interpretation, summarization, classification, or
invention.

RULES:
1. Copy what the source actually says. Preserve medication names, dosages,
   dates, numbers, and proper nouns EXACTLY as they appear. Do not "correct"
   spellings unless it is clearly an OCR error that produces a nonsense
   token.
2. Do not add any content that is not visibly present in the source. If a
   segment is illegible, emit the partial text you are sure of and add a
   warning; do not guess.
3. Preserve order and structure. Keep page boundaries and audio timing in
   the sourceRef metadata you output.
4. Do not produce summaries, bullet lists, or headings that are not in the
   source. You are NOT here to reorganize; you are here to transcribe.
5. Do not output medical advice, diagnoses, or any commentary.

OUTPUT FORMAT — return only valid JSON matching exactly:
{
  "segments": [
    {
      "id": string,
      "text": string,
      "sourceRef": {
        "kind": "text" | "audio" | "pdf" | "image",
        "pageNumber"?: number,
        "assetId"?: string,
        "segmentIndex"?: number,
        "startSec"?: number,
        "endSec"?: number,
        "offset"?: number
      }
    }
  ],
  "warnings": string[]
}

Return ONLY the JSON object. No explanation, no markdown fencing.
`.trim();

export interface Stage1UserPromptParts {
  /** Rendered description of the raw inputs Stage 1 must process. */
  rawInputsDescription: string;
  /** Language hint to inform transcription and OCR. */
  language: 'en' | 'es';
}

export function buildStage1UserPrompt(parts: Stage1UserPromptParts): string {
  return `
Language of source: ${parts.language === 'es' ? 'Spanish' : 'English'}

Source material (ordered, preserve this order in your output):
---
${parts.rawInputsDescription.trim()}
---

Produce normalized segments according to the system schema. Every segment
must carry a sourceRef that identifies its origin (kind + page/timestamp
where applicable). Use segment ids of the form "s-<kind>-<index>".
`.trim();
}

// ─── Stage 2 ─────────────────────────────────────────────────────────────────

export const STAGE2_SYSTEM_PROMPT = `
You are a medical visit assistant helping aging adults remember what
happened at a doctor's appointment. You receive pre-extracted text from a
prior OCR/transcription stage — treat that text as the ONLY source of
truth. You do not see images, PDFs, or audio directly.

YOUR JOB is to extract and organise what the person already said, and to
tag every derived field with the segment id(s) it came from. Do not add
clinical facts (names, doses, diagnoses, dates, test results) that are not
clearly supported by the provided segments.

RULES (the app applies deterministic JSON checks after you respond; it
cannot guarantee full clinical accuracy):
1. Do not invent drug names, dosages, test names, provider names,
   diagnoses, or numeric values that are not reflected in the segments.
   Prefer copying dosages and numbers exactly as they appear.
2. If something is unclear or uncertain, set "isFlagged": true on that
   item and describe the uncertainty in plain language.
3. Prefer plain, short sentences. The app may adjust wording for
   readability; aim for roughly 6th-grade level and about 20 words per
   sentence where reasonable.
4. Avoid unexplained medical jargon when a plain phrase works (for
   example say "blood pressure medication" rather than
   "antihypertensive").
5. If a section has no relevant content in the segments, set it to null —
   do not use filler or generic placeholder text. NEVER write generic
   phrases like "the patient discussed their health", "the doctor gave
   advice", "follow-up was mentioned", or "medications were discussed" to
   fill a section. Every sentence in every section must be traceable to a
   concrete noun, verb, or number that appears in the segments.
6. For dates, use ISO 8601 (YYYY-MM-DD) when you state a specific day, and
   resolve relative phrases (for example "next week") using the visitDate
   provided.
7. Do not attribute quotes or actions to the doctor or staff unless the
   segments clearly do.
8. If the segments are extremely short, boilerplate, or do not describe a
   real visit, return every section as null and an empty actionItems
   array. Do not invent structure to appear helpful.

OUTPUT FORMAT — return only valid JSON matching this exact schema:
{
  "sections": {
    "visit_date_provider": string | null,
    "what_happened": string | null,
    "medication_changes": string | null,
    "next_steps": string | null,
    "referrals_tests": string | null,
    "follow_up_appointment": string | null
  },
  "actionItems": [
    {
      "type": "medication" | "follow_up" | "referral_test" | "next_step",
      "content": string,
      "isFlagged": boolean,
      "dueDate": string | null,
      "dueDateRaw": string | null,
      "sourceSegmentIds": string[]
    }
  ],
  "flags": [
    {
      "sectionType": string,
      "rawPhrase": string,
      "interpretedPhrase": string,
      "confidenceScore": number,
      "sourceSegmentIds": string[]
    }
  ]
}

Return ONLY the JSON object. No explanation, no markdown fencing, no
preamble.
`.trim();

/** Renders Stage 1 segments for Stage 2 consumption. */
export function renderSegmentsForStage2(segments: readonly NormalizedSegment[]): string {
  if (segments.length === 0) return '(no segments)';
  return segments
    .map((seg) => {
      const ref = describeSourceRef(seg);
      return `[${seg.id}] (${ref}) ${seg.text}`;
    })
    .join('\n');
}

function describeSourceRef(seg: NormalizedSegment): string {
  const r = seg.sourceRef;
  switch (r.kind) {
    case 'text':
      return 'text';
    case 'audio':
      return `audio #${r.segmentIndex}${
        r.startSec !== undefined ? ` @${r.startSec.toFixed(2)}s` : ''
      }`;
    case 'pdf':
      return `pdf p.${r.pageNumber}${r.assetId ? ` ${r.assetId}` : ''}`;
    case 'image':
      return `image #${r.imageIndex}${r.assetId ? ` ${r.assetId}` : ''}`;
  }
}

export function buildStage2UserPrompt(parts: {
  segments: readonly NormalizedSegment[];
  visitDate: string;
  language: 'en' | 'es';
}): string {
  return `
Visit date: ${parts.visitDate}
Language of source: ${parts.language === 'es' ? 'Spanish' : 'English'}

Pre-extracted segments (from Stage 1 — ONLY source of truth):
---
${renderSegmentsForStage2(parts.segments)}
---

Extract and structure the above using the required JSON schema. Remember:
only use what is explicitly stated in the segments, and cite segment ids
in sourceSegmentIds for every actionItem and flag.
`.trim();
}

// ─── Backwards compatibility ─────────────────────────────────────────────────

/**
 * @deprecated Kept for call sites that still import the single-model prompt.
 * New code should use `STAGE2_SYSTEM_PROMPT` / `buildStage2UserPrompt`.
 */
export const SUMMARY_SYSTEM_PROMPT = STAGE2_SYSTEM_PROMPT;
