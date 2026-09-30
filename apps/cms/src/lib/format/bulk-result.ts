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
  same = 0,
  one,
  many,
  verb,
}: {
  /** How many went through. */
  done: number
  /** How many were asked for and did not. */
  kept: number
  /**
   * How many were already that way, so nothing was written to them. Only a
   * change has this pile; deleting does not, and leaves it out.
   */
  same?: number
  /** The thing's name, singular — "workspace". */
  one: string
  /** The thing's name, plural — "workspaces". */
  many: string
  /** What happened to them, past tense — "deleted". */
  verb: string
}) {
  const were = plural(same, "was", "were")
  // Nothing changed because nothing needed to. The already-pile leads the
  // sentence and takes the noun with it, because "0 posts unpublished" makes a
  // run that was already right read like a failure. Everywhere else it is a
  // follow-on clause and needs no noun.
  const nothingToDo = done === 0 && same > 0
  const parts = nothingToDo
    ? [`${same} ${plural(same, one, many)} ${were} already ${verb}`]
    : [
        `${done} ${plural(done, one, many)} ${verb}`,
        ...(same ? [`${same} ${were} already ${verb}`] : []),
      ]
  if (kept) parts.push(`${kept} could not be ${verb}`)
  return `${parts.join(", ")}.`
}
