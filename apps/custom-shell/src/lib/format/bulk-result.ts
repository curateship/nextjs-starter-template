import { plural } from "@/lib/format/plural"

/**
 * What a bulk action actually did, in one line.
 *
 * A run that only got part way has to say so: a plain "Workspaces deleted."
 * after two of five went is a lie, and the two that stayed are still on screen
 * with no explanation. Every bulk action reports through this so they all count
 * the same way.
 */
export function describeBulkResult({
  done,
  kept,
  one,
  many,
  verb,
}: {
  /** How many went through. */
  done: number
  /** How many were asked for and did not. */
  kept: number
  /** The thing's name, singular — "workspace". */
  one: string
  /** The thing's name, plural — "workspaces". */
  many: string
  /** What happened to them, past tense — "deleted". */
  verb: string
}) {
  const things = `${done} ${plural(done, one, many)}`
  return kept
    ? `${things} ${verb}, ${kept} could not be ${verb}.`
    : `${things} ${verb}.`
}
