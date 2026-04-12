import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { isStructuredApiError, StructuredApiError } from './errors.js';
import { createRequestLogger } from './logger.js';
import { validateSummarizeBody, validateTranscribeBody } from './validation.js';
import { handleSummarizeMock } from './handlers/summarize.js';
import { handleTranscribeMock } from './handlers/transcribe.js';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  SummarizeFallbackPayload,
  SummarizeResult,
  SummarizeSuccessPayload,
} from './types.js';
import { getServerConfigSummary, serverEnv } from './config/env.js';
import { BackendTelemetryEvent } from './telemetry/events.js';
import { emitTelemetry } from './telemetry/logger.js';

const PORT = serverEnv.BACKEND_PORT;

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getRequestId(req: IncomingMessage): string {
  const h = req.headers['x-request-id'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (Array.isArray(h) && h[0]) return h[0];
  return randomUUID();
}

function toErrorEnvelope(requestId: string, err: StructuredApiError): ApiErrorEnvelope {
  return {
    ok: false,
    requestId,
    error: {
      outcome: err.outcome,
      code: err.code,
      message: err.message,
    },
  };
}

function isSummarizeOk(
  result: SummarizeResult
): result is SummarizeSuccessPayload | SummarizeFallbackPayload {
  return result.outcome === 'success' || result.outcome === 'fallback_used';
}

function summarizeFilledSectionCount(
  result: SummarizeSuccessPayload | SummarizeFallbackPayload
): number {
  return result.summary.sections.filter((s) => !s.isEmpty).length;
}

async function routeSummarize(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string
): Promise<void> {
  const routeStart = Date.now();
  const log = createRequestLogger(requestId);

  emitTelemetry(BackendTelemetryEvent.RequestReceived, requestId, {
    route: '/summarize',
    method: req.method ?? 'UNKNOWN',
  });

  const finish = (fields: Record<string, string | number | boolean | null | undefined>) => {
    emitTelemetry(BackendTelemetryEvent.PipelineSummarizeFinished, requestId, {
      route: '/summarize',
      durationMs: Date.now() - routeStart,
      ...fields,
    });
  };

  if (req.method !== 'POST') {
    sendJson(
      res,
      405,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Method not allowed', {
          outcome: 'non_retryable_failure',
          code: 'validation_failed',
          httpStatus: 405,
        })
      )
    );
    finish({ httpStatus: 405, ok: false, errorCode: 'validation_failed', errorOutcome: 'non_retryable_failure' });
    return;
  }
  let raw: unknown;
  try {
    const text = await readBody(req);
    raw = text ? JSON.parse(text) : {};
  } catch {
    sendJson(
      res,
      400,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Invalid JSON', {
          outcome: 'non_retryable_failure',
          code: 'validation_failed',
          httpStatus: 400,
        })
      )
    );
    finish({ httpStatus: 400, ok: false, errorCode: 'validation_failed', errorOutcome: 'non_retryable_failure', phase: 'parse_body' });
    return;
  }
  try {
    const body = validateSummarizeBody(raw);
    const result: SummarizeResult = await handleSummarizeMock(body, log);
    const envelope: ApiEnvelope<SummarizeResult> = { ok: true, requestId, result };
    sendJson(res, 200, envelope);
    if (isSummarizeOk(result)) {
      finish({
        httpStatus: 200,
        ok: true,
        pipelineOutcome: result.outcome,
        filledSectionCount: summarizeFilledSectionCount(result),
        actionItemCount: result.summary.actionItems.length,
        flagCount: result.summary.flags.length,
        fallbackReasonCode: result.outcome === 'fallback_used' ? result.fallback.reasonCode : undefined,
      });
    } else {
      finish({
        httpStatus: 200,
        ok: false,
        pipelineOutcome: result.outcome,
        errorCode: result.code,
      });
    }
  } catch (e) {
    if (isStructuredApiError(e)) {
      sendJson(res, e.httpStatus, toErrorEnvelope(requestId, e));
      finish({
        httpStatus: e.httpStatus,
        ok: false,
        errorCode: e.code,
        errorOutcome: e.outcome,
      });
      return;
    }
    log.error('unhandled summarize error', { err: String(e) });
    emitTelemetry(BackendTelemetryEvent.PipelineHandlerException, requestId, {
      route: '/summarize',
      errorName: e instanceof Error ? e.name : 'Error',
    });
    sendJson(
      res,
      500,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Internal error', {
          outcome: 'retryable_failure',
          code: 'server_error',
          httpStatus: 500,
        })
      )
    );
    finish({ httpStatus: 500, ok: false, errorCode: 'server_error', errorOutcome: 'retryable_failure', phase: 'unhandled' });
  }
}

