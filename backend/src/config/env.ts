/**
 * Server-only environment — never import this module from the mobile app.
 *
 * Load from `backend/.env` (see `backend/.env.example`). Variables are not
 * prefixed with EXPO_PUBLIC_; they are not bundled into any client.
 *
 * POLICY (ADR-002 + "cloud-only LLM"): summarisation MUST use Ollama Cloud
 * (HTTPS + bearer API key). Local Ollama daemons and Gemini are not supported.
 *
 * PIPELINE (two-model, sequential):
 *   Stage 1 — `OLLAMA_EXTRACTION_MODEL` (default `gemma4:31b-cloud`):
 *     OCR + PDF text extraction. Produces normalized text with page/source
 *     refs preserved.
 *   Stage 2 — `OLLAMA_STRUCTURED_MODEL` (default `ministral-3:14b-cloud`):
 *     Context-aware parsing and structured extraction over Stage 1 output.
 *     MUST be a non-thinking instruct model — thinking cloud tags hang on
 *     format:'json' and return empty content (see Stage 2 history in
 *     `docs/session-handoff-stt-ollama-500.md`).
 *
 * Rule: Stage 2 MUST NOT receive raw OCR/audio; Stage 1 MUST NOT be skipped.
 * The extraction pipeline (`backend/src/extraction/pipeline.ts`) enforces
 * this ordering.
 *
 * SPEECH-TO-TEXT (separate service — Ollama Cloud has no audio modality):
 *   POST /transcribe uses `STT_PROVIDER` (default `groq`) against a dedicated
 *   hosted ASR model (default `whisper-large-v3-turbo`). The API key is held
 *   server-side only; client never talks to the STT provider directly.
 */

/**
 * Resolve Stage 1 / Stage 2 model names, with a one-step backwards-compatible
 * fall-through to the legacy `OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL` vars.
 * The legacy vars are treated as aliases ONLY; new deployments should set the
 * new vars explicitly.
 */
function resolveStageModels(): { extraction: string; structured: string } {
  const legacyPrimary = (process.env.OLLAMA_MODEL ?? '').trim();
  const legacyFallback = (process.env.OLLAMA_FALLBACK_MODEL ?? '').trim();

  // Stage 2 default is `ministral-3:14b-cloud` (non-thinking, instruction-tuned
  // Mistral, 14B, 256K context, vision+tools). We moved off `qwen3.5:cloud`
  // because that cloud tag silently runs extended reasoning and often returns
  // HTTP 200 with empty `message.content` (done_reason=stop, 50+ seconds of
  // compute) when combined with `format: 'json'`. Ministral is a straight
  // instruct model and is well-behaved for structured output.
  const extraction = (process.env.OLLAMA_EXTRACTION_MODEL ?? '').trim() || legacyPrimary || 'gemma4:31b-cloud';
  const structured = (process.env.OLLAMA_STRUCTURED_MODEL ?? '').trim() || legacyFallback || 'ministral-3:14b-cloud';

  return { extraction, structured };
}

const stageModels = resolveStageModels();

export type SttProvider = 'groq';

function resolveSttProvider(): SttProvider {
  const raw = (process.env.STT_PROVIDER ?? 'groq').trim().toLowerCase();
  if (raw === 'groq' || raw === '') return 'groq';
  throw new Error(
    `Unsupported STT_PROVIDER="${raw}". Supported: "groq". ` +
      'Set STT_PROVIDER=groq in backend/.env.'
  );
}

const sttProvider: SttProvider = resolveSttProvider();

