# Final release signoff — Aging Parents Plan

**Purpose:** Single **go / no-go** record for a specific release, proving that **gates**, **runbooks**, and **CI** were satisfied before users get a new binary or production config.

**Prerequisites (Steps 19–20):** Phase gate runbooks completed; CI and tests in place per `.github/workflows/ci.yml`.

**Who signs:** **Two people** — typically **Product / owner** and **Engineering lead** (or delegated equivalents). **Both** must sign before release.

---

## Release record (fill in)

| Field | Value |
|-------|--------|
| Release name / version (Expo `app.json` / store) | |
| Git commit SHA (exact) | |
| Target environment | ☐ staging ☐ production |
| Release type | ☐ Internal build ☐ Store ☐ Backend-only |
| Date prepared | |

---

## Completed gates (mandatory attestation)

Check each only if the linked runbook was **executed** for this release (or formally waived with ticket reference).

| Gate | Doc | Completed | Waived (ticket #) |
|------|-----|:---------:|:-----------------:|
| Phase 2 — storage, queue, backend contract readiness | [phase2-gate.md](./phase2-gate.md) | ☐ | |
| Phase 3 — integrated pipeline (API, timeout, retry, persistence) | [phase3-gate.md](./phase3-gate.md) | ☐ | |
| Release checklist (env, smoke, evidence) | [release-checklist.md](./release-checklist.md) | ☐ | |

---

## 1 — Reliability (mandatory signoff block)

**Statement:** We believe this release is **stable enough** for the target audience: capture → processing → summary flows behave as tested, and known limitations are documented in release notes.

| # | Criterion | Pass | N/A |
|---|------------|:----:|:---:|
| 1.1 | Smoke test passed on a **real device** (text path; voice if in scope) per [release-checklist.md](./release-checklist.md). | ☐ | ☐ |
| 1.2 | **Feature flags** documented: `EXPO_PUBLIC_USE_BACKEND_PIPELINE`, `EXPO_PUBLIC_BACKEND_API_BASE` match this environment. | ☐ | ☐ |
| 1.3 | If backend is required: **`GET /health`** succeeds on production base URL. | ☐ | ☐ |
| 1.4 | **Rollback path** understood: [rollback.md](./rollback.md) reviewed this cycle. | ☐ | ☐ |

**Reliability — signed**

| Role | Printed name | Signature / initials | Date |
|------|----------------|------------------------|------|
| Product / owner | | | |
| Engineering | | | |

---

## 2 — Security & privacy (mandatory signoff block)

**Statement:** Client configuration follows **ADR-002** — no production provider **secrets** ship in `EXPO_PUBLIC_*` bundles unless explicitly accepted; **`backend/.env`** holds server-only secrets; we avoid logging **PHI** in analytics or server telemetry.

| # | Criterion | Pass | N/A |
|---|------------|:----:|:---:|
| 2.1 | [ADR-002: Env separation](../adr/ADR-002-env-separation.md) acknowledged for this release. | ☐ | ☐ |
| 2.2 | Production **backend** secrets live only on the server (`backend/.env` or host secrets), not in the mobile repo. | ☐ | ☐ |
| 2.3 | Support / incident handling avoids sharing **raw transcripts** externally (see [rollback.md](./rollback.md) and team policy). | ☐ | ☐ |

**Security & privacy — signed**

| Role | Printed name | Signature / initials | Date |
|------|----------------|------------------------|------|
| Product / owner | | | |
| Engineering | | | |

---

## 3 — CI & quality (mandatory signoff block)

**Statement:** The **exact commit** above passed automated checks defined in **`.github/workflows/ci.yml`**: install → app typecheck → backend install/build → **`npm test`** (Vitest unit + integration).

| # | Criterion | Pass | Evidence link / run ID |
|---|------------|:----:|-------------------------|
| 3.1 | CI workflow **green** on the release commit | ☐ | |
| 3.2 | No open **blocking** defects tied to this release (or listed as known issues in release notes) | ☐ | |

**CI & quality — signed**

| Role | Printed name | Signature / initials | Date |
|------|----------------|------------------------|------|
| Product / owner | | | |
| Engineering | | | |

---

## 4 — Rollback readiness (mandatory signoff block)

**Statement:** We know **how to roll back** or mitigate: flags, backend version, and who to call — per [rollback.md](./rollback.md).

| # | Criterion | Pass |
|---|------------|:----:|
| 4.1 | **On-call** or owner for this release is identified (name + channel). | ☐ |
| 4.2 | **Backend** previous good deploy / tag identified (if applicable). | ☐ |
| 4.3 | **Store** rollback limitations understood (especially iOS). | ☐ |

**Rollback readiness — signed**

| Role | Printed name | Signature / initials | Date |
|------|----------------|------------------------|------|
| Product / owner | | | |
| Engineering | | | |

---

## Final dual signoff (release authorized)

By signing below, **both** parties confirm that Sections **1–4** are satisfied or **N/A** with documented waiver, and they authorize this release for the stated environment.

| Party | Printed name | Signature | Date |
|-------|----------------|-----------|------|
| **Product / owner** | | | |
| **Engineering** | | | |

---

## Evidence archive (optional)

Attach or link: CI run, build IDs (EAS), release notes, support comms template.

---

## Revision

Update when CI job names, gates, or signatory roles change.
