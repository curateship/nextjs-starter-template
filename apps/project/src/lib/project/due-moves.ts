/**
 * A due date moved from one day to another, as its history row keeps it: the
 * two days in the row's reason, "2026-11-03 2026-11-10".
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function dueMoveReason(from: string, to: string) {
  return `${from} ${to}`
}

/** The two days back out of the reason, or null for a reason that isn't one. */
export function readDueMove(reason: string | null): { from: string; to: string } | null {
  const [from, to] = (reason ?? "").split(" ")
  return from && to && DAY.test(from) && DAY.test(to) ? { from, to } : null
}
