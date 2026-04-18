/**
 * Ollama HTTP chat — Ollama Cloud (`https://ollama.com`) only per policy.
 *
 * Shared by both pipeline stages:
 *   Stage 1 — extraction (OCR/PDF/audio → text) via `OLLAMA_EXTRACTION_MODEL`
 *   Stage 2 — structured extraction via `OLLAMA_STRUCTURED_MODEL`
 *
 * Optional `images` parameter enables vision-capable stage 1 calls over
 * page/photo inputs (base64 strings, no data-URL prefix). `format:'json'`
 * biases the model toward a parseable JSON response for stage 2.
 */

import { withTimeout } from '../async.js';
import { serverEnv } from '../config/env.js';

export interface OllamaChatParams {
  model: string;
  system: string;
  user: string;
  /** Base64-encoded image bytes (no `data:` prefix). Used by stage 1 OCR. */
  images?: readonly string[];
  /** When `'json'`, Ollama constrains the response to a JSON object. */
  format?: 'json';
  /** Override sampling temperature (default 0.1). */
  temperature?: number;
  /** Override token budget (default 4096). */
  numPredict?: number;
  /**
   * Enable extended reasoning / "thinking" tokens on capable models. Default
   * is `false` because it (a) consumes num_predict before any final answer is
   * emitted — cloud thinking models like qwen3.5:cloud return HTTP 200 with
   * empty message.content when the budget is exhausted mid-think — and (b) we
   * want deterministic, schema-compliant output for structured extraction,
   * not deliberative chain-of-thought.
   */
  think?: boolean;
}

export async function ollamaChat(params: OllamaChatParams): Promise<string> {
  const base = serverEnv.OLLAMA_BASE_URL.replace(/\/$/, '');
  const url = `${base}/api/chat`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (base.startsWith('https://')) {
    if (!serverEnv.OLLAMA_API_KEY.trim()) {
      throw new Error('OLLAMA_API_KEY is required when OLLAMA_BASE_URL uses HTTPS');
    }
    headers.Authorization = `Bearer ${serverEnv.OLLAMA_API_KEY}`;
  }

  const userMessage: Record<string, unknown> = { role: 'user', content: params.user };
  if (params.images && params.images.length > 0) {
    userMessage.images = [...params.images];
  }

  const body: Record<string, unknown> = {
    model: params.model,
    stream: false,
    think: params.think ?? false,
    messages: [
      { role: 'system', content: params.system },
      userMessage,
    ],
    options: {
      temperature: params.temperature ?? 0.1,
      num_predict: params.numPredict ?? 4096,
    },
  };
  if (params.format === 'json') {
    body.format = 'json';
  }

  const fetchPromise = fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let response: Response;
  try {
    response = await withTimeout(
      fetchPromise,
      serverEnv.OLLAMA_TIMEOUT_MS,
      () => new Error(`Ollama request timed out after ${serverEnv.OLLAMA_TIMEOUT_MS}ms`)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot reach Ollama at ${base}: ${msg}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Ollama auth failed (${response.status})`);
  }

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    throw new Error(`Ollama HTTP ${response.status}: ${t.slice(0, 200)}`);
  }

  const rawBody = await response.text();
  let data: { message?: { content?: string }; done_reason?: string } = {};
  try {
    data = JSON.parse(rawBody) as typeof data;
  } catch {
    throw new Error(
      `Ollama returned non-JSON body for model="${params.model}": ${rawBody.slice(0, 200)}`
    );
  }
  const text = data?.message?.content ?? '';
  if (!text.trim()) {
    const doneReason = data?.done_reason ? ` done_reason="${data.done_reason}"` : '';
    const hint =
      data?.done_reason === 'length'
        ? ' Hint: num_predict budget exhausted (likely thinking tokens) — increase numPredict or ensure think:false.'
        : ' Hint: check that the model tag is spelled correctly and is available on your Ollama Cloud plan.';
    throw new Error(
      `Ollama returned empty message.content for model="${params.model}"${doneReason}.${hint} ` +
        `Raw body: ${rawBody.slice(0, 200)}`
    );
  }
  return text;
}
