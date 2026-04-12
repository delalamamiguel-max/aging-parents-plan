/**
 * Typed fetch helpers for the Node backend (`/summarize`, `/transcribe`).
 * Additive — does not replace `summaryService` / `transcriptionService`.
 */

import {
  PipelineErrorCode,
  type PipelineOutcomeStatus,
} from '../contracts/schema';
import {
  API_PATHS,
  type ApiErrorBody,
  type ApiSummarizeSuccessBody,
  type ApiTranscribeSuccessBody,
  DEFAULT_BACKEND_TIMEOUT_MS,
  getDefaultBackendBaseUrl,
  type SummarizeApiRequest,
  type SummarizeApiResult,
  type TranscribeApiRequest,
  type TranscribeApiResultBody,
} from './endpoints';

type PipelineErrorCodeUnion = (typeof PipelineErrorCode)[keyof typeof PipelineErrorCode];

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  readonly outcome: Extract<PipelineOutcomeStatus, 'retryable_failure' | 'non_retryable_failure'>;
  readonly code: PipelineErrorCodeUnion;
  readonly httpStatus: number;
  readonly requestId?: string;

  constructor(
    message: string,
    init: {
      outcome: ApiClientError['outcome'];
      code: PipelineErrorCodeUnion;
      httpStatus: number;
      requestId?: string;
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.outcome = init.outcome;
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.requestId = init.requestId;
  }
}

export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}

const KNOWN_CODES = new Set<string>(Object.values(PipelineErrorCode));

function toPipelineCode(raw: string): PipelineErrorCodeUnion {
  if (KNOWN_CODES.has(raw)) return raw as PipelineErrorCodeUnion;
  return PipelineErrorCode.Unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  if (!isRecord(v) || v.ok !== false) return false;
  const err = v.error;
  if (!isRecord(err)) return false;
  return (
    typeof v.requestId === 'string' &&
    (err.outcome === 'retryable_failure' || err.outcome === 'non_retryable_failure') &&
    typeof err.code === 'string' &&
    typeof err.message === 'string'
  );
}

function isSummarizeSuccessBody(v: unknown): v is ApiSummarizeSuccessBody {
  if (!isRecord(v) || v.ok !== true) return false;
  const result = v.result;
  if (!isRecord(result)) return false;
  if (typeof v.requestId !== 'string') return false;
  if (!isRecord(result.summary)) return false;
  if (result.outcome === 'success') return true;
  if (result.outcome === 'fallback_used') {
    return isRecord(result.fallback) && typeof result.fallback.kind === 'string';
  }
  return false;
}

function isTranscribeSuccessBody(v: unknown): v is ApiTranscribeSuccessBody {
  if (!isRecord(v) || v.ok !== true) return false;
  const result = v.result;
  if (!isRecord(result)) return false;
  return (
    typeof v.requestId === 'string' &&
    typeof result.transcript === 'string' &&
    (result.language === 'en' || result.language === 'es')
  );
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export interface BackendRequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Sent as `X-Request-Id`; server echoes in JSON */
  requestId?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  outerSignal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
    outerSignal?.removeEventListener('abort', onAbort);
  }
}

function mapFetchFailure(e: unknown, requestId?: string): ApiClientError {
  const name = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'AbortError' || msg.includes('aborted')) {
    return new ApiClientError('Request timed out', {
      outcome: 'retryable_failure',
      code: PipelineErrorCode.Timeout,
      httpStatus: 504,
      requestId,
    });
  }
  return new ApiClientError(msg || 'Network request failed', {
    outcome: 'retryable_failure',
    code: PipelineErrorCode.Network,
    httpStatus: 0,
    requestId,
  });
}

async function parseJsonResponse(raw: string): Promise<unknown> {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiClientError('Invalid JSON from server', {
      outcome: 'retryable_failure',
      code: PipelineErrorCode.ParseError,
      httpStatus: 502,
    });
  }
}

async function postBackendJson(
  path: string,
  body: unknown,
  options: BackendRequestOptions | undefined,
  parseSuccess: (parsed: unknown) => boolean
): Promise<{ status: number; parsed: unknown }> {
  const baseUrl = (options?.baseUrl ?? getDefaultBackendBaseUrl()).replace(/\/$/, '');
  const url = `${baseUrl}${path}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (options?.requestId) headers['X-Request-Id'] = options.requestId;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      timeoutMs,
      options?.signal
    );
  } catch (e) {
    throw mapFetchFailure(e, options?.requestId);
  }

  const text = await res.text();
  const parsed = text.length > 0 ? await parseJsonResponse(text) : null;

  if (isApiErrorBody(parsed)) {
    throw new ApiClientError(parsed.error.message, {
      outcome: parsed.error.outcome,
      code: toPipelineCode(parsed.error.code),
      httpStatus: res.status,
      requestId: parsed.requestId,
    });
  }

  if (!res.ok) {
    throw new ApiClientError(typeof text === 'string' && text ? text.slice(0, 200) : `HTTP ${res.status}`, {
      outcome: res.status >= 500 ? 'retryable_failure' : 'non_retryable_failure',
      code: res.status >= 500 ? PipelineErrorCode.ServerError : PipelineErrorCode.ValidationFailed,
      httpStatus: res.status,
      requestId: options?.requestId,
    });
  }

  if (!parseSuccess(parsed)) {
    throw new ApiClientError('Unexpected response shape from server', {
      outcome: 'retryable_failure',
      code: PipelineErrorCode.ServerError,
      httpStatus: res.status,
    });
  }

  return { status: res.status, parsed };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type SummarizeViaBackendResponse = {
  requestId: string;
  result: SummarizeApiResult;
};

/**
 * POST `/summarize`. Throws `ApiClientError` on HTTP/wire/validation errors.
 * @example
 * ```ts
 * const { requestId, result } = await summarizeViaBackend({
 *   visitId: summary.id,
 *   rawText: 'Doctor visit notes…',
 *   language: 'en',
 * });
 * if (result.outcome === 'fallback_used') {
 *   console.warn(result.fallback.reasonCode);
 * }
 * ```
 */
export async function summarizeViaBackend(
  body: SummarizeApiRequest,
  options?: BackendRequestOptions
): Promise<SummarizeViaBackendResponse> {
  const { parsed } = await postBackendJson(API_PATHS.summarize, body, options, isSummarizeSuccessBody);
  const data = parsed as ApiSummarizeSuccessBody;
  return { requestId: data.requestId, result: data.result };
}

export type TranscribeViaBackendResponse = {
  requestId: string;
  result: TranscribeApiResultBody;
};

/**
 * POST `/transcribe` (JSON stub until multipart is implemented on the server).
 * @example
 * ```ts
 * const { result } = await transcribeViaBackend({ language: 'en' });
 * const text = result.transcript;
 * ```
 */
export async function transcribeViaBackend(
  body: TranscribeApiRequest = {},
  options?: BackendRequestOptions
): Promise<TranscribeViaBackendResponse> {
  const { parsed } = await postBackendJson(API_PATHS.transcribe, body, options, isTranscribeSuccessBody);
  const data = parsed as ApiTranscribeSuccessBody;
  return { requestId: data.requestId, result: data.result };
}
