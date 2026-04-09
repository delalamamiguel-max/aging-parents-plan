/**
 * Environment configuration — Aging Parents Plan
 *
 * Key rules:
 * - NEVER commit actual key values to git
 * - .env is in .gitignore
 * - All consumers import from this file, not process.env directly
 *
 * Setup:
 * 1. Copy .env.example to .env
 * 2. Fill in your keys / provider choices
 * 3. Restart the Expo server (Ctrl-C then `npx expo start`)
 */

// Expo exposes env vars prefixed with EXPO_PUBLIC_ to the client bundle.

export const ENV = {
  // ── LLM (Gemma 3 via Ollama, or Gemini cloud) ────────────────────────────
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  LLM_PROVIDER: (process.env.EXPO_PUBLIC_LLM_PROVIDER ?? 'gemini') as 'gemini' | 'ollama',
  OLLAMA_BASE_URL: process.env.EXPO_PUBLIC_OLLAMA_BASE_URL ?? 'http://localhost:11434',
  OLLAMA_MODEL: process.env.EXPO_PUBLIC_OLLAMA_MODEL ?? 'gemma3',

  // ── Transcription (Whisper local server, or OpenAI Whisper API) ───────────
  WHISPER_PROVIDER: (process.env.EXPO_PUBLIC_WHISPER_PROVIDER ?? 'local') as 'local' | 'openai',
  WHISPER_LOCAL_URL: process.env.EXPO_PUBLIC_WHISPER_LOCAL_URL ?? 'http://localhost:9000',
  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  // Model used by the local whisper_server.py ('tiny', 'base', 'small', 'medium')
  WHISPER_MODEL: process.env.EXPO_PUBLIC_WHISPER_MODEL ?? 'base',
} as const;

// ─── Capability guards ────────────────────────────────────────────────────────

/** True if the LLM summarisation pipeline is ready */
export function isAIConfigured(): boolean {
  if (ENV.LLM_PROVIDER === 'gemini') return ENV.GEMINI_API_KEY.length > 0;
  if (ENV.LLM_PROVIDER === 'ollama') return ENV.OLLAMA_BASE_URL.length > 0;
  return false;
}

/** True if the transcription pipeline is ready */
export function isTranscriptionConfigured(): boolean {
  if (ENV.WHISPER_PROVIDER === 'local') return ENV.WHISPER_LOCAL_URL.length > 0;
  if (ENV.WHISPER_PROVIDER === 'openai') return ENV.OPENAI_API_KEY.length > 0;
  return false;
}
