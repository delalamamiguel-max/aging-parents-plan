import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { isStructuredApiError, StructuredApiError } from './errors.js';
import { createRequestLogger } from './logger.js';
import { validateSummarizeBody, validateTranscribeBody } from './validation.js';
import { handleSummarizeMock } from './handlers/summarize.js';
import { handleTranscribeMock } from './handlers/transcribe.js';
import type { ApiEnvelope, ApiErrorEnvelope, SummarizeResult } from './types.js';
import { getServerConfigSummary, serverEnv } from './config/env.js';

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

async function routeSummarize(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string
): Promise<void> {
  const log = createRequestLogger(requestId);
  if (req.method !== 'POST') {
    sendJson(res, 405, toErrorEnvelope(requestId, new StructuredApiError('Method not allowed', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 405,
    })));
    return;
  }
  let raw: unknown;
  try {
    const text = await readBody(req);
    raw = text ? JSON.parse(text) : {};
  } catch {
    sendJson(res, 400, toErrorEnvelope(requestId, new StructuredApiError('Invalid JSON', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    })));
    return;
  }
  try {
    const body = validateSummarizeBody(raw);
    const result: SummarizeResult = await handleSummarizeMock(body, log);
    const envelope: ApiEnvelope<SummarizeResult> = { ok: true, requestId, result };
    sendJson(res, 200, envelope);
  } catch (e) {
    if (isStructuredApiError(e)) {
      sendJson(res, e.httpStatus, toErrorEnvelope(requestId, e));
      return;
    }
    log.error('unhandled summarize error', { err: String(e) });
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
}

async function routeTranscribe(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string
): Promise<void> {
  const log = createRequestLogger(requestId);
  if (req.method !== 'POST') {
    sendJson(res, 405, toErrorEnvelope(requestId, new StructuredApiError('Method not allowed', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 405,
    })));
    return;
  }
  let raw: unknown;
  try {
    const text = await readBody(req);
    raw = text ? JSON.parse(text) : {};
  } catch {
    sendJson(res, 400, toErrorEnvelope(requestId, new StructuredApiError('Invalid JSON', {
      outcome: 'non_retryable_failure',
      code: 'validation_failed',
      httpStatus: 400,
    })));
    return;
  }
  try {
    const body = validateTranscribeBody(raw);
    const result = await handleTranscribeMock(body, log);
    sendJson(res, 200, { ok: true, requestId, result } as const);
  } catch (e) {
    if (isStructuredApiError(e)) {
      sendJson(res, e.httpStatus, toErrorEnvelope(requestId, e));
      return;
    }
    log.error('unhandled transcribe error', { err: String(e) });
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
});
