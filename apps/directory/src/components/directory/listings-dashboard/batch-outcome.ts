/**
 * What a batch on ticked rows says when some of it was refused, and which rows
 * stay ticked afterwards (`workspace/docs/changing-many-records.md`).
 *
 * - **Everything refused:** the server's own reason for the first one, so a
 *   network failure reads as one and not as something about the records.
 * - **Some refused:** "3 of 5 rejected. Joe's Diner, Café Bleu could not be,
 *   and stay ticked." No reason is guessed. Placements and Featured plans used
 *   to say "were not running any more" or "have purchases" for any failure,
 *   which sent people looking for the wrong thing.
 *
 * The refused rows stay ticked, so what is still selected is exactly what the
 * message is about and the same action can be tried again on them.
 */
export function batchOutcome<Row>({
  asked,
  refused,
  verb,
  nameOf,
}: {
  asked: readonly Row[]
  refused: readonly { row: Row; error: unknown }[]
  /** What happened to the ones that went, past tense: "rejected". */
  verb: string
  nameOf: (row: Row) => string
}): Error | null {
  if (!refused.length) return null
  if (refused.length === asked.length) {
    const first = refused[0]!.error
    return first instanceof Error ? first : new Error(`None could be ${verb}.`)
  }
  const names = refused.map((each) => nameOf(each.row)).join(", ")
  return new Error(
    `${asked.length - refused.length} of ${asked.length} ${verb}. ${names} could not be, and ${refused.length === 1 ? "stays" : "stay"} ticked.`
  )
}
