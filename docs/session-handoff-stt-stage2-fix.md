# Session Handoff — STT + Stage 2 Rework (2026-04-18)

Continue from this file in the next chat. This picks up where `session-handoff-stt-ollama-500.md` left off and covers everything done in the follow-up session that implemented the fix, then chased a second, unrelated empty-response failure in Stage 2.

Related prior transcript (do not re-read linearly; search only if needed): [STT pipeline diagnosis](bb096e47-3841-4301-a354-1ad3b08003b1).

---

## 1. Current end-to-end architecture (what is running today)

```
┌──────────────┐   multipart /transcribe    ┌──────────────────┐   HTTPS multipart   ┌────────────────────────┐
│  Expo app    │ ─────────────────────────▶ │  Node backend    │ ──────────────────▶ │  Groq Cloud (STT)      │
│  (phone)     │                            │  /transcribe     │                     │  whisper-large-v3-turbo│
└──────────────┘                            └──────────────────┘ ◀────────────────── │  /openai/v1/audio/…    │
                                                   │                                 └────────────────────────┘
                                                   │ transcript (JSON)
                                                   ▼
                                            ┌──────────────────┐   HTTPS /api/chat   ┌────────────────────────┐
                                            │  /summarize →    │ ──────────────────▶ │  Ollama Cloud          │
                                            │  Stage 1 (if img)│                     │  Stage 1: gemma4:31b-cloud
                                            │  Stage 2 (always)│ ◀────────────────── │  Stage 2: ministral-3:14b-cloud
                                            └──────────────────┘                     └────────────────────────┘
```

Policies:
- **No client secrets.** All provider API keys (`GROQ_API_KEY`, `OLLAMA_API_KEY`) live only in `backend/.env`.
- **Two-stage LLM pipeline is intact.** Stage 2 never sees raw audio/OCR — only Stage 1's normalized text.
- **Stage 1 runs in-process (no LLM call) for pure-text/audio inputs.** The LLM call only happens when PDFs/images are present.
- **Transcription does NOT run on Ollama.** Ollama Cloud has no ASR endpoint — that's the whole reason we moved STT to Groq.
- **Whisper (local Python, OpenAI Whisper API) is fully removed.** Do not reintroduce.

---

## 2. What was actually implemented this session

### 2.1 STT migration — Ollama → Groq Whisper

Reason: `gemma4:31b-cloud` has no audio encoder; `/api/chat` has no audio field. Sending m4a bytes in `images[]` produced deterministic HTTP 500s.

Changes:
- **New file:** `backend/src/stt/groqTranscribe.ts` — multipart POST to `https://api.groq.com/openai/v1/audio/transcriptions`, Node 18+ native `FormData`/`Blob`/`fetch`, AbortController timeout.
- **Deleted:** `backend/src/summary/ollamaTranscribe.ts` (the audio-in-`images[]` hack).
- **Updated:** `backend/src/handlers/transcribe.ts` — dispatches on `STT_PROVIDER`, new `mapTranscribeFailure` with distinct error codes (`auth`, `rate limited → unavailable`, `file rejected → format_error`, `timeout`, `network`, 5xx with model name in message).
- **Updated:** `backend/src/config/env.ts`:
  - Added: `STT_PROVIDER` (only `'groq'` supported), `STT_MODEL` (default `whisper-large-v3-turbo`), `STT_TIMEOUT_MS` (60 s), `GROQ_BASE_URL` (default `https://api.groq.com`), `GROQ_API_KEY`.
  - Removed: `OLLAMA_TRANSCRIPTION_MODEL`, `OLLAMA_TRANSCRIPTION_TIMEOUT_MS`.
  - Added fail-fast check: server refuses to boot without `GROQ_API_KEY` when `STT_PROVIDER=groq`.
- **Updated:** `backend/.env.example` + `backend/.env` — new STT section, Whisper-style extension list documented.
- **Updated:** Client copy in `src/services/transcriptionService.ts` header, `src/screens/ProcessingScreen.tsx` subtitle, `src/config/env.ts` summary. Client timeout reduced 300s → 90s (STT is fast now).
- **Updated:** `ApiPipelineErrorCode` in `backend/src/types.ts` and `PipelineErrorCode` in `src/contracts/schema.ts` to include `'unavailable'`.

Client wire contract is unchanged: multipart `file`+`language` → `{ ok, requestId, result: { transcript, language } }`.

### 2.2 Stage 2 model swap — qwen3.5:cloud → ministral-3:14b-cloud

After STT was working, a new failure surfaced: summarize returned `provider_error` with `Ollama returned empty message.content`.

