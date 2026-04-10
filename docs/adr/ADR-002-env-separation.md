# ADR-002: Environment variable policy (client vs server)

- **Status:** Accepted
- **Date:** 2026-04-10
- **Scope:** `src/config/env.ts`, `.env`, `.env.example` (no code behavior change in this ADR).

## Context

This app is an **Expo (React Native) client**. Variables prefixed with **`EXPO_PUBLIC_`** are intended by Expo to be available in app code; they are **bundled into the client JavaScript** at build time. That means:

- There is **no hiding** of `EXPO_PUBLIC_*` values from anyone who can inspect the app package or runtime.
- **API keys** placed in `EXPO_PUBLIC_*` are **not server-only** in practice—they are **exposed as client-side secrets**, which is acceptable only for **local development** or **throwaway keys**, never for production-grade protection of paid quotas or sensitive backends.

The **target policy** is: **secrets belong on a server** (or managed secure channel); the client should call **your backend**, which holds provider keys and talks to Gemini / OpenAI / Whisper proxies.

## Decision

1. **Classify every variable** as either **client-safe** or **server-only** by *intent*:
   - **Client-safe:** Non-secret configuration that may ship in the app (provider choice, public model names, non-sensitive URLs where acceptable).
   - **Server-only:** Secrets and anything that must **not** be embedded in a shipped client (API keys, private endpoints, internal credentials).

2. **Document the current gap:** Today, `env.ts` reads secrets via `EXPO_PUBLIC_*` so the **client bundle can access them**. That is **contradictory to server-only intent** until a backend exists. Mark these keys clearly in `.env.example` and treat **production** use of raw keys in the client as **out of policy**.

3. **Do not remove keys** in this iteration; migration is phased (see below).

## Variable classification (current file)

| Variable | Intended classification | Notes |
|----------|-------------------------|--------|
| `EXPO_PUBLIC_LLM_PROVIDER` | **Client-safe** | `gemini` / `ollama` toggle. |
| `EXPO_PUBLIC_OLLAMA_BASE_URL` | **Client-safe** (operational) | Not a cryptographic secret; may reveal **network topology** (e.g. LAN IP). Prefer non-sensitive URLs for shipped builds. |
| `EXPO_PUBLIC_OLLAMA_MODEL` | **Client-safe** | Model id string. |
| `EXPO_PUBLIC_GEMINI_API_KEY` | **Server-only** | **Today:** embedded via `EXPO_PUBLIC_` → **exposed in bundle**. Dev-only until proxied. |
| `EXPO_PUBLIC_WHISPER_PROVIDER` | **Client-safe** | `local` / `openai` toggle. |
| `EXPO_PUBLIC_WHISPER_LOCAL_URL` | **Client-safe** (operational) | Same topology caveat as Ollama URL. |
| `EXPO_PUBLIC_WHISPER_MODEL` | **Client-safe** | Model id string. |
| `EXPO_PUBLIC_OPENAI_API_KEY` | **Server-only** | **Today:** embedded via `EXPO_PUBLIC_` → **exposed in bundle**. Dev-only until proxied. |

## Warning notes (summary)

- **Never commit** a real `.env` file; use `.env.example` as a template only.
- **`EXPO_PUBLIC_` + API key = visible secret.** Assume keys in the client can be extracted.
- **Production path:** move Gemini / OpenAI (and optionally Whisper) calls behind **your server**; client uses **session-scoped or public-only** config, not raw provider keys in the bundle.

## Migration notes (future work; not done in this ADR)

1. **Introduce a small backend** (or serverless functions) that holds `GEMINI_API_KEY`, `OPENAI_API_KEY`, and performs provider calls on behalf of the app.
2. **Client env:** replace secret vars with **public** values only, e.g. `EXPO_PUBLIC_API_BASE_URL=https://api.yourapp.com` (no keys).
3. **Remove or stop using** `EXPO_PUBLIC_*` key names for secrets once the client no longer reads them; keep keys only in server environment (e.g. hosting provider secrets, not in repo).
4. **EAS Build:** use EAS Secrets for values needed at build time that are still not appropriate for git—but remember **anything the client needs at runtime in JS is still extractable** unless the call happens on the server.
5. **Logging:** continue to avoid printing raw keys (current `getAIConfigSummary` only logs “set” / “MISSING”—keep that pattern).

## References

- [Expo: Environment variables in Expo](https://docs.expo.dev/guides/environment-variables/) — `EXPO_PUBLIC_` inlining behavior.
- `src/config/env.ts` — single import surface for app configuration.
