# Session Handoff — Pipeline + Transcription Rework

Last updated: 2026-04-18. Written so the next session can resume without re-reading the full transcript.

## Workspace cheatsheet

- Repo root (workspace): `/Users/migueldelalama/Desktop/My Stuff/1) Side Projects/Parents App V2 Claude PM`
- App: `aging-parents-plan/` (Expo / React Native)
- Backend: `aging-parents-plan/backend/` (Node + TS, `type: module`, `tsc` + `tsx`)
- Whisper server: `aging-parents-plan/whisper_server.py` (Flask + faster-whisper)
- Product docs: `MD Files/` (at repo root, not inside `aging-parents-plan/`), plus `aging-parents-plan/docs/adr/*`
- Client env: `aging-parents-plan/.env` (EXPO_PUBLIC_*)
- Backend env: `aging-parents-plan/backend/.env` (server-only; real API key already set)

Typecheck commands:
- Backend: `cd aging-parents-plan/backend && ./node_modules/.bin/tsc --noEmit`
- App: `cd aging-parents-plan && ./node_modules/.bin/tsc --noEmit`

Run commands:
- Backend: `cd aging-parents-plan && npm run backend:dev` (tsx watch)
- Whisper: `python aging-parents-plan/whisper_server.py`
- App: `cd aging-parents-plan && npx expo start` (use `--tunnel` if LAN fails)

## Completed in this session

### A. Two-model backend summarisation pipeline (sequential, no bypass)

Goal: Stage 1 does OCR/PDF/audio → text, Stage 2 does context-aware structured extraction. Models must be different; ordering enforced in code.

- **Stage 1** model: `OLLAMA_EXTRACTION_MODEL` (default `gemma4:31b-cloud`).
- **Stage 2** model: `OLLAMA_STRUCTURED_MODEL` (default `qwen3.5:cloud`).
- Same Ollama Cloud bearer. Validation in `backend/src/config/env.ts` refuses to boot if models are equal or missing.

New module: `backend/src/extraction/`
- `types.ts` — `Stage1RawInputs`, `NormalizedSegment` (with `SourceRef` kinds: `text|audio|pdf|image`), `NormalizedText`, `Stage2StructuredOutput`, `PipelineResult`.
- `prompts.ts` — `STAGE1_SYSTEM_PROMPT` (pure transcription, no interpretation), `STAGE2_SYSTEM_PROMPT` (structured extraction, must cite `sourceSegmentIds`). `buildStage1UserPrompt`, `buildStage2UserPrompt`, `renderSegmentsForStage2`.
- `stage1Extract.ts` — deterministic normalizers for text / per-segment audio / PDF-text-layer pages; LLM-backed vision OCR path (batched, max 8 images/call) for PDF page images + standalone images. Uses new `images` param in `ollamaChat`.
- `stage2Structure.ts` — wraps `ollamaChat` with `format:'json'`, runs it against `NormalizedText.segments`, reuses existing `parseLLMResponse` + `validateLLMOutput`. Returns typed result: `success | unparseable | validation_failed`.
- `pipeline.ts` — `runExtractionPipeline(inputs, opts, log)`. Always runs Stage 1 first; short-circuits with `no_input` / `insufficient_detail`; only then runs Stage 2. Min text threshold and mock-boilerplate detection moved here from the handler.

Changed:
- `backend/src/config/env.ts` — new vars `OLLAMA_EXTRACTION_MODEL` / `OLLAMA_STRUCTURED_MODEL`. Backwards-compat fall-through to legacy `OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL` for one release. `getServerConfigSummary` now prints both stage models.
- `backend/src/summary/ollamaChat.ts` — accepts `images?: readonly string[]` (base64, no data URL prefix) and `format?: 'json'`; everything else unchanged.
- `backend/src/handlers/summarize.ts` — replaced `handleSummarizeOllama` with `handleSummarizePipeline` that delegates to `runExtractionPipeline` and maps pipeline failure reasons → fallback reason codes. Retains `handleSummarizeMock` for tests.
- `backend/src/types.ts` — `SummarizeRequestBody` now accepts `audioSegments[]`, `pdfPages[]`, `images[]` in addition to `rawText` / `rawAudioTranscript`. `ActionItemDTO` / `AccuracyFlagDTO` carry optional `sourceSegmentIds` for traceability.
- `backend/src/validation.ts` — `validateSummarizeBody` now parses those fields and throws `format_error` / `validation_failed` with descriptive messages.
- `backend/src/summary/prompts.ts` — now a deprecated shim that re-exports Stage 2 prompts under the old names (`SUMMARY_SYSTEM_PROMPT`, `buildUserPrompt`) so legacy imports still compile.
- `backend/.env` and `backend/.env.example` — replaced single-model block with the two new vars.

