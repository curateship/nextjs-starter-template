/**
 * Liquidation-risk math shared by the positions tables, the wallets
 * margin-health card, and the worker's snapshot-poller alerts. Pure functions
 * so every surface grades the same numbers the same way.
 */

/**
 * Percent gap between the mark price and the exchange-provided liquidation
 * price, relative to mark — "price has to move this much against you before
 * forced liquidation". Null when there is no position, no usable liquidation
 * price (e.g. a cross position the exchange reports as null), or no mark.
 * Floored at 0: a mark at or past the liquidation price is 0% away, never negative.
 */
export function liquidationDistancePct(input: {
  szi: number
  markPx: number
  liquidationPx: number | null | undefined
}): number | null {
  const { szi, markPx, liquidationPx } = input
  if (!szi || !(markPx > 0)) return null
  if (liquidationPx === null || liquidationPx === undefined) return null
  if (!(liquidationPx > 0)) return null
  const gap =
    szi > 0
      ? ((markPx - liquidationPx) / markPx) * 100
      : ((liquidationPx - markPx) / markPx) * 100
  return Math.max(0, gap)
}

/**
 * Mark price implied by an exchange position row: `positionValue` is the
 * position's notional at mark, so mark = |value| / |size|. Lets the poller
 * and wallet card grade distance without a separate price feed.
 */
export function positionMarkPx(
  positionValue: string | number,
  szi: string | number
): number | null {
  const size = Math.abs(Number(szi))
  const value = Math.abs(Number(positionValue))
  if (!(size > 0) || !(value > 0)) return null
  return value / size
}

/** Color band for a liquidation distance, shared by every surface. */
export function liquidationTone(
  distancePct: number
): "critical" | "warning" | "safe" {
  if (distancePct <= 10) return "critical"
  if (distancePct <= 25) return "warning"
  return "safe"
}

/**
 * The one text-color grade for liquidation distances, so the positions table
 * and the wallets card can never disagree. Red = liquidation is near, amber =
 * getting close, muted = comfortable.
 */
export function liquidationDistanceClass(distancePct: number | null) {
  if (distancePct === null) return undefined
  const tone = liquidationTone(distancePct)
  if (tone === "critical") return "text-red-500"
  if (tone === "warning") return "text-amber-500"
  return "text-muted-foreground"
}

export const DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT = 10
export const MAX_LIQUIDATION_ALERT_THRESHOLD_PCT = 90

/**
 * Read the alert threshold out of a raw settings JSON leniently: rows saved
 * before the setting existed fall back to the default instead of failing.
 * 0 turns the alert off.
 */
export function liquidationAlertThresholdFromSettings(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
  }
  const raw = (value as { liquidationAlertThresholdPct?: unknown })
    .liquidationAlertThresholdPct
  return clampLiquidationAlertThreshold(raw)
}

export function clampLiquidationAlertThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
  }
  return Math.min(Math.max(value, 0), MAX_LIQUIDATION_ALERT_THRESHOLD_PCT)
}

export type LiquidationAlertPosition = {
  coin: string
  szi: number
  liquidationPx: number | null
  markPx: number | null
}

export type LiquidationAlertDraft = {
  coin: string
  side: "long" | "short"
  /** The liquidation price the alert warns about (row `price`). */
  liquidationPx: number
  size: number
  distancePct: number
}

/** One alert per position per cooldown window while it stays inside the threshold. */
export const LIQUIDATION_ALERT_COOLDOWN_MS = 30 * 60_000

/**
 * Which positions deserve an alert right now. `lastAlertAt` (key
 * `walletId:coin`) rate-limits a position hovering at the threshold to one
 * alert per cooldown window; callers persist the returned map between ticks.
 * Pure — the poller owns the clock and the map.
 */
export function evaluateLiquidationAlerts(input: {
  walletId: string
  positions: LiquidationAlertPosition[]
  thresholdPct: number
  now: number
  lastAlertAt: Map<string, number>
}): LiquidationAlertDraft[] {
  const { walletId, positions, thresholdPct, now, lastAlertAt } = input
  if (!(thresholdPct > 0)) return []
  const drafts: LiquidationAlertDraft[] = []
  for (const position of positions) {
    if (position.markPx === null) continue
    const distance = liquidationDistancePct({
      szi: position.szi,
      markPx: position.markPx,
      liquidationPx: position.liquidationPx,
    })
    if (distance === null || distance > thresholdPct) continue
    const key = `${walletId}:${position.coin}`
    const last = lastAlertAt.get(key)
    if (last !== undefined && now - last < LIQUIDATION_ALERT_COOLDOWN_MS) {
      continue
    }
    lastAlertAt.set(key, now)
    drafts.push({
      coin: position.coin,
      side: position.szi > 0 ? "long" : "short",
      liquidationPx: position.liquidationPx as number,
      size: Math.abs(position.szi),
      distancePct: distance,
    })
  }
  return drafts
}
