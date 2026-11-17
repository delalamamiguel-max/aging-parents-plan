# Aging Parents Plan

## Purpose and status

An Expo application for capturing visit notes or audio, reviewing structured summaries, setting reminders and sharing information between older adults and adult children. This checkout contains a mobile client and a separate Node backend. Release readiness and live service availability are not established by this README.

## Repository map

- `App.tsx`, `index.ts`: Expo entry points.
- `src/navigation/`, `src/screens/`, `src/components/`: navigation and capture/review/share interfaces.
- `src/state/`: application state and local storage schema helpers.
- `src/api/`, `src/contracts/`, `src/services/`: backend contract, processing and device services.
- `backend/src/`: HTTP server, transcription, extraction and summary pipeline.
- `tests/`, `scripts/`: tests and evaluation utilities.
- `docs/`: architecture, ADRs, historical handoffs and release runbooks.

## Architecture and integrations

Expo 54, React Native 0.81 and React 19 form the client. AsyncStorage persists application data locally. The client calls the backend for transcription and summarization; current `src/config/env.ts` fixes backend-pipeline use to true and has no direct-provider fallback.

The Node HTTP server exposes `GET /health`, `POST /transcribe` and `POST /summarize`. Groq handles speech transcription. Ollama Cloud supports extraction followed by structured summarization with separate configured models. Outcomes and errors use a structured API contract. Startup validates provider configuration. A responding health endpoint alone does not verify the model pipeline.

## Setup and environments

The root and `backend/` have separate manifests and lockfiles. For authorized development, install each package's dependencies, configure private environment files from the examples, then start the backend and Expo client. No install or startup was performed for this documentation work.

Client configuration uses `EXPO_PUBLIC_BACKEND_API_BASE` (default `http://127.0.0.1:8787`). On a physical device, loopback points to the device, so use an approved reachable backend. All `EXPO_PUBLIC_*` values are public application configuration.

Backend-only variables include `BACKEND_PORT`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, `OLLAMA_EXTRACTION_MODEL`, `OLLAMA_STRUCTURED_MODEL`, `STT_PROVIDER`, `STT_MODEL` and `GROQ_API_KEY`; see `backend/.env.example` and `backend/src/config/` for current requirements. Keep provider keys out of the client and repository. The current backend requires the cloud Ollama endpoint and Groq credentials; historical direct-client provider instructions are obsolete.

## Safe commands

For documentation inspection, use `git status --short`, `git diff -- README.md`, and `git diff --check`. Read manifests and scripts before executing them. The command references below describe development workflows; none were executed for this README update.

Root scripts: `npm start` (Expo), `npm run android`, `npm run ios`, `npm run web`, `npm run typecheck`, `npm test`, and `npm run test:ci`. `npm run backend:dev`, `backend:build` and `backend:start` forward to the backend package. Backend startup and application use can call paid providers; do not use them as README checks.

## Testing and validation

Jest configuration and unit tests are present, including storage migrations; `test:ci` requests coverage. TypeScript checking is available separately. Evaluation scripts and release gates require inspection and approved inputs before execution. The workflow YAML under `docs/runbooks/` is a backup document, not evidence of an active GitHub Actions workflow.

## Deployment and rollback

Client distribution and backend hosting are separate release concerns. The checked-in release and rollback runbooks are planning references, not proof of a currently deployed environment. Verify the target, approved artifact and backend compatibility before any release. Environment values embedded in a client build require rebuilding to change.

The historical rollback runbook proposes `EXPO_PUBLIC_USE_BACKEND_PIPELINE=0`; current client configuration does not implement that toggle or the described legacy fallback. Do not rely on it. A rollback must use a known compatible client/backend version and preserve local data compatibility.

## Risks and guardrails

Use synthetic visit information for development. Do not publish medical text, audio, private contacts, credentials or unredacted logs. AI summaries need user review; generated content is not a clinical judgment. Local persistence is not evidence of encrypted storage, caregiver authorization or production privacy compliance. Review network exposure and access controls before hosting the backend publicly. Preserve existing local environment files without copying their values into documentation.

## Related documentation

- [Architecture](docs/architecture.md) — includes historical paths; current source takes precedence.
- [Outcome contract](docs/adr/ADR-001-pipeline-outcome-contract.md)
- [Environment ADR](docs/adr/ADR-002-env-separation.md) — historical direct-provider assumptions need reconciliation.
- [Working agreement](docs/runbooks/dev-working-agreement.md)
- [Release checklist](docs/runbooks/release-checklist.md)
- [Release signoff](docs/runbooks/release-signoff.md)
- [Rollback](docs/runbooks/rollback.md) — caveat above applies.

This README update was validated by static documentation review only. No application tests, installs, builds, service calls, database operations or deployments were performed. Hosting state, external link availability and runtime behavior remain unverified.
