import { z } from "zod"

// Common zod fragments so id/name limits can't drift between domains.
export const idSchema = z.string().min(1).max(36)
export const idArraySchema = z.array(idSchema).min(1).max(100)
export const nameSchema = z.string().min(1).max(255)

// Voice-provider failures are safe (and useful) to show verbatim. Errors
// cross the server-fn boundary as plain messages, so this stays string-based.
const SAFE_PREFIXES = ["Vapi request failed", "Invalid custom field name:"]

// Builds a domain's error-message getter: exact allowlist matches and
// provider-error prefixes pass through, everything else gets the fallback.
export function makeSafeErrorMessage(fallback: string, safeMessages: Set<string>) {
  return (error: unknown): string => {
    if (!(error instanceof Error)) return fallback
    if (safeMessages.has(error.message)) return error.message
    if (SAFE_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
      return error.message
    }
    return fallback
  }
}
