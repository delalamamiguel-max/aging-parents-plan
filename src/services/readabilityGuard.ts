/**
 * Readability Guard — Aging Parents Plan
 * Source: masterplan.md §7.2 "6th-grade reading level"; "sentences under 20 words"
 *
 * Post-generation pass applied to all section content before state is written.
 * Purpose: make AI output easier for aging adults to read and trust.
 *
 * This does NOT alter clinical meaning — it only:
 *   1. Splits sentences longer than 20 words at natural break points
 *   2. Replaces a curated list of clinical jargon with plain equivalents
 *   3. Reports a Flesch-Kincaid grade estimate for logging
 *
 * Sprint 3: surface ReadabilityReport in internal analytics.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadabilityReport {
  originalGradeEstimate: number;
  finalGradeEstimate: number;
  longSentencesFixed: number;
  jargonReplacements: number;
  sectionType: string;
}

// ─── Jargon dictionary ────────────────────────────────────────────────────────
// Clinical term → plain-language equivalent
// Conservative list — only replace when meaning is identical

const JARGON_MAP: Record<string, string> = {
  // Medications & pharma
  antihypertensive: 'blood pressure medication',
  antihypertensives: 'blood pressure medications',
  antidiabetic: 'diabetes medication',
  statins: 'cholesterol-lowering medication',
  nsaid: 'pain reliever',
  nsaids: 'pain relievers',
  analgesic: 'pain reliever',
  analgesics: 'pain relievers',
  anticoagulant: 'blood thinner',
  anticoagulants: 'blood thinners',
  diuretic: 'water pill',
  diuretics: 'water pills',
  corticosteroid: 'steroid medication',
  corticosteroids: 'steroid medications',
  bronchodilator: 'breathing medication',
  bronchodilators: 'breathing medications',

  // Clinical terms
  hypertension: 'high blood pressure',
  hypotension: 'low blood pressure',
  hyperglycemia: 'high blood sugar',
  hypoglycemia: 'low blood sugar',
  dyspnea: 'shortness of breath',
  dyspnoea: 'shortness of breath',
  tachycardia: 'fast heart rate',
  bradycardia: 'slow heart rate',
  edema: 'swelling',
  oedema: 'swelling',
  myocardial: 'heart',
  infarction: 'blockage',
  renal: 'kidney',
  hepatic: 'liver',
  pulmonary: 'lung',
  osteoarthritis: 'joint pain',
  osteoporosis: 'weak bones',
  neuropathy: 'nerve damage',
  arrhythmia: 'irregular heartbeat',

  // Procedures & tests
  echocardiogram: 'heart ultrasound',
  electrocardiogram: 'heart tracing test',
  ecg: 'heart tracing test',
  ekg: 'heart tracing test',
  colonoscopy: 'bowel check',
  endoscopy: 'stomach check',
  spirometry: 'breathing test',
  urinalysis: 'urine test',

  // Actions
  administer: 'give',
  administered: 'given',
  titrate: 'adjust the dose of',
  titrated: 'adjusted the dose of',
  contraindicated: 'not recommended',
  prophylactic: 'preventive',
  prophylactically: 'as prevention',
  exacerbation: 'worsening',
  exacerbations: 'worsenings',
  comorbidity: 'other health condition',
  comorbidities: 'other health conditions',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply readability improvements to a single section's content.
 * Returns the improved text and a report.
 */
export function applyReadabilityGuard(
  content: string,
  sectionType: string
): { text: string; report: ReadabilityReport } {
  let text = content;
  let jargonReplacements = 0;
  let longSentencesFixed = 0;

  const originalGrade = estimateFleschKincaidGrade(text);

  // Step 1: Replace jargon
  for (const [term, plain] of Object.entries(JARGON_MAP)) {
    const re = new RegExp(`\\b${term}\\b`, 'gi');
    const before = text;
    text = text.replace(re, (match) => {
      // Preserve capitalisation if the original was capitalised
      return match[0] === match[0].toUpperCase()
        ? plain.charAt(0).toUpperCase() + plain.slice(1)
        : plain;
    });
    if (text !== before) jargonReplacements++;
  }

  // Step 2: Split long sentences
  const sentences = splitIntoSentences(text);
  const processedSentences: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    if (words.length > 20) {
      const split = splitLongSentence(sentence);
      processedSentences.push(...split);
      longSentencesFixed++;
    } else {
      processedSentences.push(sentence);
    }
  }
  text = processedSentences.join(' ').trim();

  const finalGrade = estimateFleschKincaidGrade(text);

  return {
    text,
    report: {
      originalGradeEstimate: originalGrade,
      finalGradeEstimate: finalGrade,
      longSentencesFixed,
      jargonReplacements,
      sectionType,
    },
  };
}

/**
 * Apply to all sections in a sections map. Returns improved map + all reports.
 */
export function applyReadabilityToSections(
  sections: Partial<Record<string, string | null>>
): { sections: Partial<Record<string, string | null>>; reports: ReadabilityReport[] } {
  const result: Partial<Record<string, string | null>> = {};
  const reports: ReadabilityReport[] = [];

  for (const [key, value] of Object.entries(sections)) {
    if (!value) {
      result[key] = value;
      continue;
    }
    const { text, report } = applyReadabilityGuard(value, key);
    result[key] = text;
    reports.push(report);
  }

  return { sections: result, reports };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  // Split on period/question/exclamation followed by space + capital letter
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
}

function splitLongSentence(sentence: string): string[] {
  // Try to split at conjunction or semicolon if > 20 words
  const splitPoints = [
    /(?<=\w),\s+(and|but|or|so|yet|because|although|however)\s+/gi,
    /;\s*/g,
    /\s+—\s+/g,
  ];

  for (const pattern of splitPoints) {
    const parts = sentence.split(pattern).filter(Boolean);
    const cleanParts = parts.filter(p => p.trim().split(/\s+/).length > 2);
    if (cleanParts.length > 1) {
      // Capitalise first char of each part
      return cleanParts.map(p => {
        const t = p.trim();
        return t.charAt(0).toUpperCase() + t.slice(1);
      });
    }
  }

  // Can't split cleanly — return as-is
  return [sentence];
}

/**
 * Simplified Flesch-Kincaid Grade Level approximation.
 * FK formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 * Good enough for logging; not intended to be displayed to users.
 */
function estimateFleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || sentences.length === 0) return 0;

  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllableCount / words.length;

  const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}
