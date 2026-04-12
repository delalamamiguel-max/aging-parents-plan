# Release Sign-off: [Version Number]

This document serves as the final authority for releasing the Aging Parents Plan application. **Version [X.X.X]** cannot be deployed to Production until all gates are marked PASS and both Leads have signed.

## 1. Milestone Traceability

| Gate | Requirement | Checkpoint Doc | Status |
|:---|:---|:---|:---|
| **Phase 1** | Foundations & Role Clarity | [dev-working-agreement.md](file:///docs/runbooks/dev-working-agreement.md) | [ ] PASS |
| **Phase 2** | Storage & Queue Hardening | [phase2-gate.md](file:///docs/runbooks/phase2-gate.md) | [ ] PASS |
| **Phase 3** | Pipeline & Telemetry | [phase3-gate.md](file:///docs/runbooks/phase3-gate.md) | [ ] PASS |
| **Phase 4** | CI & Automated Testing | [walkthrough.md](file:///brain/ced685ea-c68d-412b-ad81-fd21705b999f/walkthrough.md) | [ ] PASS |

---

## 2. Global Safety & Reliability Checks

### [ ] CI / Automation
- [ ] GitHub Actions [Phase 4 CI Workflow] passed on `main`.
- [ ] No critical lint errors or type failures in `final-release` branch.

### [ ] Security & Privacy (PHI)
- [ ] Metadata-only scrubbing confirmed for all `pipeline_*` events.
- [ ] No local transcripts or diagnostic audio files leaked in release bundle.

### [ ] Reliability & Rollback
- [ ] Rollback strategy: Revert to previous build tagged `stable-XXXX`.
- [ ] Database/Storage: No breaking migrations (all tests in `storageMigrations.test.ts` pass).

---

## 3. Final Smoke Test (Lead A + B)

| ID | Test Case | Target State | Result |
|:---|:---|:---|:---|
| ST-1 | Capture Voice | Success / Review | [ ] PASS |
| ST-2 | Share Summary | Care Partner receives | [ ] PASS |
| ST-3 | Force Offline | Queue banners visible | [ ] PASS |
| ST-4 | App Restart | Data persists 100% | [ ] PASS |

---

## Final Approval

> [!IMPORTANT]
> By signing below, you affirm that this release meets the PHI-safety standards and structural trust requirements outlined in the Master Plan.

**Person A (Client Lead):** ____________________  Date: __________

**Person B (Backend Lead):** ____________________ Date: __________

---

## Release Log

*   **Commits Merged**: ____________________
*   **Build ID**: ____________________
*   **Notes**: ____________________
