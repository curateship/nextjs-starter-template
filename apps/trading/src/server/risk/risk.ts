/**
 * Pure risk engine shared by the manual order path and the bot brokers.
 * No I/O, no imports with side effects — everything is unit-testable and
 * safe to call from both the web server and the worker.
 */

export type OrderIntent = {
  market: string
  side: "buy" | "sell"
  orderType: "market" | "limit"
  /** Limit price; null for market orders (mark price is used for notional). */
  px: string | null
  /** Size in base currency units. */
  sz: string
  reduceOnly: boolean
  /** Leverage the order will trade under. */
  leverage: number
}

export type AccountRiskState = {
  /** Account equity in USD. */
  equity: string
  /** Signed position size in this market (szi), "0" when flat. */
  positionSzi: string
  /** Absolute notional of the current position in this market, USD. */
  positionNotional: string
  /** Resting orders for this account. */
  openOrderCount: number
}

export type RiskLimits = {
  maxPositionNotionalUsd: number
  maxLeverage: number
  maxOpenOrders: number
}

export type PriceRef = {
  /** Reference (mark) price for the market. */
  markPx: string
  /** When the reference price was observed, ms epoch. */
  priceTimestamp: number
  /** Current time, ms epoch. */
  now: number
}

export type RiskViolation = {
  code:
    | "stale_price"
    | "invalid_size"
    | "invalid_price"
    | "price_sanity"
    | "max_notional"
    | "max_leverage"
    | "max_open_orders"
    | "reduce_only_direction"
    | "reduce_only_size"
  message: string
}

export type RiskCheckResult =
  | { ok: true }
  | { ok: false; violations: RiskViolation[] }

export const STALE_PRICE_MS = 5_000
/** Limit prices further than this from mark are treated as fat-fingered. */
export const PRICE_SANITY_PCT = 20

export function checkOrderIntent(
  intent: OrderIntent,
  account: AccountRiskState,
  limits: RiskLimits,
  ref: PriceRef
): RiskCheckResult {
  const violations: RiskViolation[] = []

  if (ref.now - ref.priceTimestamp > STALE_PRICE_MS) {
    violations.push({
      code: "stale_price",
      message: `Reference price is ${Math.round((ref.now - ref.priceTimestamp) / 1000)}s old; refusing to size an order against it.`,
    })
  }

  const sz = Number(intent.sz)
  if (!Number.isFinite(sz) || sz <= 0) {
    violations.push({ code: "invalid_size", message: "Size must be positive." })
  }

  const mark = Number(ref.markPx)
  const px = intent.px === null ? mark : Number(intent.px)
  if (!Number.isFinite(px) || px <= 0) {
    violations.push({
      code: "invalid_price",
      message: "Price must be positive.",
    })
  }

  if (
    intent.orderType === "limit" &&
    intent.px !== null &&
    Number.isFinite(px) &&
    px > 0 &&
    mark > 0
  ) {
    const deviationPct = (Math.abs(px - mark) / mark) * 100
    if (deviationPct > PRICE_SANITY_PCT) {
      violations.push({
        code: "price_sanity",
        message: `Limit price is ${deviationPct.toFixed(1)}% away from mark (${ref.markPx}); max allowed is ${PRICE_SANITY_PCT}%.`,
      })
    }
  }

  if (intent.leverage > limits.maxLeverage) {
    violations.push({
      code: "max_leverage",
      message: `Leverage ${intent.leverage}x exceeds the ${limits.maxLeverage}x limit.`,
    })
  }

  if (account.openOrderCount + 1 > limits.maxOpenOrders) {
    violations.push({
      code: "max_open_orders",
      message: `Placing this order would exceed the ${limits.maxOpenOrders} open order limit.`,
    })
  }

  const szi = Number(account.positionSzi)
  if (intent.reduceOnly) {
    const positionSide = szi > 0 ? "long" : szi < 0 ? "short" : "flat"
    const reduces =
      (positionSide === "long" && intent.side === "sell") ||
      (positionSide === "short" && intent.side === "buy")
    if (!reduces) {
      violations.push({
        code: "reduce_only_direction",
        message:
          positionSide === "flat"
            ? "Reduce-only order with no open position."
            : `Reduce-only ${intent.side} does not reduce a ${positionSide} position.`,
      })
    } else if (Number.isFinite(sz) && sz > Math.abs(szi)) {
      violations.push({
        code: "reduce_only_size",
        message: `Reduce-only size ${intent.sz} exceeds position size ${Math.abs(szi)}.`,
      })
    }
  } else if (Number.isFinite(sz) && Number.isFinite(px) && sz > 0 && px > 0) {
    const orderNotional = sz * px
    const increasesPosition =
      szi === 0 ||
      (szi > 0 && intent.side === "buy") ||
      (szi < 0 && intent.side === "sell")
    const projected = increasesPosition
      ? Number(account.positionNotional) + orderNotional
      : Math.max(orderNotional - Number(account.positionNotional), 0)
    if (projected > limits.maxPositionNotionalUsd) {
      violations.push({
        code: "max_notional",
        message: `Projected position notional $${projected.toFixed(0)} exceeds the $${limits.maxPositionNotionalUsd} limit.`,
      })
    }
  }

  return violations.length > 0 ? { ok: false, violations } : { ok: true }
}

export function describeViolations(violations: RiskViolation[]): string {
  return violations.map((violation) => violation.message).join(" ")
}
