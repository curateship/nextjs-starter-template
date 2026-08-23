---
name: commit-change
description: Review and commit the current worktree changes to the current branch without pushing. Use only when the user explicitly asks to commit, save changes to Git, or create a local commit in the current conversation. Do not trigger for implementation, review, audits, task completion, or general Git questions that do not authorize a commit.
---

# Commit Change

Create one safe local commit from the changes the user authorized. Never push.

An audit result, automatic skill handoff, or completed task is not authorization to stage or commit.

## Workflow

1. Read repository instructions and inspect `git status`, staged changes, unstaged changes, and relevant untracked files.
2. Run `audit-change`. The commit request authorizes it to fix clear in-scope findings before staging. If a finding needs new authority or has no safe resolution, stop and explain the conflict.
3. For a browser-facing change, invoke `validate-app` after audit fixes and before staging. Follow its authentication and fallback workflow. Run the check yourself and never hand routine validation to the user. Treat a failure caused by the changed code as a Required audit finding, fix it, and validate again.
4. Exclude unrelated files, secrets, credentials, environment files, and generated output the repository does not track.
5. Stage authorized files by explicit path; never use `git add .` or `git add -A`.
6. Review the staged diff and confirm it represents one coherent change.
7. Follow the repository's commit-message convention. If none exists, use a concise past-tense message such as `Added commit message generator`.
8. Commit on the current branch, then run `git status` and report the commit hash and remaining changes.

## Rules

- Never push, create or switch branches, amend, force, reset, discard files, or rewrite history unless separately and explicitly requested.
- After the audit passes, do not edit code during staging or commit. Any new issue returns the workflow to the audit step.
- Never stage changes merely because they are present.
- Report hook, test, or commit failures directly; do not bypass verification.
