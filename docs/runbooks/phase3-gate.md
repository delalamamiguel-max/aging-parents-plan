# Phase 3 Gate: Integrated Pipeline & Telemetry Sign-off

This document defines the mandatory validation checklist for the Phase 3 integrated pipeline and telemetry layer. Both **Person A (Client)** and **Person B (Backend)** must execute these tests and sign off before merging to production.

## 1. Pipeline Failure & Error Handling

| ID | Test Case | Expected Result | Result |
|:---|:---|:---|:---|
| P3-1 | **LLM API Failure** (Invalid Key/Host) | Pipeline shows "Something went wrong" (🔌). Outcome `retryable_failure` is persisted. | [ ] PASS |
| P3-2 | **Transcription Failure** (Auth Error) | Pipeline shows "Setup Required" (⚙️). Outcome `non_retryable_failure` is persisted. | [ ] PASS |
| P3-3 | **Pipeline Timeout** (Simulated >60s) | `withTimeout` triggers. UI shows "Taking a bit longer" banner. | [ ] PASS |
| P3-4 | **Malformed Output** (Invalid JSON) | `outputValidator` triggers fallback. Result displays "Partial"✦ chip on Home. | [ ] PASS |

---

## 2. Queue & Replay Durability

| ID | Test Case | Expected Result | Result |
|:---|:---|:---|:---|
| Q3-1 | **Offline Capture Persistence** | Capture saved while offline survives app force-quit/restart. | [ ] PASS |
| Q3-2 | **Automatic Replay** | Banner appears on Home. Tapping "Process" restarts pipeline with `requestId` correlation. | [ ] PASS |
| Q3-3 | **Retry Flow** | Failed items remain in queue with "Retry needed" ⚠️ indicator. | [ ] PASS |

---

## 3. PHI-Safe Telemetry Audit

| ID | Test Case | Expected Result | Result |
|:---|:---|:---|:---|
| T3-1 | **Event Correlation** | Client `pipeline_started` and `pipeline_completed` share the same `requestId`. | [ ] PASS |
| T3-2 | **PHI Scrubbing Check** | No `rawText`, `sections`, or `actionItems` found in Metro console or logs. | [ ] PASS |
| T3-3 | **Outcome Fidelity** | `outcome` field matches the UI state (`success`, `fallback_used`, etc.). | [ ] PASS |

---

## 4. Role-Safe Navigation

| ID | Test Case | Expected Result | Result |
|:---|:---|:---|:---|
| N3-1 | **Parent Exit Path** | "Go Home" from error/success returns to `ParentHome`. | [ ] PASS |
| N3-2 | **Care Partner Exit Path** | "Go Home" from error/success returns to `AdultChildHome`. | [ ] PASS |

---

## Sign-off

**Person A (Client Owner):** ____________________  Date: __________

**Person B (Backend Owner):** ____________________ Date: __________
