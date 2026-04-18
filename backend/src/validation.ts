import { StructuredApiError } from './errors.js';
import type {
  AudioSegmentPayload,
  ImagePayload,
  PdfPagePayload,
  SummarizeRequestBody,
  TranscribeRequestBody,
} from './types.js';

function bail(message: string, code: 'validation_failed' | 'format_error' = 'validation_failed'): never {
  throw new StructuredApiError(message, {
    outcome: 'non_retryable_failure',
    code,
    httpStatus: 400,
  });
}

function parseAudioSegments(raw: unknown): AudioSegmentPayload[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) bail('audioSegments must be an array');
  const out: AudioSegmentPayload[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') bail(`audioSegments[${i}] must be an object`);
    const o = item as Record<string, unknown>;
    if (typeof o.text !== 'string') bail(`audioSegments[${i}].text must be a string`);
    const segmentIndex = typeof o.segmentIndex === 'number' ? o.segmentIndex : i;
    out.push({
      segmentIndex,
      startSec: typeof o.startSec === 'number' ? o.startSec : undefined,
      endSec: typeof o.endSec === 'number' ? o.endSec : undefined,
      text: o.text,
    });
  });
  return out;
}

function parsePdfPages(raw: unknown): PdfPagePayload[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) bail('pdfPages must be an array');
  const out: PdfPagePayload[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') bail(`pdfPages[${i}] must be an object`);
    const o = item as Record<string, unknown>;
    if (typeof o.pageNumber !== 'number') bail(`pdfPages[${i}].pageNumber must be a number`);
    if (o.text !== undefined && typeof o.text !== 'string') {
      bail(`pdfPages[${i}].text must be a string when provided`);
    }
    if (o.imageBase64 !== undefined && typeof o.imageBase64 !== 'string') {
      bail(`pdfPages[${i}].imageBase64 must be a string when provided`);
    }
    if (!o.text && !o.imageBase64) {
      bail(`pdfPages[${i}] must supply either text or imageBase64`);
    }
    out.push({
      pageNumber: o.pageNumber,
      text: typeof o.text === 'string' ? o.text : undefined,
      imageBase64: typeof o.imageBase64 === 'string' ? o.imageBase64 : undefined,
      assetId: typeof o.assetId === 'string' ? o.assetId : undefined,
    });
  });
  return out;
}

function parseImages(raw: unknown): ImagePayload[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) bail('images must be an array');
  const out: ImagePayload[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') bail(`images[${i}] must be an object`);
    const o = item as Record<string, unknown>;
    if (typeof o.imageBase64 !== 'string' || !o.imageBase64.trim()) {
      bail(`images[${i}].imageBase64 must be a non-empty base64 string`);
    }
    const imageIndex = typeof o.imageIndex === 'number' ? o.imageIndex : i;
    out.push({
      imageIndex,
      imageBase64: o.imageBase64,
      assetId: typeof o.assetId === 'string' ? o.assetId : undefined,
    });
  });
  return out;
}

/** Stub: extend with zod / AJV later */
export function validateSummarizeBody(raw: unknown): SummarizeRequestBody {
  if (raw === null || typeof raw !== 'object') bail('Invalid JSON body');
  const o = raw as Record<string, unknown>;
  const visitId = o.visitId;
  if (typeof visitId !== 'string' || visitId.trim() === '') {
    bail('visitId is required');
  }
  const language = o.language;
  if (language !== undefined && language !== 'en' && language !== 'es') {
    bail('language must be en or es');
  }
  return {
    visitId,
    rawText: typeof o.rawText === 'string' ? o.rawText : undefined,
    rawAudioTranscript:
      typeof o.rawAudioTranscript === 'string' ? o.rawAudioTranscript : undefined,
    audioSegments: parseAudioSegments(o.audioSegments),
    pdfPages: parsePdfPages(o.pdfPages),
    images: parseImages(o.images),
    language: language as 'en' | 'es' | undefined,
    visitDate: typeof o.visitDate === 'string' ? o.visitDate : undefined,
  };
}

/** JSON test hooks for POST /transcribe (multipart is validated in the HTTP layer). */
export function validateTranscribeBody(raw: unknown): TranscribeRequestBody {
  if (raw === null || typeof raw !== 'object') bail('Invalid JSON body');
  const o = raw as Record<string, unknown>;
  const language = o.language;
  if (language !== undefined && language !== 'en' && language !== 'es') {
    bail('language must be en or es');
  }
  return {
    language: language as 'en' | 'es' | undefined,
    _stubInvalid: o._stubInvalid === true,
  };
}
