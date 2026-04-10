# Development working agreement

**Purpose:** A short, shared understanding of how we change this repository safely. This app is built with **Expo** and **TypeScript** (strict mode). You do not need to be a developer to use this page—treat it as a checklist when coordinating work.

---

## Branch rules

1. **`main` stays releasable.** Do not commit experimental work directly to `main` unless the team explicitly agrees it is an emergency fix with a follow-up plan.
2. **Do your day-to-day work on a separate branch** (for example, a branch named after you or the feature). Create the branch from the latest `main` (or from the branch your team agreed to use as the base).
3. **One logical change per branch when possible** (one feature, one bugfix, or one doc update). That makes review and rollback easier.
4. **Keep branch names readable** (lowercase, hyphens, no secrets in the name). Examples: `migs-onboarding-copy`, `fix-notification-text`.
5. **Pull before you push** so you resolve conflicts early and do not overwrite others’ work.

---

## Merge rules

1. **Prefer merging through a pull request (PR)** on GitHub instead of informal file swaps. A PR is a single place for discussion, review, and history.
2. **At least one reviewer** (someone other than the author, when more than one person is available) should approve before merge, unless the team has defined an exception for tiny doc-only changes.
3. **Do not merge** if checks fail (for example, CI or required scripts the team has agreed to run). Fix or ask for help first.
4. **Use “squash merge” or the team’s standard merge style** so `main` stays easy to read; follow whatever convention the repository already uses.
5. **After merge, delete the feature branch** on GitHub if it is no longer needed, to avoid confusion about what is current.

---

## Validation checklist

Use this before asking for a final review or before merge.

| Step | Question | Owner |
|------|----------|--------|
| 1 | Does this change match an agreed task or issue? | Author |
| 2 | Is the branch up to date with its base branch? | Author |
| 3 | Did you run the checks the team expects (see below)? | Author |
| 4 | Is there anything sensitive (passwords, keys, personal health data) in commits or screenshots? | Author |
| 5 | Did you describe *what* changed and *why* in the PR description? | Author |
| 6 | For user-visible changes: did someone sanity-check on a device or simulator if needed? | Author / reviewer |

**Checks this repo commonly uses** (from `package.json`; run after `npm install` if you have not already):

- **TypeScript:** `npx tsc --noEmit` — confirms types are consistent with `tsconfig.json` (strict mode).
- **Start the app locally:** `npm start` (Expo), then use `npm run ios`, `npm run android`, or `npm run web` as appropriate.

If the team adds scripts (for example `lint` or `test`), add them to this checklist when they become standard.

---

## When something goes wrong

- **Revert or roll back** using GitHub and git history; do not force-push to `main` without team agreement.
- **Escalate** to the person responsible for releases if users might already have a broken build.

---

## Review cadence

Revisit this document when branching strategy, reviewers, or required checks change.
