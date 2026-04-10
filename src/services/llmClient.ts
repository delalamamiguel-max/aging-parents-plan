/**
 * LLM Client — Aging Parents Plan
 * Source: implementation-plan.md §Sprint 2
 *
 * Provider-agnostic wrapper. Provider is selected via ENV.LLM_PROVIDER.
 * Supports: 'gemini' (cloud) | 'ollama' (local)
 *
 * Contract:
 *   callLLM(systemPrompt, userPrompt) → raw string response
 *   Callers are responsible for parsing and validating the output.
 */

import { ENV } from '../config/env';
import { SUMMARY_SYSTEM_PROMPT } from './promptTemplates';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 45_000;

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth' | 'timeout' | 'parse' | 'network' | 'provider_error'
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (ENV.LLM_PROVIDER === 'gemini') {
        return await callGemini(systemPrompt, userPrompt);
      } else if (ENV.LLM_PROVIDER === 'ollama') {
        return await callOllama(systemPrompt, userPrompt);
      } else {
        throw new LLMError(`Unknown LLM_PROVIDER: ${ENV.LLM_PROVIDER}`, 'provider_error');
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry auth errors
      if (err instanceof LLMError && err.code === 'auth') throw err;
      if (attempt < MAX_RETRIES) {
        await delay(1000 * (attempt + 1)); // 1s, 2s backoff
      }
    }
  }

  throw lastError ?? new LLMError('Unknown error', 'provider_error');
}

// ─── Gemini provider ──────────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!ENV.GEMINI_API_KEY) {
    throw new LLMError(
      'EXPO_PUBLIC_GEMINI_API_KEY is not set. Add it to your .env file.',
      'auth'
    );
  }

  // Dynamic import to keep bundle lean if provider is switched
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(ENV.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json', // enforced JSON output
      temperature: 0.1,    // very low — we want deterministic, not creative
      topP: 0.8,
      maxOutputTokens: 2048,
    },
  });

  const result = await withTimeout(
    model.generateContent(userPrompt),
    TIMEOUT_MS,
    'Gemini request timed out after 45 seconds'
  );

  const text = result.response.text();
  if (!text) {
    throw new LLMError('Gemini returned an empty response', 'provider_error');
  }

  return text;
}

// ─── Ollama provider ──────────────────────────────────────────────────────────

async function callOllama(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const url = `${ENV.OLLAMA_BASE_URL}/api/chat`;

  const body = {
    model: ENV.OLLAMA_MODEL,
    // format: 'json', // Removed because Gemma 3 might return empty {} with this flag
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options: {
      temperature: 0.1,
      num_predict: 2048,
    },
  };

  let response: Response;
  try {
    response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      TIMEOUT_MS,
      `Ollama request timed out. Is Ollama running at ${ENV.OLLAMA_BASE_URL}?`
    );
  } catch (err) {
    if (err instanceof LLMError) throw err;
    throw new LLMError(
      `Cannot reach Ollama at ${ENV.OLLAMA_BASE_URL}. Make sure Ollama is running.`,
      'network'
    );
  }

  if (!response.ok) {
    throw new LLMError(
      `Ollama returned status ${response.status}: ${response.statusText}`,
      'provider_error'
    );
  }

  const data = await response.json();
  const text: string = data?.message?.content ?? '';
  if (!text) {
    throw new LLMError('Ollama returned an empty response', 'provider_error');
  }

  return text;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new LLMError(message, 'timeout')), ms)
    ),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
