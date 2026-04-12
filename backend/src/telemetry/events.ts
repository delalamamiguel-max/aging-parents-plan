/**
 * Backend telemetry event catalog (Person B) — PHI-safe: no transcript, raw body text, or visit content.
 * One JSON line per emission via `telemetry/logger.ts`.
 */

export const BackendTelemetryEvent = {
  /** Incoming HTTP request (method + path only). */
  RequestReceived: 'backend.http.request_received',
  /** Summarize route finished (success or structured error envelope). */
  PipelineSummarizeFinished: 'backend.pipeline.summarize.finished',
  /** Transcribe route finished. */
  PipelineTranscribeFinished: 'backend.pipeline.transcribe.finished',
  /** Unhandled exception in route or top-level handler (no stack in payload). */
  PipelineHandlerException: 'backend.pipeline.handler_exception',
} as const;

export type BackendTelemetryEventName =
  (typeof BackendTelemetryEvent)[keyof typeof BackendTelemetryEvent];
