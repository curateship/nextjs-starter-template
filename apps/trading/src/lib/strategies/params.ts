import { z } from "zod"

/**
 * Strategy parameter schemas — isomorphic (zod only, no node imports).
 * The bot wizard renders forms from these and the worker validates
 * bots.params against them before starting a runner.
 */

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Must be a positive decimal")

export const gridParamsSchema = z.object({
  strategyType: z.literal("grid"),
  lowerPx: decimalString,
  upperPx: decimalString,
  levels: z.number().int().min(2).max(100),
  sizePerLevelUsd: z.number().positive(),
  side: z.enum(["both", "long_only", "short_only"]),
  stopLossPx: decimalString.optional(),
  /** Price that exits the entire position and halts the grid (favorable side). */
  takeProfitPx: decimalString.optional(),
})

export const dcaParamsSchema = z.object({
  strategyType: z.literal("dca"),
  direction: z.enum(["long", "short"]),
  baseOrderUsd: z.number().positive(),
  safetyOrderUsd: z.number().positive(),
  maxSafetyOrders: z.number().int().min(0).max(15),
  /** Deviation % from entry to the first safety order. */
  priceStepPct: z.number().positive().max(50),
  /** Multiplies the spacing of each further safety order. */
  stepMultiplier: z.number().min(1).max(5),
  /** Multiplies the size of each further safety order. */
  sizeMultiplier: z.number().min(1).max(5),
  takeProfitPct: z.number().positive().max(100),
  stopLossPct: z.number().positive().max(100).optional(),
})

export const momentumParamsSchema = z
  .object({
    strategyType: z.literal("momentum"),
    signal: z.enum(["ema_cross", "rsi", "breakout"]),
    interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
    emaFast: z.number().int().min(2).max(200).optional(),
    emaSlow: z.number().int().min(3).max(400).optional(),
    rsiPeriod: z.number().int().min(2).max(100).optional(),
    rsiBuyBelow: z.number().min(1).max(50).optional(),
    rsiSellAbove: z.number().min(50).max(99).optional(),
    breakoutLookback: z.number().int().min(5).max(400).optional(),
    trailingStopPct: z.number().positive().max(50).optional(),
    orderSizeUsd: z.number().positive(),
    direction: z.enum(["long", "short", "both"]),
  })
  .superRefine((params, ctx) => {
    if (params.signal === "ema_cross") {
      if (!params.emaFast || !params.emaSlow) {
        ctx.addIssue({
          code: "custom",
          message: "EMA cross needs emaFast and emaSlow periods.",
        })
      } else if (params.emaFast >= params.emaSlow) {
        ctx.addIssue({
          code: "custom",
          message: "emaFast must be shorter than emaSlow.",
        })
      }
    }
    if (params.signal === "rsi") {
      if (!params.rsiPeriod || !params.rsiBuyBelow || !params.rsiSellAbove) {
        ctx.addIssue({
          code: "custom",
          message: "RSI needs rsiPeriod, rsiBuyBelow, and rsiSellAbove.",
        })
      }
    }
    if (params.signal === "breakout" && !params.breakoutLookback) {
      ctx.addIssue({
        code: "custom",
        message: "Breakout needs breakoutLookback.",
      })
    }
  })

export const copyParamsSchema = z
  .object({
    strategyType: z.literal("copy"),
    sourceAddress: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x address"),
    sizeMode: z.enum(["ratio", "fixed_usd"]),
    /** Mirror at this fraction of the source's fill size (1 = same size). */
    ratio: z.number().positive().max(100).optional(),
    /** Mirror every source fill with this fixed USD notional. */
    fixedUsd: z.number().positive().optional(),
    marketsFilter: z.array(z.string().min(1)).max(50).optional(),
    maxSlippageBps: z.number().int().min(1).max(500),
  })
  .superRefine((params, ctx) => {
    if (params.sizeMode === "ratio" && !params.ratio) {
      ctx.addIssue({ code: "custom", message: "Ratio mode needs ratio." })
    }
    if (params.sizeMode === "fixed_usd" && !params.fixedUsd) {
      ctx.addIssue({
        code: "custom",
        message: "Fixed mode needs fixedUsd.",
      })
    }
  })

export const strategyParamsSchema = z.discriminatedUnion("strategyType", [
  gridParamsSchema,
  dcaParamsSchema,
  momentumParamsSchema,
  copyParamsSchema,
])

export const riskParamsSchema = z.object({
  maxPositionNotionalUsd: z.number().positive(),
  maxLeverage: z.number().min(1).max(50),
  /** Realized daily loss beyond this auto-pauses the bot. */
  dailyLossLimitUsd: z.number().positive(),
  /** Drawdown % from peak equity that kills (and flattens) the bot. */
  maxDrawdownPct: z.number().positive().max(100),
  maxOpenOrders: z.number().int().min(1).max(200),
  /** Consecutive losing trades before pausing for cooldownMinutes. */
  cooldownLosses: z.number().int().min(0).max(50),
  cooldownMinutes: z.number().int().min(0).max(24 * 60),
})

export type GridParams = z.infer<typeof gridParamsSchema>
export type DcaParams = z.infer<typeof dcaParamsSchema>
export type MomentumParams = z.infer<typeof momentumParamsSchema>
export type CopyParams = z.infer<typeof copyParamsSchema>
export type StrategyParams = z.infer<typeof strategyParamsSchema>
export type RiskParams = z.infer<typeof riskParamsSchema>
export type StrategyType = StrategyParams["strategyType"]

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  grid: "Grid",
  dca: "DCA / Martingale",
  momentum: "Momentum",
  copy: "Copy Trader",
}

export const STRATEGY_DESCRIPTIONS: Record<StrategyType, string> = {
  grid: "Ladders resting buys and sells across a price range; re-arms the opposite side after each fill.",
  dca: "Averages in with martingale safety orders and exits the whole position at a take-profit from average entry.",
  momentum: "Enters on EMA cross, RSI, or breakout signals at candle close; manages a trailing stop.",
  copy: "Mirrors every fill of a Hyperliquid address with scaled size at market, capped by slippage.",
}

export const DEFAULT_RISK_PARAMS: RiskParams = {
  maxPositionNotionalUsd: 5_000,
  maxLeverage: 5,
  dailyLossLimitUsd: 250,
  maxDrawdownPct: 20,
  maxOpenOrders: 60,
  cooldownLosses: 4,
  cooldownMinutes: 60,
}
