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
  | 'format_error'
  | 'server_error'
  | 'parse'
  | 'provider_error'
  | 'no_input'
  | 'parse_error'
  | 'validation_failed'
  | 'not_configured'
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
}

export interface AccuracyFlagDTO {
  id: string;
  sectionType: SectionType;
  rawPhrase: string;
  interpretedPhrase: string;
  confidenceScore: number;
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

export interface SummarizeRequestBody {
  visitId: string;
  rawText?: string;
  /** Future: transcript from /transcribe */
  rawAudioTranscript?: string;
  language?: 'en' | 'es';
  visitDate?: string;
}

export interface TranscribeRequestBody {
  /** Stub: optional pretend payload; real impl uses multipart audio */
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
