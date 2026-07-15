---
name: implement-change
description: Implement focused code changes and bug fixes with narrow scope, existing project patterns, tests, and proportionate verification. Use when the user asks to build, modify, fix, or refactor application code across one or more files. This skill changes code but does not commit, push, deploy, or create branches.
---

# Implement Change

Deliver the requested behavior with the smallest clear change that proves it works.

## Boundaries

- Read the applicable `AGENTS.md`, relevant docs, and task files before editing.
- Preserve unrelated and user-owned changes in a dirty worktree.
- Fix only the requested behavior and failures caused by the change.
- Prefer deletion and existing patterns over new layers, flags, dependencies, or configuration.
- Do not commit, push, deploy, create branches, or rewrite history.

## Workflow

1. Inspect the current behavior, call sites, tests, and local conventions.
2. Establish the expected behavior and the narrowest useful verification.
3. For a bug or logic change, add or identify a test that fails for the right reason when practical.
4. Implement one logical slice at a time and keep the project buildable between slices.
5. Run focused checks after each meaningful slice; broaden checks only when scope or repository guidance requires it.
6. Review the final diff for unintended edits, temporary code, duplication, and stale paths.
7. Update documentation when behavior, architecture, commands, or repository structure changed.

## Engineering Rules

- Validate untrusted input at trust boundaries and enforce authorization server-side.
- Keep public interfaces stable unless the requested change requires a contract change.
- Use explicit types and clear error paths; do not hide failures with silent fallbacks.
- Keep UI state minimal, preserve accessibility, and verify loading, empty, error, and disabled states when relevant.
- Diagnose the root cause before changing code when tests or behavior are unexpected.
- Consult official documentation when an API is unfamiliar, version-sensitive, or uncertain—not for routine local patterns.
- Add compatibility behavior only when the user explicitly requires a transition period.

## Verification

Run the narrowest relevant combination of tests, type checks, linting, formatting, builds, and live validation. Report pre-existing failures separately and do not repair unrelated failures.

Summarize the user-visible outcome, key files or areas changed, checks run, and any remaining limitation. Do not claim success when verification failed.
