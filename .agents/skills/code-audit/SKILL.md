---
name: code-audit
description: Audit recent code changes for cleanup, simplification, efficiency, and security issues. Use when Codex needs to review a branch, commit range, staged diff, or recent file edits before merge, remove debug logs, delete dead or unnecessary code, tighten risky code paths, or make a small cleanup pass on recent changes.
tags: review
---

# Audit Recent Code Changes

## Communication

Always explain things in plain English. Start with the user-visible meaning, define necessary technical terms briefly, and avoid unexplained jargon before naming files, APIs, commands, or implementation details.
Audit the recent diff first. Prefer deleting code over rewriting it. Keep the scope on recent changes unless the diff reveals a broader issue that must be fixed to keep the edited code correct or safe.

## Simplicity Check

For small UI or behavior requests, treat unnecessary architecture as a finding. Flag chips, badges, warnings, counts, buttons, and modal tweaks that grew into broad helpers, actions, hooks, polling, schemas, status systems, or future-proofing. Prefer the smallest visible fix; if cleanup is allowed, remove the extra system instead of polishing it.

## Audit Workflow

1. Identify the review scope.
Use the narrowest concrete scope available: staged diff, last commit, PR diff, or user-named files. If the user does not specify, inspect recent local changes with `git status`, then `git diff --stat`, then the actual diff for changed files.

2. Read the changed code before editing it.
Understand what each changed block is trying to do. Do not remove code just because it looks unused without checking call sites, feature flags, config wiring, and tests.

3. Classify findings before making changes.
Use these buckets:
- debug or temporary logging
- dead code or unreachable branches
- unnecessary code or duplicated logic
- efficiency problems in hot or repeated paths
- security risks introduced by the diff

4. Fix only clear improvements.
Prefer small, mechanical edits that reduce code and risk. If a change is ambiguous, call it out instead of guessing.

5. Verify behavior after edits.
Run the smallest relevant validation available for the touched area. Prefer targeted tests, lint, typecheck, or a focused smoke check over broad expensive commands when the change is small.

## Cleanup Rules

### Remove logs

Delete debug logging added for local investigation unless it is clearly intentional operational logging.

Remove logs such as:
- `console.log`, `console.debug`, `print`, `pdb`, ad hoc tracing
- request or response dumps that expose secrets, tokens, cookies, or personal data
- noisy logs inside loops, render paths, polling, or retry paths

Keep logs only when they are:
- part of established observability patterns
- rate-limited or intentionally structured
- necessary for error reporting or auditability

When keeping a log, reduce sensitive payloads and keep messages concise.

### Remove dead code

Delete:
- unused variables, imports, helpers, branches, and parameters
- commented-out code blocks
- fallback paths that can no longer execute after the current change
- duplicate code left behind after refactors

Before removal, check:
- direct references with `rg`
- exported APIs used by other files
- config-driven or dynamic usage
- tests that still rely on the code

### Remove unnecessary code

Prefer the simplest working form. Look for:
- extra wrappers or helpers with a single trivial call site
- duplicated conditionals or repeated normalization
- state, hooks, or caches that do not change observable behavior
- defensive code that handles impossible states without evidence

Do not introduce abstractions during cleanup unless they remove more complexity than they add.

## Efficiency Checks

Focus on obvious, high-signal issues in the recent diff:
- repeated work inside loops or render paths
- duplicate network, database, or filesystem calls
- avoidable serialization, parsing, or cloning
- loading large data when a narrower query or selection works
- O(n^2) patterns introduced where a map or set is sufficient

Do not micro-optimize cold paths. Prefer fewer operations, fewer allocations, and fewer round-trips only where the benefit is concrete.

## Security Checks

Inspect recent changes for:
- secrets or tokens in code, logs, tests, fixtures, or error messages
- missing authorization checks around new mutations, routes, actions, or queries
- unsanitized user input used in SQL, shell commands, HTML, markdown rendering, redirects, or file paths
- risky data exposure in logs, API responses, or client props
- newly added dependency on client-supplied identifiers without server validation
- broad `any`, unsafe casts, or disabled checks around security-sensitive code

When a security risk is plausible but not provable from the diff alone, state the assumption and the safer change.

## Editing Guidance

Make the smallest safe patch. Preserve existing patterns unless the pattern itself is the problem.

If the request is a review only, report findings first, ordered by severity, with file references and concrete reasoning. If no issues are found, say that explicitly and mention any remaining validation gaps.

If the request allows changes, apply the cleanup directly, then summarize:
- what was removed
- what was simplified
- what security or efficiency risks were addressed
- what validation was run

## Useful Commands

Prefer fast, narrow inspection:

```bash
git status --short
git diff --stat
git diff --cached
git diff HEAD~1..HEAD
rg "console\\.log|console\\.debug|print\\(|TODO|FIXME" path/
rg "functionName|exportName" path/
```

Use repo-specific guidance when present, especially local `AGENTS.md` files in the touched app or package.
