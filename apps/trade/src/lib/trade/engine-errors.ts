/**
 * The engine's own error history, as the Trading engine screen reads it.
 *
 * Shapes only — no database — so the page and the server hold the same idea of
 * what one recorded error is. The engine used to print a line to the container
 * log and move on, and the only line that survived anywhere a person could
 * reach was the very last one, carried on the heartbeat. Two failures at 3am
 * and one at 4am left you looking at the 4am one with nothing behind it.
 */

/** Which console call the site made. Warnings are kept apart from errors. */
export type EngineErrorKind = "error" | "warning"

export type EngineErrorRow = {
  id: string
  kind: EngineErrorKind
  /** The part of the engine that reported it, named after its file. */
  source: string
  message: string
  /** How many times this same line repeated inside its minute. */
  times: number
  firstSeenAt: string
  lastSeenAt: string
}

/**
 * How many rows are kept. The oldest go on the insert that passes the mark, so
 * the table cannot grow forever on a night nobody is watching.
 */
export const ENGINE_ERROR_KEEP = 500

/**
 * Repeats of the same line from the same place inside this long become one row
 * with a count.
 *
 * Some sites fire once a second during an outage. Without folding, an eight
 * minute outage would fill all 500 rows with one sentence and push out every
 * other error of the night. Folding by the row's *first* time rather than its
 * last keeps each row a one-minute bucket, so an hour-long outage leaves sixty
 * readable rows instead of one row whose count nobody can place in time.
 */
export const ENGINE_ERROR_FOLD_MS = 60_000
