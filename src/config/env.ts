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
 * 2. Add your Gemini API key from https://aistudio.google.com/app/apikey
 * 3. Restart the Expo server
 */

// Expo exposes env vars prefixed with EXPO_PUBLIC_ to the client bundle.
// Non-prefixed vars are only available in server/EAS contexts.

export const ENV = {
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
  LLM_PROVIDER: (process.env.EXPO_PUBLIC_LLM_PROVIDER ?? 'gemini') as 'gemini' | 'ollama',
  OLLAMA_BASE_URL: process.env.EXPO_PUBLIC_OLLAMA_BASE_URL ?? 'http://localhost:11434',
  OLLAMA_MODEL: process.env.EXPO_PUBLIC_OLLAMA_MODEL ?? 'gemma3',
} as const;

/**
 * Returns true if the AI pipeline is ready to use.
 * Used by summaryService to decide whether to call real LLM or show an error.
 */
export function isAIConfigured(): boolean {
  if (ENV.LLM_PROVIDER === 'gemini') {
    return ENV.GEMINI_API_KEY.length > 0;
  }
  if (ENV.LLM_PROVIDER === 'ollama') {
    return ENV.OLLAMA_BASE_URL.length > 0;
  }
  return false;
}
