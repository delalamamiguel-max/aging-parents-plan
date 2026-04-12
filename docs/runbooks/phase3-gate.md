# Phase 3 gate checklist — integrated pipeline (go / no-go)

**Purpose:** Executable go/no-go verification for the **end-to-end capture → processing → summary** path with **backend HTTP API**, **client fallback**, **timeouts**, **validation**, **retry**, **offline queue**, and **persistence** — without shipping code changes during this checkpoint.

**Scope references:** `src/api/client.ts`, `src/config/env.ts` (`USE_BACKEND_PIPELINE`, `BACKEND_API_BASE`), `src/services/summaryService.ts`, `src/services/transcriptionService.ts`, `src/services/outputValidator.ts`, `backend/src/server.ts` + `backend/src/telemetry/*`, `src/state/AppContext.tsx` (`@app_state_v1`, `offlineCaptureQueue`), `src/screens/ProcessingScreen.tsx`, `docs/architecture.md`, ADR-001.

**Branch suggestion:** `phase3/shared-gate` (documentation only in-repo; branch optional for PR workflow).

---

## Preconditions (all must be true before Section A)

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| P.1 | Repo matches the Phase 3 integration commit you intend to release. | ☐ | ☐ |
| P.2 | You have **two terminals**: one for the Node backend, one for Expo (or device build). | ☐ | ☐ |
| P.3 | Root `.env` exists (from `.env.example`) with **`EXPO_PUBLIC_BACKEND_API_BASE`** pointing at the backend host (use LAN IP from a physical device, not `localhost`). | ☐ | ☐ |
| P.4 | **`backend/.env`** copied from `backend/.env.example` if you rely on server-side providers later (not required for mock-only checks). | ☐ | ☐ |

---

## A — Backend API (direct HTTP)

Execute these against the running backend (`npm run backend:dev` or `cd backend && npm run dev` after `npm run build`).

### A.1 Health

| Step | Action | Expected | Pass | Fail |
|------|--------|----------|:----:|:----:|
| 1 | `curl -sS http://127.0.0.1:8787/health` (adjust host/port if needed) | JSON includes `"ok":true`, `"requestId"`, `"status":"up"` | ☐ | ☐ |
| 2 | Confirm **one** structured telemetry line on server stdout for `backend.http.request_received` (JSON) with matching `requestId` | Log line present, **no** request body in log | ☐ | ☐ |

### A.2 Summarize — success path

| Step | Action | Expected | Pass | Fail |
|------|--------|----------|:----:|:----:|
| 1 | `curl -sS -X POST http://127.0.0.1:8787/summarize -H 'Content-Type: application/json' -H 'X-Request-Id: gate-summarize-1' -d '{"visitId":"gate-v1","rawText":"Doctor said follow up in two weeks."}'` | `ok:true`, `requestId` echoed or generated, `result.outcome` is `success` or `fallback_used` | ☐ | ☐ |
| 2 | Server logs: `backend.pipeline.summarize.finished` JSON with `httpStatus:200`, `durationMs`, **no** raw transcript text | Confirmed | ☐ | ☐ |

### A.3 API failure envelope (structured error)

| Step | Action | Expected | Pass | Fail |
|------|--------|----------|:----:|:----:|
| 1 | `curl -sS -X POST http://127.0.0.1:8787/transcribe -H 'Content-Type: application/json' -d '{"_stubInvalid":true}'` | `ok:false`, `error.code`, `error.outcome`, `error.message`, `requestId` | ☐ | ☐ |
| 2 | Server telemetry line includes `errorCode` / `httpStatus` (non-200) — **no** PHI in payload | Confirmed | ☐ | ☐ |

### A.4 Malformed request body

| Step | Action | Expected | Pass | Fail |
|------|--------|----------|:----:|:----:|
| 1 | `curl -sS -X POST http://127.0.0.1:8787/summarize -H 'Content-Type: application/json' -d 'not-json'` | HTTP **400**, `ok:false`, `error.code` reflects validation/parse failure | ☐ | ☐ |

