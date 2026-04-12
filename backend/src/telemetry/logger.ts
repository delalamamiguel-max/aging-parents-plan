/**
 * Structured stdout logger for operations/debug (no PHI).
 * Format: single-line JSON for easy grep in production logs.
 */

import type { BackendTelemetryEventName } from './events.js';

export type SafeTelemetryScalar = string | number | boolean | null | undefined;

/** Strip undefined so JSON omits those keys. */
function compact(
  r: Record<string, SafeTelemetryScalar>
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v !== undefined) out[k] = v === null ? null : v;
  }
  return out;
}

/**
 * Emit one structured telemetry line. Never pass user transcript, raw JSON body, or visit identifiers beyond lengths/prefixes agreed by policy.
 */
export function emitTelemetry(
  event: BackendTelemetryEventName,
  requestId: string,
  fields: Record<string, SafeTelemetryScalar> = {}
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    requestId,
    ...compact(fields),
  });
  console.log(line);
}
