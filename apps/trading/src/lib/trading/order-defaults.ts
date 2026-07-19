/**
 * Starting values for a fresh manual order ticket (main ticket and the chart
 * quick-order popup). Saved in Trading settings; the ticket still lets you
 * change any of them per order.
 */
export type OrderDefaults = {
  /** Margin multiplier, clamped to whatever the market allows. */
  leverage: number
  marginMode: "cross" | "isolated"
  orderType: "market" | "limit"
  sizeUnit: "usd" | "coin" | "pct"
}

export const MIN_DEFAULT_LEVERAGE = 1
export const MAX_DEFAULT_LEVERAGE = 50

export const DEFAULT_ORDER_DEFAULTS: OrderDefaults = {
  leverage: 5,
  marginMode: "cross",
  orderType: "limit",
  sizeUnit: "usd",
}

export function clampDefaultLeverage(value: unknown): number {
  const leverage = Math.round(Number(value))
  if (!Number.isFinite(leverage)) return DEFAULT_ORDER_DEFAULTS.leverage
  return Math.min(
    MAX_DEFAULT_LEVERAGE,
    Math.max(MIN_DEFAULT_LEVERAGE, leverage)
  )
}

/** Lenient: settings rows saved before this card existed fall back to defaults. */
export function normalizeOrderDefaults(value: unknown): OrderDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_ORDER_DEFAULTS }
  }
  const input = value as Partial<OrderDefaults>
  return {
    leverage: clampDefaultLeverage(input.leverage),
    marginMode:
      input.marginMode === "isolated"
        ? "isolated"
        : DEFAULT_ORDER_DEFAULTS.marginMode,
    orderType:
      input.orderType === "market"
        ? "market"
        : DEFAULT_ORDER_DEFAULTS.orderType,
    sizeUnit:
      input.sizeUnit === "coin" || input.sizeUnit === "pct"
        ? input.sizeUnit
        : DEFAULT_ORDER_DEFAULTS.sizeUnit,
  }
}
