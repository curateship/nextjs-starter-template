import { z } from "zod"

import { HYPERLIQUID_MARKET_NAME_MAX_LENGTH } from "@/lib/hl/market-symbol"

export const ALERT_WINDOWS = ["1m", "5m", "15m", "1h", "4h", "24h"] as const
export const ALERT_COOLDOWNS = ["5m", "15m", "1h", "4h", "24h"] as const
export const ALERT_KINDS = [
  "price_level",
  "price_move",
  "volume_spike",
  "trendline",
] as const
export const PRICE_LEVEL_OPERATORS = [
  "crossing",
  "crossing_up",
  "crossing_down",
] as const
/**
 * What counts as "price touched your drawn line": any trade reaching it
 * ("wick") or a one-minute candle finishing on the far side of it ("close").
 */
export const TRENDLINE_TOUCH_MODES = ["wick", "close"] as const

export type AlertWindow = (typeof ALERT_WINDOWS)[number]
export type AlertCooldown = (typeof ALERT_COOLDOWNS)[number]
export type AlertKind = (typeof ALERT_KINDS)[number]
export type AlertStatus = "active" | "paused" | "triggered"
export type PriceLevelOperator = (typeof PRICE_LEVEL_OPERATORS)[number]
export type TrendlineTouchMode = (typeof TRENDLINE_TOUCH_MODES)[number]
export type AlertLogSort =
  | "time"
  | "market"
  | "alert"
  | "condition"
  | "observed"
  | "read"

export type AlertLogFilters = {
  page?: number
  pageSize?: number
  search?: string
  coin?: string
  kind?: AlertKind
  read?: "all" | "read" | "unread"
  sortBy?: AlertLogSort
  dir?: "asc" | "desc"
}

const identityFields = {
  name: z.string().trim().min(1).max(100),
  message: z.string().trim().max(1_000).optional(),
  coin: z.string().trim().min(1).max(HYPERLIQUID_MARKET_NAME_MAX_LENGTH),
}

const onceFields = {
  triggerMode: z.literal("once"),
  cooldown: z.never().optional(),
}

const repeatFields = {
  triggerMode: z.literal("repeat"),
  cooldown: z.enum(ALERT_COOLDOWNS),
}

const priceLevelFields = {
  kind: z.literal("price_level"),
  level: z.number().finite().positive(),
  operator: z.enum(PRICE_LEVEL_OPERATORS),
}

const priceMoveFields = {
  kind: z.literal("price_move"),
  direction: z.enum(["up", "down"]),
  percent: z.number().finite().positive().max(100),
  window: z.enum(ALERT_WINDOWS),
}

const volumeSpikeFields = {
  kind: z.literal("volume_spike"),
  multiplier: z.number().finite().gt(1).max(100),
  window: z.enum(ALERT_WINDOWS),
}

const trendlineFields = {
  kind: z.literal("trendline"),
  /** Which chart the drawing lives on; drawings are stored per network. */
  network: z.enum(["testnet", "mainnet"]),
  /** The drawn line's id inside that chart's saved drawings. */
  trendlineId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  touch: z.enum(TRENDLINE_TOUCH_MODES),
}

export const alertRuleInputSchema = z.union([
  z.object({ ...identityFields, ...priceLevelFields, ...onceFields }).strict(),
  z
    .object({ ...identityFields, ...priceLevelFields, ...repeatFields })
    .strict(),
  z.object({ ...identityFields, ...priceMoveFields, ...onceFields }).strict(),
  z.object({ ...identityFields, ...priceMoveFields, ...repeatFields }).strict(),
  z.object({ ...identityFields, ...volumeSpikeFields, ...onceFields }).strict(),
  z
    .object({ ...identityFields, ...volumeSpikeFields, ...repeatFields })
    .strict(),
  z.object({ ...identityFields, ...trendlineFields, ...onceFields }).strict(),
  z.object({ ...identityFields, ...trendlineFields, ...repeatFields }).strict(),
])

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>

export type AlertRuleItem = AlertRuleInput & {
  id: string
  userId: string
  status: AlertStatus
  lastEvaluatedAt: string | null
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
}

export type AlertEventItem = {
  id: string
  ruleId: string | null
  alertName: string
  message: string | null
  coin: string
  kind: AlertKind
  operator: PriceLevelOperator | null
  direction: "up" | "down" | null
  level: number | null
  percent: number | null
  multiplier: number | null
  window: AlertWindow | null
  touch: TrendlineTouchMode | null
  triggerMode: "once" | "repeat"
  cooldown: AlertCooldown | null
  observed: number
  title: string
  body: string | null
  occurredAt: string
  readAt: string | null
}

