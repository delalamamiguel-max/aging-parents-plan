/**
 * Server-only environment — never import this module from the mobile app.
 *
 * Load from `backend/.env` (see `backend/.env.example`). Variables are not
 * prefixed with EXPO_PUBLIC_; they are not bundled into any client.
 */

export const serverEnv = {
  BACKEND_PORT: Number(process.env.BACKEND_PORT ?? '8787'),

  /** Summarisation / LLM */
  LLM_PROVIDER: (process.env.LLM_PROVIDER ?? 'ollama') as 'gemini' | 'ollama',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'gemma3:4b',

  /** Transcription / Whisper */
  WHISPER_PROVIDER: (process.env.WHISPER_PROVIDER ?? 'local') as 'local' | 'openai',
  WHISPER_LOCAL_URL: process.env.WHISPER_LOCAL_URL ?? 'http://127.0.0.1:9000',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  WHISPER_MODEL: process.env.WHISPER_MODEL ?? 'base',
} as const;

/** For logs and readiness checks — no secret values. */
export function getServerConfigSummary(): string {
  return [
    `port=${serverEnv.BACKEND_PORT}`,
    `LLM=${serverEnv.LLM_PROVIDER}${
      serverEnv.LLM_PROVIDER === 'ollama'
        ? ` (${serverEnv.OLLAMA_MODEL} @ ${serverEnv.OLLAMA_BASE_URL})`
        : ` (GEMINI_API_KEY: ${serverEnv.GEMINI_API_KEY ? 'set' : 'MISSING'})`
    }`,
    `Whisper=${serverEnv.WHISPER_PROVIDER}${
      serverEnv.WHISPER_PROVIDER === 'local'
        ? ` @ ${serverEnv.WHISPER_LOCAL_URL}`
        : ` (OPENAI_API_KEY: ${serverEnv.OPENAI_API_KEY ? 'set' : 'MISSING'})`
    }`,
  ].join(' | ');
}
