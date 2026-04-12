import { withTimeout } from '../async.js';
import type { RequestLogger } from '../logger.js';
import type { SummarizeRequestBody, SummarizeResult, SummarySectionDTO } from '../types.js';

const SECTION_ORDER: SummarySectionDTO['sectionType'][] = [
  'visit_date_provider',
  'what_happened',
  'medication_changes',
  'next_steps',
  'referrals_tests',
  'follow_up_appointment',
];

function emptySections(): SummarySectionDTO[] {
  return SECTION_ORDER.map((sectionType) => ({
    sectionType,
    content: '',
    sourceType: 'empty' as const,
    isEmpty: true,
  }));
}

/**
 * Mock summariser — returns typed `success` with placeholder section text.
 * Replace inner call with provider + timeout/retry around real HTTP.
 */
export async function handleSummarizeMock(
  body: SummarizeRequestBody,
  log: RequestLogger
): Promise<SummarizeResult> {
  const text = (body.rawText ?? body.rawAudioTranscript ?? '').trim();
  log.info('summarize.mock invoked', { visitId: body.visitId, charCount: text.length });

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
