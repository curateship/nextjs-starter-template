import type { DesiredOrder } from "./strategies/contract"

export type ExistingOrder = {
  cloid: string
  purpose: string
  side: "buy" | "sell"
  px: string | null
  sz: string
  remainingSz: string
  tif: string
  reduceOnly: boolean
}

export type DiffAction =
  | { kind: "place"; desired: DesiredOrder }
  | { kind: "cancel"; existing: ExistingOrder }
  | { kind: "replace"; existing: ExistingOrder; desired: DesiredOrder }

/** Relative tolerance for treating prices/sizes as unchanged. */
const EPSILON = 1e-9

/**
 * Pure diff between what the strategy wants resting and what the bot
 * currently has resting, matched by purpose. Market orders are always
 * "place" actions — they execute once and never rest.
 */
export function diffOrders(
  desired: DesiredOrder[],
  existing: ExistingOrder[]
): DiffAction[] {
  const actions: DiffAction[] = []
  const existingByPurpose = new Map(
    existing.map((order) => [order.purpose, order])
  )
  const desiredPurposes = new Set<string>()

  for (const want of desired) {
    if (want.orderType === "market") {
      actions.push({ kind: "place", desired: want })
      continue
    }
    desiredPurposes.add(want.purpose)
    const have = existingByPurpose.get(want.purpose)
    if (!have) {
      actions.push({ kind: "place", desired: want })
      continue
    }
    if (
      have.side !== want.side ||
      have.reduceOnly !== want.reduceOnly ||
      !nearlyEqual(have.px, want.px ?? null) ||
      !nearlyEqual(want.sizeIsRemaining ? have.remainingSz : have.sz, want.sz)
    ) {
      actions.push({ kind: "replace", existing: have, desired: want })
    }
  }

  for (const have of existing) {
    if (!desiredPurposes.has(have.purpose)) {
      actions.push({ kind: "cancel", existing: have })
    }
  }

  return actions
}

function nearlyEqual(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  const numA = Number(a)
  const numB = Number(b)
  if (!Number.isFinite(numA) || !Number.isFinite(numB)) return a === b
  const scale = Math.max(Math.abs(numA), Math.abs(numB), 1)
  return Math.abs(numA - numB) <= scale * EPSILON
}
