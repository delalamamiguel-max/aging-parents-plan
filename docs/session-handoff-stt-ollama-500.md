# Session Handoff — STT Pipeline Failure Diagnosis (Ollama Cloud 500)

Use this as the starting point for the next chat. Diagnosis is complete. No code changes have been made. Next session should pick one of the remediation directions in §7 and implement it.

---

## 1. Current intended architecture (unchanged from prior session)

- **Two-stage pipeline, Ollama Cloud only for LLM work.**
  - Stage 1 (extraction): `OLLAMA_EXTRACTION_MODEL` = `gemma4:31b-cloud` — OCR, PDF text, and (intended) audio-to-text.
  - Stage 2 (structured): `OLLAMA_STRUCTURED_MODEL` = `qwen3.5:cloud` — context-aware extraction from Stage 1 normalized text.
- **Whisper is fully removed** (local Python server deleted, OpenAI Whisper path deleted, client-side Whisper env vars removed). Confirmed in this diagnosis that no Whisper call is still in the runtime path.
- **STT runtime path today**: app records m4a → multipart POST `/transcribe` to Node backend → backend calls `ollamaChat` against `https://ollama.com/api/chat` with audio bytes base64-encoded in the `images[]` array on `OLLAMA_TRANSCRIPTION_MODEL` (defaults to `OLLAMA_EXTRACTION_MODEL`).

---

## 2. Current failure (reported 2026-04-18)

User sees this in-app error **immediately** after recording ends (not after a long wait):

```
[ProcessingScreen] pipeline.failed code=server_error
message=Ollama HTTP 500: {"error":"Internal Server Error (ref: fe24ba77-431d-467d-8b04-35bdec02df8c)"}
```

UI shows "Transcription server error" with a generic retry button. Retrying reproduces the same 500 deterministically.

---

## 3. Exact failure point

- The `Ollama HTTP 500: …` string is thrown by **one location only**:
  - `aging-parents-plan/backend/src/summary/ollamaChat.ts:87` — thrown when `/api/chat` on `https://ollama.com` returns a non-OK status.
- The `ref:` UUID is an **Ollama Cloud server-side exception id**, not one of ours. The 500 comes back fast, which is why the UI error appears seconds after recording ends (not after the 5-minute timeout).

### Propagation chain (files / functions)

1. `backend/src/summary/ollamaChat.ts` → `ollamaChat()` throws `Ollama HTTP 500: …`.
2. `backend/src/summary/ollamaTranscribe.ts` → `transcribeWithOllamaExtractionModel()` re-throws.
3. `backend/src/handlers/transcribe.ts` → `mapTranscribeFailure()` doesn't match `auth failed` / `timed out` / `Cannot reach Ollama`, so it falls into the **default branch** → `StructuredApiError(code: 'server_error', httpStatus: 502)` (lines ~35–39).
4. `backend/src/server.ts` → `routeTranscribe()` writes the standard error envelope.
5. `src/services/transcriptionService.ts` → `mapWireCode('server_error')` → `TranscriptionError('server_error')`.
6. `src/screens/ProcessingScreen.tsx:240` logs `pipeline.failed code=server_error …` and renders the error view.

---

## 4. Actual runtime path after recording completes

1. App saves m4a locally.
2. `transcribeAudio()` → `fetch(POST ${BACKEND}/transcribe)` with `FormData { file, language }`. **No Whisper**. **No OpenAI**. **No local Python server.**
3. Backend `routeTranscribe()` → `parseTranscribeMultipart()` succeeds (otherwise error code would be `format_error`, not `server_error`).
4. `handleTranscribe()` → `transcribeWithOllamaExtractionModel()`:
   - Base64-encodes audio bytes.
   - Calls `ollamaChat({ model: 'gemma4:31b-cloud', images: [<b64 m4a>], … })`.
5. `POST https://ollama.com/api/chat` → **HTTP 500** with body `{"error":"Internal Server Error (ref: fe24…)"}`.
6. Backend returns `server_error` → client shows generic retry screen.

---

## 5. Classification

**Not** a timeout. **Not** a Whisper leftover. **Not** an auth or network failure.

The real issue is a **service-path / model-capability mismatch**:

