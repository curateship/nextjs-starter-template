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
  keptReason,
}: {
  /** How many went through. */
  done: number
  /** How many were asked for and did not. */
  kept: number
  /**
   * How many were already that way, so nothing was written to them. Only a
   * change has this pile; deleting does not, and leaves it out.
   *
   * It came from CMS, which had its own copy of this file for it. The two
   * copies were merged on 5 Oct 2026 so there is one again.
   */
  same?: number
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
  // A reason gets a sentence of its own below, so it does not also become a
  // "could not be" clause here.
  if (kept && !keptReason) parts.push(`${kept} could not be ${verb}`)
  const line = `${parts.join(", ")}.`
  if (!kept || !keptReason) return line
  return `${line} ${kept} ${plural(kept, "was", "were")} ${keptReason}.`
}
