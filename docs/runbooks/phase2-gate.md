# Phase 2 gate checklist

**Purpose:** Concise pass/fail gate before treating Phase 2 (durable capture, offline queue handling, backend contract readiness) as complete. Evidence can be notes in the PR or a short screen recording.

**Scope references:** `src/state/AppContext.tsx` (`@app_state_v1`), offline queue actions, `backend/` HTTP API + `src/api/client.ts`, `docs/architecture.md`, ADR-001 pipeline outcomes.

---

## 1. Storage durability

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| 1.1 | Summaries and linked data persist across **full app restart** (force-quit and relaunch). | ☐ | ☐ |
| 1.2 | **Role** (`parent` / `adult_child`) and **language** preference restore after restart. | ☐ | ☐ |
| 1.3 | **`offlineCaptureQueue`** survives restart (entries still present after relaunch). | ☐ | ☐ |
| 1.4 | **Corrupt / invalid** `@app_state_v1` JSON does not crash the app (falls back to empty state). | ☐ | ☐ |
| 1.5 | Session-only fields (**active summary selection**, **pending capture**, **processing flags**) are acceptable to **not** persist; behavior documented or verified as intentional. | ☐ | ☐ |

---

## 2. Queue replay (offline capture)

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| 2.1 | With **network off**, a capture can be **queued** (`QUEUE_OFFLINE_CAPTURE`) and appears in queue state. | ☐ | ☐ |
| 2.2 | After **network on**, queued item(s) can be **processed or dequeued** without duplicate summaries or data loss (manual spot-check). | ☐ | ☐ |
| 2.3 | **`DEQUEUE_OFFLINE_CAPTURE`** removes the correct item by `captureId`. | ☐ | ☐ |
| 2.4 | If replay is **not yet automated**, document gap and target sprint; gate may still pass with explicit “manual replay only” sign-off. | ☐ | ☐ |

---

## 3. Backend mock contract readiness

| # | Check | Pass | Fail |
|---|--------|:----:|:----:|
| 3.1 | Backend starts: `GET /health` returns **200** with JSON including `ok` and `requestId`. | ☐ | ☐ |
| 3.2 | **`POST /summarize`** with valid JSON (`visitId` + optional `rawText`) returns **`ok: true`** and a **`result`** matching success or `fallback_used` (per ADR-001). | ☐ | ☐ |
| 3.3 | **`POST /transcribe`** (JSON stub) returns **`ok: true`** with `transcript` + `language`. | ☐ | ☐ |
| 3.4 | Error path: **`ok: false`** envelope includes **`error.outcome`**, **`error.code`**, **`error.message`**, and **`requestId`**. | ☐ | ☐ |
| 3.5 | Mobile **`EXPO_PUBLIC_BACKEND_API_BASE`** points at the running backend; **`src/api/client.ts`** calls succeed or fail with **`ApiClientError`** (typed code), not silent failures. | ☐ | ☐ |
| 3.6 | **Server-only** provider env lives in **`backend/.env`** (not duplicated as production secrets in the client `.env`). | ☐ | ☐ |
| 3.7 | **`USE_BACKEND_PIPELINE`** (`EXPO_PUBLIC_USE_BACKEND_PIPELINE`) behavior agreed (backend first, legacy fallback); documented if not yet wired end-to-end. | ☐ | ☐ |

---

## Sign-off

Both parties must record **Pass** on all required rows (or **Fail** with a tracked follow-up) before merge/release.

| Role | Name | Date | Signature / initials |
|------|------|------|----------------------|
| **Developer** | | | |
| **Product / owner** | | | |

**Notes (blockers, waivers, links to evidence):**

```
(when / where / ticket ID)


```

---

## Revision

Update this runbook when persistence keys, queue semantics, or API contracts change.