- `gemma4:31b-cloud` is a **text + image** cloud model. The 31B dense Gemma tag has **no audio encoder** — audio support lives only in the **E2B / E4B edge variants** (local models, not currently offered as a cloud tag).
- Ollama's `/api/chat` has **no audio field** yet (upstream feature request is still open).
- So base64 m4a bytes placed into `images[]` are handed to Ollama Cloud's image pipeline, which blows up with a generic 500 and a `ref:` UUID.
- Startup of the STT call works; the **first model-call request is structurally incompatible** with the selected cloud model. Every retry deterministically fails the same way.

Secondary UX issue: `mapTranscribeFailure` flattens any non-auth/timeout/network error to `server_error` with a generic user-facing copy. This hides the real signal (provider rejected the payload because the selected model can't accept audio).

---

## 6. Config snapshot at time of failure

`aging-parents-plan/backend/.env` (relevant keys):

- `OLLAMA_BASE_URL=https://ollama.com`
- `OLLAMA_API_KEY=<set>`
- `OLLAMA_EXTRACTION_MODEL=gemma4:31b-cloud`
- `OLLAMA_STRUCTURED_MODEL=qwen3.5:cloud`
- `OLLAMA_TRANSCRIPTION_MODEL=` (unset → falls back to `OLLAMA_EXTRACTION_MODEL` per `backend/src/config/env.ts`)
- `OLLAMA_TRANSCRIPTION_TIMEOUT_MS=300000`

---

## 7. Recommendations (pick one; do not re-introduce Whisper)

1. **Stop treating `gemma4:31b-cloud` as an ASR model.** Cloud tag is text + image only; `/api/chat` + `images[m4a]` is structurally wrong.
2. Pick a direction:
   - **A. Local Gemma for STT.** Run `gemma4:e2b` or `gemma4:e4b` against a local Ollama daemon (these tags have an audio encoder). Point `OLLAMA_TRANSCRIPTION_MODEL` + a separate base URL at it. Keep `OLLAMA_STRUCTURED_MODEL` on Ollama Cloud. Keeps "Ollama only" intent for LLM stack but sacrifices "Cloud only".
   - **B. Ollama Cloud OpenAI-compat STT.** Use `/v1/audio/transcriptions` against an ASR-capable cloud model, if one is available on the account. Ollama's library does not currently list a cloud ASR tag — **verify first** before committing.
   - **C. External STT provider through the backend.** Accept that STT lives outside Ollama; proxy through Node backend so no client secrets. Two-stage Gemma/Qwen Cloud summary pipeline is unaffected.
3. **Tighten error mapping** in `backend/src/handlers/transcribe.ts::mapTranscribeFailure` so provider 5xx surfaces a distinct user state (include model name, e.g. "Transcription model `gemma4:31b-cloud` rejected the audio payload"). Today it flattens to `server_error` and hides the cause.
4. **Add a fail-fast config check** at backend startup: if `OLLAMA_TRANSCRIPTION_MODEL` is a known text/image-only tag (e.g. any `:cloud` tag without audio support), refuse to boot with a clear message instead of letting every recording hit a 500.
5. **Do not** re-introduce Whisper or any local Python service as a workaround. This is a model-capability mismatch, not a transport problem.

---

## 8. Files you'll likely need to touch next session

- `aging-parents-plan/backend/src/config/env.ts` — add/validate `OLLAMA_TRANSCRIPTION_MODEL`, possibly `OLLAMA_TRANSCRIPTION_BASE_URL` if direction A.
- `aging-parents-plan/backend/src/summary/ollamaTranscribe.ts` — change model target (A), switch to `/v1/audio/transcriptions` (B), or replace call (C).
- `aging-parents-plan/backend/src/summary/ollamaChat.ts` — only if adding a second base URL or switching endpoint.
- `aging-parents-plan/backend/src/handlers/transcribe.ts` — refine `mapTranscribeFailure` error codes + user messages.
- `aging-parents-plan/src/services/transcriptionService.ts` + `src/screens/ProcessingScreen.tsx` — surface new error code(s) with clearer copy.
- `aging-parents-plan/backend/.env.example` — document new env vars.

---

## 9. Do / don't for next session

- **Do** pick one remediation direction (A/B/C) before touching code.
- **Do** verify in the Ollama library/account what cloud tags actually exist with audio support before assuming B is viable.
- **Don't** re-add Whisper, `whisper_server.py`, or any OpenAI-Whisper code path.
- **Don't** treat this as a timeout bug — the 5-minute `OLLAMA_TRANSCRIPTION_TIMEOUT_MS` is never reached.
- **Don't** retry-loop the existing call; it is a deterministic 500.
