/**
 * Analytics Service — Aging Parents Plan
 *
 * Privacy-first telemetry hub.
 * STRICT RULE: Never pass rawText, transcribed notes, or PHI into these payloads.
 * Only boolean flags, enums, counts, and duration metrics.
 */

import {
  CaptureInputType,
  SubmitterType,
  ProcessingOutcome,
} from '../contracts/schema';
import { logger } from '../telemetry/logger';
import { EventName, TelemetryPayload } from '../telemetry/events';

class AnalyticsService {
  private currentRequestId: string | null = null;

  /**
   * Generates a new unique request ID for a pipeline run.
   */
  startNewRequest(): string {
    this.currentRequestId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    return this.currentRequestId;
  }

  getRequestId(): string {
    return this.currentRequestId || 'no-request-id';
  }

  /**
   * Track a telemetry event using the structured logger.
   *
   * The payload is intentionally loose to allow event-specific metadata.
   * Callers are responsible for enforcing PHI rules (see file header):
   * no rawText, no transcripts, no medical details — only booleans, enums,
   * counts, and timing metrics.
   */
  trackEvent(
    eventName: EventName,
    payload: Record<string, unknown> = {}
  ) {
    const fullPayload = {
      ...payload,
      requestId: this.getRequestId(),
      timestamp: new Date().toISOString(),
    };

    logger.log(eventName, fullPayload as unknown as TelemetryPayload);
  }

  /**
   * Helper bindings for pipeline events
   */

  trackPipelineStarted(data: {
    inputType: CaptureInputType;
    isOffline: boolean;
    language: 'en' | 'es';
    retryCount: number;
    role: 'parent' | 'adult_child';
  }) {
    logger.log('pipeline_started', {
      requestId: this.getRequestId(),
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  trackPipelineCompleted(data: {
    durationMs: number;
    transcriptionDurationMs?: number;
    generationDurationMs: number;
    outcome: ProcessingOutcome;
    sectionCount: number;
    actionItemCount: number;
    flagCount: number;
    role: 'parent' | 'adult_child';
  }) {
    logger.log('pipeline_completed', {
      requestId: this.getRequestId(),
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  trackPipelineFailed(data: {
    errorType: string;
    errorCode?: string;
    errorPhase: 'transcription' | 'generation' | 'unknown';
    retryCount: number;
    role: 'parent' | 'adult_child';
  }) {
    logger.log('pipeline_failed', {
      requestId: this.getRequestId(),
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Emitted when the user initiates a capture (voice/text/photo).
   * Keep PHI-free: only the input type and the submitter role.
   */
  trackCaptureStarted(inputType: CaptureInputType, role: SubmitterType) {
    logger.log('capture_started', {
      requestId: this.getRequestId(),
      timestamp: new Date().toISOString(),
      inputType,
      role,
    });
  }

  /**
   * Legacy shim to prevent breaking existing code during migration.
   * TODO: Migrate all callers to trackPipeline* methods.
   */
  trackCaptureCompleted(durationSecs: number, inputType: CaptureInputType, wasOffline: boolean) {
    this.trackEvent('pipeline_completed' as any, { 
      durationMs: durationSecs * 1000, 
      inputType, 
      isOffline: wasOffline,
      outcome: 'success',
      generationDurationMs: durationSecs * 1000,
      sectionCount: 0,
      actionItemCount: 0,
      flagCount: 0
    } as any);
  }

  trackCaptureFailed(reason: string, inputType: CaptureInputType) {
    this.trackEvent('pipeline_failed' as any, { 
      errorType: reason, 
      inputType, 
      errorPhase: 'unknown',
      retryCount: 0 
    } as any);
  }
}

export const analytics = new AnalyticsService();