export function alertTradeTarget(coin: string) {
  return {
    to: "/trade" as const,
    search: { market: coin },
  }
}

export function quickPriceAlert(
  coin: string,
  level: number
): Extract<AlertRuleInput, { kind: "price_level" }> {
  return {
    name: `${coin} price alert`,
    coin,
    kind: "price_level",
    operator: "crossing",
    level,
    triggerMode: "once",
  }
}

export function quickTrendlineAlert(
  coin: string,
  network: "testnet" | "mainnet",
  trendlineId: string,
  touch: TrendlineTouchMode
): Extract<AlertRuleInput, { kind: "trendline" }> {
  return {
    name: `${coin} drawn line`,
    coin,
    kind: "trendline",
    network,
    trendlineId,
    touch,
    triggerMode: "once",
  }
}

export function alertWithTrendlineTouch(
  rule: Extract<AlertRuleItem, { kind: "trendline" }>,
  touch: TrendlineTouchMode
): Extract<AlertRuleInput, { kind: "trendline" }> {
  const shared = {
    name: rule.name,
    ...(rule.message !== undefined ? { message: rule.message } : {}),
    coin: rule.coin,
    kind: "trendline" as const,
    network: rule.network,
    trendlineId: rule.trendlineId,
    touch,
  }
  return rule.triggerMode === "repeat"
    ? { ...shared, triggerMode: "repeat", cooldown: rule.cooldown }
    : { ...shared, triggerMode: "once" }
}

export function alertWithPriceLevel(
  rule: Extract<AlertRuleItem, { kind: "price_level" }>,
  level: number
): Extract<AlertRuleInput, { kind: "price_level" }> {
  const shared = {
    name: rule.name,
    ...(rule.message !== undefined ? { message: rule.message } : {}),
    coin: rule.coin,
    kind: "price_level" as const,
    operator: rule.operator,
    level,
  }
  return rule.triggerMode === "repeat"
    ? { ...shared, triggerMode: "repeat", cooldown: rule.cooldown }
    : { ...shared, triggerMode: "once" }
}

export type MarketBar = {
  ts: number
  close: number
  quoteVolume: number
}

export type WindowAlertEvaluation = {
  matched: boolean
  observed: number
}

export type ThresholdState = {
  matched: boolean
  lastTriggeredAt: number | null
  stopped: boolean
}

export type ThresholdStateResult = ThresholdState & {
  shouldAlert: boolean
}

export type PriceLevelState = {
  previousPrice: number
  lastTriggeredAt: number | null
  stopped: boolean
}

export type PriceLevelStateResult = PriceLevelState & {
  shouldAlert: boolean
}

export const ALERT_WINDOW_MS: Record<AlertWindow, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
}

export const ALERT_COOLDOWN_MS: Record<AlertCooldown, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
}

export function evaluateWindowAlert(
  rule: AlertRuleItem,
  bars: MarketBar[],
  now: number
): WindowAlertEvaluation | null {
  if (rule.kind === "price_level" || rule.kind === "trendline") return null

  const windowMs = ALERT_WINDOW_MS[rule.window]
  const currentStart = now - windowMs

  if (rule.kind === "price_move") {
    const reference = bars.filter((bar) => bar.ts <= currentStart).at(-1)
    const latest = bars.filter((bar) => bar.ts <= now).at(-1)
    if (!reference || !latest || reference.close <= 0) return null

    const observed = ((latest.close - reference.close) / reference.close) * 100
    return {
      matched:
        rule.direction === "down"
          ? observed <= -rule.percent
          : observed >= rule.percent,
      observed,
    }
  }

  const currentVolume = volumeBetween(bars, currentStart, now)
  const baseline: number[] = []
  for (let index = 0; index < 20; index += 1) {
    const end = currentStart - index * windowMs
    const start = end - windowMs
    const volume = volumeBetween(bars, start, end)
    if (volume === null) return null
    baseline.push(volume)
  }
  if (currentVolume === null) return null
  const average =
    baseline.reduce((sum, value) => sum + value, 0) / baseline.length
  if (average <= 0) return null
  const observed = currentVolume / average
  return { matched: observed >= rule.multiplier, observed }
}

