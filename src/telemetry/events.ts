/**
 * Telemetry Event Taxonomy — Aging Parents Plan
 * 
 * Defines all valid analytics events and their payload schemas.
 * 
 * PHI SAFETY RULES:
 * 1. NEVER include rawText, rawAudioTranscript, or notes.
 * 2. NEVER include PHI fields from summaries (meds, names, etc.).
 * 3. EXCLUDE identifiable PII unless specifically necessary for correlation.
 */

import type {
  CaptureInputType,
  SubmitterType,
  PipelineOutcomeStatus,
} from '../contracts/schema';

export type EventName =
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'pipeline_failed'
  | 'summary_review_opened'
  | 'summary_action_taken' // approved, rejected, shared
  | 'summary_saved_private'
  | 'summary_approved'
  | 'summary_rejected'
  | 'capture_started'
  | 'app_foregrounded';

export interface BasePayload {
  requestId: string;
  timestamp: string;
  role: SubmitterType;
}

export interface PipelineStartedPayload extends BasePayload {
  inputType: CaptureInputType;
  isOffline: boolean;
  language: 'en' | 'es';
  retryCount: number;
}

export interface PipelineCompletedPayload extends BasePayload {
  durationMs: number;
  transcriptionDurationMs?: number;
  generationDurationMs: number;
  // Narrowed to the "completed" subset of outcomes.
  // Failure outcomes use `PipelineFailedPayload` instead.
  outcome: Extract<PipelineOutcomeStatus, 'success' | 'fallback_used'>;
  sectionCount: number;
  actionItemCount: number;
  flagCount: number;
}

export interface PipelineFailedPayload extends BasePayload {
  errorType: string;
  errorCode?: string;
  errorPhase: 'transcription' | 'generation' | 'unknown';
  retryCount: number;
}

export interface SummaryActionPayload extends BasePayload {
  summaryId: string;
  action: 'approve' | 'reject' | 'share';
}

export type TelemetryPayload = 
  | PipelineStartedPayload 
  | PipelineCompletedPayload 
  | PipelineFailedPayload 
  | SummaryActionPayload 
  | BasePayload;
