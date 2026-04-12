import type { ApiPipelineErrorCode, PipelineOutcomeStatus } from './types.js';

export class StructuredApiError extends Error {
  readonly outcome: Extract<PipelineOutcomeStatus, 'retryable_failure' | 'non_retryable_failure'>;
  readonly code: ApiPipelineErrorCode;
  readonly httpStatus: number;

  constructor(
    message: string,
    options: {
      outcome: StructuredApiError['outcome'];
      code: ApiPipelineErrorCode;
      httpStatus?: number;
    }
  ) {
    super(message);
    this.name = 'StructuredApiError';
    this.outcome = options.outcome;
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? (options.outcome === 'non_retryable_failure' ? 400 : 503);
  }
}

export function isStructuredApiError(e: unknown): e is StructuredApiError {
  return e instanceof StructuredApiError;
}
