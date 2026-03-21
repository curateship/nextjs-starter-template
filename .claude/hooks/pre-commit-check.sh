#!/usr/bin/env bash
# Pre-commit hook for Claude Code Bash tool calls.
# Runs before any Bash tool invocation. If the command is a git commit,
# scans staged files for secrets and leftover debug files.
# Outputs structured JSON with permissionDecision: "deny" on stdout to block.

set -euo pipefail

# Only inspect git commit commands
INPUT=$(cat /dev/stdin 2>/dev/null || true)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

# If this isn't a git commit, let it through
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit'; then
  exit 0
fi

ISSUES=""

# --- Check for secret patterns in staged files ---
SECRET_PATTERNS='(api_key|api[-_]?secret|secret[-_]?key|password|token|private[-_]?key|credentials)\s*[:=]'
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

if [ -n "$STAGED_FILES" ]; then
  while IFS= read -r file; do
    # Skip binary files and common config files
    if [[ "$file" == *.png || "$file" == *.jpg || "$file" == *.ico || "$file" == *.woff* ]]; then
      continue
    fi
    # Check staged content (not working tree) for secret patterns
    MATCHES=$(git show ":$file" 2>/dev/null | grep -inE "$SECRET_PATTERNS" | head -5 || true)
    if [ -n "$MATCHES" ]; then
      ISSUES="${ISSUES}SECRETS in $file:\n$MATCHES\n\n"
    fi
  done <<< "$STAGED_FILES"
fi

# --- Check for leftover debug/test files ---
DEBUG_FILES=$(echo "$STAGED_FILES" | grep -E '^(test-|debug-|tmp-)' || true)
if [ -n "$DEBUG_FILES" ]; then
  ISSUES="${ISSUES}DEBUG FILES staged for commit:\n$DEBUG_FILES\n\n"
fi

# --- Report issues ---
if [ -n "$ISSUES" ]; then
  REASON="Pre-commit check found issues:\n${ISSUES}Unstage or fix these files before committing."
  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

exit 0
