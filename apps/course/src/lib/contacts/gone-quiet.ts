/**
 * The rule that decides when somebody has gone quiet, in numbers.
 *
 * Browser safe on purpose: the Settings field that types the number and the
 * server that enforces it both read this file, so there is one set of bounds
 * rather than two that drift. The rule itself lives in
 * `src/server/people/quiet-contacts.ts`.
 */

/**
 * The run of unopened sends it takes.
 *
 * Two is the floor rather than one, because an open is a hidden image and a
 * single unopened message says almost nothing — a mail client that blocks
 * pictures reports nothing on a message somebody read end to end. Fifty is the
 * ceiling because nothing above it is a rule anybody would reach.
 */
export const QUIET_AFTER_EMAILS_MIN = 2
export const QUIET_AFTER_EMAILS_MAX = 50
export const QUIET_AFTER_EMAILS_DEFAULT = 7

/** A stored or typed number, brought inside the bounds. */
export function normalizeQuietAfterEmails(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return QUIET_AFTER_EMAILS_DEFAULT
  return Math.min(
    QUIET_AFTER_EMAILS_MAX,
    Math.max(QUIET_AFTER_EMAILS_MIN, parsed)
  )
}