export const serverEnv = {
  BACKEND_PORT: Number(process.env.BACKEND_PORT ?? '8787'),

  /** Summarisation / LLM — Ollama Cloud only. */
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'https://ollama.com',

  /**
   * Stage 1 — OCR + PDF text extraction (text/vision only; no audio).
   * Default: `gemma4:31b-cloud`.
   */
  OLLAMA_EXTRACTION_MODEL: stageModels.extraction,

  /**
   * Stage 2 — context-aware structured extraction.
   * Default: `qwen3.5:cloud`.
   */
  OLLAMA_STRUCTURED_MODEL: stageModels.structured,

  /** Required — never log this value. */
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? '',

  /** Outbound Ollama chat timeout (ms). Applies per summarize stage. */
  OLLAMA_TIMEOUT_MS: Number(process.env.OLLAMA_TIMEOUT_MS ?? '120000'),

  /**
   * Speech-to-text (POST /transcribe).
   * Ollama Cloud does not offer an ASR endpoint; STT is delegated to a
   * dedicated provider. Default is Groq (OpenAI-compatible `/v1/audio/transcriptions`).
   */
  STT_PROVIDER: sttProvider,

  /** Hosted ASR model. Default: `whisper-large-v3-turbo` (fast + high quality). */
  STT_MODEL: (process.env.STT_MODEL ?? '').trim() || 'whisper-large-v3-turbo',

  /**
   * End-to-end budget for an STT call in ms. Groq Whisper turbo typically
   * returns in < 1s for short clips; 60s covers cold starts and long clips.
   */
  STT_TIMEOUT_MS: Number(process.env.STT_TIMEOUT_MS ?? '60000'),

  /** Provider base URL — used only when STT_PROVIDER=groq. */
  GROQ_BASE_URL: (process.env.GROQ_BASE_URL ?? '').trim() || 'https://api.groq.com',

  /** Required when STT_PROVIDER=groq — never log this value. */
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
} as const;

/**
 * Fail fast if LLM or STT config is invalid. Call from server startup.
 * Returns the list of fatal problems (empty = OK).
 */
export function validateServerEnv(): string[] {
  const errors: string[] = [];
  const base = serverEnv.OLLAMA_BASE_URL.trim();

  if (!base.startsWith('https://')) {
    errors.push(
      `OLLAMA_BASE_URL must start with https:// (got "${base}"). ` +
        'Local/HTTP Ollama daemons are disabled — use Ollama Cloud.'
    );
  }
  if (!serverEnv.OLLAMA_API_KEY.trim()) {
    errors.push('OLLAMA_API_KEY is required (Ollama Cloud bearer token).');
  }
  if (!serverEnv.OLLAMA_EXTRACTION_MODEL.trim()) {
    errors.push('OLLAMA_EXTRACTION_MODEL is required (Stage 1: OCR/PDF → text).');
  }
  if (!serverEnv.OLLAMA_STRUCTURED_MODEL.trim()) {
    errors.push('OLLAMA_STRUCTURED_MODEL is required (Stage 2: structured extraction).');
  }
  if (
    serverEnv.OLLAMA_EXTRACTION_MODEL.trim() &&
    serverEnv.OLLAMA_EXTRACTION_MODEL.trim() === serverEnv.OLLAMA_STRUCTURED_MODEL.trim()
  ) {
    errors.push(
      'OLLAMA_EXTRACTION_MODEL and OLLAMA_STRUCTURED_MODEL must be distinct: ' +
        'stage 1 (extraction/OCR) and stage 2 (structured extraction) intentionally use different models.'
    );
  }

  if (serverEnv.STT_PROVIDER === 'groq') {
    if (!serverEnv.GROQ_API_KEY.trim()) {
      errors.push(
        'GROQ_API_KEY is required when STT_PROVIDER=groq. ' +
          'Create one at https://console.groq.com/keys and paste it into backend/.env.'
      );
    }
    const groqBase = serverEnv.GROQ_BASE_URL.trim();
    if (!groqBase.startsWith('https://')) {
      errors.push(
        `GROQ_BASE_URL must start with https:// (got "${groqBase}").`
      );
    }
    if (!serverEnv.STT_MODEL.trim()) {
      errors.push('STT_MODEL is required (e.g. whisper-large-v3-turbo).');
    }
  }
  return errors;
}

/** For logs and readiness checks — no secret values. */
export function getServerConfigSummary(): string {
  const sttSummary =
    serverEnv.STT_PROVIDER === 'groq'
      ? `STT=groq @ ${serverEnv.GROQ_BASE_URL} model=${serverEnv.STT_MODEL} (apiKey: ${
          serverEnv.GROQ_API_KEY ? 'set' : 'MISSING'
        })`
      : `STT=${serverEnv.STT_PROVIDER as string}`;

  return [
    `port=${serverEnv.BACKEND_PORT}`,
    `LLM=ollama-cloud @ ${serverEnv.OLLAMA_BASE_URL} (apiKey: ${
      serverEnv.OLLAMA_API_KEY ? 'set' : 'MISSING'
    })`,
    `stage1=${serverEnv.OLLAMA_EXTRACTION_MODEL}`,
    `stage2=${serverEnv.OLLAMA_STRUCTURED_MODEL}`,
    sttSummary,
    `sttTimeoutMs=${serverEnv.STT_TIMEOUT_MS}`,
  ].join(' | ');
}
