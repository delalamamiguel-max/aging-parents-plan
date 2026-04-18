import { format } from 'date-fns';
import { withTimeout } from '../async.js';
import { serverEnv } from '../config/env.js';
import { StructuredApiError } from '../errors.js';
import type { RequestLogger } from '../logger.js';
import type {
  ActionItemDTO,
  AccuracyFlagDTO,
  SummarizeRequestBody,
  SummarizeResult,
  SummarySectionDTO,
} from '../types.js';
import { SECTION_ORDER } from '../types.js';
import { runExtractionPipeline } from '../extraction/pipeline.js';
import type { Stage1RawInputs, Stage2StructuredOutput } from '../extraction/types.js';
import type { RawActionItem, RawFlag } from '../summary/outputValidator.js';

function emptySections(): SummarySectionDTO[] {
  return SECTION_ORDER.map((sectionType) => ({
    sectionType,
    content: '',
    sourceType: 'empty' as const,
    isEmpty: true,
  }));
}

function mapOllamaError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('auth failed') || msg.includes('OLLAMA_API_KEY is required')) {
    throw new StructuredApiError(msg, {
      outcome: 'non_retryable_failure',
      code: 'auth',
      httpStatus: 401,
    });
  }
  if (msg.includes('timed out')) {
    throw new StructuredApiError(msg, {
      outcome: 'retryable_failure',
      code: 'timeout',
      httpStatus: 504,
    });
  }
  if (msg.includes('Cannot reach Ollama')) {
    throw new StructuredApiError(msg, {
      outcome: 'retryable_failure',
      code: 'network',
      httpStatus: 503,
    });
  }
  throw new StructuredApiError(msg, {
    outcome: 'retryable_failure',
    code: 'provider_error',
    httpStatus: 502,
  });
}

