# Rollback — Aging Parents Plan

**Audience:** Person on call, product owner, or engineer when a release causes problems.  
**Goal:** Restore a **safe state** quickly: app behavior, backend routing, and user expectations.

**Principle:** Prefer **fast toggles** (feature flags, DNS, load balancer) over **rebuilding old binaries** when time matters. Full store rollback can take hours or days.

---

## When to use this runbook

- Users report **crashes**, **cannot finish a visit summary**, or **errors after an update**.
- **Backend** returns errors or timeouts after a deploy.
- You need to **undo** a bad configuration change (wrong URL, wrong flag).

---

## 1 — Triage (5 minutes)

1. **Confirm the scope:** Is it **everyone** or **one device**? **One region** or **all**?
2. **Identify what changed** since last good state: app version, `EXPO_PUBLIC_*` values, backend deploy, or hosting.
3. **Do not paste** user medical text into chat or tickets — use **screenshots with text blurred** or **error codes only**.

**Quick classification**

| Symptom | Likely lever (try first) |
|---------|---------------------------|
| “Processing” spins forever / network errors | Backend URL, backend down, or `USE_BACKEND_PIPELINE` |
| App opens then crashes on one screen | Bad build → previous store version or hotfix |
| Only voice fails | Transcription / Whisper / backend transcribe |
| Only text fails | Summary / LLM / backend summarize |

---

## 2 — Feature-flag rollback (no new app binary)

Use when the **current installed app** already reads env at **build time** — changing `.env` **without** rebuilding **does not** change production users’ apps. These steps apply to **the next build** or to **server-only** behavior.

For **server-side** or **hosted config** that clients read at runtime (if you add that later), toggling can be instant.

### 2A — Disable backend-first pipeline (fastest logical rollback)

**Intent:** Force the app to use **legacy on-device / direct provider** paths instead of the Node backend first.

1. In your **source of truth** for env (EAS secrets, build profile, or `.env` for the next build), set:
   - `EXPO_PUBLIC_USE_BACKEND_PIPELINE=0`
2. **Rebuild and ship** a new binary **or** document that only **new** installs get the fix (if you cannot ship immediately).
3. Ensure **legacy** LLM/Whisper settings in `.env` are still valid for testers (see `.env.example`).

**Evidence:** Note the **build ID** and **flag value** in your incident log.

### 2B — Point backend URL back to a known-good server

1. Set `EXPO_PUBLIC_BACKEND_API_BASE` to the **last known-good** URL (staging, previous prod host, or IP).
2. Ship a **new build** with that value, **or** fix **DNS / reverse proxy** so the **same hostname** routes to the old server (no app update needed if hostname unchanged).

---

## 3 — Backend server rollback

1. **Stop** serving traffic to the broken deploy (load balancer, process manager, or cloud console).
2. **Redeploy** the previous **tagged image** or **git commit** you trust (main should be tagged at release).
3. Run **`GET /health`** on the production base URL; confirm `ok: true`.
4. Run one **`POST /summarize`** smoke test from [phase3-gate.md](./phase3-gate.md) (curl), **without** pasting real user content in tickets.
5. Confirm **telemetry** JSON lines show successful completion codes.

---

## 4 — App store rollback (binary)

1. **Android (Play):** In Play Console, use **staged rollout rollback** or upload the **previous APK/AAB** with a **higher versionCode** if required.
2. **iOS (App Store):** You generally **cannot** downgrade users; you submit a **new build** that fixes the issue or ask Apple for an expedited review for a hotfix.
3. Document **which version** is “last known good” in your internal wiki.

---

## 5 — Communication

1. **Internal:** Post status (what broke, what you changed, ETA) in your team channel.
2. **Users:** Short, non-technical message: “We’re fixing an issue with visit summaries; try again in X hours” — **no PHI**.

---

## 6 — After rollback

1. **Verify** smoke test: one capture → summary review on a **clean install** if possible.
2. **Open** a **post-incident** note (see [incident-response.md](./incident-response.md)).
3. **Schedule** a root-cause discussion within a few days.

---

## Dry-run (both roles can practice)

1. On a **dev device**, set `EXPO_PUBLIC_USE_BACKEND_PIPELINE=1` and a **wrong** backend URL; confirm processing fails gracefully (error screen, retry).
2. Set `EXPO_PUBLIC_USE_BACKEND_PIPELINE=0` and confirm **legacy path** still produces a summary (with dev keys as needed).
3. On **backend**, stop the process; confirm health check fails; restart; confirm health passes.

**Sign-off (dry-run)**

| Person | Date | Notes |
|--------|------|-------|
| | | |

---

## Revision

Update when hosting, EAS, or flag names change.
