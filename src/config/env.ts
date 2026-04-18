/**
 * Environment configuration — Aging Parents Plan
 *
 * POLICY (ADR-002): summarisation and transcription run on the backend only.
 * No LLM/STT API keys in the Expo bundle. Voice capture POSTs audio to
 * `/transcribe` on the same host as `/summarize`. Summarisation uses Ollama
 * Cloud; transcription uses the backend's configured STT provider (Groq
 * Whisper by default).
 *
 * Setup:
 * 1. Copy .env.example to .env
 * 2. Set EXPO_PUBLIC_BACKEND_API_BASE (device: your Mac's LAN IP, e.g. http://192.168.1.73:8787)
 * 3. Restart the Expo server (Ctrl-C then `npx expo start -c`)
 */

export const ENV = {
  /** HTTP origin of the Node backend (no path, no trailing slash). */
  BACKEND_API_BASE: (process.env.EXPO_PUBLIC_BACKEND_API_BASE ?? 'http://127.0.0.1:8787').replace(
    /\/$/,
    ''
  ),

  /**
   * Kept for backward compatibility with existing callers / tests.
   * Always true — the client no longer has a local LLM fallback.
   */
  USE_BACKEND_PIPELINE: true as const,
} as const;

// ─── Capability guards ────────────────────────────────────────────────────────

/** True if voice transcription can run (backend URL configured). */
export function isTranscriptionConfigured(): boolean {
  return ENV.BACKEND_API_BASE.length > 0;
}

/** True if summarisation can run — requires a reachable backend (cloud LLM). */
export function isAIConfigured(): boolean {
  return ENV.BACKEND_API_BASE.length > 0;
}

/** Human-readable summary of the current AI config — for logging only. */
export function getAIConfigSummary(): string {
  return [
    `Backend: ${ENV.BACKEND_API_BASE}`,
    'Summarize: Ollama Cloud (backend)',
    'Transcribe: backend /transcribe (STT provider configured server-side)',
  ].join(' | ');
}
