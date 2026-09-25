/**
 * How a month's AI budget reads. Kept apart from the indicator that draws it
 * so the wording and the 80-out-of-100 line can be checked without a browser.
 */

export type BudgetState = "fine" | "low" | "none"

/** The same line the meter itself warns on, and the same idea of "gone". */
export function budgetState(
  spentCents: number,
  allowanceCents: number
): BudgetState {
  if (allowanceCents <= 0 || spentCents >= allowanceCents) return "none"
  // Kept in whole cents: spent/allowance >= 4/5 without dividing.
  return spentCents * 5 >= allowanceCents * 4 ? "low" : "fine"
}

export function budgetHeadline(state: BudgetState) {
  if (state === "none") return "This month's AI budget is gone"
  if (state === "low") return "Most of this month's AI budget is gone"
  return "This month's AI budget"
}

/** "caption_generation" reads as "Caption generation". */
export function featureLabel(feature: string) {
  const words = feature.replace(/[-_]+/g, " ").trim()
  return words ? words[0].toUpperCase() + words.slice(1) : "AI"
}
