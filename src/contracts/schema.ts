/**
 * Phase 0: Shared Contracts
 * Source of truth: masterplan.md §6, §9; app-flow-pages-and-roles.md §5
 *
 * Lock these before any feature branch starts.
 */

// ─── Summary state model ─────────────────────────────────────────────────────
// Source: app-flow-pages-and-roles.md §5 "Summary state model"
export type SummaryStatus =
  | 'draft'
  | 'processing'
  | 'ready_for_review'
  | 'saved_private'
  | 'shared'
  | 'revoked'
  | 'pending_parent_approval'
  | 'rejected';

// ─── Action item / task status enum ──────────────────────────────────────────
// Source: masterplan.md §7.5; app-flow-pages-and-roles.md §5
export type TaskStatus = 'open' | 'completed' | 'not_scheduled';

// ─── Capture input types ──────────────────────────────────────────────────────
export type CaptureInputType = 'voice' | 'text' | 'photo';

// ─── Submitter types ──────────────────────────────────────────────────────────
export type SubmitterType = 'parent' | 'adult_child';

// ─── Approval states ──────────────────────────────────────────────────────────
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

// ─── Section types (fixed order — design-guidelines.md §7) ───────────────────
export type SectionType =
  | 'visit_date_provider'
  | 'what_happened'
  | 'medication_changes'
  | 'next_steps'
  | 'referrals_tests'
  | 'follow_up_appointment';

export const SECTION_ORDER: SectionType[] = [
  'visit_date_provider',
  'what_happened',
  'medication_changes',
  'next_steps',
  'referrals_tests',
  'follow_up_appointment',
];

export const SECTION_LABELS: Record<SectionType, string> = {
  visit_date_provider: 'Visit date & provider',
  what_happened: 'What happened',
  medication_changes: 'Medication changes',
  next_steps: 'Next steps',
  referrals_tests: 'Referrals & tests',
  follow_up_appointment: 'Follow-up appointment',
};

// ─── Uncertainty / accuracy flag ──────────────────────────────────────────────
// Source: masterplan.md §7.6
export interface AccuracyFlag {
  id: string;
  sectionType: SectionType;
  rawPhrase: string;
  interpretedPhrase: string;
  confidenceScore: number; // 0–1
}

// ─── Summary section ──────────────────────────────────────────────────────────
export interface SummarySection {
  sectionType: SectionType;
  content: string;
  sourceType: 'ai_generated' | 'parent_edited' | 'empty';
  editedBy?: SubmitterType;
  uncertaintyFlag?: AccuracyFlag;
  isEmpty: boolean;
}

// ─── Action item ──────────────────────────────────────────────────────────────
export interface ActionItem {
  id: string;
  visitId: string;
  type: 'medication' | 'follow_up' | 'referral_test' | 'next_step';
  content: string;
  status: TaskStatus;
  isFlagged: boolean; // if flagged, no reminder until confirmed
  dueDate?: string; // ISO date string
}

// ─── Reminder ────────────────────────────────────────────────────────────────
export interface Reminder {
  id: string;
  actionItemId: string;
  scheduledAt: string; // ISO datetime
  status: 'pending' | 'sent' | 'snoozed' | 'dismissed';
}

// ─── Capture input ────────────────────────────────────────────────────────────
export interface CaptureInput {
  id: string;
  visitId: string;
  inputType: CaptureInputType;
  rawUri?: string; // local file URI for audio/photo
  rawText?: string;
  language: string; // 'en' | 'es'
  isOffline: boolean;
  capturedAt: string;
}

// ─── Visit summary (core entity) ──────────────────────────────────────────────
// Source: masterplan.md §9; implementation-plan.md §Phase 0
export interface VisitSummary {
  id: string;
  parentId: string;
  submitter: SubmitterType;
  submitterName?: string; // for "Captured by [name]" label
  status: SummaryStatus;
  approvalStatus: ApprovalStatus;
  sections: SummarySection[];
  actionItems: ActionItem[];
  flags: AccuracyFlag[];
  captureInputId: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  sharedAt?: string;
  revokedAt?: string;
}

