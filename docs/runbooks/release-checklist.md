# Release checklist — Aging Parents Plan

**Audience:** Product owner, release coordinator, or engineer doing a disciplined ship.  
**Goal:** Ship a build only after gates, env, and evidence are in order — without surprises for users.

**Related docs:** [Architecture](../architecture.md), [ADR-002 env separation](../adr/ADR-002-env-separation.md), [Phase 2 gate](./phase2-gate.md), [Phase 3 gate](./phase3-gate.md), [Dev working agreement](./dev-working-agreement.md).

**App identity (from `app.json`):** name **Aging Parents Plan**, slug `aging-parents-plan`, Expo app version **`0.1.0`** (bump this when you cut a user-visible release). Root `package.json` version may differ; **store-facing version** should follow **Expo / `app.json`** for builds you submit.

---

## 1 — Decide what “release” means

1. **Internal test build** — distributed to a few testers (TestFlight, internal track, APK sideload). Lower bar; still run Section 3–4.
2. **Store release** — Apple App Store and/or Google Play **production** track. Full checklist below.
3. **Backend-only change** — Node server or hosting config, **no** new app binary. Use Section 5 + [Rollback](./rollback.md) for server; app checklist optional.

---

## 2 — Feature flags and environment (before you build)

Complete with **evidence** (checkbox + owner initials + date).

| # | Item | Pass |
|---|------|:----:|
| 2.1 | **`EXPO_PUBLIC_USE_BACKEND_PIPELINE`** is set to the intended value for this release (`0` = legacy client AI only; `1` = try backend first, then legacy). Document the choice in the release notes. | ☐ |
| 2.2 | **`EXPO_PUBLIC_BACKEND_API_BASE`** points to the **correct** server URL for each environment (dev / staging / prod). **Physical devices** cannot use `localhost`; use the computer’s LAN IP or your hosted API hostname. | ☐ |
| 2.3 | **No production secrets** in the client `.env` (see ADR-002). API keys belong in **`backend/.env`** on the server, not in `EXPO_PUBLIC_*` for real users. | ☐ |
| 2.4 | Legacy client keys (if any) are **throwaway or dev-only**, or you accept bundle exposure per policy. | ☐ |

---

## 3 — Quality gates (recommended)

| # | Gate | Pass |
|---|------|:----:|
| 3.1 | **Phase 2** runbook completed or waived with sign-off: [phase2-gate.md](./phase2-gate.md). | ☐ |
| 3.2 | **Phase 3** integrated pipeline runbook completed or waived: [phase3-gate.md](./phase3-gate.md). | ☐ |
| 3.3 | **CI green** on the commit you are releasing (typecheck + tests + backend build, per `.github/workflows/ci.yml`). | ☐ |

---

## 4 — Pre-submit checks (store-bound binaries)

1. **Version and build numbers**
   1. Open `app.json` and set **`expo.version`** to the new marketing version (e.g. `0.2.0`).
   2. In **EAS Build** (or your builder), set **iOS build number** / **Android versionCode** to a value **higher** than the last store submission (stores reject duplicates).
2. **Smoke test on a real device**
   1. Install the release candidate build.
   2. Complete **one text capture** end-to-end: capture → processing → summary review (no crash).
   3. If voice is in scope: one short recording → processing → review.
   4. Confirm **no raw medical text** appears in public analytics or screenshots you share externally.
3. **Permissions copy** — `app.json` already describes microphone, calendar, and photo usage; confirm they still match what the app actually does.
4. **Rollback plan** — Read [rollback.md](./rollback.md) once and note who can flip flags or pull the build.

**Evidence checklist**

| # | Evidence | Pass |
|---|----------|:----:|
| E.1 | Link or ID of the **CI run** that passed for this commit | ☐ |
| E.2 | **Build ID** (EAS) or artifact name for iOS/Android | ☐ |
| E.3 | Screenshot or note from **smoke test** (device + date) | ☐ |
| E.4 | **Release notes** drafted (what changed, known limitations) | ☐ |

---

## 5 — Backend (if users depend on the Node API)

1. **Deploy** `backend/` to your host with **`backend/.env`** set (no secrets in git).
2. **Health check:** open `GET /health` on the production base URL; expect JSON with `ok: true` and a `requestId`.
3. **Structured logs:** confirm you can see JSON telemetry lines (see backend `telemetry/`) — **no PHI** in logs.
4. Match **`EXPO_PUBLIC_BACKEND_API_BASE`** in the shipped app to this URL.

---

## 6 — Submit and monitor

1. Submit the binary through **App Store Connect** / **Google Play Console** per your org’s process.
2. After approval, perform a **staged rollout** if available (e.g. 10% → 50% → 100%).
3. For the first 24–48 hours, watch **crash reports**, **support messages**, and **server error rates** (if backend is live).
4. If something goes wrong, open [incident-response.md](./incident-response.md).

---

## 7 — Sign-off

| Role | Name | Date | Initials |
|------|------|------|----------|
| Owner / product | | | |
| Engineering | | | |

---

## Revision

Update this checklist when you add environments, EAS profiles, or new flags.
