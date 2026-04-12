/**
 * Environment configuration — Aging Parents Plan
 *
 * Key rules:
 * - NEVER commit actual key values to git
 * - .env is in .gitignore
 * - All consumers import from this file, not process.env directly
 *
 * Preferred (client-safe): public backend URL + feature flags only.
 * Legacy: direct LLM/Whisper env vars remain supported until all calls go through the backend.
 *
 * Setup:
 * 1. Copy .env.example to .env
 * 2. Set EXPO_PUBLIC_BACKEND_API_BASE for the Node backend (device: use host LAN IP)
 * 3. Restart the Expo server (Ctrl-C then `npx expo start`)
 */

// Expo exposes env vars prefixed with EXPO_PUBLIC_ to the client bundle.

export const ENV = {
  // ── Preferred: client-safe (public backend + flags) ─────────────────────────
  /** HTTP origin of the Node backend (no path, no trailing slash). */
  BACKEND_API_BASE: (process.env.EXPO_PUBLIC_BACKEND_API_BASE ?? 'http://127.0.0.1:8787').replace(
    /\/$/,
    ''
  ),
  /**
   * When true, summarisation/transcription should use the backend HTTP API once wired.
   * Legacy client-side LLM/Whisper paths remain when false (default).
   */
  FEATURE_BACKEND_AI: (process.env.EXPO_PUBLIC_FEATURE_BACKEND_AI ?? '0').trim() === '1',

  // ── Legacy: direct client-side providers (still supported) ──────────────────
  // Do not use production secrets here — values are visible in the bundle (ADR-002).
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  LLM_PROVIDER: (process.env.EXPO_PUBLIC_LLM_PROVIDER ?? 'ollama') as 'gemini' | 'ollama',
  OLLAMA_BASE_URL: process.env.EXPO_PUBLIC_OLLAMA_BASE_URL ?? 'http://localhost:11434',
  OLLAMA_MODEL: process.env.EXPO_PUBLIC_OLLAMA_MODEL ?? 'gemma3:4b',

  WHISPER_PROVIDER: (process.env.EXPO_PUBLIC_WHISPER_PROVIDER ?? 'local') as 'local' | 'openai',
  WHISPER_LOCAL_URL: process.env.EXPO_PUBLIC_WHISPER_LOCAL_URL ?? 'http://localhost:9000',
  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  WHISPER_MODEL: process.env.EXPO_PUBLIC_WHISPER_MODEL ?? 'base',
} as const;

// ─── Capability guards ────────────────────────────────────────────────────────

/** True if the LLM summarisation pipeline is ready */
export function isAIConfigured(): boolean {
  if (ENV.LLM_PROVIDER === 'gemini') return ENV.GEMINI_API_KEY.length > 0;
  if (ENV.LLM_PROVIDER === 'ollama') return ENV.OLLAMA_BASE_URL.length > 0 && ENV.OLLAMA_MODEL.length > 0;
  return false;
}

/** True if the transcription pipeline is ready */
export function isTranscriptionConfigured(): boolean {
  if (ENV.WHISPER_PROVIDER === 'local') return ENV.WHISPER_LOCAL_URL.length > 0;
  if (ENV.WHISPER_PROVIDER === 'openai') return ENV.OPENAI_API_KEY.length > 0;
  return false;
}

/** Returns a human-readable summary of the current AI config — for logging only */
export function getAIConfigSummary(): string {
  return [
    `Backend: ${ENV.BACKEND_API_BASE} | FEATURE_BACKEND_AI=${ENV.FEATURE_BACKEND_AI}`,
    `LLM: ${ENV.LLM_PROVIDER}${
      ENV.LLM_PROVIDER === 'ollama'
        ? ` (${ENV.OLLAMA_MODEL} @ ${ENV.OLLAMA_BASE_URL})`
        : ` (key: ${ENV.GEMINI_API_KEY ? 'set' : 'MISSING'})`
    }`,
    `Transcription: ${ENV.WHISPER_PROVIDER}${
      ENV.WHISPER_PROVIDER === 'local'
        ? ` @ ${ENV.WHISPER_LOCAL_URL}`
        : ` (key: ${ENV.OPENAI_API_KEY ? 'set' : 'MISSING'})`
    }`,
  ].join(' | ');
}
