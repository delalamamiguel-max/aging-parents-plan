import { withRetry, withTimeout } from '../async.js';
import { StructuredApiError } from '../errors.js';
import type { RequestLogger } from '../logger.js';
import type { TranscribeRequestBody } from '../types.js';

export interface TranscribeSuccess {
  transcript: string;
  language: 'en' | 'es';
}

/**
 * Mock transcription — returns fixed transcript. Wire Whisper/OpenAI here later.
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
  log.info('transcribe.mock invoked', { language });

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
    transcript:
      '[mock transcript] Patient discussed follow-up and medications. Please replace with real Whisper output.',
    language,
  };
}
