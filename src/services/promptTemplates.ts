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

YOUR ONLY JOB is to extract and organise what the person already said — you must NEVER add, infer, or invent clinical information.

STRICT RULES — violating any of these is a critical failure:
1. DO NOT invent drug names, dosages, test names, provider names, diagnoses, or dates that are not in the input.
2. If something is unclear or uncertain, set "isFlagged": true on that item and describe the uncertainty.
3. Use plain language only. Aim for 6th-grade reading level. Sentences must be 20 words or shorter.
4. Do not use medical jargon. "Blood pressure medication" instead of "antihypertensive".
5. If a section has no relevant content in the input, set it to null — do not fill it with placeholder text.
6. Extract dates exactly as stated. Use ISO 8601 format (YYYY-MM-DD). Resolve relative dates using the visitDate provided.
7. Never say "the doctor said" if the input does not clearly attribute something to the doctor.

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
