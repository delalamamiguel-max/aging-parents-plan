/**
 * Backend HTTP paths and JSON contracts — mirrors `backend/src/types.ts`.
 * Base URL: set `EXPO_PUBLIC_BACKEND_API_BASE` (e.g. http://192.168.1.10:8787 for device → host).
 */

import type {
  AccuracyFlag,
  ActionItem,
  PipelineFallbackMetadata,
  SummarySection,
} from '../contracts/schema';
import { ENV } from '../config/env';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Public API origin only — never put provider secrets here (ADR-002). */
export function getDefaultBackendBaseUrl(): string {
  return ENV.BACKEND_API_BASE;
}

export const API_PATHS = {
  summarize: '/summarize',
  transcribe: '/transcribe',
  health: '/health',
} as const;

export const DEFAULT_BACKEND_TIMEOUT_MS = 70_000;

// ─── Requests (POST JSON) ─────────────────────────────────────────────────────

export interface SummarizeApiRequest {
  visitId: string;
  rawText?: string;
  rawAudioTranscript?: string;
  language?: 'en' | 'es';
  visitDate?: string;
}

/** Stub JSON body; future: multipart audio to `/transcribe`. */
export interface TranscribeApiRequest {
  language?: 'en' | 'es';
  /** Backend test hook only — omit in production callers */
  _stubInvalid?: boolean;
}

// ─── Summarize result (success paths only — failures use error envelope + throw) ─

export interface SummarizeResultBody {
  sections: SummarySection[];
  actionItems: ActionItem[];
  flags: AccuracyFlag[];
  generatedAt: string;
  validationWarnings?: readonly string[];
}

export type SummarizeApiResult =
  | { outcome: 'success'; summary: SummarizeResultBody }
  | { outcome: 'fallback_used'; summary: SummarizeResultBody; fallback: PipelineFallbackMetadata };

export interface TranscribeApiResultBody {
  transcript: string;
  language: 'en' | 'es';
}

// ─── Raw envelopes (wire format) ──────────────────────────────────────────────

export interface ApiErrorBody {
  ok: false;
  requestId: string;
  error: {
    outcome: 'retryable_failure' | 'non_retryable_failure';
    code: string;
    message: string;
  };
}

export interface ApiSummarizeSuccessBody {
  ok: true;
  requestId: string;
  result: SummarizeApiResult;
}

export interface ApiTranscribeSuccessBody {
  ok: true;
  requestId: string;
  result: TranscribeApiResultBody;
}
