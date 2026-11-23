/** The most a project's monthly AI cap may be, in dollars. */
export const AI_CAP_MAX_DOLLARS = 10_000

/** Cents as dollars a person reads: "$20", "$12.40". */
export function dollarsText(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

/**
 * What was typed in the cap box, as whole cents: "" is no cap, "20" or
 * "$12.50" a cap. Anything else is not a cap, and says so.
 */
export function parseCapDollars(typed: string): { cents: number | null } | { error: string } {
  const cleaned = typed.trim().replace(/^\$/, "").replace(/,/g, "")
  if (!cleaned) return { cents: null }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Type the cap in dollars, such as 20." }
  const dollars = Number(cleaned)
  if (dollars > AI_CAP_MAX_DOLLARS) return { error: `The cap can be at most $${AI_CAP_MAX_DOLLARS.toLocaleString("en-US")}.` }
  return { cents: Math.round(dollars * 100) }
}
