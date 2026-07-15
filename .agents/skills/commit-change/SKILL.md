---
name: commit-change
description: Review and commit the current worktree changes to the current branch without pushing. Use when the user explicitly asks to commit, save changes to Git, or create a local commit, or when audit-change hands off a ready standalone audit under its documented policy. Do not trigger for implementation, review, or general Git questions that do not authorize a commit.
---

# Commit Change

Create one safe local commit from the changes the user authorized. Never push.

## Workflow

1. Read repository instructions and inspect `git status`, staged changes, unstaged changes, and relevant untracked files.
2. Run `audit-change` in report-only mode. If it finds a blocker, stop and request authorization before editing.
3. Exclude unrelated files, secrets, credentials, environment files, and generated output the repository does not track.
4. Stage authorized files by explicit path; never use `git add .` or `git add -A`.
5. Review the staged diff and confirm it represents one coherent change.
6. Follow the repository's commit-message convention. If none exists, use a concise past-tense message such as `Added commit message generator`.
7. Commit on the current branch, then run `git status` and report the commit hash and remaining changes.

## Rules

- Never push, create or switch branches, amend, force, reset, discard files, or rewrite history unless separately and explicitly requested.
- Never edit code during the commit workflow.
- Never stage changes merely because they are present.
- Report hook, test, or commit failures directly; do not bypass verification.
