/**
 * HTTP API contracts — aligned with ADR-001 and mobile `schema.ts` pipeline types.
 * Duplicated here so the backend stays independent of the Expo bundle.
 */

// ─── Pipeline (mirror of app schema) ──────────────────────────────────────────

export type PipelineOutcomeStatus =
  | 'success'
  | 'fallback_used'
  | 'retryable_failure'
  | 'non_retryable_failure';

/** Subset of app `PipelineErrorCode` used on the wire */
export type ApiPipelineErrorCode =
  | 'no_speech'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'unavailable'
  | 'format_error'
  | 'server_error'
  | 'parse'
  | 'provider_error'
  | 'no_input'
  | 'parse_error'
  | 'validation_failed'
  | 'not_configured'
  | 'not_implemented'
  | 'insufficient_detail'
  | 'regeneration_failed'
  | 'unknown'
  | 'llm_generation_error'
  | 'stub_llm_unconfigured';

export type PipelineFallbackKind = 'empty_output' | 'stub_heuristic';

export interface PipelineFallbackMetadata {
  kind: PipelineFallbackKind;
  reasonCode: ApiPipelineErrorCode;
  validationWarnings?: readonly string[];
}

export type SectionType =
  | 'visit_date_provider'
  | 'what_happened'
  | 'medication_changes'
  | 'next_steps'
  | 'referrals_tests'
  | 'follow_up_appointment';

/** Fixed section order — mirrors app `contracts/schema.ts`. */
export const SECTION_ORDER: SectionType[] = [
  'visit_date_provider',
  'what_happened',
  'medication_changes',
  'next_steps',
  'referrals_tests',
  'follow_up_appointment',
];

export interface SummarySectionDTO {
  sectionType: SectionType;
  content: string;
  sourceType: 'ai_generated' | 'parent_edited' | 'empty';
  isEmpty: boolean;
}

export interface ActionItemDTO {
  id: string;
  visitId: string;
  type: 'medication' | 'follow_up' | 'referral_test' | 'next_step';
  content: string;
  status: 'open' | 'completed' | 'not_scheduled';
  isFlagged: boolean;
  dueDate?: string;
  /** Stage 1 segment ids this item was derived from (traceability). */
  sourceSegmentIds?: readonly string[];
}

export interface AccuracyFlagDTO {
  id: string;
  sectionType: SectionType;
  rawPhrase: string;
  interpretedPhrase: string;
  confidenceScore: number;
  /** Stage 1 segment ids this flag was derived from (traceability). */
  sourceSegmentIds?: readonly string[];
}

/** Mirrors app `GenerateSummaryOutput` fields the API returns */
export interface SummarizeResultBody {
  sections: SummarySectionDTO[];
  actionItems: ActionItemDTO[];
  flags: AccuracyFlagDTO[];
  generatedAt: string;
  validationWarnings?: readonly string[];
}

export type SummarizeSuccessPayload = {
  outcome: 'success';
  summary: SummarizeResultBody;
};

export type SummarizeFallbackPayload = {
  outcome: 'fallback_used';
  summary: SummarizeResultBody;
  fallback: PipelineFallbackMetadata;
};

export type SummarizeFailurePayload = {
  outcome: 'retryable_failure' | 'non_retryable_failure';
  code: ApiPipelineErrorCode;
  message: string;
};

export type SummarizeResult =
  | SummarizeSuccessPayload
  | SummarizeFallbackPayload
  | SummarizeFailurePayload;

// ─── Requests ─────────────────────────────────────────────────────────────────

/** Transcript segment with audio timing, for the two-stage pipeline. */
export interface AudioSegmentPayload {
  segmentIndex: number;
  startSec?: number;
  endSec?: number;
  text: string;
}

/** PDF page payload — text layer and/or page image (base64, no data URL prefix). */
export interface PdfPagePayload {
  pageNumber: number;
  text?: string;
  imageBase64?: string;
  assetId?: string;
}

/** Standalone image payload — base64 bytes (no data URL prefix). */
export interface ImagePayload {
  imageIndex: number;
  imageBase64: string;
  assetId?: string;
}

export interface SummarizeRequestBody {
  visitId: string;
  /** Loose text (e.g. user notes). */
  rawText?: string;
  /** Whole-audio transcript fallback when per-segment timing is unavailable. */
  rawAudioTranscript?: string;
  /** Per-segment audio transcripts with timestamps (preferred). */
  audioSegments?: readonly AudioSegmentPayload[];
  /** PDF pages — text layer or base64 image, consumed by Stage 1. */
  pdfPages?: readonly PdfPagePayload[];
  /** Standalone images (e.g. photos of discharge papers), consumed by Stage 1. */
  images?: readonly ImagePayload[];
  language?: 'en' | 'es';
  visitDate?: string;
}

export interface TranscribeRequestBody {
  /** JSON-only test hooks; production uploads use multipart field `file`. */
  language?: 'en' | 'es';
  /** If true, validation stub returns invalid_request (testing) */
  _stubInvalid?: boolean;
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

export interface ApiSuccessEnvelope<T> {
  ok: true;
  requestId: string;
  result: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  requestId: string;
  error: {
    outcome: Extract<PipelineOutcomeStatus, 'retryable_failure' | 'non_retryable_failure'>;
    code: ApiPipelineErrorCode;
    message: string;
  };
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
