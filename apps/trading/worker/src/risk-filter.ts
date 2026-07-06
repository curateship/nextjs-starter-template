import type { RiskParams } from "@/lib/strategies/params"

import type { DesiredOrder } from "./strategies/contract"

/**
 * Trims the orders a strategy wants resting down to what risk limits allow:
 * caps the open-order count and the remaining position-notional budget.
 * Reduce-only orders always pass (they de-risk). Pure — shared by the live
 * BotRunner and the backtest engine so both gate orders identically.
 */
export function applyRiskFilter(
  desired: DesiredOrder[],
  input: {
    mid: number
    position: { szi: string; entryPx: string } | null
    risk: RiskParams
  }
): DesiredOrder[] {
  const { mid, position, risk } = input
  const positionNotional = position
    ? Math.abs(Number(position.szi)) * (mid || Number(position.entryPx))
    : 0

  let budget = Math.max(0, risk.maxPositionNotionalUsd - positionNotional)
  const kept: DesiredOrder[] = []
  for (const order of desired) {
    if (kept.length >= risk.maxOpenOrders) break
    if (order.reduceOnly) {
      kept.push(order)
      continue
    }
    const px = order.px ? Number(order.px) : mid
    const notional = Number(order.sz) * px
    if (notional > budget) continue
    budget -= notional
    kept.push(order)
  }
  return kept
}
