/**
 * Stage 1 — OCR / PDF text / audio-to-text normalization.
 *
 * Runs `OLLAMA_EXTRACTION_MODEL` (default `gemma4:31b-cloud`) and returns a
 * `NormalizedText` for Stage 2.
 *
 * Important:
 *  - Stage 1 is the ONLY pipeline stage allowed to consume raw OCR/audio.
 *  - When no raw sources are supplied, Stage 1 still runs as a normalization
 *    pass over any loose text — the rule "do not skip stage 1" holds, but the
 *    pass is a no-op transform that preserves every character.
 *  - The LLM call is used only when we have image-bearing inputs (PDFs/photos)
 *    or when the caller explicitly opts in. For pure-text inputs we build the
 *    NormalizedText deterministically in-process; spending an LLM roundtrip to
 *    echo text back introduces hallucination risk and latency for no gain.
 */

import type { RequestLogger } from '../logger.js';
import { ollamaChat } from '../summary/ollamaChat.js';
import { STAGE1_SYSTEM_PROMPT, buildStage1UserPrompt } from './prompts.js';
import type {
  AudioSegmentInput,
  ImageInput,
  NormalizedSegment,
  NormalizedText,
  PdfPageInput,
  SourceRef,
  Stage1RawInputs,
} from './types.js';

const MAX_IMAGES_PER_CALL = 8;

export interface Stage1Options {
  model: string;
  language: 'en' | 'es';
}

export async function runStage1(
  inputs: Stage1RawInputs,
  opts: Stage1Options,
  log: RequestLogger
): Promise<NormalizedText> {
  const warnings: string[] = [];

  const textSegments = normalizeLooseText(inputs.rawText);
  const audioSegments = normalizeAudio(inputs.audioSegments, inputs.rawAudioTranscript);
  const pdfTextSegments = normalizePdfText(inputs.pdfPages ?? []);

  const hasPdfImages = (inputs.pdfPages ?? []).some((p) => p.imageBase64);
  const hasImages = (inputs.images ?? []).length > 0;

  let ocrSegments: NormalizedSegment[] = [];
  if (hasPdfImages || hasImages) {
    try {
      ocrSegments = await runVisionOcr(inputs, opts, log);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('stage1.vision_ocr_failed', { err: msg });
      warnings.push(`stage1_vision_ocr_failed:${truncate(msg, 120)}`);
    }
  }

  const segments: NormalizedSegment[] = [
    ...textSegments,
    ...audioSegments,
    ...pdfTextSegments,
    ...ocrSegments,
  ];

  const fullText = segments
    .map((s) => s.text.trim())
    .filter((t) => t.length > 0)
    .join('\n');

  const inputsUsed = {
    text: textSegments.length > 0,
    audio: audioSegments.length > 0,
    pdf: pdfTextSegments.length > 0 || ocrSegments.some((s) => s.sourceRef.kind === 'pdf'),
    image: ocrSegments.some((s) => s.sourceRef.kind === 'image'),
  };

  log.info('stage1.normalized', {
    segmentCount: segments.length,
    fullTextLen: fullText.length,
    usedText: inputsUsed.text,
    usedAudio: inputsUsed.audio,
    usedPdf: inputsUsed.pdf,
    usedImage: inputsUsed.image,
    warningCount: warnings.length,
  });

  return { segments, fullText, inputsUsed, warnings };
}

// ─── Deterministic (non-LLM) normalizers ─────────────────────────────────────

function normalizeLooseText(rawText: string | undefined): NormalizedSegment[] {
  const t = (rawText ?? '').trim();
  if (!t) return [];
  return [
    {
      id: 's-text-0',
      text: t,
      sourceRef: { kind: 'text', offset: 0 },
    },
  ];
}

function normalizeAudio(
  segments: readonly AudioSegmentInput[] | undefined,
  fallbackTranscript: string | undefined
): NormalizedSegment[] {
  if (segments && segments.length > 0) {
    return segments
      .filter((s) => s.text.trim().length > 0)
      .map((s, i) => ({
        id: `s-audio-${s.segmentIndex ?? i}`,
        text: s.text.trim(),
        sourceRef: {
          kind: 'audio' as const,
          segmentIndex: s.segmentIndex,
          startSec: s.startSec,
          endSec: s.endSec,
        },
      }));
  }
  const t = (fallbackTranscript ?? '').trim();
  if (!t) return [];
  return [
    {
      id: 's-audio-0',
      text: t,
      sourceRef: { kind: 'audio', segmentIndex: 0 },
    },
  ];
}

