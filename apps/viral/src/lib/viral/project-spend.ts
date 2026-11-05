/**
 * A Viral project's AI spend limit (see `workspace/docs/ai-analysis.md`).
 * Shared by the server, which adds up the spend and refuses a call, and the
 * browser, which reads the limit typed and shows the refusal.
 */

/** A limit above this many dollars is a typing mistake, not a budget. */
export const PROJECT_SPEND_LIMIT_MAX_DOLLARS = 100_000

/** "$4.50" from 450 cents. */
export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * The sentence a refused call ends with. It carries the numbers, so the
 * person can see the sum: what is spent, what the next step costs, and how
 * far short the limit falls.
 */
export function projectSpendLimitMessage({
  spentCents,
  nextCents,
  limitCents,
}: {
  spentCents: number
  nextCents: number
  limitCents: number
}) {
  const short = spentCents + nextCents - limitCents
  const next =
    nextCents > 0
      ? `, and this costs about ${formatCents(nextCents)}, so the limit is ${formatCents(short)} short`
      : ""
  return `This project has spent ${formatCents(spentCents)} of its ${formatCents(limitCents)} limit${next}. Raise the limit in the project's settings.`
}

export function isProjectSpendLimitMessage(message: string) {
  return /^This project has spent /.test(message)
}

/** Dollars typed into a spend limit box, as cents; empty is no limit. */
export function parseSpendLimit(value: string): number | null {
  const cleaned = value.trim().replace(/^\$/, "")
  if (!cleaned) return null
  const dollars = Number(cleaned)
  if (
    !Number.isFinite(dollars) ||
    dollars <= 0 ||
    dollars > PROJECT_SPEND_LIMIT_MAX_DOLLARS
  ) {
    throw new Error(
      `Type the limit in dollars, more than $0 and at most $${PROJECT_SPEND_LIMIT_MAX_DOLLARS.toLocaleString()}, or leave it empty for no limit.`
    )
  }
  return Math.round(dollars * 100)
}
