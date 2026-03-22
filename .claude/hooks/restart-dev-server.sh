#!/usr/bin/env bash
# PostToolUse hook: check if dev server is healthy after file edits.
# Only restarts if the server is down or returning 500s.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Check if server is responding (allow redirects like 307 for auth)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")

# If server is healthy (any response that isn't 000/500/502/503), do nothing
if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "500" ] && [ "$HTTP_CODE" != "502" ] && [ "$HTTP_CODE" != "503" ]; then
  exit 0
fi

# Server is down or erroring — restart it
PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PID" ]; then
  kill $PID 2>/dev/null || true
  sleep 1
  kill -9 $(lsof -ti :3000 2>/dev/null || true) 2>/dev/null || true
fi

cd "$PROJECT_DIR"
nohup npm run dev > /tmp/nextjs-dev-server.log 2>&1 &

# Wait for server to be ready (up to 15 seconds)
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://localhost:3000/ 2>/dev/null; then
    exit 0
  fi
  sleep 0.5
done

exit 0
