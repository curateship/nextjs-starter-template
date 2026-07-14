import { z } from "zod"

import { HYPERLIQUID_MARKET_NAME_MAX_LENGTH } from "@/lib/hl/market-symbol"

export const MARKET_SCANNER_WINDOWS = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "24h",
] as const
export const MARKET_SCANNER_COOLDOWNS = ["5m", "15m", "1h", "4h", "24h"] as const

export type MarketScannerWindow = (typeof MARKET_SCANNER_WINDOWS)[number]
export type MarketScannerCooldown = (typeof MARKET_SCANNER_COOLDOWNS)[number]

const sharedRuleFields = {
  name: z.string().trim().min(1).max(100),
  marketScope: z.enum(["all", "selected"]),
  markets: z
    .array(z.string().trim().min(1).max(HYPERLIQUID_MARKET_NAME_MAX_LENGTH))
    .max(300),
  window: z.enum(MARKET_SCANNER_WINDOWS),
  cooldown: z.enum(MARKET_SCANNER_COOLDOWNS),
  enabled: z.boolean(),
}

export const marketScannerRuleInputSchema = z
  .discriminatedUnion("kind", [
    z.object({
      ...sharedRuleFields,
      kind: z.literal("price_move"),
      direction: z.enum(["up", "down"]),
      threshold: z.number().min(0.1).max(100),
    }),
    z.object({
      ...sharedRuleFields,
      kind: z.literal("volume_spike"),
      threshold: z.number().min(1.1).max(100),
    }),
  ])
  .superRefine((rule, ctx) => {
    if (rule.marketScope === "selected" && rule.markets.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["markets"],
        message: "Choose at least one market.",
      })
    }
  })

export type MarketScannerRuleInput = z.infer<typeof marketScannerRuleInputSchema>

export type MarketScannerRule = Omit<MarketScannerRuleInput, "kind"> & {
  id: string
  userId: string
  kind: "price_move" | "volume_spike"
  direction?: "up" | "down"
}

export type MarketScannerRuleItem = MarketScannerRule & {
  lastEvaluatedAt: string | null
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
}

export type MarketScannerAlertItem = {
  id: string
  ruleId: string | null
  ruleName: string
  kind: "price_move" | "volume_spike"
  direction: "up" | "down" | null
  coin: string
  window: MarketScannerWindow
  threshold: number
  observed: number
  title: string
  body: string | null
  occurredAt: string
  readAt: string | null
}

export function marketScannerTradeTarget(coin: string) {
  return {
    to: "/trade" as const,
    search: { market: coin },
  }
}

export type MarketBar = {
  ts: number
  close: number
  quoteVolume: number
}

export type MarketRuleEvaluation = {
  matched: boolean
  observed: number
}

export type MarketRuleState = {
  matched: boolean
  lastTriggeredAt: number | null
}

export type MarketRuleStateResult = MarketRuleState & {
  shouldAlert: boolean
}

export const MARKET_SCANNER_WINDOW_MS: Record<MarketScannerWindow, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
}

export const COOLDOWN_MS: Record<MarketScannerCooldown, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
}

export function evaluateMarketRule(
  rule: MarketScannerRule,
  bars: MarketBar[],
  now: number
): MarketRuleEvaluation | null {
  const windowMs = MARKET_SCANNER_WINDOW_MS[rule.window]
  const currentStart = now - windowMs

  if (rule.kind === "price_move") {
    const reference = bars.filter((bar) => bar.ts <= currentStart).at(-1)
    const latest = bars.filter((bar) => bar.ts <= now).at(-1)
    if (!reference || !latest || reference.close <= 0) return null

    const observed = ((latest.close - reference.close) / reference.close) * 100
    return {
      matched:
        rule.direction === "down"
          ? observed <= -rule.threshold
          : observed >= rule.threshold,
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
  const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length
  if (average <= 0) return null
  const observed = currentVolume / average
  return { matched: observed >= rule.threshold, observed }
}

function volumeBetween(bars: MarketBar[], start: number, end: number) {
  const matching = bars.filter((bar) => bar.ts > start && bar.ts <= end)
  if (matching.length === 0) return null
  return matching.reduce((sum, bar) => sum + bar.quoteVolume, 0)
}

export function nextMarketRuleState(
  previous: MarketRuleState | undefined,
  matched: boolean,
  now: number,
  cooldownMs: number
): MarketRuleStateResult {
  if (!previous) {
    return { matched, lastTriggeredAt: null, shouldAlert: false }
  }

  const crossed = !previous.matched && matched
  const cooledDown =
    previous.lastTriggeredAt === null ||
    now - previous.lastTriggeredAt >= cooldownMs
  const shouldAlert = crossed && cooledDown

  return {
    matched,
    lastTriggeredAt: shouldAlert ? now : previous.lastTriggeredAt,
    shouldAlert,
  }
}
