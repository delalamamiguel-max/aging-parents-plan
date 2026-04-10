# Architecture

This document describes how the capture → processing pipeline fits together and the **canonical outcome contract** for that pipeline. Domain entities and summary lifecycle states live in `src/contracts/schema.ts` (`SummaryStatus`, etc.); this file does not redefine those names.

For the full rationale and gap analysis between today’s code and the contract, see [ADR-001: Pipeline outcome contract](./adr/ADR-001-pipeline-outcome-contract.md).

---

## Processing pipeline (today)

1. **Voice capture:** `ProcessingScreen` calls `transcribeAudio` (`transcriptionService.ts`), then `generateSummaryFromInput` (`summaryService.ts`).
2. **Text capture:** Skips transcription; calls `generateSummaryFromInput` with `rawText`.
3. **On success path:** The app dispatches `UPDATE_SUMMARY` and sets `SummaryStatus` to `ready_for_review` (parent) or `pending_parent_approval` (adult child assist), then navigates to review or home per role.

Transcription failures **throw** `TranscriptionError` and stop the pipeline. Summary generation failures are handled **inside** `generateSummaryFromInput` by returning a safe empty structure (no throw to the screen for LLM failures).

---

## Canonical pipeline outcomes

These four values are the **intended contract** for describing how a run finished. They are documented here for product, analytics, and future API shapes; the app may not yet expose a single field with exactly these names everywhere.

| Outcome | Definition | Typical user experience (target) |
|--------|------------|-----------------------------------|
| `success` | Provider returned a response that **parsed and validated**; sections/action items/flags are built from that sanitised output (readability guard applied). | Summary review screen with AI-generated or legitimately empty sections per model output. |
| `fallback_used` | Pipeline **completed without throwing**, but output is **intentionally degraded**: empty sections-only fallback, heuristic stub summary, or similar safe substitute defined in `summaryService`. | Same navigation as success; user may see empty or stub content and should review or re-capture as needed. |
| `retryable_failure` | Pipeline **stopped** with an error the user can address by **retrying** the same capture (network blip, timeout, quiet audio, transient server error). | Error UI with retry; same recording/text can be processed again. |
| `non_retryable_failure` | Pipeline **stopped** until **configuration or environment** changes (missing API key, transcription not configured, unknown provider). Retry alone does not fix the root cause. | Error UI; user fixes `.env` / server / provider settings, then retries. |

---

## Error and reason code mapping

### A. Transcription (`TranscriptionError.code`)

Thrown by `transcribeAudio`; `ProcessingScreen` maps codes to copy via `TRANSCRIPTION_ERROR_MESSAGES` and records `transcription_error_<code>` in analytics on failure.

| Code | Canonical outcome | Retry likely? | Notes |
|------|-------------------|---------------|--------|
| `no_speech` | `retryable_failure` | Yes | Empty or unusable transcript; user can record again. |
| `network` | `retryable_failure` | Yes | Cannot reach local Whisper or OpenAI. |
| `timeout` | `retryable_failure` | Yes | 60s upload/call limit in `transcriptionService`. |
| `server_error` | `retryable_failure` | Often | 5xx or unexpected status; includes unknown `WHISPER_PROVIDER` mapped to this code. |
| `format_error` | `retryable_failure` | Yes | Missing file, bad audio, or 400-class parse issues from server. |
| `auth` | `non_retryable_failure` | After config | Missing/invalid OpenAI key or setup message from screen when transcription is not configured. |

### B. Summary generation (internal reasons, not thrown)

`generateSummaryFromInput` / `regenerateSummaryWithCorrection` return `GenerateSummaryOutput`. On failure paths they return **`buildFallback`** (empty sections) with reasons carried in `_validationWarnings` (and logged), or **`buildStubFallback`** when the LLM is not configured on the main generate path (no `_validationWarnings` set on that stub return).

| Source | Reason string / code | Canonical outcome (today’s behavior) | Notes |
|--------|----------------------|--------------------------------------|--------|
| Empty input | `no_input` | `fallback_used` | No raw text after transcription skip or empty string. |
| LLM call | `LLMError`: `auth`, `timeout`, `parse`, `network`, `provider_error` | `fallback_used` | Passed into `buildFallback` as `reason`; `callLLM` retries non-auth errors up to 2 times before failing. |
| LLM call | `unknown` | `fallback_used` | Non-`LLMError` thrown from provider path, stringified as reason. |
| Parse | `parse_error` | `fallback_used` | `parseLLMResponse` returned null. |
| Validate | `validation_failed` | `fallback_used` | `validateLLMOutput` produced no sanitised output. |
| Regeneration | `not_configured` | `fallback_used` | `regenerateSummaryWithCorrection` when AI not configured. |
| Regeneration | `regeneration_failed` | `fallback_used` | LLM error on correction path. |
| Not configured (main generate) | (stub path) | `fallback_used` | `buildStubFallback` — heuristic sections; not the same as `not_configured` string on regen path. |

**Important:** For all rows in section B, `ProcessingScreen` currently still follows the **success navigation path** (update summary + navigate). So the **UI outcome** is “reached review,” while the **semantic contract** row is `fallback_used`.

### C. Screen-level catch-all (non-transcription)

If something **throws** outside `TranscriptionError` during the pipeline effect, `ProcessingScreen` sets generic copy and logs `llm_generation_error` to analytics. With the current `generateSummaryFromInput` implementation, this path is **exceptional** (e.g. unexpected throw from dispatch/navigation or future changes).

| Analytics reason | Canonical outcome |
|------------------|-------------------|
| `llm_generation_error` | Implementation-dependent; treat as `retryable_failure` or `non_retryable_failure` once the thrown error is classified. |

---

## Related files (implementation)

| Area | File |
|------|------|
| Domain types / summary states | `src/contracts/schema.ts` |
| Transcription + error codes + user messages | `src/services/transcriptionService.ts` |
| Summary generation + fallbacks | `src/services/summaryService.ts` |
| LLM errors + retry | `src/services/llmClient.ts` |
| Orchestration + UI error vs success | `src/screens/ProcessingScreen.tsx` |
| Failure/completion analytics | `src/services/analyticsService.ts` (via `ProcessingScreen`) |

---

## Future alignment

When implementing a single pipeline result type, prefer **one explicit outcome field** (`success` | `fallback_used` | `retryable_failure` | `non_retryable_failure`) plus **stable reason codes** aligned with the tables above. See ADR-001 for affected surfaces and gaps.