/** Pull sourceSegmentIds from the raw LLM output if the model emitted them. */
function extractSegmentIds(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const ids = (raw as { sourceSegmentIds?: unknown }).sourceSegmentIds;
  if (!Array.isArray(ids)) return undefined;
  const out = ids.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function toSummaryDto(
  visitId: string,
  structured: Stage2StructuredOutput
): {
  sections: SummarySectionDTO[];
  actionItems: ActionItemDTO[];
  flags: AccuracyFlagDTO[];
} {
  const sections: SummarySectionDTO[] = SECTION_ORDER.map((sectionType) => {
    const content = structured.sections[sectionType] ?? null;
    const str = content && typeof content === 'string' ? content : '';
    return {
      sectionType,
      content: str,
      sourceType: str ? ('ai_generated' as const) : ('empty' as const),
      isEmpty: !str,
    };
  });

  const actionItems: ActionItemDTO[] = structured.actionItems.map((item: RawActionItem, i: number) => ({
    id: `action-${visitId}-${Date.now()}-${i}`,
    visitId,
    type: item.type,
    content: item.content,
    status: 'open' as const,
    isFlagged: item.isFlagged,
    dueDate: item.dueDate ?? undefined,
    sourceSegmentIds: extractSegmentIds(item as unknown),
  }));

  const flags: AccuracyFlagDTO[] = structured.flags.map((flag: RawFlag, i: number) => ({
    id: `flag-${visitId}-${Date.now()}-${i}`,
    sectionType: flag.sectionType as SummarySectionDTO['sectionType'],
    rawPhrase: flag.rawPhrase,
    interpretedPhrase: flag.interpretedPhrase,
    confidenceScore: flag.confidenceScore,
    sourceSegmentIds: extractSegmentIds(flag as unknown),
  }));

  return { sections, actionItems, flags };
}

function toStage1Inputs(body: SummarizeRequestBody): Stage1RawInputs {
  return {
    rawText: body.rawText,
    rawAudioTranscript: body.rawAudioTranscript,
    audioSegments: body.audioSegments,
    pdfPages: body.pdfPages,
    images: body.images,
  };
}

async function handleSummarizePipeline(
  body: SummarizeRequestBody,
  log: RequestLogger
): Promise<SummarizeResult> {
  const base = serverEnv.OLLAMA_BASE_URL.replace(/\/$/, '');
  if (base.startsWith('https://') && !serverEnv.OLLAMA_API_KEY.trim()) {
    throw new StructuredApiError('OLLAMA_API_KEY is required when OLLAMA_BASE_URL uses HTTPS', {
      outcome: 'non_retryable_failure',
      code: 'auth',
      httpStatus: 401,
    });
  }

  const visitDate = body.visitDate ?? format(new Date(), 'yyyy-MM-dd');
  const language: 'en' | 'es' = body.language === 'es' ? 'es' : 'en';
  const generatedAt = new Date().toISOString();

  log.info('summarize.input', {
    hasRawText: !!body.rawText,
    hasRawAudioTranscript: !!body.rawAudioTranscript,
    audioSegmentCount: body.audioSegments?.length ?? 0,
    pdfPageCount: body.pdfPages?.length ?? 0,
    imageCount: body.images?.length ?? 0,
    language,
    visitDate,
    stage1Model: serverEnv.OLLAMA_EXTRACTION_MODEL,
    stage2Model: serverEnv.OLLAMA_STRUCTURED_MODEL,
  });

  let result;
  try {
    result = await runExtractionPipeline(
      toStage1Inputs(body),
      { visitDate, language },
      log
    );
  } catch (e) {
    mapOllamaError(e);
  }

  if (result.status === 'failure') {
    const reasonCode =
      result.reason === 'no_input'
        ? 'no_input'
        : result.reason === 'insufficient_detail'
        ? 'insufficient_detail'
        : result.reason === 'stage2_unparseable'
        ? 'parse_error'
        : 'validation_failed';

    return {
      outcome: 'fallback_used',
      summary: {
        sections: emptySections(),
        actionItems: [],
        flags: [],
        generatedAt,
        validationWarnings:
          result.warnings.length + result.errors.length > 0
            ? [...result.warnings, ...result.errors]
            : undefined,
      },
      fallback: {
        kind: 'empty_output',
        reasonCode,
        validationWarnings: [...result.warnings, ...result.errors],
      },
    };
  }

  const { sections, actionItems, flags } = toSummaryDto(body.visitId, result.structured);

  return {
    outcome: 'success',
    summary: {
      sections,
      actionItems,
      flags,
      generatedAt,
      validationWarnings: result.warnings.length > 0 ? result.warnings : undefined,
    },
  };
}

/**
 * Mock summariser — retained for unit tests only. NOT reachable from the
 * production request path; `handleSummarize` always runs the two-stage
 * cloud pipeline.
 */
export async function handleSummarizeMock(
  body: SummarizeRequestBody,
  log: RequestLogger
): Promise<SummarizeResult> {
  const text = (body.rawText ?? body.rawAudioTranscript ?? '').trim();
  log.info('summarize.mock invoked', { visitIdLen: body.visitId.length, inputCharCount: text.length });

  await withTimeout(
    Promise.resolve(),
    5_000,
    () => new Error('mock summarize exceeded stub timeout')
  );

  if (text.length === 0) {
    return {
      outcome: 'fallback_used',
      summary: {
        sections: emptySections(),
        actionItems: [],
        flags: [],
        generatedAt: new Date().toISOString(),
      },
      fallback: {
        kind: 'empty_output',
        reasonCode: 'no_input',
        validationWarnings: ['no_input'],
      },
    };
  }

  const sections: SummarySectionDTO[] = SECTION_ORDER.map((sectionType) => {
    if (sectionType === 'what_happened') {
      return {
        sectionType,
        content: `[mock] Summary for visit ${body.visitId}: ${text.slice(0, 200)}`,
        sourceType: 'ai_generated',
        isEmpty: false,
      };
    }
    return {
      sectionType,
      content: '',
      sourceType: 'empty',
      isEmpty: true,
    };
  });

  return {
    outcome: 'success',
    summary: {
      sections,
      actionItems: [],
      flags: [],
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Production summariser — two-stage Ollama Cloud pipeline.
 *
 *   Stage 1 (OLLAMA_EXTRACTION_MODEL, gemma4:31b-cloud by default):
 *     OCR / PDF text / audio-to-text → NormalizedText with source refs.
 *
 *   Stage 2 (OLLAMA_STRUCTURED_MODEL, qwen3.5:cloud by default):
 *     NormalizedText → structured sections, action items, flags.
 *
 * Ordering is enforced by `runExtractionPipeline` — Stage 2 never sees raw
 * OCR/audio, and Stage 1 is never skipped.
 */
export async function handleSummarize(
  body: SummarizeRequestBody,
  log: RequestLogger
): Promise<SummarizeResult> {
  return handleSummarizePipeline(body, log);
}
