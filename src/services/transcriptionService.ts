/**
 * Transcription Service — Aging Parents Plan
 * Source: implementation-plan.md §Whisper Transcription
 *
 * Provider-agnostic audio → text transcription layer.
 * Supports:
 *   'local'  — POST to local whisper_server.py (http://localhost:9000)
 *   'openai' — POST to OpenAI Whisper API  (api.openai.com)
 *
 * Uses the expo-file-system legacy API for multipart uploads.
 * Returns the raw transcript string.
 * Throws TranscriptionError with a code so callers can show appropriate UI.
 */

import {
  getInfoAsync,
  uploadAsync,
  FileSystemUploadType,
} from 'expo-file-system/legacy';
import { transcribeViaBackend, isApiClientError } from '../api/client';
import { ENV } from '../config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadResult {
  status: number;
  body: string;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'no_speech'
      | 'auth'
      | 'network'
      | 'timeout'
      | 'format_error'
      | 'server_error'
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/** User-facing messages keyed by error code. */
export const TRANSCRIPTION_ERROR_MESSAGES: Record<TranscriptionError['code'], string> = {
  no_speech:    "We couldn't hear anything clearly. Tap Record again and speak a little louder.",
  auth:         'Transcription is not set up yet. Please check your API key in .env.',
  network:      'Could not reach the transcription server. Make sure it is running.',
  timeout:      'Transcription took too long. Try a shorter recording.',
  format_error: 'The audio file could not be read. Try recording again.',
  server_error: 'Something went wrong on the transcription server. Try again.',
};

const TIMEOUT_MS = 60_000;

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Transcribe an audio file at the given local URI.
 *
 * @param audioUri   Local file URI from expo-av (e.g. file:///path/to/recording.m4a)
 * @param language   'en' | 'es' — passed to Whisper to improve accuracy
 * @returns          Raw transcript string
 */
export async function transcribeAudio(
  audioUri: string,
  language: 'en' | 'es' = 'en'
): Promise<string> {
  if (ENV.USE_BACKEND_PIPELINE && ENV.BACKEND_API_BASE.length > 0) {
    try {
      const { result } = await transcribeViaBackend({ language });
      // Backend currently uses a JSON stub (no multipart audio yet). Prefer legacy for real files when needed.
      return result.transcript;
    } catch (e) {
      if (isApiClientError(e)) {
        console.warn(
          `[transcriptionService] Backend transcribe failed (${e.code}), using legacy path. requestId=${e.requestId ?? 'n/a'}`
        );
      } else {
        console.warn('[transcriptionService] Backend transcribe threw, using legacy path:', e);
      }
    }
  }

  if (ENV.WHISPER_PROVIDER === 'local') {
    return transcribeLocal(audioUri, language);
  }
  if (ENV.WHISPER_PROVIDER === 'openai') {
    return transcribeOpenAI(audioUri, language);
  }
  throw new TranscriptionError(
    `Unknown WHISPER_PROVIDER: ${ENV.WHISPER_PROVIDER}`,
    'server_error'
  );
}

// ─── Local Whisper server ─────────────────────────────────────────────────────

async function transcribeLocal(
  audioUri: string,
  language: 'en' | 'es'
): Promise<string> {
  const endpoint = `${ENV.WHISPER_LOCAL_URL}/transcribe`;

  // Verify file exists
  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new TranscriptionError(`Audio file not found: ${audioUri}`, 'format_error');
  }

  let response: UploadResult;
  try {
    response = await withTimeout(
      uploadAsync(endpoint, audioUri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        parameters: { language },
      }),
      TIMEOUT_MS,
      'Local Whisper server timed out after 60 seconds'
    );
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError(
      `Cannot reach Whisper server at ${ENV.WHISPER_LOCAL_URL}. Is whisper_server.py running?`,
      'network'
    );
  }

  return parseWhisperResponse(response.body, response.status);
}

// ─── OpenAI Whisper API ───────────────────────────────────────────────────────

async function transcribeOpenAI(
  audioUri: string,
  language: 'en' | 'es'
): Promise<string> {
  if (!ENV.OPENAI_API_KEY) {
    throw new TranscriptionError(
      'EXPO_PUBLIC_OPENAI_API_KEY is not set. Add it to your .env file.',
      'auth'
    );
  }

  const endpoint = 'https://api.openai.com/v1/audio/transcriptions';

  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new TranscriptionError(`Audio file not found: ${audioUri}`, 'format_error');
  }

  let response: UploadResult;
  try {
    response = await withTimeout(
      uploadAsync(endpoint, audioUri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        parameters: {
          model: 'whisper-1',
          language,
          response_format: 'json',
        },
        headers: {
          Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
        },
      }),
      TIMEOUT_MS,
      'OpenAI Whisper API timed out after 60 seconds'
    );
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError('Network error calling OpenAI Whisper API', 'network');
  }

  if (response.status === 401) {
    throw new TranscriptionError('Invalid OpenAI API key', 'auth');
  }

  return parseWhisperResponse(response.body, response.status);
}

// ─── Shared response parser ───────────────────────────────────────────────────

function parseWhisperResponse(body: string, status: number): string {
  let parsed: { transcript?: string; text?: string; error?: string; code?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TranscriptionError('Could not parse server response', 'server_error');
  }

  if (status === 422 || parsed.code === 'no_speech') {
    throw new TranscriptionError(parsed.error ?? 'No speech detected', 'no_speech');
  }
  if (status === 400) {
    throw new TranscriptionError(parsed.error ?? 'Bad audio file', 'format_error');
  }
  if (status >= 500) {
    throw new TranscriptionError(parsed.error ?? 'Server error', 'server_error');
  }
  if (status !== 200) {
    throw new TranscriptionError(`Unexpected status ${status}`, 'server_error');
  }

  // Local server returns { transcript: "..." }
  // OpenAI returns        { text: "..." }
  const text = parsed.transcript ?? parsed.text ?? '';
  if (!text.trim()) {
    throw new TranscriptionError('Empty transcript returned', 'no_speech');
  }

  return text.trim();
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TranscriptionError(message, 'timeout')),
        ms
      )
    ),
  ]);
}