async function routeTranscribe(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string
): Promise<void> {
  const routeStart = Date.now();
  const log = createRequestLogger(requestId);

  emitTelemetry(BackendTelemetryEvent.RequestReceived, requestId, {
    route: '/transcribe',
    method: req.method ?? 'UNKNOWN',
  });

  const finish = (fields: Record<string, string | number | boolean | null | undefined>) => {
    emitTelemetry(BackendTelemetryEvent.PipelineTranscribeFinished, requestId, {
      route: '/transcribe',
      durationMs: Date.now() - routeStart,
      ...fields,
    });
  };

  if (req.method !== 'POST') {
    sendJson(
      res,
      405,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Method not allowed', {
          outcome: 'non_retryable_failure',
          code: 'validation_failed',
          httpStatus: 405,
        })
      )
    );
    finish({ httpStatus: 405, ok: false, errorCode: 'validation_failed', errorOutcome: 'non_retryable_failure' });
    return;
  }
  let raw: unknown;
  try {
    const text = await readBody(req);
    raw = text ? JSON.parse(text) : {};
  } catch {
    sendJson(
      res,
      400,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Invalid JSON', {
          outcome: 'non_retryable_failure',
          code: 'validation_failed',
          httpStatus: 400,
        })
      )
    );
    finish({ httpStatus: 400, ok: false, errorCode: 'validation_failed', errorOutcome: 'non_retryable_failure', phase: 'parse_body' });
    return;
  }
  try {
    const body = validateTranscribeBody(raw);
    const result = await handleTranscribeMock(body, log);
    sendJson(res, 200, { ok: true, requestId, result } as const);
    finish({
      httpStatus: 200,
      ok: true,
      language: result.language,
      transcriptCharCount: result.transcript.length,
    });
  } catch (e) {
    if (isStructuredApiError(e)) {
      sendJson(res, e.httpStatus, toErrorEnvelope(requestId, e));
      finish({
        httpStatus: e.httpStatus,
        ok: false,
        errorCode: e.code,
        errorOutcome: e.outcome,
      });
      return;
    }
    log.error('unhandled transcribe error', { err: String(e) });
    emitTelemetry(BackendTelemetryEvent.PipelineHandlerException, requestId, {
      route: '/transcribe',
      errorName: e instanceof Error ? e.name : 'Error',
    });
    sendJson(
      res,
      500,
      toErrorEnvelope(
        requestId,
        new StructuredApiError('Internal error', {
          outcome: 'retryable_failure',
          code: 'server_error',
          httpStatus: 500,
        })
      )
    );
    finish({ httpStatus: 500, ok: false, errorCode: 'server_error', errorOutcome: 'retryable_failure', phase: 'unhandled' });
  }
}

const server = createServer((req, res) => {
  const requestId = getRequestId(req);
  const log = createRequestLogger(requestId);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url?.split('?')[0] ?? '';

  if (req.method === 'GET' && url === '/health') {
    emitTelemetry(BackendTelemetryEvent.RequestReceived, requestId, {
      route: '/health',
      method: 'GET',
    });
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, requestId, status: 'up' }));
    return;
  }

  void (async () => {
    try {
      if (url === '/summarize') {
        await routeSummarize(req, res, requestId);
        return;
      }
      if (url === '/transcribe') {
        await routeTranscribe(req, res, requestId);
        return;
      }
      sendJson(
        res,
        404,
        toErrorEnvelope(
          requestId,
          new StructuredApiError('Not found', {
            outcome: 'non_retryable_failure',
            code: 'validation_failed',
            httpStatus: 404,
          })
        )
      );
    } catch (e) {
      log.error('top-level handler', { err: String(e) });
      emitTelemetry(BackendTelemetryEvent.PipelineHandlerException, requestId, {
        route: url || '/unknown',
        phase: 'top_level',
        errorName: e instanceof Error ? e.name : 'Error',
      });
      sendJson(
        res,
        500,
        toErrorEnvelope(
          requestId,
          new StructuredApiError('Internal error', {
            outcome: 'retryable_failure',
            code: 'server_error',
            httpStatus: 500,
          })
        )
      );
    }
  })();
});

server.listen(PORT, () => {
  console.log(
    `[backend] listening on http://127.0.0.1:${PORT} (POST /summarize, POST /transcribe, GET /health)`
  );
  console.log(`[backend] config: ${getServerConfigSummary()}`);
  console.log(
    '[backend] telemetry: structured JSON lines (event, requestId, …) — see backend/src/telemetry/events.ts'
  );
});
