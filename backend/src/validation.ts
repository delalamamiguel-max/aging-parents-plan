import { StructuredApiError } from './errors.js';
import type { SummarizeRequestBody, TranscribeRequestBody } from './types.js';

/** Stub: extend with zod / AJV later */
export function validateSummarizeBody(raw: unknown): SummarizeRequestBody {
  if (raw === null || typeof raw !== 'object') {
    throw new StructuredApiError('Invalid JSON body', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    });
  }
  const o = raw as Record<string, unknown>;
  const visitId = o.visitId;
  if (typeof visitId !== 'string' || visitId.trim() === '') {
    throw new StructuredApiError('visitId is required', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    });
  }
  const language = o.language;
  if (language !== undefined && language !== 'en' && language !== 'es') {
    throw new StructuredApiError('language must be en or es', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    });
  }
  return {
    visitId,
    rawText: typeof o.rawText === 'string' ? o.rawText : undefined,
    rawAudioTranscript: typeof o.rawAudioTranscript === 'string' ? o.rawAudioTranscript : undefined,
    language: language as 'en' | 'es' | undefined,
    visitDate: typeof o.visitDate === 'string' ? o.visitDate : undefined,
  };
}

/** Stub: real route will accept multipart audio */
export function validateTranscribeBody(raw: unknown): TranscribeRequestBody {
  if (raw === null || typeof raw !== 'object') {
    throw new StructuredApiError('Invalid JSON body', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    });
  }
  const o = raw as Record<string, unknown>;
  const language = o.language;
  if (language !== undefined && language !== 'en' && language !== 'es') {
    throw new StructuredApiError('language must be en or es', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    });
  }
  return {
    language: language as 'en' | 'es' | undefined,
    _stubInvalid: o._stubInvalid === true,
  };
}