### B. Async transcription pipeline (server-side jobs + client polling)

Problem: 20s recording timed out at the client’s 60s single-shot; whisper ran synchronously in the HTTP request, generic error hid the real cause.

- `whisper_server.py` **rewritten** as a job server:
  - `POST /transcribe` → saves audio, creates `Job`, returns 202 + `{ jobId, status: "queued", ... }`.
  - `GET /transcribe/jobs/<id>` → returns snapshot (`queued|processing|completed|failed|cancelled`, `queueWaitSeconds`, `processingSeconds`, `audioDurationSeconds`, `transcript`, `language`, `error`, `code`). `failed|cancelled` → HTTP 410 so naive `response.ok` can't mistake it for success.
  - `DELETE /transcribe/jobs/<id>` → best-effort cancel.
  - `GET /health` includes worker count, queue depth, job counters.
  - Background worker threads (`WHISPER_WORKERS`, default 1), finished-job TTL (`WHISPER_JOB_TTL_S`, default 900s).
  - Structured single-line JSON logs: `job.created`, `job.processing_start`, `job.completed`, `job.no_speech`, `job.failed`, `job.cancelled_*`, `worker.started`.

- `src/services/transcriptionService.ts` **rewritten**:
  - New `TranscriptionJobHandle` + `TranscriptionJobSnapshot`.
  - `startTranscriptionJob(uri, lang)` — uploads, returns handle. Accepts async 202 + jobId; falls back to legacy sync 200 + `{transcript}` via an in-memory `LEGACY_SYNC_RESULTS` map so partial upgrades don’t brick.
  - `pollTranscriptionJob(handle, { onUpdate, signal, maxWaitMs })` — backoff `750ms → 5s`, end-to-end budget default 10 minutes, escalates to `unavailable` after 6 consecutive poll failures. Emits snapshots via `onUpdate`.
  - `cancelTranscriptionJob(handle)` — calls `DELETE`.
  - `transcribeAudio(uri, lang)` kept as a back-compat wrapper (start + poll).
  - `TranscriptionError.code` expanded to `'no_speech' | 'auth' | 'network' | 'timeout' | 'unavailable' | 'format_error' | 'server_error' | 'cancelled'` with matching `TRANSCRIPTION_ERROR_MESSAGES`.
  - OpenAI path shimmed onto the same async API (request runs in background, `pollOpenAIJob` awaits it).

- `src/screens/ProcessingScreen.tsx` **rewritten**:
  - Phases: `idle | uploading | queued | transcribing | summarizing | error`.
  - `transcribing` detail line shows `Audio 20s · Running 42s`.
  - Slow banner (`Still running — your recording is safe…`) appears at 30s and **persists**; it no longer hands off to a fatal state.
  - Error view per code: distinct title + emoji + message. `unavailable` shows the configured `WHISPER_LOCAL_URL`. `no_speech` shows a dedicated **Record again** button that navigates to `Capture`.
  - Retry button is hidden for non-retryable codes (`auth`, `format_error`, `no_speech`).
  - **Go home — I'll finish later** aborts only the client-side poll; the server job keeps running (retained 15 min via TTL).
  - **Cancel transcription** available during `queued`/`transcribing` (maps to DELETE).
  - Logs: `[ProcessingScreen] pipeline.start|upload.start|upload.done|job.snapshot|transcription.done|summary.start|summary.done|user.*|pipeline.failed`.