First diagnostic guess (wrong but instructive): assumed token budget exhaustion. Added `think: false` default + bumped `num_predict` from 2048 → 4096 in `backend/src/summary/ollamaChat.ts`. Improved error message to include model, `done_reason`, raw body, and a hint.

Real failure (second attempt, with improved error visible):
```
done_reason="stop"
total_duration: 56.2s
prompt_eval_count: 893
content: ""    (no thinking field either)
```

Diagnosis: `qwen3.5:cloud` silently runs extended reasoning and emits empty content under `format:'json'` — `think: false` in the request body is NOT honored by that tag on Ollama Cloud. The model stops cleanly (EOS), produces zero output tokens, eats ~60s of compute.

Fix: switched Stage 2 default to `ministral-3:14b-cloud`.

Why ministral-3:14b-cloud:
- Capability tags: `vision tools cloud` — **no `thinking`** capability, so the hidden-reasoning trap can't happen.
- Instruction-tuned Mistral, 14B active params, 256K context. More than enough for ~500-token medical transcripts.
- Confirmed valid cloud tag (digest `615c59440878`, see https://ollama.com/library/ministral-3:14b-cloud).

Changes applied:
- `backend/.env` + `backend/.env.example`: `OLLAMA_STRUCTURED_MODEL=ministral-3:14b-cloud`.
- `backend/src/config/env.ts`: default for `OLLAMA_STRUCTURED_MODEL` changed from `qwen3.5:cloud` to `ministral-3:14b-cloud`; docstring explains why.
- `backend/src/extraction/prompts.ts` + `stage2Structure.ts`: header comments updated.
- `think: false` + `num_predict: 4096` defaults kept in `ollamaChat.ts` as belt-and-suspenders.

Stage 1 kept at `gemma4:31b-cloud` (works fine; only hit on image/PDF inputs, not voice).

### 2.3 Improved `ollamaChat` diagnostics

`backend/src/summary/ollamaChat.ts`:
- Accepts `think?: boolean` (default `false`).
- Logs `done_reason` and a 200-char raw-body preview in the empty-content error.
- Targeted hints: `done_reason === 'length'` → suggests numPredict / think:false; otherwise → suggests model tag check.

---

## 3. Current config in `backend/.env`

```
BACKEND_PORT=8787

OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=<set — cloud key>

OLLAMA_EXTRACTION_MODEL=gemma4:31b-cloud
OLLAMA_STRUCTURED_MODEL=ministral-3:14b-cloud

STT_PROVIDER=groq
STT_MODEL=whisper-large-v3-turbo
GROQ_API_KEY=<set by user this session>
```

Expected `[backend] config:` log line at startup:
```
port=8787 | LLM=ollama-cloud @ https://ollama.com (apiKey: set) | stage1=gemma4:31b-cloud | stage2=ministral-3:14b-cloud | STT=groq @ https://api.groq.com model=whisper-large-v3-turbo (apiKey: set) | sttTimeoutMs=60000
```

---

## 4. State of verification

- **Transcription end-to-end**: ✅ CONFIRMED working by user. Recording → `/transcribe` → Groq → transcript returned. Stage 1 normalization then ran deterministically in-process and handed segments to Stage 2.
- **Stage 2 with qwen3.5:cloud**: ❌ CONFIRMED failing. Empty content, 56s compute, done_reason=stop. Two separate recordings produced the same outcome.
- **Stage 2 with ministral-3:14b-cloud**: ⏳ **NOT YET VERIFIED BY USER.** The user asked to save context right after this change was applied. First action in next session is to confirm it actually works.

---

## 5. First thing to do in next session

Ask the user: "Did the Ministral 3 Stage 2 fix work?"

- If **yes**: the pipeline is green end-to-end; move on to any new feature work.
- If **no** (empty content again, different error, or slow): pull the full error from the phone and inspect the `done_reason` + raw body. See §6 for failure modes and what each means.

---

## 6. Failure-mode cheat-sheet for Stage 2

Error format (thrown by `ollamaChat.ts` line ~100):
```
Ollama returned empty message.content for model="<model>" done_reason="<reason>". <hint> Raw body: <first 200 chars>
```

| `done_reason` | Meaning | Action |
|---|---|---|
| `stop` | Model emitted EOS with no content. Almost always a thinking-model trap under `format:'json'`. | Switch to a non-thinking cloud tag. Current fix: `ministral-3:14b-cloud`. |
| `length` | `num_predict` exhausted. | Bump `numPredict` on the call, or ensure the model isn't thinking. |
| `load` | Model failed to load on cloud. | Check the tag name and account access. |
| absent | Non-JSON or malformed body. | Check `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, and tag validity. |

Non-thinking cloud models available (as of this session's registry lookup — re-verify in the next session if relying on this):
- `ministral-3:14b-cloud` ← **current Stage 2 default**
- `ministral-3:8b-cloud`
- `ministral-3:3b-cloud`
- `devstral-small-2:24b-cloud` (coding-biased)
- `devstral-2:123b-cloud` (coding-biased)
- `rnj-1:8b-cloud` (STEM/code)
- `cogito-2.1:671b-cloud` (huge; non-thinking instruction-tuned)

Non-thinking tags have capability string `vision tools cloud` or `tools cloud` — **no `thinking`**. Verify via https://ollama.com/search?c=cloud before switching.

---

## 7. Files touched in this session

**Backend**:
- `backend/src/config/env.ts` — STT config, Stage 2 default, fail-fast validation, summary
- `backend/src/stt/groqTranscribe.ts` — NEW
- `backend/src/handlers/transcribe.ts` — dispatches on STT_PROVIDER, refined error mapping
- `backend/src/summary/ollamaChat.ts` — `think: false` default, 4096 num_predict, richer error
- `backend/src/summary/ollamaTranscribe.ts` — DELETED
- `backend/src/extraction/stage2Structure.ts` — doc comment
- `backend/src/extraction/prompts.ts` — doc comments
- `backend/src/extraction/types.ts` — comment (audio now Groq, not Ollama)
- `backend/src/types.ts` — added `'unavailable'` to `ApiPipelineErrorCode`
- `backend/.env` + `backend/.env.example` — STT section + Stage 2 model update

**Client** (copy only; no behavior change):
- `src/services/transcriptionService.ts` — header, messages, timeout 300→90s
- `src/screens/ProcessingScreen.tsx` — header + subtitle copy
- `src/config/env.ts` — config summary copy
- `src/contracts/schema.ts` — added `PipelineErrorCode.Unavailable`

Verifications run (both clean at end of session):
- `cd backend && ./node_modules/.bin/tsc --noEmit`
- `cd aging-parents-plan && ./node_modules/.bin/tsc --noEmit`
- No lints on touched files.

---

## 8. How to run

Two terminals:

```
# Terminal 1 (backend)
cd "aging-parents-plan"
npm run backend:dev
# wait for: [backend] listening on http://127.0.0.1:8787 …
# confirm: stage2=ministral-3:14b-cloud … STT=groq

# Terminal 2 (mobile)
cd "aging-parents-plan"
npx expo start -c   # -c only needed on first run after env/schema changes
```

Phone must be on same Wi-Fi as Mac; `EXPO_PUBLIC_BACKEND_API_BASE` in `aging-parents-plan/.env` must point to Mac's LAN IP.

Smoke test (in any terminal): `curl -s http://127.0.0.1:8787/health` → `{"ok":true,…,"status":"up"}`.

---

## 9. Do / don't

- **Do** verify the Ministral Stage 2 actually works on the next recording.
- **Do** keep using Groq for STT; do not revert to Whisper or try to route audio through Ollama.
- **Do** prefer non-thinking instruction-tuned cloud models for any stage that uses `format:'json'`.
- **Don't** switch Stage 2 back to `qwen3.5:cloud`, `gemma4:*-cloud`, `nemotron-*-cloud`, `deepseek-v*-cloud`, `minimax-m*-cloud`, or any tag with the `thinking` capability — all have the same empty-content risk.
- **Don't** drop `format:'json'` without also updating `parseLLMResponse` to tolerate prose-mixed output; it already handles code-fenced and first-JSON-object extraction but the current Stage 2 prompt relies on pure JSON.
- **Don't** commit `backend/.env` — it contains `OLLAMA_API_KEY` and `GROQ_API_KEY`. Already gitignored.

---

## 10. Outstanding / nice-to-have (not blocking)

- **Stream Stage 2 as NDJSON** with `stream: true` instead of `stream: false`. Would eliminate the "56s of silence" failure mode entirely because we'd see tokens arrive (or not) in real time, and we could abort early if the first 2s produce nothing. Medium lift; not needed if Ministral works.
- **Sprint docs** (`aging-parents-plan/Walkthrough by Sprint/walkthrough_sprint_*.md`) haven't been re-checked for stale model names post-Stage 2 swap. Low priority.
- **Handoff doc `session-handoff-stt-ollama-500.md`** still describes the pre-STT-fix state. It's historically accurate; don't overwrite, but link to this file from the top if revisiting.
- **Rotation of the Ollama Cloud key** left in `backend/.env`. User was alerted; no action taken.