// ─── Link permission ─────────────────────────────────────────────────────────
export interface LinkPermission {
  id: string;
  parentId: string;
  adultChildId: string;
  adultChildName: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt?: string;
}

// ─── Share record ─────────────────────────────────────────────────────────────
export interface ShareRecord {
  id: string;
  visitId: string;
  recipientId: string;
  sharedAt: string;
  revokedAt?: string;
}

// ─── Pipeline outcome / error contract (capture → processing → summary) ───────
// Source: docs/architecture.md; docs/adr/ADR-001-pipeline-outcome-contract.md
// Wire-up in services/screens is future work; types are shared contract only.

/** How a capture processing run finished (orthogonal to `SummaryStatus`). */
export type PipelineOutcomeStatus =
  | 'success'
  | 'fallback_used'
  | 'retryable_failure'
  | 'non_retryable_failure';

/**
 * Machine-readable codes for transcription errors, LLM errors passed into
 * summary fallbacks, summary `buildFallback` reasons, and screen-level failures.
 * String values match `transcriptionService`, `llmClient`, and `summaryService` today.
 */
export const PipelineErrorCode = {
  NoSpeech: 'no_speech',
  Auth: 'auth',
  Network: 'network',
  Timeout: 'timeout',
  FormatError: 'format_error',
  ServerError: 'server_error',
  Parse: 'parse',
  ProviderError: 'provider_error',
  NoInput: 'no_input',
  ParseError: 'parse_error',
  ValidationFailed: 'validation_failed',
  NotConfigured: 'not_configured',
  RegenerationFailed: 'regeneration_failed',
  Unknown: 'unknown',
  /** ProcessingScreen catch-all / analytics when a non-transcription throw escapes. */
  LlmGenerationError: 'llm_generation_error',
  /** Stub path when the LLM is not configured (reserved for explicit metadata when wired). */
  StubLlmUnconfigured: 'stub_llm_unconfigured',
} as const;

export type PipelineErrorCode =
  (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode];

/** Whether the user received empty-section fallback vs heuristic stub content. */
export type PipelineFallbackKind = 'empty_output' | 'stub_heuristic';

/** Metadata when `PipelineOutcomeStatus` is `fallback_used` (or embedded in a full result type). */
export interface PipelineFallbackMetadata {
  kind: PipelineFallbackKind;
  reasonCode: PipelineErrorCode;
  /** e.g. validator warnings from summary pipeline; keep non-PHI. */
  validationWarnings?: readonly string[];
}

// ─── Legal disclaimer copy ────────────────────────────────────────────────────
// Source: masterplan.md §7.6 "Required disclaimer"
export const REQUIRED_DISCLAIMER =
  'This summary was created from your recording. It may not be complete or fully accurate. ' +
  'Please review it carefully and ask your doctor if anything seems wrong. ' +
  'This app does not provide medical advice.';

export const NOT_A_MEDICAL_RECORD_LABEL = 'Not a medical record';

export const AI_GENERATED_LABEL = 'AI-generated — review before relying on it';

// ─── Default reminder timing ──────────────────────────────────────────────────
// Source: masterplan.md §7.5 "Default timing from workbook"
export const DEFAULT_REMINDER_OFFSETS_HOURS: Record<ActionItem['type'], number[]> = {
  medication: [0, 24], // day of visit + day 2
  referral_test: [48], // within 48 hours
  follow_up: [0], // on captured date
  next_step: [24],
};

// ─── Notification payload rules ───────────────────────────────────────────────
// Source: masterplan.md §7.4 "Notification philosophy"
// No PHI in push content: titles and bodies below are PHI-free
export const NOTIFICATION_COPY = {
  summaryShared: {
    title: 'Visit summary ready',
    body: 'A new visit summary has been shared with you.',
  },
  assistedCaptureReady: {
    title: 'Summary waiting for your review',
    body: 'Please review the summary before it is saved.',
  },
  reminderDefault: {
    title: 'A reminder from your visit',
    body: 'You have a follow-up item from a recent visit.',
  },
  missedVisit: {
    title: 'Did you have an appointment today?',
    body: 'Tap to log what happened while it is still fresh.',
  },
} as const;
