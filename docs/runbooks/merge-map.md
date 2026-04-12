# Master Merge Map: Processing Pipeline Integration

This document defines the **strict merge sequence** required to synchronize **Person A (Client)** and **Person B (Backend)** development. Integration must follow this order to prevent breaking contract changes or data loss.

## 1. Integration Status Tracker

| Step | Milestone | Required Branch (A) | Required Branch (B) | Status |
|:---|:---|:---|:---|:---|
| **1** | **Foundations** | `phase1/shared-contract-docs` | `phase1/b-schema-contract` | [ ] PENDING |
| **2** | **Env Policy** | - | `phase1/b-env-policy` | [ ] PENDING |
| **3** | **Storage Scaffold** | `phase2/a-storage-scaffold` | `phase2/b-backend-skeleton` | [ ] PENDING |
| **4** | **Hydration & API** | `phase2/a-hydration-gate` | `phase2/b-client-api-layer` | [ ] PENDING |
| **5** | **Offline Replay** | `phase2/a-offline-ack` | `phase2/b-env-implementation` | [ ] PENDING |
| **6** | **Phase 2 Gate** | `phase2/shared-gate` | - | [ ] PENDING |
| **7** | **LLM Integration** | - | `phase3/b-service-integration` | [ ] PENDING |
| **8** | **Outcome UI** | `phase3/a-processing-outcome-ui` | - | [ ] PENDING |
| **9** | **Status Prop** | `phase3/a-status-propagation` | `phase3/b-validator-alignment` | [ ] PENDING |
| **10** | **Telemetry** | `phase3/a-telemetry-client` | `phase3/b-telemetry-backend` | [ ] PENDING |
| **11** | **Phase 3 Gate** | `phase3/shared-gate` | - | [ ] PENDING |
| **12** | **CI & Release** | `phase4/a-ci-tests` | `phase4/b-release-runbooks` | [ ] PENDING |
| **13** | **Final Release** | `phase4/shared-release-gate` | - | [ ] PENDING |

---

## 2. Merge Instructions

### Flow: Feature -> Shared -> Main
1.  **Person A** merges their topic branch (e.g., `phase2/a-storage-scaffold`) into the corresponding shared gate (e.g., `phase2/shared-gate`).
2.  **Person B** does the same for their corresponding branch.
3.  **Conflict Resolution**: Conflicts must be resolved on the `shared-gate` branch.
4.  **Sign-off**: Both leads execute the checklists in `docs/runbooks/phase[N]-gate.md`.
5.  **Main Merge**: The `shared-gate` is merged into `main` ONLY after sign-off is complete.

---

## 3. Conflict Resolution Protocol

> [!WARNING]
> **Contract Consistency**: If `src/contracts/schema.ts` is changed on a backend branch, it MUST be reconciled in `phase1/shared-contract-docs` first before proceeding to later steps.

> [!IMPORTANT]
> **Environment Variables**: Never commit `.env` files to these branches. Use `.env.example` to document required backend keys for local pipeline testing.
