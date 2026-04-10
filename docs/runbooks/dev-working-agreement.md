# Dev Working Agreement

## Purpose

This document explains how we work on the app in a safe, predictable way.

It is written for both developers and non-developers. The goal is simple:

- Keep active work on one shared working branch: **`Aaron`**
- Merge changes carefully
- Run a short validation checklist before calling work "ready"

## Working Branch Rules

### Main rule

The default working branch for day-to-day development is **`Aaron`**.

This means:

- New work should start from `Aaron`.
- Small fixes should usually be made on `Aaron`.
- If someone is unsure where to work, use `Aaron`.

### Why this matters

Using one agreed working branch reduces confusion and makes it easier for non-developers to know where the latest in-progress version lives.

### Expectations

- Treat `Aaron` as the current shared work area.
- Pull the latest `Aaron` changes before starting work.
- Keep changes focused on one task at a time.
- Write clear commit messages in plain language.
- **Do not add new dependencies** unless there is explicit approval.

### Do not

- Do not work directly on a release or production branch unless specifically asked.
- Do not create extra long-lived branches unless there is a clear reason.
- Do not mix unrelated fixes into one change set.

## Merge Rules

### Before merging into `Aaron`

Only merge work into `Aaron` when all of the following are true:

- The change solves the intended problem.
- The app still starts successfully.
- Validation steps have been completed.
- There are no known broken flows introduced by the change.

### How to merge

- Prefer small, reviewable merges.
- Resolve conflicts carefully.
- If there is uncertainty, ask before merging.
- After merging, re-run the validation checklist on the updated `Aaron` branch.

### What not to merge

Do not merge if:

- Dependencies were added without approval.
- The app does not start.
- Expo health checks fail.
- TypeScript issues are introduced.
- A required local service, such as the whisper server, is expected but not available.

## Validation Checklist

Run this checklist before marking work as ready.

### 1. Install dependencies

Make sure project packages are installed:

```bash
npm install
```

### 2. Confirm Expo project health

Run Expo's project check:

```bash
npx expo-doctor
```

This helps catch common setup and compatibility problems.

### 3. Confirm TypeScript expectations

This project uses TypeScript with `strict` mode enabled. That means the codebase expects stronger type safety and fewer silent mistakes.

If a TypeScript validation command exists in local practice, run it before merging.

### 4. Start the app

Confirm the app can start:

```bash
npm run start
```

If needed, also verify a target platform:

```bash
npm run ios
npm run android
npm run web
```

### 5. Whisper server check

If the feature being worked on depends on a whisper server, confirm that server is reachable and working before marking the change ready.

Example plain-language check:
- Is the whisper server running?
- Is it reachable from the app or local environment?
- Does the related voice or transcription flow still work?

If the work does not touch whisper-related features, note that the whisper check was not required.

## Ready-to-Merge Summary

A change is ready to merge into `Aaron` when:
- Dependencies install cleanly.
- `npx expo-doctor` passes.
- The app starts successfully.
- Any required whisper server dependency is available.
- The change is understandable to the next person reviewing it.

## Notes for Non-Developers

You do not need to know the code details to use this agreement.

The practical meaning is:
- **`Aaron`** is the branch where active work happens.
- Changes should be merged only after basic checks pass.
- If a check fails, the work is not considered ready yet.
- We avoid surprise dependency changes because they can break setup for everyone.
