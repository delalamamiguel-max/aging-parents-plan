/**
 * Shared types for the two-stage extraction pipeline.
 *
 *   Stage 1 (OLLAMA_EXTRACTION_MODEL, default gemma4:31b-cloud):
 *     inputs: PDFs, images, audio transcripts, rough text
 *     output: NormalizedText
 *
 *   Stage 2 (OLLAMA_STRUCTURED_MODEL, default qwen3.5:cloud):
 *     input:  NormalizedText
 *     output: StructuredExtraction (sections + action items + flags) with
 *             sourceRef back-links into the Stage 1 segments.
 *
 * Traceability is preserved via `SourceRef`: every normalized segment tags
 * the origin (page number, audio timestamp, asset id), and every structured
 * field may cite the segment id(s) it was derived from.
 */

import type { RawLLMOutput } from '../summary/outputValidator.js';

// ─── Stage 1 inputs ──────────────────────────────────────────────────────────

/** A PDF page supplied to Stage 1. */
export interface PdfPageInput {
  /** 1-based page number within the source document. */
  pageNumber: number;
  /** Page image as base64 (no data URL prefix). Used for vision-based OCR. */
  imageBase64?: string;
  /** Pre-extracted text for the page (e.g. from a text-layer PDF). */
  text?: string;
  /** Optional human-meaningful asset identifier (e.g. filename). */
  assetId?: string;
}

/** A standalone image (e.g. discharge paper photo) supplied to Stage 1. */
export interface ImageInput {
  /** Ordered index in the upload batch (0-based). */
  imageIndex: number;
  /** Image bytes as base64 (no data URL prefix). */
  imageBase64: string;
  /** Optional human-meaningful asset identifier (e.g. filename). */
  assetId?: string;
}

/**
 * An audio segment that has already been turned into text (e.g. backend
 * /transcribe → Groq Whisper). Stage 1 normalizes these into canonical
 * segments but will NOT replace them with hallucinated content.
 */
export interface AudioSegmentInput {
  /** Ordered index in the transcript (0-based). */
  segmentIndex: number;
  /** Start time in seconds relative to the recording. */
  startSec?: number;
  /** End time in seconds relative to the recording. */
  endSec?: number;
  /** Raw transcript text for this segment. */
  text: string;
}

/** Container for every raw input the pipeline accepts. */
export interface Stage1RawInputs {
  /** Loose text (e.g. user-typed notes). */
  rawText?: string;
  /** Whole-audio transcript fallback (when per-segment timing is unavailable). */
  rawAudioTranscript?: string;
  /** Per-segment audio transcripts with timestamps. */
  audioSegments?: readonly AudioSegmentInput[];
  /** PDF pages (either text or image, or both). */
  pdfPages?: readonly PdfPageInput[];
  /** Standalone images. */
  images?: readonly ImageInput[];
}

// ─── Stage 1 output (consumed by Stage 2) ────────────────────────────────────

/** Origin of a normalized segment — used for traceability. */
export type SourceRef =
  | { kind: 'text'; offset?: number }
  | { kind: 'audio'; segmentIndex: number; startSec?: number; endSec?: number }
  | { kind: 'pdf'; pageNumber: number; assetId?: string }
  | { kind: 'image'; imageIndex: number; assetId?: string };

/** A single span of normalized text plus the origin it came from. */
export interface NormalizedSegment {
  /** Stable segment id (`s-<kind>-<index>`). Referenced from Stage 2 output. */
  id: string;
  /** Cleaned text. Preserves numbers, proper nouns, and dosages verbatim. */
  text: string;
  /** Where this text came from. */
  sourceRef: SourceRef;
}

/** The Stage 1 payload handed to Stage 2. */
export interface NormalizedText {
  /** Ordered segments. Order mirrors the natural reading order of inputs. */
  segments: readonly NormalizedSegment[];
  /** Newline-joined concatenation of `segments[].text` — convenience. */
  fullText: string;
  /** Which input kinds actually produced content. */
  inputsUsed: {
    text: boolean;
    audio: boolean;
    pdf: boolean;
    image: boolean;
  };
  /** Non-fatal notes (e.g. "image-3 illegible") surfaced by Stage 1. */
  warnings: readonly string[];
}

// ─── Stage 2 output ──────────────────────────────────────────────────────────

/**
 * Re-export Stage 2's structured shape from the existing validator so the
 * pipeline and handler can share one source of truth for the schema.
 */
export type Stage2StructuredOutput = RawLLMOutput;

// ─── Pipeline result ─────────────────────────────────────────────────────────

export interface PipelineSuccess {
  status: 'success';
  normalized: NormalizedText;
  structured: Stage2StructuredOutput;
  stage1Model: string;
  stage2Model: string;
  warnings: readonly string[];
}

export type PipelineFailureReason =
  | 'no_input'
  | 'insufficient_detail'
  | 'stage1_unparseable'
  | 'stage2_unparseable'
  | 'stage2_validation_failed';

export interface PipelineFailure {
  status: 'failure';
  reason: PipelineFailureReason;
  /** Any Stage 1 output we did manage to produce (may be empty). */
  normalized?: NormalizedText;
  warnings: readonly string[];
  errors: readonly string[];
}

export type PipelineResult = PipelineSuccess | PipelineFailure;
