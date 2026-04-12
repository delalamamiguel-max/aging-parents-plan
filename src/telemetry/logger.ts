/**
 * Telemetry Logger — Aging Parents Plan
 * 
 * PHI-safe wrapper for system logging.
 * Scrubs potential PII/PHI before outputting to the transport (console/backend).
 */

import { EventName, TelemetryPayload } from './events';

class TelemetryLogger {
  private isDevelopment = true; // Use __DEV__ in React Native

  /**
   * Log a structured event.
   */
  log(eventName: EventName, payload: TelemetryPayload) {
    const scrubbedPayload = this.scrubPayload(payload);
    
    if (this.isDevelopment) {
      console.log(`[Telemetry] 📊 ${eventName}`, JSON.stringify(scrubbedPayload, null, 2));
    }
    
    // In a future phase, this would send to a central collector (e.g. /api/telemetry)
  }

  /**
   * Log an error event with standard structure.
   */
  error(message: string, error: unknown, context?: Record<string, unknown>) {
    console.error(`[Telemetry] 🛑 ${message}`, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
  }

  /**
   * Ensures no accidental PHI leakage by filtering for allowed fields.
   * This is a "Deny-by-Default" approach.
   */
  private scrubPayload(payload: TelemetryPayload): Record<string, any> {
    const result: Record<string, any> = {};
    
    // List of explicitly allowed keys across all event types
    const ALLOWED_KEYS = new Set([
      'requestId', 'timestamp', 'role', 
      'inputType', 'isOffline', 'language', 'retryCount',
      'durationMs', 'transcriptionDurationMs', 'generationDurationMs', 
      'outcome', 'sectionCount', 'actionItemCount', 'flagCount',
      'errorType', 'errorCode', 'errorPhase',
      'summaryId', 'action'
    ]);

    Object.keys(payload).forEach(key => {
      if (ALLOWED_KEYS.has(key)) {
        result[key] = (payload as any)[key];
      }
    });

    return result;
  }
}

export const logger = new TelemetryLogger();