Everything typechecks clean (`tsc --noEmit` on both backend and app) and lints clean.

## Current state

- App **compiles** and runs via `npx expo start` / Expo Go.
- Backend **compiles**; uses existing key in `backend/.env`.
- Not yet verified end-to-end by the user since the transcription rework. Previous symptom was `TranscriptionError: Local Whisper server timed out after 60 seconds` on a ~20s recording — that specific failure mode is gone (client no longer has a 60s single-shot; server returns 202 + jobId).

## Known gaps / explicitly deferred

1. **Resume-across-app-restart** for transcription jobs. Right now `jobHandleRef` lives in `ProcessingScreen` only. Server keeps the job for 15 min, but if the user goes Home and kills the app, there is no reconnect on reopen. Next step (user approved in principle, not yet implemented): add optional `transcriptionJobId` to `VisitSummary`, persist the handle on start, resume polling on mount if present.
2. **Backend `/transcribe` route** (`backend/src/handlers/transcribe.ts`) is still the stub that returns 501. The client talks directly to `whisper_server.py`. If/when we proxy audio through the Node backend, we should mirror the same async job API there.
3. **Stage 1 LLM call is skipped for pure-text inputs.** We pass text through deterministically. Intentional: avoids an extra LLM roundtrip and hallucination risk. If product wants Stage 1 to always run, flip `runStage1` to always invoke the model (prompt already constrains it to transcribe verbatim).
4. **`sourceSegmentIds` traceability** is prompted for in Stage 2 but not enforced by `validateLLMOutput`. Current pass-through via `extractSegmentIds` in the handler is defensive — missing ids don't fail the request. If we want hard enforcement, extend `RawActionItem` / `RawFlag` types and validation.
5. **Dedicated tests.** No Vitest/Jest yet. Smoke testing is curl + manual through Expo Go. Open suggestion: a `backend/test/` vitest harness that mocks `fetch` and asserts Stage 1 → Stage 2 ordering and that raw images never reach Stage 2.
6. Legacy vars `OLLAMA_MODEL` / `OLLAMA_FALLBACK_MODEL` still read as fallback aliases. Remove next sweep.

## Key file paths

Backend:
- `aging-parents-plan/backend/src/config/env.ts`
- `aging-parents-plan/backend/src/extraction/types.ts`
- `aging-parents-plan/backend/src/extraction/prompts.ts`
- `aging-parents-plan/backend/src/extraction/stage1Extract.ts`
- `aging-parents-plan/backend/src/extraction/stage2Structure.ts`
- `aging-parents-plan/backend/src/extraction/pipeline.ts`
- `aging-parents-plan/backend/src/handlers/summarize.ts`
- `aging-parents-plan/backend/src/summary/ollamaChat.ts`
- `aging-parents-plan/backend/src/summary/outputValidator.ts` (unchanged; reused)
- `aging-parents-plan/backend/src/summary/prompts.ts` (now a shim)
- `aging-parents-plan/backend/src/types.ts`
- `aging-parents-plan/backend/src/validation.ts`
- `aging-parents-plan/backend/.env` and `.env.example`

App + server:
- `aging-parents-plan/whisper_server.py`
- `aging-parents-plan/src/services/transcriptionService.ts`
- `aging-parents-plan/src/screens/ProcessingScreen.tsx`
- `aging-parents-plan/src/services/summaryService.ts` (unchanged)
- `aging-parents-plan/src/contracts/schema.ts` (unchanged)
- `aging-parents-plan/src/config/env.ts` (unchanged)

## Conventions to keep following

- No mock/heuristic summary fallback in production path — only empty-sections fallback with a reason code.
- Server-only secrets in `backend/.env`; anything `EXPO_PUBLIC_*` is public.
- Ollama base must be `https://`; refuse to boot otherwise.
- Stage 2 must never consume raw OCR/audio — only `NormalizedText.segments`.
- Keep logs structured; prefer single-line JSON on the server, `key=value` on the client.