function normalizePdfText(pages: readonly PdfPageInput[]): NormalizedSegment[] {
  const out: NormalizedSegment[] = [];
  for (const page of pages) {
    const t = (page.text ?? '').trim();
    if (!t) continue;
    out.push({
      id: `s-pdf-${page.pageNumber}`,
      text: t,
      sourceRef: { kind: 'pdf', pageNumber: page.pageNumber, assetId: page.assetId },
    });
  }
  return out;
}

// ─── LLM-backed OCR for image/PDF-page inputs ────────────────────────────────

interface Stage1RawSourceRef {
  kind?: string;
  pageNumber?: number;
  imageIndex?: number;
  segmentIndex?: number;
  startSec?: number;
  endSec?: number;
  assetId?: string;
  offset?: number;
}

interface Stage1RawSegment {
  id?: string;
  text?: string;
  sourceRef?: Stage1RawSourceRef;
}

interface Stage1RawResponse {
  segments?: Stage1RawSegment[];
  warnings?: string[];
}

type PdfRef = Extract<SourceRef, { kind: 'pdf' }>;
type ImageRef = Extract<SourceRef, { kind: 'image' }>;
type VisionRef = PdfRef | ImageRef;

interface VisionItem {
  base64: string;
  ref: VisionRef;
  fallbackId: string;
}

async function runVisionOcr(
  inputs: Stage1RawInputs,
  opts: Stage1Options,
  log: RequestLogger
): Promise<NormalizedSegment[]> {
  const pdfPagesWithImages = (inputs.pdfPages ?? []).filter((p) => p.imageBase64);
  const images = inputs.images ?? [];

  const all: VisionItem[] = [
    ...pdfPagesWithImages.map<VisionItem>((p) => ({
      base64: p.imageBase64!,
      ref: { kind: 'pdf', pageNumber: p.pageNumber, assetId: p.assetId },
      fallbackId: `s-pdf-${p.pageNumber}`,
    })),
    ...images.map<VisionItem>((img: ImageInput) => ({
      base64: img.imageBase64,
      ref: { kind: 'image', imageIndex: img.imageIndex, assetId: img.assetId },
      fallbackId: `s-image-${img.imageIndex}`,
    })),
  ];

  if (all.length === 0) return [];

  const batches: typeof all[] = [];
  for (let i = 0; i < all.length; i += MAX_IMAGES_PER_CALL) {
    batches.push(all.slice(i, i + MAX_IMAGES_PER_CALL));
  }

  const collected: NormalizedSegment[] = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const description = batch
      .map((item, idx) => {
        const r = item.ref;
        const ordinal = idx + 1;
        if (r.kind === 'pdf') {
          return `Image ${ordinal}: PDF page ${r.pageNumber}${
            r.assetId ? ` (${r.assetId})` : ''
          }.`;
        }
        return `Image ${ordinal}: photo #${r.imageIndex}${
          r.assetId ? ` (${r.assetId})` : ''
        }.`;
      })
      .join('\n');

    const response = await ollamaChat({
      model: opts.model,
      system: STAGE1_SYSTEM_PROMPT,
      user: buildStage1UserPrompt({
        rawInputsDescription: description,
        language: opts.language,
      }),
      images: batch.map((i) => i.base64),
      format: 'json',
    });

    const parsed = parseStage1Response(response);
    if (!parsed) {
      log.warn('stage1.vision_batch_unparseable', { batchIndex: b, size: batch.length });
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const rawSegs = (parsed.segments ?? []).filter((s) => {
        const kind = s.sourceRef?.kind;
        if (!kind) return false;
        if (item.ref.kind === 'pdf') {
          return kind === 'pdf' && s.sourceRef?.pageNumber === item.ref.pageNumber;
        }
        return kind === 'image' && s.sourceRef?.imageIndex === item.ref.imageIndex;
      });

      if (rawSegs.length === 0) {
        // Fall back to any textless entry in order — some models forget refs.
        const positional = (parsed.segments ?? [])[i];
        if (positional && typeof positional.text === 'string' && positional.text.trim()) {
          collected.push({
            id: item.fallbackId,
            text: positional.text.trim(),
            sourceRef: item.ref,
          });
        }
        continue;
      }

      for (const s of rawSegs) {
        if (typeof s.text !== 'string' || !s.text.trim()) continue;
        collected.push({
          id: (typeof s.id === 'string' && s.id) || item.fallbackId,
          text: s.text.trim(),
          sourceRef: item.ref,
        });
      }
    }
  }

  return collected;
}

function parseStage1Response(raw: string): Stage1RawResponse | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Stage1RawResponse;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Stage1RawResponse;
    } catch {
      return null;
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