### A.5 Timeout / unreachable API (simulated)

| Step | Action | Expected | Pass | Fail |
|------|--------|----------|:----:|:----:|
| 1 | Stop the backend **or** point **`EXPO_PUBLIC_BACKEND_API_BASE`** at `http://127.0.0.1:59999` (nothing listening). | — | ☐ | ☐ |
| 2 | From the **app** (Section B), run a **text** capture through processing with **`EXPO_PUBLIC_USE_BACKEND_PIPELINE=1`**. | **`ApiClientError`** path or network failure → **legacy client pipeline still completes** OR user sees error UI with **Try again** (no silent hang). | ☐ | ☐ |
| 3 | Restore backend and correct `EXPO_PUBLIC_BACKEND_API_BASE`; restart Expo. | App processes capture again successfully. | ☐ | ☐ |

> **Note:** Client default timeout is long (~70s). For a quicker gate, prefer “wrong port” + confirm failure within one minute or use a dedicated low-timeout test build only if your team allows it.

---

## B — Mobile client: integrated pipeline + retry

**Setup:** `EXPO_PUBLIC_USE_BACKEND_PIPELINE=1`, valid `EXPO_PUBLIC_BACKEND_API_BASE`, legacy LLM/Whisper env available so **fallback** works when backend fails.

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| B.1 | **Text capture** completes and reaches summary review with backend reachable (observe console: backend telemetry + Metro logs; no raw transcript in analytics). | ☐ | ☐ |
| B.2 | **Processing error UI**: with backend down or wrong URL, capture shows error state with **Try again** (`ProcessingScreen`). | ☐ | ☐ |
| B.3 | **Retry**: tap **Try again**; with backend restored, run completes **or** clear failure repeats (no stuck spinner forever). | ☐ | ☐ |
| B.4 | **Voice capture** (if in scope): with backend + legacy Whisper configured, transcription runs; if using JSON transcribe stub only, confirm team expectation (mock transcript vs legacy path) and record in notes. | ☐ | ☐ |

---

## C — Validator + LLM path (legacy client)

**When:** `USE_BACKEND_PIPELINE=0` **or** backend failed over to legacy summarisation.

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| C.1 | Pipeline still returns a summary or controlled empty/fallback; **`_validationWarnings`** may list non-blocking warnings (see `outputValidator` errors vs warnings). | ☐ | ☐ |
| C.2 | **Invented numeric / ungrounded** content (if you run a targeted adversarial prompt in a dev session) triggers **validation failure → empty fallback** per policy — document **pass/fail** and example in notes. | ☐ | ☐ |

---

## D — Offline queue + replay

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| D.1 | Queue at least one capture while offline (or simulate via `QUEUE_OFFLINE_CAPTURE` / product flow your build supports). | ☐ | ☐ |
| D.2 | Bring network online; **replay or dequeue** without duplicate summaries or obvious data loss (spot-check). | ☐ | ☐ |

---

## E — Restart persistence

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| E.1 | After **force-quit** and relaunch, **summaries** and **`offlineCaptureQueue`** still match pre-restart expectations (`@app_state_v1`). | ☐ | ☐ |
| E.2 | No crash on startup when storage is valid; corrupt-storage behavior acceptable per Phase 2 gate. | ☐ | ☐ |

---

## Go / no-go decision

| Criterion | Status |
|-----------|--------|
| Sections **A–E** have no **Fail** unless waived below | ☐ Pass ☐ Fail |
| Waivers (ticket ID + owner): | |

---

## Sign-off

Both parties execute the rows they own and record **Pass** before merge/release.

| Role | Name | Date | Signature / initials |
|------|------|------|----------------------|
| **Engineering** | | | |
| **Product / owner** | | | |

**Evidence links (screen recordings, curl transcripts, log snippets — redact PHI):**

```




```

---

## Revision

Update this runbook when routes, env flags, or persistence keys change.
