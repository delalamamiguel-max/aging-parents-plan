# Phase 2 Gate: Technical Stability & Contracts

This document provides a formal checklist for transitioning from Phase 2 (Core Stability) to Phase 3 (Multi-user Sync & Cloud). These items must be verified to ensure a robust foundation for the application.

## 1. Storage Durability (Local-First Safety)
*Goal: Ensure local state persistence is resilient to race conditions and schema evolution.*

- [ ] **Hydration Gated**: App prevents initial-state overwrites by blocking persistence until `isHydrated` is true.
- [ ] **Versioned Keys**: Storage uses the `@app_state_v1` key and `SCHEMA_VERSION` constant.
- [ ] **Typed Boundary**: State persistence is restricted to the defined `PersistedState` interface (no leaking ephemeral UI state).
- [ ] **Migration Hook**: Placeholder `migrateState` exists in `storage/persist.ts` for future schema upgrades.
- [ ] **Telemetry Audit**: Read/Write operations log success/failure to the internal telemetry utility.

## 2. Queue Replay (Offline Resilience)
*Goal: Ensure no user data is lost during transit or processing failures.*

- [ ] **Atomic Success**: Items are only removed from `offlineCaptureQueue` *after* a successful LLM/Summary dispatch in `ProcessingScreen.tsx`.
- [ ] **Pending State Protection**: The `currentlyProcessingQueueId` prevents processing the same item twice while in flight.
- [ ] **Failure Recovery**: On pipeline failure, the pending marker is cleared, making the item visible in the banner for retry.
- [ ] **Durability Check**: Unprocessed items survive app termination/restart via the storage persistence layer.

## 3. Mock Contract Readiness (Schema Alignment)
*Goal: Align local data models with the shared backend vision.*

- [ ] **Identifier Uniformity**: All entities (VisitSummary, CaptureInput) use unique UUIDs compatible with external DBs.
- [ ] **Section Consistency**: `SummarySection` order and labels strictly match `contracts/schema.ts` and Design Guidelines.
- [ ] **Status Enums**: `SummaryStatus` includes all transition states (`draft` → `processing` → `ready_for_review` → `shared`).
- [ ] **Offline Flagging**: The `isOffline` boolean is correctly propagated from capture to summary for audit trails.

---

## Sign-off

| Role | Status | Name | Date |
| :--- | :--- | :--- | :--- |
| **Engineering Lead** | [ ] | | |
| **Product Owner** | [ ] | | |

> [!NOTE]
> Pass/Fail is determined by physical verification of the code in the `Aaron` branch.
