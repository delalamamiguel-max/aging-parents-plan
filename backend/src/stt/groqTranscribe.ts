/**
 * Speech-to-text via Groq's hosted Whisper (OpenAI-compatible endpoint).
 *
 *   POST {GROQ_BASE_URL}/openai/v1/audio/transcriptions
 *   Authorization: Bearer {GROQ_API_KEY}
 *   multipart/form-data: file=<audio>, model=<STT_MODEL>, language=en|es
 *
 * Chosen because:
 *   - Ollama Cloud has no ASR endpoint (see session-handoff-stt-ollama-500.md).
 *   - `whisper-large-v3-turbo` is high quality, bilingual-friendly (EN/ES),
 *     and typically returns in < 1s.
 *   - API key is server-side only (ADR-002: no client secrets).
 *
 * Error contract:
 *   Errors thrown from here are strings that `mapTranscribeFailure` recognises:
 *     "STT auth failed (…)"            → code=auth
 *     "STT rate limited (…)"           → code=unavailable
 *     "STT file rejected (…)"          → code=format_error
 *     "STT timed out after {ms}ms"     → code=timeout
 *     "Cannot reach STT provider (…)"  → code=network
 *     "STT HTTP {status}: {body}"      → code=server_error
 */

import { serverEnv } from '../config/env.js';

const SUPPORTED_EXTENSIONS = new Set([
  'flac',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'm4a',
  'ogg',
  'wav',
  'webm',
]);

function filenameFromMime(mimeType: string): string {
  const mt = mimeType.toLowerCase();
  if (mt.includes('mp4') || mt.includes('m4a') || mt.includes('aac')) return 'recording.m4a';
  if (mt.includes('wav')) return 'recording.wav';
  if (mt.includes('webm')) return 'recording.webm';
  if (mt.includes('ogg')) return 'recording.ogg';
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'recording.mp3';
  if (mt.includes('flac')) return 'recording.flac';
  return 'recording.m4a';
}

function ensureSupportedFilename(name: string): void {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `STT file rejected (unsupported extension ".${ext}"). ` +
        `Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}.`
    );
  }
}

interface GroqTranscriptionResponse {
  text?: string;
}

function isGroqTranscriptionResponse(v: unknown): v is GroqTranscriptionResponse {
  return !!v && typeof v === 'object' && 'text' in v;
}

/**
 * Transcribe a single audio buffer via Groq Whisper.
 * Returns the trimmed transcript (may be empty — caller handles no_speech).
 */
export async function transcribeWithGroq(
  audio: Buffer,
  mimeType: string,
  language: 'en' | 'es',
  log: {
    info: (m: string, meta?: Record<string, unknown>) => void;
    warn: (m: string, meta?: Record<string, unknown>) => void;
  }
): Promise<string> {
  const base = serverEnv.GROQ_BASE_URL.replace(/\/$/, '');
  const url = `${base}/openai/v1/audio/transcriptions`;
  const model = serverEnv.STT_MODEL;
  const timeoutMs = serverEnv.STT_TIMEOUT_MS;

  if (!serverEnv.GROQ_API_KEY.trim()) {
    throw new Error('STT auth failed (GROQ_API_KEY is not set)');
  }

  const filename = filenameFromMime(mimeType);
  ensureSupportedFilename(filename);

  // Node 18+ globals: Blob / FormData / fetch / AbortController.
  // We pass the Buffer straight to Blob (Buffer is a Uint8Array subclass).
  const blob = new Blob([new Uint8Array(audio)], {
    type: mimeType || 'application/octet-stream',
  });

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  log.info('stt.groq.request', {
    model,
    language,
    bytes: audio.length,
    mimeType: mimeType.slice(0, 48),
    timeoutMs,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.GROQ_API_KEY}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    const aborted =
      (e instanceof Error && e.name === 'AbortError') || msg.toLowerCase().includes('abort');
    if (aborted) {
      throw new Error(`STT timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Cannot reach STT provider at ${base}: ${msg}`);
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => '');
    throw new Error(`STT auth failed (${response.status}): ${body.slice(0, 200)}`);
  }
  if (response.status === 413) {
    const body = await response.text().catch(() => '');
    throw new Error(`STT file rejected (413 too large): ${body.slice(0, 200)}`);
  }
  if (response.status === 415 || response.status === 422 || response.status === 400) {
    const body = await response.text().catch(() => '');
    throw new Error(`STT file rejected (${response.status}): ${body.slice(0, 200)}`);
  }
  if (response.status === 429) {
    const body = await response.text().catch(() => '');
    throw new Error(`STT rate limited (429): ${body.slice(0, 200)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`STT HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`STT HTTP 200 but invalid JSON: ${msg}`);
  }

  if (!isGroqTranscriptionResponse(parsed) || typeof parsed.text !== 'string') {
    throw new Error('STT response missing "text" field');
  }

  const text = parsed.text.trim();
  log.info('stt.groq.done', { chars: text.length });
  return text;
}
