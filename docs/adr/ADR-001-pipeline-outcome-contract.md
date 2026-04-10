# ADR-001: Pipeline outcome contract

- **Status:** Accepted (documentation only; behavior unchanged)
- **Date:** 2026-04-10
- **Context:** Capture → processing → summary review (`ProcessingScreen`, `transcriptionService`, `summaryService`, `llmClient`).

## Context

The pipeline crosses **transcription** (voice only) and **LLM summary generation**. Failures are not surfaced uniformly: transcription uses **thrown errors with codes**, while summary generation often returns **degraded output** without throwing. Product and analytics need a **single vocabulary** for outcomes without renaming existing domain enums such as `SummaryStatus` in `src/contracts/schema.ts`.

## Decision

Adopt a **canonical four-outcome model** for pipeline runs:

1. `success` — Valid LLM output after parse, validate, and readability steps.
2. `fallback_used` — Safe degraded output; no throw; user may still reach review.
3. `retryable_failure` — Hard stop; retrying the same capture may succeed.
4. `non_retryable_failure` — Hard stop until configuration or environment is fixed.

**Error codes** already in code (`TranscriptionError['code']`, `LLMError['code']`, and internal `buildFallback` reason strings) are **mapped** to these outcomes below. **Do not rename** those code literals in source without a dedicated migration ADR.

---

## Outcome contract (normative)

| Outcome | When it applies | Required artifacts / notes |
|---------|-----------------|----------------------------|
| `success` | `processLLMResponse` returns a `GenerateSummaryOutput` built from **sanitised** validator output (sections may still be empty where the model legitimately left them blank). | `generatedAt` set; `_validationWarnings` optional (validator warnings only). |
| `fallback_used` | `buildFallback` or `buildStubFallback` returned; or equivalent safe substitute. | Empty or stub sections per `summaryService`; user should be guided to review or re-capture. |
| `retryable_failure` | Transcription or other step **throws** and the error is **transient** or **user-recoverable** without changing repo config. | User-facing message + retry affordance (current: `ProcessingScreen` error state). |
| `non_retryable_failure` | Failure tied to **missing/invalid credentials**, **transcription not configured**, or **misconfiguration** where repeat attempt without change will not help. | User directed to fix `.env`, start local server, or check provider. |

---

## Error code → canonical outcome

### Transcription (`TranscriptionError`)

Defined in `src/services/transcriptionService.ts`. User strings: `TRANSCRIPTION_ERROR_MESSAGES`.

| Code | Canonical outcome |
|------|-------------------|
| `no_speech` | `retryable_failure` |
| `network` | `retryable_failure` |
| `timeout` | `retryable_failure` |
| `server_error` | `retryable_failure` |
| `format_error` | `retryable_failure` |
| `auth` | `non_retryable_failure` |

### LLM client (`LLMError`)

Defined in `src/services/llmClient.ts`. These propagate to `summaryService` catch as `buildFallback(visitId, code, generatedAt)`.

| Code | Canonical outcome (current product semantics) |
|------|---------------------------------------------|
| `auth` | `fallback_used` |
| `timeout` | `fallback_used` |
| `parse` | `fallback_used` |
| `network` | `fallback_used` |
| `provider_error` | `fallback_used` |

*Rationale:* Today the screen does not throw on these; the user lands on review with empty sections. A **future** revision may promote some codes (e.g. repeated `network`) to `retryable_failure` at the UI layer.

### Summary service internal reasons (`buildFallback` / paths)

| Reason string | When | Canonical outcome |
|---------------|------|-------------------|
| `no_input` | No text after guards | `fallback_used` |
| `parse_error` | `parseLLMResponse` failed | `fallback_used` |
| `validation_failed` | Validator produced no sanitised output | `fallback_used` |
| `not_configured` | Regeneration path; AI not configured | `fallback_used` |
| `regeneration_failed` | Regeneration LLM error | `fallback_used` |
| `unknown` | Non-`LLMError` in catch | `fallback_used` |

### Stub fallback (no LLM)

| Condition | Canonical outcome |
|-----------|-------------------|
| `!isAIConfigured()` on `generateSummaryFromInput` | `fallback_used` (heuristic stub, not `buildFallback` reason list) |

### Analytics (today)

| Event | Payload pattern | Suggested future outcome tagging |
|-------|-----------------|----------------------------------|
| `trackCaptureCompleted` | On navigation after summary step | `success` or `fallback_used` (requires detecting stub/fallback inside result). |
| `trackCaptureFailed` | `transcription_error_<code>` | Map code table → `retryable_failure` / `non_retryable_failure`. |
| `trackCaptureFailed` | `llm_generation_error` | Classify thrown error when this path is used. |

---

## Consequences

### Gaps (current code vs contract)

- **No single return type** carries `success` | `fallback_used` | `retryable_failure` | `non_retryable_failure` from the pipeline; the screen infers success if no throw.
- **`fallback_used` is invisible to analytics** on the happy path: completion is always tracked as success today.
- **LLM failures are intentionally silent** at the UI layer (empty summary); the contract documents that as `fallback_used`, not `retryable_failure`.

### Intended future contract (API shape)

Future implementations should return something like:

```ts
// Illustrative only — not implemented in repo yet
type PipelineResult =
  | { outcome: 'success'; summary: GenerateSummaryOutput }
  | { outcome: 'fallback_used'; summary: GenerateSummaryOutput; reasonCode: string }
  | { outcome: 'retryable_failure'; errorCode: string; message: string }
  | { outcome: 'non_retryable_failure'; errorCode: string; message: string };
```

Stable `reasonCode` / `errorCode` values should match the tables in `docs/architecture.md` and this ADR.

---

## Affected future files (when implementing the contract)

| File | Why |
|------|-----|
| `src/screens/ProcessingScreen.tsx` | Orchestrates transcription + summary; should branch on unified outcome and analytics. |
| `src/services/summaryService.ts` | Should expose outcome + reason instead of only implicit `_validationWarnings`. |
| `src/services/transcriptionService.ts` | May remain throw-based but should map to shared error code enum/type used by the pipeline result. |
| `src/services/llmClient.ts` | `LLMError.code` already stable; ensure mapping table stays in sync. |
| `src/services/analyticsService.ts` | Add dimensions for `outcome` and `reason_code` (or equivalent). |
| Tests under `src/**/__tests__` or e2e | Assert each outcome path and code mapping. |

---

## References

- `src/contracts/schema.ts` — `SummaryStatus` and domain models (unchanged names).
- `docs/architecture.md` — Pipeline overview and tables (duplicate mapping for discoverability).