export function nextThresholdState(
  previous: ThresholdState | undefined,
  matched: boolean,
  now: number,
  cooldownMs: number,
  triggerMode: "once" | "repeat",
  initialLastTriggeredAt: number | null = null
): ThresholdStateResult {
  if (!previous) {
    return {
      matched,
      lastTriggeredAt: initialLastTriggeredAt,
      stopped: false,
      shouldAlert: false,
    }
  }

  if (previous.stopped) {
    return { ...previous, matched, shouldAlert: false }
  }

  const crossed = !previous.matched && matched
  const cooledDown =
    previous.lastTriggeredAt === null ||
    now - previous.lastTriggeredAt >= cooldownMs
  const shouldAlert = crossed && cooledDown

  return {
    matched,
    lastTriggeredAt: shouldAlert ? now : previous.lastTriggeredAt,
    stopped: shouldAlert && triggerMode === "once",
    shouldAlert,
  }
}

export type LineTouchState = {
  /** Which side of the line the last look left price on. */
  aboveLine: boolean
  lastTriggeredAt: number | null
  stopped: boolean
}

export type LineTouchStateResult = LineTouchState & {
  shouldAlert: boolean
}

/**
 * Touch detection against a drawn line whose trigger price moves with time.
 * The caller passes the line's price *now*, so this fires both when price
 * crosses the line and when a sloped line catches up to a quiet price.
 *
 * The first look only arms: it records which side of the line price is on
 * and never fires, so arming a line that price already passed stays silent
 * until the next real touch.
 */
export function nextLineTouchState(
  previous: LineTouchState | undefined,
  currentPrice: number,
  linePrice: number,
  now: number,
  config: {
    triggerMode: "once" | "repeat"
    cooldownMs: number
    /**
     * Whether landing exactly on the line counts. A wick touching the line
     * to the tick is a touch; a candle closing exactly on the line has not
     * closed *beyond* it.
     */
    exactTouchFires: boolean
  },
  initialLastTriggeredAt: number | null = null
): LineTouchStateResult {
  const aboveLine = currentPrice >= linePrice
  if (!previous) {
    return {
      aboveLine,
      lastTriggeredAt: initialLastTriggeredAt,
      stopped: false,
      shouldAlert: false,
    }
  }

  if (previous.stopped) {
    return { ...previous, aboveLine, shouldAlert: false }
  }

  const touched =
    aboveLine !== previous.aboveLine ||
    (config.exactTouchFires && currentPrice === linePrice)
  const cooledDown =
    previous.lastTriggeredAt === null ||
    now - previous.lastTriggeredAt >= config.cooldownMs
  const shouldAlert = touched && cooledDown

  return {
    aboveLine,
    lastTriggeredAt: shouldAlert ? now : previous.lastTriggeredAt,
    stopped: shouldAlert && config.triggerMode === "once",
    shouldAlert,
  }
}

export function nextPriceLevelState(
  previous: PriceLevelState | undefined,
  currentPrice: number,
  now: number,
  config: {
    level: number
    operator: PriceLevelOperator
    triggerMode: "once" | "repeat"
    cooldownMs: number
  },
  initialLastTriggeredAt: number | null = null
): PriceLevelStateResult {
  if (!previous) {
    return {
      previousPrice: currentPrice,
      lastTriggeredAt: initialLastTriggeredAt,
      stopped: false,
      shouldAlert: false,
    }
  }

  if (previous.stopped) {
    return { ...previous, previousPrice: currentPrice, shouldAlert: false }
  }

  const crossedUp =
    previous.previousPrice < config.level && currentPrice >= config.level
  const crossedDown =
    previous.previousPrice > config.level && currentPrice <= config.level
  const crossed =
    config.operator === "crossing_up"
      ? crossedUp
      : config.operator === "crossing_down"
        ? crossedDown
        : crossedUp || crossedDown
  const cooledDown =
    previous.lastTriggeredAt === null ||
    now - previous.lastTriggeredAt >= config.cooldownMs
  const shouldAlert = crossed && cooledDown

  return {
    previousPrice: currentPrice,
    lastTriggeredAt: shouldAlert ? now : previous.lastTriggeredAt,
    stopped: shouldAlert && config.triggerMode === "once",
    shouldAlert,
  }
}

function volumeBetween(bars: MarketBar[], start: number, end: number) {
  const matching = bars.filter((bar) => bar.ts > start && bar.ts <= end)
  if (matching.length === 0) return null
  return matching.reduce((sum, bar) => sum + bar.quoteVolume, 0)
}
