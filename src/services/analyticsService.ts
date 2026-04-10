/**
 * Analytics Service — Aging Parents Plan
 *
 * Privacy-first telemetry hub.
 * STRICT RULE: Never pass rawText, transcribed notes, or PHI into these payloads.
 * Only boolean flags, enums, counts, and duration metrics.
 */

import { CaptureInputType, SubmitterType } from '../contracts/schema';

// List of allowed events to prevent typos and enforce taxonomy
type AppEvent =
  | 'app_opened'
  | 'capture_started'
  | 'capture_completed'
  | 'capture_failed'
  | 'summary_saved_private'
  | 'summary_shared'
  | 'summary_approved'
  | 'summary_rejected'
  | 'reminder_scheduled';

interface EventPayload {
  [key: string]: string | number | boolean;
}

class AnalyticsService {
  private isEnabled = true;

  /**
   * Track a standard user action or system event.
   */
  trackEvent(eventName: AppEvent, payload?: EventPayload) {
    if (!this.isEnabled) return;

    // In a real app this would batch and send to PostHog, Mixpanel, etc.
    // For MVP, we log to Metro to prove the QA hook works securely.
    console.log(`[Analytics] 📊 EVENT: ${eventName}`, payload ? payload : '');
  }

  /**
   * Track an application boundary error.
   */
  trackError(errorName: string, errorMessage: string, contextualData?: EventPayload) {
    if (!this.isEnabled) return;

    // Only log the structure of the error, never the user data that caused it
    console.error(`[Analytics] 🛑 ERROR: ${errorName}`, {
      message: errorMessage,
      ...contextualData,
    });
  }

  // Helper bindings for common events

  trackCaptureStarted(inputType: CaptureInputType, submitter: SubmitterType) {
    this.trackEvent('capture_started', { inputType, submitter });
  }

  trackCaptureCompleted(durationSecs: number, inputType: CaptureInputType, wasOffline: boolean) {
    this.trackEvent('capture_completed', { durationSecs, inputType, wasOffline });
  }

  trackCaptureFailed(reason: string, inputType: CaptureInputType) {
    this.trackEvent('capture_failed', { reason, inputType });
  }
}

export const analytics = new AnalyticsService();
