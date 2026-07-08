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
    /** Exit mechanism: trailing percent stop, or a break of the QFL base. */
    stopMode: z.enum(["trailing", "base"]).optional(),
    trailingStopPct: z.number().positive().max(50).optional(),
    /** QFL base: bars to scan for a new base low (stopMode = "base"). */
    basePeriods: z.number().int().min(4).max(400).optional(),
    /** QFL base: bars the low must hold to confirm a base. */
    pumpPeriods: z.number().int().min(2).max(200).optional(),
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
    if (params.stopMode === "base" && (!params.basePeriods || !params.pumpPeriods)) {
      ctx.addIssue({
        code: "custom",
        message: "Base stop needs basePeriods and pumpPeriods.",
      })
    }
  })

export const qqeParamsSchema = z.object({
  strategyType: z.literal("qqe"),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  rsiPeriod: z.number().int().min(2).max(100),
  rsiSmoothing: z.number().int().min(1).max(50),
  qqeFactor: z.number().positive().max(20),
  threshold: z.number().min(0).max(50),
  maType: z.enum([
    "ALMA",
    "EMA",
    "DEMA",
    "TEMA",
    "WMA",
    "VWMA",
    "SMA",
    "SMMA",
    "HMA",
    "LSMA",
    "PEMA",
  ]),
  lsmaOffset: z.number().int().min(0).max(100).optional(),
  almaOffset: z.number().min(0).max(1).optional(),
  almaSigma: z.number().positive().max(50).optional(),
  rsiSource: z.enum(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"]),
  /** Paint candles green/red/orange by QQE state on the backtest chart. */
  colorBars: z.boolean(),
  /** Suppress signals while the market sits in a consolidation zone. */
  consolidationFilter: z.boolean(),
  loopbackPeriod: z.number().int().min(2).max(400),
  minConsolidationLen: z.number().int().min(2).max(100),
  paintConsolidation: z.boolean(),
  zoneColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a #rrggbb hex color")
    .optional(),
  /** Paint the previous swing high/low (trailing-pivot structure). */
  paintSwings: z.boolean(),
  /** Trailing window (bars) a bar must top/bottom to count as a swing pivot. */
  swingLookback: z.number().int().min(2).max(400),
  /** Exit at the swing low (long) / swing high (short) instead of stopLossPct. */
  swingStopLoss: z.boolean(),
  /**
   * Swing-base stop geometry (QFL-style): scan window for the swing low/high
   * and the bars it must hold to confirm as a base. Longs exit when price
   * breaks the base low, shorts when it breaks the mirrored high.
   * Defaults 12 / 4 when swingStopLoss is on.
   */
  swingScanBars: z.number().int().min(4).max(400).optional(),
  swingConfirmBars: z.number().int().min(1).max(100).optional(),
  /**
   * Re-enter the trend while flat: after an exit, if the smoothed RSI still
   * holds beyond 50±threshold (and outside consolidation), enter again on a
   * continuation candle (close beyond the prior close).
   */
  trendReentry: z.boolean().optional(),
  /** Cap re-entries per threshold excursion (unset = unlimited). */
  maxReentries: z.number().int().min(1).max(100).optional(),
  orderSizeUsd: z.number().positive(),
  takeProfitPct: z.number().positive().max(100).optional(),
  stopLossPct: z.number().positive().max(100).optional(),
})

export const vwapParamsSchema = z
  .object({
    strategyType: z.literal("vwap"),
    interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
    /**
     * reversion: fade stretches away from the session VWAP back to fair value.
     * cross: trend-follow the close crossing the VWAP line.
     */
    mode: z.enum(["reversion", "cross"]),
    direction: z.enum(["long", "short", "both"]),
    /** Reversion: band width in volume-weighted σ that arms an entry. */
    bandK: z.number().positive().max(10).optional(),
    /** Reversion: exit at the VWAP line or at the opposite band. */
    exitAt: z.enum(["vwap", "band"]).optional(),
    orderSizeUsd: z.number().positive(),
    /** Bet the full current balance each trade (profits/losses compound) rather
     *  than a fixed order size. */
    compounding: z.boolean().optional(),
    takeProfitPct: z.number().positive().max(100).optional(),
    stopLossPct: z.number().positive().max(100).optional(),
  })
  .superRefine((params, ctx) => {
    if (params.mode === "reversion") {
      if (!params.bandK) {
        ctx.addIssue({
          code: "custom",
          message: "Reversion needs a band width (bandK).",
        })
      }
      if (!params.exitAt) {
        ctx.addIssue({
          code: "custom",
          message: "Reversion needs an exit target (exitAt).",
        })
      }
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
  qqeParamsSchema,
  vwapParamsSchema,
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
export type QqeParams = z.infer<typeof qqeParamsSchema>
export type VwapParams = z.infer<typeof vwapParamsSchema>
export type CopyParams = z.infer<typeof copyParamsSchema>
export type StrategyParams = z.infer<typeof strategyParamsSchema>
export type RiskParams = z.infer<typeof riskParamsSchema>
export type StrategyType = StrategyParams["strategyType"]

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  grid: "Grid",
  dca: "DCA / Martingale",
  momentum: "Momentum",
  qqe: "QQE + Consolidation",
  vwap: "VWAP",
  copy: "Copy Trader",
}

export const STRATEGY_DESCRIPTIONS: Record<StrategyType, string> = {
  grid: "Ladders resting buys and sells across a price range; re-arms the opposite side after each fill.",
  dca: "Averages in with martingale safety orders and exits the whole position at a take-profit from average entry.",
  momentum: "Enters on EMA cross, RSI, or breakout signals at candle close; exits on a trailing stop or a break of the QFL base.",
  qqe: "Stop-and-reverse on the smoothed RSI's first cross out of the 50±threshold channel, filtered by a zigzag consolidation detector; optional TP/SL.",
  vwap: "Trades the session-anchored VWAP: fade stretches past its σ-bands back to fair value (reversion), or follow the close crossing the VWAP line (cross).",
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

export const DEFAULT_BACKTEST_RISK_PARAMS: RiskParams = {
  maxPositionNotionalUsd: 10_000,
  maxLeverage: 1,
  dailyLossLimitUsd: 1_000_000,
  maxDrawdownPct: 99,
  maxOpenOrders: 60,
  cooldownLosses: 0,
  cooldownMinutes: 0,
}
