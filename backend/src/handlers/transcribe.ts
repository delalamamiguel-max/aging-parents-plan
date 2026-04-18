import { StructuredApiError } from '../errors.js';
import type { RequestLogger } from '../logger.js';
import type { TranscribeRequestBody } from '../types.js';
import { serverEnv } from '../config/env.js';
import { transcribeWithGroq } from '../stt/groqTranscribe.js';
import { withRetry, withTimeout } from '../async.js';

export interface TranscribeSuccess {
  transcript: string;
  language: 'en' | 'es';
}

/**
 * Translate the narrow error strings thrown by STT modules into user-facing
 * structured errors. New STT providers MUST emit one of the prefixes below
 * (see `backend/src/stt/groqTranscribe.ts` for the contract).
 */
function mapTranscribeFailure(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);

  if (msg.startsWith('STT auth failed')) {
    throw new StructuredApiError(msg, {
      outcome: 'non_retryable_failure',
      code: 'auth',
      httpStatus: 401,
    });
  }
  if (msg.startsWith('STT rate limited')) {
    throw new StructuredApiError(msg, {
      outcome: 'retryable_failure',
      code: 'unavailable',
      httpStatus: 503,
    });
  }
  if (msg.startsWith('STT file rejected')) {
    throw new StructuredApiError(msg, {
      outcome: 'non_retryable_failure',
      code: 'format_error',
      httpStatus: 400,
    });
  }
  if (msg.includes('timed out')) {
    throw new StructuredApiError(msg, {
      outcome: 'retryable_failure',
      code: 'timeout',
      httpStatus: 504,
    });
  }
  if (msg.startsWith('Cannot reach STT provider')) {
    throw new StructuredApiError(msg, {
      outcome: 'retryable_failure',
      code: 'network',
      httpStatus: 503,
    });
  }
  if (msg.startsWith('STT HTTP 5')) {
    throw new StructuredApiError(
      `Transcription provider error (${serverEnv.STT_PROVIDER}/${serverEnv.STT_MODEL}): ${msg.slice(0, 200)}`,
      {
        outcome: 'retryable_failure',
        code: 'server_error',
        httpStatus: 502,
      }
    );
  }
  throw new StructuredApiError(msg.slice(0, 300), {
    outcome: 'retryable_failure',
    code: 'server_error',
    httpStatus: 502,
  });
}

/**
 * Multipart audio → transcript via the configured STT provider.
 * Client contract (`/transcribe` multipart, JSON ApiEnvelope response) is
 * unchanged; only the server-side STT call changes per `STT_PROVIDER`.
 */
export async function handleTranscribe(
  audio: Buffer,
  mimeType: string,
  language: 'en' | 'es' | undefined,
  log: RequestLogger
): Promise<TranscribeSuccess> {
  const lang = language ?? 'en';
  if (audio.length < 32) {
    throw new StructuredApiError('Audio file too small.', {
      outcome: 'non_retryable_failure',
      code: 'format_error',
      httpStatus: 400,
    });
  }

  log.info('transcribe.accepted', {
    bytes: audio.length,
    mimeType: mimeType.slice(0, 48),
    language: lang,
    sttProvider: serverEnv.STT_PROVIDER,
    sttModel: serverEnv.STT_MODEL,
  });

  let transcript: string;
  try {
    switch (serverEnv.STT_PROVIDER) {
      case 'groq':
        transcript = await transcribeWithGroq(audio, mimeType, lang, log);
        break;
      default: {
        const provider: never = serverEnv.STT_PROVIDER;
        throw new Error(`Unsupported STT provider: ${provider as string}`);
      }
    }
  } catch (e) {
    mapTranscribeFailure(e);
  }

  if (!transcript.trim()) {
    throw new StructuredApiError('No speech detected in the recording.', {
      outcome: 'non_retryable_failure',
      code: 'no_speech',
      httpStatus: 422,
    });
  }

  log.info('transcribe.done', { chars: transcript.length });
  return { transcript, language: lang };
}

/**
 * Mock transcription — retained ONLY for unit/integration tests that
 * explicitly import this symbol. NOT wired into the HTTP route.
 */
export async function handleTranscribeMock(
  body: TranscribeRequestBody,
  log: RequestLogger
): Promise<TranscribeSuccess> {
  if (body._stubInvalid) {
    throw new StructuredApiError('Stub invalid request', {
      outcome: 'non_retryable_failure',
      code: 'format_error',
      httpStatus: 400,
    });
  }

  const language: 'en' | 'es' = body.language ?? 'en';
  log.info('transcribe.mock invoked (tests only)', { language });

  await withRetry(
    () =>
      withTimeout(
        Promise.resolve(),
        3_000,
        () =>
          new StructuredApiError('Transcription timed out', {
            outcome: 'retryable_failure',
            code: 'timeout',
            httpStatus: 504,
          })
      ),
    { maxAttempts: 2, delayMs: 50 }
  );

  return {
    transcript: '[mock transcript] Patient discussed follow-up and medications.',
    language,
  };
}
