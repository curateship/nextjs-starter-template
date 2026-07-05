import { randomUUID } from "node:crypto"

// Node-only helpers safe for both the web server and the worker process —
// keep this module free of any @tanstack/react-start imports.

export function now() {
  return new Date()
}

export function uuid() {
  return randomUUID()
}
