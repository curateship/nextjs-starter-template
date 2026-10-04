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
  keptReason,
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
  /**
   * Why the rest did not change, without the count and without the full stop —
   * "already closed". It becomes a sentence of its own: "17 closed. 3 were
   * already closed."
   *
   * Leave it out when the rest genuinely failed, and the line falls back to
   * "could not be deleted". The two are not the same thing, and a conversation
   * that was already closed being reported as one that could not be closed
   * sends somebody looking for a bug.
   */
  keptReason?: string
}) {
  const things = `${done} ${plural(done, one, many)}`
  if (!kept) return `${things} ${verb}.`
  return keptReason
    ? `${things} ${verb}. ${kept} ${plural(kept, "was", "were")} ${keptReason}.`
    : `${things} ${verb}, ${kept} could not be ${verb}.`
}
