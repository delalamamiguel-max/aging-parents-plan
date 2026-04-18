/**
 * Transcription — Aging Parents Plan
 *
 * Voice capture uploads audio to the Node backend POST /transcribe, which
 * proxies to the configured STT provider (default: Groq-hosted Whisper
 * `whisper-large-v3-turbo`). The STT provider API key stays server-side.
 * No Whisper daemon on device, no OpenAI client, no local Python server.
 */

import { getInfoAsync } from 'expo-file-system/legacy';
import { ENV } from '../config/env';

// ─── Error type ───────────────────────────────────────────────────────────────

export type TranscriptionErrorCode =
  | 'no_speech'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'unavailable'
  | 'format_error'
  | 'server_error'
  | 'cancelled';

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: TranscriptionErrorCode
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export const TRANSCRIPTION_ERROR_MESSAGES: Record<TranscriptionErrorCode, string> = {
  no_speech:
    "We couldn't hear anything clearly. Tap Record again and speak a little louder.",
  auth: 'Transcription is not set up yet. Configure EXPO_PUBLIC_BACKEND_API_BASE and the backend STT key.',
  network: 'Could not reach the app server. Check your connection and that the backend is running.',
  timeout: 'Transcription is taking longer than expected. Your recording is safe — try again later.',
  unavailable: 'The transcription service is busy right now. Please try again in a moment.',
  format_error: 'The audio file could not be read. Try recording again.',
  server_error: 'Something went wrong while transcribing. Try again.',
  cancelled: 'Transcription was cancelled.',
};

/** End-to-end client budget for POST /transcribe. Backend-side timeout is tighter. */
const TRANSCRIBE_TIMEOUT_MS = 90_000;

interface ApiErrorBody {
  ok: false;
  requestId: string;
  error: {
    outcome: string;
    code: string;
    message: string;
  };
}

interface ApiOkBody {
  ok: true;
  requestId: string;
  result: { transcript: string; language: 'en' | 'es' };
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  if (!v || typeof v !== 'object') return false;
  const o = v as { ok?: unknown; error?: unknown };
  return o.ok === false && typeof o.error === 'object' && o.error !== null;
}

function isApiOkBody(v: unknown): v is ApiOkBody {
  if (!v || typeof v !== 'object') return false;
  const o = v as { ok?: unknown; result?: unknown };
  if (o.ok !== true || !o.result || typeof o.result !== 'object') return false;
  const r = o.result as { transcript?: unknown };
  return typeof r.transcript === 'string';
}

function mapWireCode(code: string): TranscriptionErrorCode {
  if (code === 'no_speech') return 'no_speech';
  if (code === 'auth') return 'auth';
  if (code === 'network') return 'network';
  if (code === 'timeout') return 'timeout';
  if (code === 'format_error' || code === 'validation_failed') return 'format_error';
  if (code === 'server_error' || code === 'provider_error') return 'server_error';
  return 'server_error';
}

function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new TranscriptionError(`${label} (${ms}ms)`, 'timeout'));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export interface TranscribeOptions {
  signal?: AbortSignal;
}

/**
 * Upload local recording to backend /transcribe and return plain transcript text.
 */
export async function transcribeAudio(
  audioUri: string,
  language: 'en' | 'es' = 'en',
  options: TranscribeOptions = {}
): Promise<string> {
  if (!ENV.BACKEND_API_BASE?.trim()) {
    throw new TranscriptionError(
      'EXPO_PUBLIC_BACKEND_API_BASE is not set. Add your backend URL to .env.',
      'auth'
    );
  }

  const base = ENV.BACKEND_API_BASE.replace(/\/$/, '');
  const url = `${base}/transcribe`;

  const info = await getInfoAsync(audioUri);
  if (!info.exists) {
    throw new TranscriptionError(`Audio file not found: ${audioUri}`, 'format_error');
  }

  const formData = new FormData();
  formData.append('language', language);
  formData.append('file', {
    uri: audioUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  console.log(`[transcription] backend.start url=${url} lang=${language}`);

  const fetchOnce = async (): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: options.signal,
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      const msg = e instanceof Error ? e.message : String(e);
      if (name === 'AbortError' || msg.toLowerCase().includes('abort')) {
        throw new TranscriptionError('Transcription was cancelled.', 'cancelled');
      }
      console.warn('[transcription] fetch.failed', e);
      throw new TranscriptionError(`Could not reach backend: ${msg}`, 'network');
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      throw new TranscriptionError('Invalid JSON from transcription server.', 'server_error');
    }

    if (isApiErrorBody(parsed)) {
      const code = mapWireCode(parsed.error.code);
      throw new TranscriptionError(parsed.error.message || 'Transcription failed', code);
    }

    if (!res.ok || !isApiOkBody(parsed)) {
      throw new TranscriptionError(
        typeof text === 'string' && text ? text.slice(0, 200) : `HTTP ${res.status}`,
        res.status === 422 ? 'no_speech' : 'server_error'
      );
    }

    const out = parsed.result.transcript.trim();
    if (!out) {
      throw new TranscriptionError('Empty transcript returned.', 'no_speech');
    }
    console.log(`[transcription] backend.done chars=${out.length}`);
    return out;
  };

  return raceWithTimeout(fetchOnce(), TRANSCRIBE_TIMEOUT_MS, 'Transcription timed out');
}
