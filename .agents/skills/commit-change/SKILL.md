---
name: commit-change
description: Review and commit only the current agent's work for the current request to the current branch without pushing or disturbing another agent's changes. Use only when the user explicitly asks to commit, save changes to Git, or create a local commit in the current conversation. Do not trigger for implementation, review, audits, task completion, or general Git questions that do not authorize a commit.
---

# Commit Change

Create one safe local commit from changes owned by the current agent's request.
Never push or touch another agent's work.

An audit result, automatic skill handoff, or completed task is not authorization to stage or commit.

## Ownership Boundary

Build an ownership record from the current conversation and the agent's tool
history before auditing or staging. Ownership is decided per diff hunk, not per
file.

Owned work includes only:

- edits made by the current agent during the current request
- edits made by a subagent that the current agent explicitly delegated for the
  same request
- audit fixes made within that owned work

Treat every other change as someone else's work. This includes changes that
predate the current agent's first write, changes from another task or agent,
pre-staged changes the current agent did not stage during this workflow, and
anything whose origin cannot be proved from the conversation or tool history.

A file may contain both owned and unowned hunks. Stage the owned hunks only
when they are cleanly separate. If owned and unowned edits overlap on the same
lines, stop and explain the conflict. Never include the other work merely to
make the commit possible.

## Workflow

1. Read repository instructions and inspect `git status`, the staged diff, the unstaged diff, and relevant untracked files. Record which changes were already present before staging begins.
2. Create the ownership record. List the exact files and hunks changed for the current request, then exclude every change that is unowned or uncertain.
3. If the index already contains any unowned staged change, stop without changing the index. Do not unstage it and do not commit around it.
4. Run `audit-change` against the owned diff only. The commit request authorizes clear fixes inside that boundary. Do not audit, format, or fix neighboring work from another agent. If a required fix overlaps unowned work, stop and explain the conflict.
5. For a browser-facing change, invoke `validate-app` after audit fixes and before staging. Follow its authentication and fallback workflow. Run the check yourself and never hand routine validation to the user. Treat a failure caused by the owned code as a Required audit finding, fix it, and validate again.
6. Exclude secrets, credentials, environment files, and generated output the repository does not track.
7. Stage a whole file by explicit path only when every changed hunk in that file is owned. For a mixed file with separate hunks, build and review a patch containing only the owned hunks, then apply that patch to the index. Never use interactive staging as a substitute for reviewing the exact staged diff.
8. Compare the staged diff with the ownership record. Confirm the staged diff contains all and only the owned work, forms one coherent change, and leaves every unowned worktree change untouched.
9. Follow the repository's commit-message convention. If none exists, use a concise past-tense message such as `Added commit message generator`.
10. Commit on the current branch, then run `git status`. Report the commit hash and describe the remaining uncommitted work without claiming or modifying it.

## Rules

- Never push, create or switch branches, amend, force, reset, discard files, or rewrite history unless separately and explicitly requested.
- Never stash, restore, unstage, reformat, or otherwise rearrange another agent's changes to make a commit easier.
- After the audit passes, do not edit code during staging or commit. Any new issue returns the workflow to the audit step.
- Never stage changes merely because they are present.
- Never use `git add .`, `git add -A`, `git commit -a`, or a broad path that can capture unowned work.
- When ownership is uncertain, leave the change uncommitted. Excluding uncertain work is safer than guessing who made it.
- Report hook, test, or commit failures directly; do not bypass verification.
