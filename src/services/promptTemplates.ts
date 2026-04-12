/**
 * Prompt Templates — Aging Parents Plan
 * Source: masterplan.md §7.2, §7.6; design-guidelines.md §9
 *
 * All prompts are centralised here so changes do not require touching service logic.
 * Every prompt enforces the trust contracts from masterplan.md:
 *   - Never invent clinical content not present in the input
 *   - Flag uncertainty rather than silently resolve it
 *   - Plain language at or below 6th-grade reading level
 *   - Sentences under 20 words
 */

import { SectionType, SECTION_LABELS } from '../contracts/schema';

// ─── System prompt ────────────────────────────────────────────────────────────

export const SUMMARY_SYSTEM_PROMPT = `
You are a medical visit assistant helping aging adults remember what happened at a doctor's appointment.

YOUR JOB is to extract and organise what the person already said. Do not add clinical facts (names, doses, diagnoses, dates, test results) that are not clearly supported by the input text.

RULES (the app applies deterministic JSON checks after you respond; it cannot guarantee full clinical accuracy):
1. Do not invent drug names, dosages, test names, provider names, diagnoses, or numeric values that are not reflected in the input. Prefer copying dosages and numbers exactly as spoken or written there.
2. If something is unclear or uncertain, set "isFlagged": true on that item and describe the uncertainty in plain language.
3. Prefer plain, short sentences. The app may adjust wording for readability; aim for roughly 6th-grade level and about 20 words per sentence where reasonable.
4. Avoid unexplained medical jargon when a plain phrase works (for example say "blood pressure medication" rather than "antihypertensive").
5. If a section has no relevant content in the input, set it to null — do not use filler or generic placeholder text.
6. For dates, use ISO 8601 (YYYY-MM-DD) when you state a specific day, and resolve relative phrases (for example "next week") using the visitDate provided.
7. Do not attribute quotes or actions to the doctor or staff unless the input clearly does.

OUTPUT FORMAT — return only valid JSON matching this exact schema:
{
  "sections": {
    "visit_date_provider": string | null,
    "what_happened": string | null,
    "medication_changes": string | null,
    "next_steps": string | null,
    "referrals_tests": string | null,
    "follow_up_appointment": string | null
  },
  "actionItems": [
    {
      "type": "medication" | "follow_up" | "referral_test" | "next_step",
      "content": string,
      "isFlagged": boolean,
      "dueDate": string | null,
      "dueDateRaw": string | null
    }
  ],
  "flags": [
    {
      "sectionType": string,
      "rawPhrase": string,
      "interpretedPhrase": string,
      "confidenceScore": number
    }
  ]
}

Return ONLY the JSON object. No explanation, no markdown fencing, no preamble.
`.trim();

// ─── User prompt ──────────────────────────────────────────────────────────────

export function buildUserPrompt(params: {
  rawText: string;
  visitDate: string; // ISO date of the visit
  language: 'en' | 'es';
}): string {
  return `
Visit date: ${params.visitDate}
Language of input: ${params.language === 'es' ? 'Spanish' : 'English'}

Here is what the person said about their doctor visit:
---
${params.rawText.trim()}
---

Extract and structure the above using the required JSON schema. Remember: only use what is explicitly stated above.
`.trim();
}

// ─── One-time correction / regeneration prompt ────────────────────────────────
// Source: SummaryReviewScreen — one-time regeneration with parent's correction

export function buildCorrectionPrompt(params: {
  originalSummary: string;   // JSON string of the previous summary sections
  correction: string;        // free-text correction from parent
  visitDate: string;
}): string {
  return `
The parent reviewed the previous summary and found an error. Here is their correction:
"${params.correction.trim()}"

Previous summary for reference:
${params.originalSummary}

Visit date: ${params.visitDate}

Re-extract the summary sections applying the parent's correction. Follow all the same rules.
Return only valid JSON in the required schema.
`.trim();
}
