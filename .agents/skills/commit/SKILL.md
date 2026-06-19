---
name: commit
description: Review code changes and commit to the current branch. Use when the user says "commit", "commit changes", or asks to save their work to git. This skill reviews changes before committing and NEVER pushes.
user_invocable: true
---

# Commit Skill

Review all staged/unstaged changes, then commit to the current branch. **Never push.**

## Steps

1. **Check state** — run `git status` and `git diff` (staged + unstaged) to see all changes
2. **Review changes** — scan the diff for:
   - Hardcoded secrets, API keys, tokens, passwords
   - Leftover debug files (test-*, debug-*, tmp-*)
   - `console.log` statements that shouldn't ship
   - Unused imports or dead code introduced by the changes
   - Missing comments on new functions or logic blocks
3. **Report findings** — if any issues found, list them and ask the user before proceeding
4. **Stage files** — add changed files by name (never `git add -A` or `git add .`)
5. **Commit** — write a concise commit message describing the "why", not the "what"
6. **Confirm** — run `git status` to verify the commit succeeded

## Rules

- NEVER push to remote — only commit locally
- NEVER create new branches — commit on the current branch
- NEVER make code changes during the commit — only commit what exists
- If the build is broken by the changes, report it and ask before fixing
- Skip files that look like secrets (.env, credentials.json, etc.) and warn the user
