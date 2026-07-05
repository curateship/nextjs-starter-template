/**
 * Isomorphic order preview math — used by the order ticket for its live
 * preview and by tests. Estimates only; the exchange is authoritative.
 */

export const TAKER_FEE_RATE = 0.00045
export const MAKER_FEE_RATE = 0.00015

export type OrderPreviewInput = {
  side: "buy" | "sell"
  /** Execution price estimate (limit px, or best opposing book px). */
  px: number
  /** Size in base units. */
  sz: number
  leverage: number
  /** Max leverage of the market, used for the maintenance margin estimate. */
  maxLeverage: number
  isTaker: boolean
}

export type OrderPreview = {
  notionalUsd: number
  marginRequiredUsd: number
  estFeeUsd: number
  /** Rough isolated liquidation price; null when not computable. */
  estLiquidationPx: number | null
}

export function previewOrder(input: OrderPreviewInput): OrderPreview {
  const notionalUsd = input.px * input.sz
  const marginRequiredUsd =
    input.leverage > 0 ? notionalUsd / input.leverage : notionalUsd
  const estFeeUsd =
    notionalUsd * (input.isTaker ? TAKER_FEE_RATE : MAKER_FEE_RATE)

  return {
    notionalUsd,
    marginRequiredUsd,
    estFeeUsd,
    estLiquidationPx: estimateLiquidationPx(
      input.side,
      input.px,
      input.leverage,
      input.maxLeverage
    ),
  }
}

/**
 * Isolated-margin liquidation estimate. Hyperliquid's maintenance margin is
 * half the initial margin at max leverage (1 / (2 * maxLeverage)).
 * Cross-margin liquidation depends on the whole account, so this is labeled
 * an estimate in the UI.
 */
export function estimateLiquidationPx(
  side: "buy" | "sell",
  entryPx: number,
  leverage: number,
  maxLeverage: number
): number | null {
  if (!(entryPx > 0) || !(leverage > 0) || !(maxLeverage > 0)) return null
  const maintenanceMarginRate = 1 / (2 * maxLeverage)
  const initialMarginRate = 1 / leverage
  const buffer = initialMarginRate - maintenanceMarginRate
  if (buffer <= 0) return null
  const liqPx =
    side === "buy" ? entryPx * (1 - buffer) : entryPx * (1 + buffer)
  return liqPx > 0 ? liqPx : null
}

/** Converts a USD order size to base units at the given price. */
export function usdToBaseSize(usd: number, px: number): number {
  if (!(px > 0)) return 0
  return usd / px
}
