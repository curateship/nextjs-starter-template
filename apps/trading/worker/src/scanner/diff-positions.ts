// Pure position diffing: two clearinghouse snapshots → change events.

export type PositionSnapshot = {
  coin: string
  /** Signed size; positive = long. */
  szi: number
  entryPx: number | null
  /** Absolute position value in USD. */
  notional: number
  leverage: number | null
  unrealizedPnl: number | null
}

export type PositionChangeType =
  | "opened"
  | "closed"
  | "increased"
  | "reduced"
  | "flipped"

export type PositionChange = {
  coin: string
  type: PositionChangeType
  prev: PositionSnapshot | null
  next: PositionSnapshot | null
}

export type DiffPositionsOptions = {
  /** Ignore size drifts below this fraction of the previous size. */
  minChangeRatio: number
  /** Ignore changes where the notional delta is below this (USD). */
  minChangeNotional: number
}

export const DEFAULT_DIFF_OPTIONS: DiffPositionsOptions = {
  minChangeRatio: 0.05,
  minChangeNotional: 10_000,
}

export function diffPositions(
  prev: Map<string, PositionSnapshot>,
  next: Map<string, PositionSnapshot>,
  opts: DiffPositionsOptions = DEFAULT_DIFF_OPTIONS
): PositionChange[] {
  const changes: PositionChange[] = []
  const coins = new Set([...prev.keys(), ...next.keys()])

  for (const coin of coins) {
    const before = prev.get(coin) ?? null
    const after = next.get(coin) ?? null
    const beforeSize = before?.szi ?? 0
    const afterSize = after?.szi ?? 0

    if (beforeSize === 0 && afterSize === 0) continue

    if (beforeSize === 0 && afterSize !== 0) {
      if ((after?.notional ?? 0) >= opts.minChangeNotional) {
        changes.push({ coin, type: "opened", prev: before, next: after })
      }
      continue
    }
    if (beforeSize !== 0 && afterSize === 0) {
      if ((before?.notional ?? 0) >= opts.minChangeNotional) {
        changes.push({ coin, type: "closed", prev: before, next: after })
      }
      continue
    }
    if (Math.sign(beforeSize) !== Math.sign(afterSize)) {
      changes.push({ coin, type: "flipped", prev: before, next: after })
      continue
    }

    const sizeDelta = Math.abs(afterSize) - Math.abs(beforeSize)
    const ratio = Math.abs(sizeDelta) / Math.abs(beforeSize)
    const notionalDelta = Math.abs(
      (after?.notional ?? 0) - (before?.notional ?? 0)
    )
    if (ratio < opts.minChangeRatio || notionalDelta < opts.minChangeNotional) {
      continue
    }
    changes.push({
      coin,
      type: sizeDelta > 0 ? "increased" : "reduced",
      prev: before,
      next: after,
    })
  }

  return changes
}
