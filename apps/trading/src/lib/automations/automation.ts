import { z } from "zod"

import type { IndicatorSelection } from "@/lib/indicators/registry"
import {
  INDICATORS,
  indicatorIdSchema,
  indicatorSelectionSchema,
} from "@/lib/indicators/registry"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"
import { SESSION_KEYS, type SessionKey } from "@/lib/trading/sessions"
import {
  automationNodeConnectionError,
  automationNodeSourcePortIsValid,
} from "./node-registry"
import {
  DEFAULT_DCA_MAX_POSITION_PCT,
  DEFAULT_DCA_SELL_BELOW_BASE_PCT,
  dcaRungsSchema,
  type AutomationDcaRung,
} from "./dca"
import {
  marketScannerSettingsFieldsSchema,
  marketScannerSettingsSchema,
  type MarketScannerSettings,
} from "./dca-ladder"

export type { AutomationInterval }

export type AutomationIndicatorNode = {
  id: string
  kind: "indicator"
  x: number
  y: number
  indicator: IndicatorSelection
}

export type AutomationLogicNode = {
  id: string
  kind: "logic"
  op: "and" | "or"
  x: number
  y: number
}

export type AutomationActionNode = {
  id: string
  kind: "action"
  action: "buy" | "short" | "close" | "reverse"
  targetEquityPct?: number
  x: number
  y: number
}

/**
 * Puts an expiry on the signal flowing through it: whatever latches upstream
 * only counts for `bars` candles after it fires (the signal candle is bar 1).
 */
export type AutomationLookbackNode = {
  id: string
  kind: "lookback"
  bars: number
  x: number
  y: number
}

/**
 * Moves the signal path onto a higher timeframe: every indicator upstream of
 * this node evaluates on `interval` (closed candles only) instead of the
 * automation's own timeframe. Sits on a Trend wire, like Look Back.
 */
export type AutomationTimeframeNode = {
  id: string
  kind: "timeframe"
  interval: AutomationInterval
  x: number
  y: number
}

/**
 * A protective exit hung on a Long or Short entry: `pct` is the take-profit
 * distance from entry. The runtime picks it by the open position's side.
 */
export type AutomationTakeProfitNode = {
  id: string
  kind: "takeProfit"
  pct: number
  /**
   * How profit is taken. "average" (default): close the whole position at `pct`
   * above the blended average entry. The two rung modes apply ONLY when a DCA
   * node feeds this take-profit (they reference the buy ladder).
   * "previousRungSellAll" peels the ladder: as price recovers, each averaged-in
   * buy is sold at the price of the buy above it (the second sells where the
   * first bought, the first at the base). "nearestRungSellAll" instead rests one
   * order for the WHOLE position at the nearest rung above the deepest buy, so a
   * bounce back to that single level closes everything at once (and that level
   * slides down as deeper rungs fill). "moneyBackThenBase" sells at that same
   * nearest rung but only ENOUGH to hand back every dollar the ladder spent; the
   * coins left over cost nothing and rest just under the base for the profit.
   */
  mode?:
    | "average"
    | "previousRungSellAll"
    | "nearestRungSellAll"
    | "moneyBackThenBase"
  /**
   * Risk-reward take profit: the profit target is the STOP's distance times
   * this ratio (1 = 1:1, so a 2% stop banks at 2%; 2 = 2:1, so it banks at
   * 4%). When set, `pct` is ignored and the entry needs a Stop Loss on the
   * same side to measure against. Absent: `pct` is the distance, as before.
   */
  rrRatio?: number
  x: number
  y: number
}

/**
 * Stop-loss twin of {@link AutomationTakeProfitNode}. `mode` defaults to
 * "fixed" (stop stays `pct` from entry); "trailing" follows the best price
 * since entry at `pct` distance, optionally waiting until price has moved
 * `activationPct` in the trade's favor before it starts to follow.
 */
export type AutomationStopLossNode = {
  id: string
  kind: "stopLoss"
  pct: number
  mode?: "fixed" | "trailing"
  activationPct?: number
  /**
   * What the stop measures from. "average" (default) uses the position's
   * blended entry, which a DCA ladder drags down as it adds rungs — letting the
   * earliest buys lose more than `pct`. "first" pins it to the first entry so
   * `pct` means exactly that from where the position started.
   */
  anchor?: "average" | "first"
  /**
   * Where the stop sits. Absent/"percent": `pct` from entry, as before.
   * "sessionOpen": at the opening price of the session wired in from a
   * Sessions node — which is below the entry on a long and above it on a
   * short, because that is simply where the level lies. `pct` stays the
   * fallback for a trade opened outside those hours, where there is no
   * session-open price to use.
   */
  level?: "percent" | "sessionOpen"
  x: number
  y: number
}

/** Live order-book source that follows the closest qualifying wall per side. */
export type AutomationWhaleWallNode = {
  id: string
  kind: "whaleWall"
  minUsd: number
  relativeSize: number
  /** Maximum distance from mid, in percentage points (0.5 = 0.5%). */
  maxDistancePct: number
  confirmationMs: number
  x: number
  y: number
}

/** Eligibility filters for markets selected in the bot or Backtest form. */
export type AutomationMarketScannerNode = MarketScannerSettings & {
  id: string
  kind: "marketScanner"
  x: number
  y: number
}

/**
 * Dollar-Cost-Averaging buy ladder. Places one resting buy per rung, each a set
 * percent below the buy above it (the first below the base), sized automatically
 * by the ladder's Size ramp. It owns averaging-IN only — Take Profit and Stop
 * Loss nodes hung on it own the exits and read its running average.
 */
/**
 * How each rung buys once its level is reached.
 * - "market" (default): react on the candle close and market-buy one rung at a
 *   time; the fill lands a little past the level (that's the slippage), and a
 *   violent candle trips the flash-crash fail-safe.
 * - "limit": rest ONE limit order at the next rung's EXACT price, so it fills
 *   at exactly that level with no slippage; as each fills the next is placed.
 * Neither ties up money ahead of a fill — only what actually fills is committed.
 */
export type DcaRungEntry = "market" | "limit"

export type AutomationDcaNode = {
  id: string
  kind: "dca"
  rungs: AutomationDcaRung[]
  /** Most of the account the whole ladder may ever hold, in percent. */
  maxPositionPct: number
  /** How much bigger each buy is than the one above it (1 = equal, 2 = doubling). */
  sizeMultiplier: number
  /**
   * true (default): size each buy off the account's CURRENT balance, so profits
   * compound into bigger bets and losses shrink them. false: size off the
   * starting balance, so every bet stays the same dollar amount regardless of
   * how the account grows.
   */
  compound: boolean
  /** Market-buy on confirmation (default) or rest a limit at each rung's level. */
  rungEntry: DcaRungEntry
  /**
   * Only buy a rung after two back-to-back green candles (each close above its
   * open), so a wall of red candles can't fill the ladder while price is still
   * knifing down. Off by default.
   */
  requireTwoGreen: boolean
  /**
   * The crack that starts the ladder: how far below the base a candle must close,
   * and how fast the fall must be (price was still at/above the base within this
   * many candles). These live HERE, not on the Base indicator feeding this node —
   * the indicator only finds levels; breaking one is this ladder's rule.
   */
  crackPct: number
  maxCrackBars: number
  /**
   * Past base quality: only trade markets whose recent cracks tended to recover.
   * Scores the last `respectLookbackMonths` and skips a crack unless at least
   * `minRespectPct` of past cracks recovered to `recoveryTargetPct` of the base.
   */
  respectFilterEnabled: boolean
  respectLookbackMonths: number
  minRespectPct: number
  recoveryTargetPct: number
  /**
   * "Money back, ride the rest free" take-profit only: where the free coins rest,
   * as a percent BELOW the base. Negative means ABOVE it — the free coins cost
   * nothing, so they can be held through a recovery rather than sold back at the
   * ceiling of the crack (-100 rests them at twice the base). Inert under every
   * other take-profit style.
   */
  sellBelowBasePct: number
  /**
   * Trend gate: only start a ladder while the close sits above the average of the
   * last `trendMaBars` closes. The ladder only ever buys, so in a falling market
   * it averages down into the fall — measured at −5.07%/month over the Sep-2025 →
   * Jul-2026 crash. This is the switch that keeps it out of one.
   */
  trendFilterEnabled: boolean
  /** Bars in that average, counted on the bot's own timeframe (200 = 200 days at 1d). */
  trendMaBars: number
  /**
   * Close an OPEN ladder when the trend gate turns bearish, instead of only
   * blocking new ones. Without this the gate is entry-only: a ladder opened in
   * an uptrend rides the whole way down after the trend breaks.
   */
  exitOnTrendBreak: boolean
  /**
   * Time stop: abandon a cycle that has been open this many candles without
   * resolving. 0 = never. The ladder otherwise has NO way to give up on a
   * position, which is how every tuned configuration ended up hiding its losses
   * in open bags and scoring a 95% win rate.
   */
  maxCycleBars: number
  x: number
  y: number
}

export type AutomationNode =
  | AutomationIndicatorNode
  | AutomationLogicNode
  | AutomationActionNode
  | AutomationLookbackNode
  | AutomationTimeframeNode
  | AutomationTakeProfitNode
  | AutomationStopLossNode
  | AutomationWhaleWallNode
  | AutomationMarketScannerNode
  | AutomationDcaNode

/**
 * Ceiling on the engine's per-candle evaluation window (candles). A Look Back
 * plus its indicator's warmup must fit inside it, or the capped signal could
 * never be seen — compile rejects such configs instead of silently blocking.
 */
export const AUTOMATION_MAX_WINDOW_BARS = 1400

/** Largest reward-to-risk multiple a Take Profit node may ask for. */
export const MAX_RR_RATIO = 20

/**
 * Candles the engine must hold for a stop anchored to a session open: enough
 * to reach back to the session's first candle on the timeframes this is for
 * (15m and below). Matches the Sessions indicator's own warmup, so a graph
 * that only uses Sessions for its stop still loads the same history.
 */
export const SESSION_STOP_WINDOW_BARS = 300

/** Milliseconds per automation interval — the one shared conversion table. */
export const AUTOMATION_INTERVAL_MS: Record<AutomationInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * Whole number of base bars per higher-timeframe bar, or null unless `htf`
 * is strictly higher than `base` and a clean multiple of it.
 */
export function automationIntervalRatio(
  base: AutomationInterval,
  htf: AutomationInterval
): number | null {
  const baseMs = AUTOMATION_INTERVAL_MS[base]
  const htfMs = AUTOMATION_INTERVAL_MS[htf]
  if (!(htfMs > baseMs) || htfMs % baseMs !== 0) return null
  return htfMs / baseMs
}

/**
 * The one higher timeframe a compiled automation watches (the compiler caps
 * graphs at a single distinct HTF), or null when everything runs on the
 * automation's own interval.
 */
export function automationHtfInterval(
  config: AutomationConfig
): AutomationInterval | null {
  const scan = (condition: AutomationCondition): AutomationInterval | null => {
    if (condition.kind === "liveWall") return null
    if (condition.kind !== "trigger") {
      for (const child of condition.children) {
        const found = scan(child)
        if (found) return found
      }
      return null
    }
    for (const filter of condition.filters ?? []) {
      if (filter.interval && filter.interval !== config.interval) {
        return filter.interval
      }
    }
    return null
  }
  for (const rule of config.rules) {
    const found = scan(rule.condition)
    if (found) return found
  }
  return null
}

export type AutomationSourcePort = string

export type AutomationEdge = {
  id: string
  from: string
  sourcePort: AutomationSourcePort
  to: string
}

export type AutomationGraph = {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  viewport: { x: number; y: number; zoom: number }
}

/** One side's protective exits, percent from entry. */
export type ProtectionLevels = {
  takeProfitPct?: number
  /**
   * Absent/"average": the whole position closes at `takeProfitPct` above the
   * blended average. The rung modes (DCA entries only) sell against the buy
   * ladder instead — "previousRungSellAll" peels each rung off at the rung above
   * it; "nearestRungSellAll" sells the whole position at the nearest rung above
   * the deepest buy; "moneyBackThenBase" sells only enough there to recover the
   * cash and rides the rest free to just under the base. See
   * {@link AutomationTakeProfitNode}.
   */
  takeProfitMode?:
    | "average"
    | "previousRungSellAll"
    | "nearestRungSellAll"
    | "moneyBackThenBase"
  stopLossPct?: number
  /** Absent/"fixed": stop stays at entry distance. "trailing": follows price. */
  stopLossMode?: "fixed" | "trailing"
  /** Trailing only: start following after this % move in the trade's favor. */
  trailActivationPct?: number
  /**
   * Absent/"average": the stop sits `stopLossPct` below the blended average, so
   * a DCA ladder drags it down with every rung it adds and the earliest buys can
   * lose far more than that percent. "first": the stop measures from the FIRST
   * entry, so the percent is the position's real worst case. Take profit always
   * measures from the average.
   */
  stopAnchor?: "average" | "first"
  /**
   * Where the stop sits when it is not a plain percent. Absent: `stopLossPct`
   * from entry. `{ kind: "sessionOpen" }`: at that session's opening price,
   * worked out per trade when the position opens, with `stopLossPct` as the
   * fallback for a trade opened outside the session's hours.
   */
  stopLossLevel?: { kind: "sessionOpen"; session: SessionKey }
  /**
   * Take profit as a multiple of the stop's REALISED distance (1 = 1:1). Only
   * written when the stop is dynamic, so the percent cannot be known until the
   * trade opens; against a plain percent stop the ratio is folded into
   * `takeProfitPct` at compile time and this stays absent.
   */
  takeProfitRr?: number
}

/**
 * Per-side protective exits. The runtime picks `long` for long positions and
 * `short` for short positions, so a short can bank profit at a tighter level
 * than a long. Derived from the Take Profit / Stop Loss nodes at compile time.
 */
export type AutomationProtection = {
  long?: ProtectionLevels
  short?: ProtectionLevels
}

/**
 * Backtest inputs saved on the automation itself so every run of it uses the
 * same money and cost assumptions. Never part of the compiled config — the
 * live worker must not see fees.
 */
export type AutomationBacktestSettings = {
  startingEquity: number
  takerFeeBps: number
  makerFeeBps: number
  slippageBps: number
}

export type AutomationFilter = {
  nodeId: string
  indicator: IndicatorSelection
  /** Look Back cap: the latched signal only counts for this many candles. */
  maxAgeBars?: number
  /**
   * Higher timeframe the filter evaluates on. Absent = the automation's
   * interval. Its signals only take effect after their candle CLOSES —
   * see workspace/docs/Key-Features/higher-timeframe-filter.md.
   */
  interval?: AutomationInterval
}

export type AutomationCondition =
  | {
      kind: "trigger"
      nodeId: string
      indicator: IndicatorSelection
      side: "buy" | "sell"
      /** Upstream trend filters whose latched side must equal `side`. */
      filters?: AutomationFilter[]
    }
  | {
      kind: "liveWall"
      nodeId: string
      side: "bid" | "ask"
      minUsd: number
      relativeSize: number
      maxDistancePct: number
      confirmationMs: number
    }
  | {
      // "and" survives only in configs compiled before chaining replaced
      // logic nodes; new compiles emit "or" solely for multi-input actions.
      kind: "and" | "or"
      nodeId: string
      children: AutomationCondition[]
    }

export type AutomationRule = {
  id: string
  action: "buy" | "short" | "close" | "reverse"
  targetEquityPct?: number
  condition: AutomationCondition
}

export type AutomationMarketScannerConfig = MarketScannerSettings & {
  nodeId: string
}

/**
 * Compiled DCA ladder: the rung table and pot cap from the DCA node plus the
 * base-detection params from the Base indicator feeding it. The Take Profit /
 * Stop Loss hung on the node fold into `AutomationConfig.protection.long`, and
 * the exits measure from the broker's blended average — no separate averaging.
 */
export type AutomationDcaConfig = {
  nodeId: string
  rungs: AutomationDcaRung[]
  maxPositionPct: number
  /** How much bigger each buy is than the one above it (1 = equal, 2 = doubling). */
  sizeMultiplier: number
  /** true: size off the current balance (compound); false: off the starting balance (fixed bet). */
  compound: boolean
  /** Market-buy on confirmation (default) or rest a limit at each rung's level. */
  rungEntry: DcaRungEntry
  /** Only buy a rung once the last two candles both closed green. */
  requireTwoGreen: boolean
  basePeriods: number
  pumpPeriods: number
  crackPct: number
  /** Fast-fall gate: only count a crack that fell within this many candles. */
  maxCrackBars: number
  /** Past base quality: skip a crack unless the market's history earns it. */
  respectFilterEnabled: boolean
  respectLookbackMonths: number
  minRespectPct: number
  recoveryTargetPct: number
  /** "Money back, ride the rest free" exit: how far under the base the free
   * coins rest. Inert under every other take-profit style. */
  sellBelowBasePct: number
  /** Trend gate: only start a ladder while price is above its own moving average. */
  trendFilterEnabled: boolean
  trendMaBars: number
  /** Close an open ladder when the trend breaks, not just block new ones. */
  exitOnTrendBreak: boolean
  /** Abandon a cycle open this many candles without resolving. 0 = never. */
  maxCycleBars: number
  /**
   * Indicator confirmations wired into the DCA node (anything other than the
   * Base indicator that supplies the levels). A rung only buys while EVERY one
   * of these has "buy" as its most recent signal — so the ladder stops averaging
   * into a fall the moment its confirmations turn bearish.
   *
   * Before this existed the compiler read only the Base and Market Scanner wires
   * and SILENTLY DROPPED every other indicator connected to the node: the canvas
   * let you wire a confirmation and nothing happened.
   */
  confirmations?: AutomationFilter[]
}

export type AutomationConfig = {
  v: 2
  kind: "automation"
  interval: AutomationInterval
  rules: AutomationRule[]
  protection: AutomationProtection
  marketScanner?: AutomationMarketScannerConfig
  dca?: AutomationDcaConfig
}

/**
 * Candles a DCA ladder must keep loaded: enough for the base tracker, plus the
 * months the Past-base-quality check scans when it is on. One source of truth
 * for both the engine window sizing and the runner's candle fetch.
 */
export function dcaHistoryBars(
  dca: AutomationDcaConfig,
  interval: AutomationInterval
): number {
  const base =
    dca.basePeriods +
    dca.pumpPeriods +
    50 +
    // The trend gate averages this many closes, so they have to be loaded.
    (dca.trendFilterEnabled ? dca.trendMaBars : 0) +
    // Confirmation indicators need their own warm-up before they say anything.
    ((dca.confirmations?.length ?? 0) > 0 ? 300 : 0)
  if (!dca.respectFilterEnabled) return base
  const MONTH_MS = 30 * 86_400_000
  return (
    Math.ceil(
      (dca.respectLookbackMonths * MONTH_MS) / AUTOMATION_INTERVAL_MS[interval]
    ) + base
  )
}

export type AutomationValidationError = {
  code:
    | "duplicate_id"
    | "missing_node"
    | "invalid_port"
    | "invalid_indicator"
    | "invalid_target"
    | "invalid_protection"
    | "invalid_edge"
    | "cycle"
    | "dangling"
    | "legacy_logic"
    | "action_input"
    | "invalid_lookback"
    | "lookback_input"
    | "invalid_timeframe"
    | "invalid_scanner"
    | "invalid_strategy"
    | "empty"
    | "limit"
  nodeId?: string
  edgeId?: string
  message: string
}

export type AutomationCompileResult = {
  config: AutomationConfig | null
  errors: AutomationValidationError[]
}

export const LIVE_BOOK_BACKTEST_UNAVAILABLE =
  "Backtesting is unavailable because Whale Wall needs live order-book data."

const idSchema = z.string().min(1).max(64)
const intervalSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"])
const indicatorParamSchema = z.union([
  z.string().max(80),
  z.number().finite(),
  z.boolean(),
])
const draftIndicatorSelectionSchema = z.object({
  type: indicatorIdSchema,
  params: z
    .record(z.string().min(1).max(64), indicatorParamSchema)
    .refine(
      (params) => Object.keys(params).length <= 32,
      "Too many parameters"
    ),
})


// A DCA-fed take-profit's style. The removed "previousRungHoldFirst" mode (a
// redundant variant of the peel) loads as the plain peel, so older saved
// automations and stored run configs keep parsing.
const takeProfitModeSchema = z.preprocess(
  (value) =>
    value === "previousRungHoldFirst" ? "previousRungSellAll" : value,
  z
    .enum([
      "average",
      "previousRungSellAll",
      "nearestRungSellAll",
      "moneyBackThenBase",
    ])
    .optional()
)

const automationNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: idSchema,
    kind: z.literal("indicator"),
    x: z.number().finite(),
    y: z.number().finite(),
    indicator: draftIndicatorSelectionSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("logic"),
    op: z.enum(["and", "or"]),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("action"),
    action: z.enum(["buy", "short", "close", "reverse"]),
    targetEquityPct: z.number().finite().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("lookback"),
    bars: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("timeframe"),
    interval: intervalSchema,
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("takeProfit"),
    pct: z.number().finite(),
    mode: takeProfitModeSchema,
    rrRatio: z.number().finite().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("stopLoss"),
    pct: z.number().finite(),
    mode: z.enum(["fixed", "trailing"]).optional(),
    activationPct: z.number().finite().optional(),
    anchor: z.enum(["average", "first"]).optional(),
    level: z.enum(["percent", "sessionOpen"]).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("whaleWall"),
    minUsd: z.number().finite(),
    relativeSize: z.number().finite(),
    maxDistancePct: z.number().finite(),
    confirmationMs: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("marketScanner"),
    ...marketScannerSettingsFieldsSchema.shape,
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("dca"),
    rungs: dcaRungsSchema,
    // Default keeps DCA nodes saved before this field existed loadable.
    maxPositionPct: z
      .number()
      .positive()
      .max(100)
      .default(DEFAULT_DCA_MAX_POSITION_PCT),
    // Defaults to 1 (equal buys) so ladders saved with per-rung weights keep
    // their behavior; NEW ladders are created with an exponential ramp.
    sizeMultiplier: z.number().min(1).max(10).default(1),
    // Defaults to true (compound) so ladders saved before this field keep their
    // current behavior — sizing off the live balance.
    compound: z.boolean().default(true),
    // Defaults to "market" (reactive confirmation + fail-safe) for ladders saved
    // before this field existed.
    rungEntry: z.enum(["market", "limit"]).default("market"),
    // Defaults to false so ladders saved before this field keep buying on every
    // confirmed rung; when on, a rung only buys after two green candles in a row.
    requireTwoGreen: z.boolean().default(false),
    // Moved off the Base indicator on July 25, 2026: the indicator finds levels,
    // this ladder decides what breaking one means. Defaults match the values the
    // Base node used to carry, so a graph saved before the move still runs the
    // same ladder.
    crackPct: z.number().positive().max(50).default(2.5),
    maxCrackBars: z.number().int().min(1).max(500).default(4),
    respectFilterEnabled: z.boolean().default(false),
    respectLookbackMonths: z.number().int().min(1).max(60).default(6),
    minRespectPct: z.number().min(0).max(100).default(80),
    recoveryTargetPct: z.number().min(-50).max(50).default(-2),
    // Added with the "money back, ride the rest free" take-profit. Ladders saved
    // before it load with the default and behave identically, because no other
    // take-profit style reads this field.
    sellBelowBasePct: z
      .number()
      .min(-500)
      .max(50)
      .default(DEFAULT_DCA_SELL_BELOW_BASE_PCT),
    // Trend gate. Defaults to off so every ladder saved before it behaves
    // identically.
    trendFilterEnabled: z.boolean().default(false),
    trendMaBars: z.number().int().min(2).max(1000).default(200),
    // Real exits for a losing ladder. Default off, so every ladder saved before
    // them behaves identically.
    exitOnTrendBreak: z.boolean().default(false),
    maxCycleBars: z.number().int().min(0).max(5000).default(0),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
])

const protectionLevelsSchema = z.object({
  takeProfitPct: z.number().positive().max(1000).optional(),
  takeProfitMode: takeProfitModeSchema,
  stopLossPct: z.number().positive().max(100).optional(),
  stopLossMode: z.enum(["fixed", "trailing"]).optional(),
  trailActivationPct: z.number().min(0).max(1000).optional(),
  stopAnchor: z.enum(["average", "first"]).optional(),
  stopLossLevel: z
    .object({
      kind: z.literal("sessionOpen"),
      session: z.enum(SESSION_KEYS),
    })
    .optional(),
  takeProfitRr: z.number().positive().max(MAX_RR_RATIO).optional(),
})

/**
 * DELIBERATE COMPATIBILITY SHIM. Config snapshots saved before per-side
 * protection stored a single flat pair `{ takeProfitPct, stopLossPct }`. Those
 * snapshots are immutable (a bot's / backtest's `params` is frozen at creation),
 * so the canonical per-side schema can't parse them and they would fail to load.
 * Reading a flat pair as both sides keeps historical backtests viewable.
 * Deletion criteria: safe to remove once no `bots`/`backtests` row carries a flat
 * `protection` pair (query: `params::text ~ '"protection":\s*\{\s*"(take|stop)'`).
 */
export function coerceLegacyProtection(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !("long" in value) &&
    !("short" in value) &&
    ("takeProfitPct" in value || "stopLossPct" in value)
  ) {
    return { long: value, short: value }
  }
  return value
}

export const automationProtectionSchema = z.preprocess(
  coerceLegacyProtection,
  z.object({
    long: protectionLevelsSchema.optional(),
    short: protectionLevelsSchema.optional(),
  })
)

export const DEFAULT_AUTOMATION_BACKTEST_SETTINGS: AutomationBacktestSettings =
  {
    startingEquity: 10_000,
    takerFeeBps: 4.5,
    makerFeeBps: 1.5,
    slippageBps: 8,
  }

export const automationBacktestSettingsSchema = z.object({
  startingEquity: z.number().positive().max(100_000_000),
  takerFeeBps: z.number().min(0).max(50),
  makerFeeBps: z.number().min(0).max(50),
  slippageBps: z.number().min(0).max(100),
})

export const automationGraphSchema = z.object({
  nodes: z.array(automationNodeSchema).max(100),
  edges: z
    .array(
      z.object({
        id: idSchema,
        from: idSchema,
        sourcePort: z.string().min(1).max(32),
        to: idSchema,
      })
    )
    .max(200),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.25).max(2),
  }),
})

export const automationDraftSchema = z.object({
  interval: intervalSchema,
  graph: automationGraphSchema,
  backtest: automationBacktestSettingsSchema.default(
    DEFAULT_AUTOMATION_BACKTEST_SETTINGS
  ),
})

const whaleWallSettingsSchema = z.object({
  minUsd: z.number().positive().max(1_000_000_000_000),
  relativeSize: z.number().min(1).max(1_000),
  maxDistancePct: z.number().positive().max(10),
  confirmationMs: z.number().int().min(100).max(60_000),
})

const compiledFilterSchema: z.ZodType<AutomationFilter> = z.object({
  nodeId: idSchema,
  indicator: indicatorSelectionSchema,
  maxAgeBars: z
    .number()
    .int()
    .min(1)
    .max(AUTOMATION_MAX_WINDOW_BARS)
    .optional(),
  interval: intervalSchema.optional(),
})

const automationConditionSchema: z.ZodType<AutomationCondition> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("trigger"),
      nodeId: idSchema,
      indicator: indicatorSelectionSchema,
      side: z.enum(["buy", "sell"]),
      filters: z.array(compiledFilterSchema).max(100).optional(),
    }),
    z.object({
      kind: z.literal("liveWall"),
      nodeId: idSchema,
      side: z.enum(["bid", "ask"]),
      ...whaleWallSettingsSchema.shape,
    }),
    z.object({
      kind: z.enum(["and", "or"]),
      nodeId: idSchema,
      children: z.array(automationConditionSchema).min(2).max(100),
    }),
  ])
)

const automationRuleSchema = z
  .object({
    id: idSchema,
    action: z.enum(["buy", "short", "close", "reverse"]),
    targetEquityPct: z.number().min(1).max(100).optional(),
    condition: automationConditionSchema,
  })

  .superRefine((rule, ctx) => {
    if (rule.action !== "close" && rule.targetEquityPct === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetEquityPct"],
        message: "Target is required",
      })
    }
    if (rule.action === "close" && rule.targetEquityPct !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetEquityPct"],
        message: "Close has no target",
      })
    }
  })

const automationMarketScannerConfigSchema: z.ZodType<AutomationMarketScannerConfig> =
  z.intersection(z.object({ nodeId: idSchema }), marketScannerSettingsSchema)

const automationDcaConfigSchema: z.ZodType<AutomationDcaConfig> = z.object({
  nodeId: idSchema,
  rungs: dcaRungsSchema,
  maxPositionPct: z.number().positive().max(100),
  sizeMultiplier: z.number().min(1).max(10).default(1),
  compound: z.boolean().default(true),
  rungEntry: z.enum(["market", "limit"]).default("market"),
  requireTwoGreen: z.boolean().default(false),
  basePeriods: z.number().int().min(4).max(500),
  pumpPeriods: z.number().int().min(1).max(499),
  crackPct: z.number().positive().max(50),
  maxCrackBars: z.number().int().min(1).max(500),
  respectFilterEnabled: z.boolean(),
  respectLookbackMonths: z.number().int().min(1).max(60),
  minRespectPct: z.number().min(0).max(100),
  recoveryTargetPct: z.number().min(-50).max(50),
  // Frozen config snapshots taken before this field existed still parse; the
  // default is inert unless the "money back" take-profit is selected.
  sellBelowBasePct: z
    .number()
    .min(-500)
    .max(50)
    .default(DEFAULT_DCA_SELL_BELOW_BASE_PCT),
  trendFilterEnabled: z.boolean().default(false),
  trendMaBars: z.number().int().min(2).max(1000).default(200),
  exitOnTrendBreak: z.boolean().default(false),
  maxCycleBars: z.number().int().min(0).max(5000).default(0),
  confirmations: z.array(compiledFilterSchema).max(8).optional(),
})

function conditionHasLiveWall(condition: AutomationCondition): boolean {
  if (condition.kind === "liveWall") return true
  if (condition.kind === "trigger") return false
  return condition.children.some(conditionHasLiveWall)
}

function conditionHasCandleTrigger(condition: AutomationCondition): boolean {
  if (condition.kind === "trigger") return true
  if (condition.kind === "liveWall") return false
  return condition.children.some(conditionHasCandleTrigger)
}

export const automationConfigSchema: z.ZodType<AutomationConfig> = z
  .object({
    v: z.literal(2),
    kind: z.literal("automation"),
    interval: intervalSchema,
    rules: z.array(automationRuleSchema).max(100),
    protection: automationProtectionSchema,
    marketScanner: automationMarketScannerConfigSchema.optional(),
    dca: automationDcaConfigSchema.optional(),
  })
  .superRefine((config, ctx) => {
    if (config.rules.length === 0 && !config.dca) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Add at least one executable entry.",
      })
    }
    if (config.marketScanner && !config.dca) {
      ctx.addIssue({
        code: "custom",
        path: ["marketScanner"],
        message: "Market Scanner must feed the DCA ladder.",
      })
    }
    const entryRules = config.rules.filter((rule) => rule.action !== "close")
    if (config.dca && entryRules.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "DCA must be the Automation's only entry owner.",
      })
    }
    if (
      entryRules.some((rule) => conditionHasLiveWall(rule.condition)) &&
      entryRules.some((rule) => conditionHasCandleTrigger(rule.condition))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message:
          "A Whale Wall automation cannot also contain a candle-driven entry.",
      })
    }
  }) as z.ZodType<AutomationConfig>

export function compileAutomationGraph(input: {
  interval: AutomationInterval
  graph: AutomationGraph
}): AutomationCompileResult {
  const { nodes, edges } = input.graph
  const errors: AutomationValidationError[] = []
  const addError = (error: AutomationValidationError) => errors.push(error)
  if (nodes.length > 100 || edges.length > 200) {
    addError({
      code: "limit",
      message: "Automation is limited to 100 nodes and 200 connections.",
    })
  }
  const nodeById = new Map<string, AutomationNode>()
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      addError({
        code: "duplicate_id",
        nodeId: node.id,
        message: "Duplicate node id.",
      })
    } else {
      nodeById.set(node.id, node)
    }
    if (
      node.kind === "indicator" &&
      !indicatorSelectionSchema.safeParse(node.indicator).success
    ) {
      addError({
        code: "invalid_indicator",
        nodeId: node.id,
        message: "Invalid indicator settings.",
      })
    }
    if (
      node.kind === "action" &&
      ((node.action !== "close" &&
        (!(node.targetEquityPct && node.targetEquityPct >= 1) ||
          node.targetEquityPct > 100)) ||
        (node.action === "close" && node.targetEquityPct !== undefined))
    ) {
      addError({
        code: "invalid_target",
        nodeId: node.id,
        message:
          node.action === "close"
            ? "Close Position does not use a target percentage."
            : "Target must be from 1% to 100%.",
      })
    }
    if (
      node.kind === "whaleWall" &&
      !whaleWallSettingsSchema.safeParse({
        minUsd: node.minUsd,
        relativeSize: node.relativeSize,
        maxDistancePct: node.maxDistancePct,
        confirmationMs: node.confirmationMs,
      }).success
    ) {
      addError({
        code: "invalid_scanner",
        nodeId: node.id,
        message: "Whale Wall settings are outside their allowed ranges.",
      })
    }
    if (node.kind === "dca" && !dcaRungsSchema.safeParse(node.rungs).success) {
      addError({
        code: "invalid_strategy",
        nodeId: node.id,
        message: "DCA rungs are outside their allowed ranges.",
      })
    }
    if (
      node.kind === "marketScanner" &&
      !marketScannerSettingsSchema.safeParse(node).success
    ) {
      addError({
        code: "invalid_scanner",
        nodeId: node.id,
        message: "Market Scanner settings are outside their allowed ranges.",
      })
    }
  }

  const incoming = new Map<string, AutomationEdge[]>()
  const outgoing = new Map<string, AutomationEdge[]>()
  const edgeKeys = new Set<string>()
  const edgeIds = new Set<string>()
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      addError({
        code: "duplicate_id",
        edgeId: edge.id,
        message: "Duplicate connection id.",
      })
    }
    edgeIds.add(edge.id)
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source || !target) {
      addError({
        code: "missing_node",
        edgeId: edge.id,
        message: "Connection references a missing node.",
      })
      continue
    }
    const sourcePortIsValid = automationNodeSourcePortIsValid(
      source,
      edge.sourcePort
    )
    if (!sourcePortIsValid) {
      addError({
        code: "invalid_port",
        edgeId: edge.id,
        message: "Connection uses an invalid output.",
      })
    }
    if (source.id === target.id) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "This connection is not allowed.",
      })
    } else if (sourcePortIsValid) {
      const message = automationNodeConnectionError(
        source,
        edge.sourcePort,
        target
      )
      if (message) {
        addError({ code: "invalid_edge", edgeId: edge.id, message })
      }
    }
    const key = `${edge.from}:${edge.sourcePort}:${edge.to}`
    if (edgeKeys.has(key)) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "Duplicate connection.",
      })
    }
    edgeKeys.add(key)
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  let cycleFound = false
  const visit = (id: string) => {
    if (visiting.has(id)) {
      cycleFound = true
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const edge of outgoing.get(id) ?? []) visit(edge.to)
    visiting.delete(id)
    visited.add(id)
  }
  for (const node of nodes) visit(node.id)
  if (cycleFound)
    addError({ code: "cycle", message: "Automation cannot contain a cycle." })

  const actions = nodes.filter(
    (node): node is AutomationActionNode => node.kind === "action"
  )
  const dcaNodes = nodes.filter(
    (node): node is AutomationDcaNode => node.kind === "dca"
  )
  if (actions.length === 0 && dcaNodes.length === 0)
    addError({ code: "empty", message: "Add at least one action." })
  if (dcaNodes.length > 1) {
    addError({
      code: "invalid_strategy",
      nodeId: dcaNodes[1].id,
      message: "An Automation can contain only one DCA node.",
    })
  }
  /**
   * The session a Sessions node wired into this node is set to, or null. This
   * is how a Stop Loss learns which session's open to sit at: the session is
   * picked once, on the Sessions node, and the wire carries it — so the signal
   * and the stop can never drift onto different sessions.
   */
  const sessionWiredInto = (nodeId: string): SessionKey | null => {
    for (const edge of incoming.get(nodeId) ?? []) {
      const parent = nodeById.get(edge.from)
      if (parent?.kind !== "indicator" || parent.indicator.type !== "session") {
        continue
      }
      const parsed = INDICATORS.session.paramsSchema.safeParse(
        parent.indicator.params
      )
      if (!parsed.success) continue
      return (parsed.data as { session: SessionKey }).session
    }
    return null
  }
  for (const node of nodes) {
    const count = incoming.get(node.id)?.length ?? 0
    if (node.kind === "logic") {
      addError({
        code: "legacy_logic",
        nodeId: node.id,
        message:
          "AND/OR nodes are no longer supported. Delete this node and connect indicators directly — multiple connections into an action mean any of them fires it.",
      })
    }
    if (node.kind === "action" && count < 1) {
      addError({
        code: "action_input",
        nodeId: node.id,
        message: "Action needs at least one condition.",
      })
    }
    if (node.kind === "lookback") {
      if (
        !(
          Number.isInteger(node.bars) &&
          node.bars >= 1 &&
          node.bars <= AUTOMATION_MAX_WINDOW_BARS
        )
      ) {
        addError({
          code: "invalid_lookback",
          nodeId: node.id,
          message: `Look Back must be a whole number from 1 to ${AUTOMATION_MAX_WINDOW_BARS} candles.`,
        })
      }
      if (count < 1) {
        addError({
          code: "lookback_input",
          nodeId: node.id,
          message: "Look Back needs a Trend input from an indicator.",
        })
      }
    }
    if (node.kind === "dca") {
      const inputs = incoming.get(node.id) ?? []
      if (inputs.filter((edge) => edge.sourcePort === "trend").length > 1) {
        addError({
          code: "invalid_strategy",
          nodeId: node.id,
          message: "DCA accepts only one direct Trend filter.",
        })
      }
      if (inputs.filter((edge) => edge.sourcePort === "markets").length > 1) {
        addError({
          code: "invalid_strategy",
          nodeId: node.id,
          message: "DCA accepts only one Market Scanner.",
        })
      }
    }
    if (node.kind === "timeframe") {
      if (automationIntervalRatio(input.interval, node.interval) === null) {
        addError({
          code: "invalid_timeframe",
          nodeId: node.id,
          message: `The Timeframe node must be higher than the automation's ${input.interval} (and the automation's timeframe must divide evenly into it).`,
        })
      }
      if (count < 1) {
        addError({
          code: "invalid_timeframe",
          nodeId: node.id,
          message: "Timeframe needs a Trend input from an indicator.",
        })
      }
    }
    if (node.kind === "takeProfit" || node.kind === "stopLoss") {
      const label = node.kind === "takeProfit" ? "Take Profit" : "Stop Loss"
      const maxPct = node.kind === "takeProfit" ? 1000 : 100
      if (!(node.pct > 0 && node.pct <= maxPct)) {
        addError({
          code: "invalid_protection",
          nodeId: node.id,
          message: `${label} must be greater than 0% and no more than ${maxPct}%.`,
        })
      }
      if (
        node.kind === "takeProfit" &&
        node.rrRatio !== undefined &&
        !(node.rrRatio > 0 && node.rrRatio <= MAX_RR_RATIO)
      ) {
        addError({
          code: "invalid_protection",
          nodeId: node.id,
          message: `The risk-reward ratio must be greater than 0 and no more than ${MAX_RR_RATIO}.`,
        })
      }
      if (node.kind === "stopLoss" && node.level === "sessionOpen") {
        if (node.mode === "trailing") {
          addError({
            code: "invalid_protection",
            nodeId: node.id,
            message:
              "A stop at the session open cannot also trail — the session open is a fixed price, so pick one or the other.",
          })
        }
        if (!sessionWiredInto(node.id)) {
          addError({
            code: "invalid_protection",
            nodeId: node.id,
            message:
              "Stop Loss is set to the session open — wire a Sessions node into it so it knows which session to use.",
          })
        }
        const onDca = (incoming.get(node.id) ?? []).some(
          (edge) => nodeById.get(edge.from)?.kind === "dca"
        )
        if (onDca) {
          addError({
            code: "invalid_protection",
            nodeId: node.id,
            message:
              "A DCA ladder buys down through levels, so its stop cannot sit at the session open. Use a percent stop here.",
          })
        }
      }
      if (
        node.kind === "stopLoss" &&
        node.mode === "trailing" &&
        node.activationPct !== undefined &&
        !(node.activationPct >= 0 && node.activationPct <= 1000)
      ) {
        addError({
          code: "invalid_protection",
          nodeId: node.id,
          message:
            "The trailing stop's activation must be between 0% and 1000%.",
        })
      }
      const port = node.kind === "takeProfit" ? "tp" : "sl"
      const attached = (incoming.get(node.id) ?? []).some((edge) => {
        const parent = nodeById.get(edge.from)
        if (edge.sourcePort !== port) return false
        // A DCA node is a long entry with the same tp/sl hooks as a Long action.
        if (parent?.kind === "dca") return true
        return (
          parent?.kind === "action" &&
          (parent.action === "buy" || parent.action === "short")
        )
      })
      if (!attached) {
        addError({
          code: "invalid_protection",
          nodeId: node.id,
          message: `${label} must hang off a Long, Short, or DCA entry's ${node.kind === "takeProfit" ? "take-profit" : "stop-loss"} hook.`,
        })
      }
    }
  }

  const hasWallEntry = edges.some((edge) => {
    const target = nodeById.get(edge.to)
    return (
      (edge.sourcePort === "bidWall" || edge.sourcePort === "askWall") &&
      target?.kind === "action" &&
      (target.action === "buy" || target.action === "short")
    )
  })
  const candleEntry = edges.find((edge) => {
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    return (
      source?.kind === "indicator" &&
      (edge.sourcePort === "bullish" || edge.sourcePort === "bearish") &&
      target?.kind === "action" &&
      target.action !== "close"
    )
  })
  if (hasWallEntry && candleEntry) {
    addError({
      code: "action_input",
      nodeId: candleEntry.to,
      message:
        "A Whale Wall automation cannot also contain a candle-driven entry.",
    })
  }

  const ownedEntry = actions.find((node) => node.action !== "close")
  if (dcaNodes.length > 0 && ownedEntry) {
    addError({
      code: "action_input",
      nodeId: ownedEntry.id,
      message:
        "DCA owns entries. Remove Long, Short, Reverse, and Whale Wall entry paths.",
    })
  }

  const connected = new Set<string>([
    ...actions.map((node) => node.id),
    ...dcaNodes.map((node) => node.id),
  ])
  const markAncestors = (id: string) => {
    for (const edge of incoming.get(id) ?? []) {
      if (connected.has(edge.from)) continue
      connected.add(edge.from)
      markAncestors(edge.from)
    }
  }
  for (const action of actions) markAncestors(action.id)
  for (const dca of dcaNodes) markAncestors(dca.id)
  // Take Profit / Stop Loss sit DOWNSTREAM of an entry (action/DCA → node), so
  // ancestor-marking never reaches them — count an attached one as connected.
  for (const node of nodes) {
    if (node.kind !== "takeProfit" && node.kind !== "stopLoss") continue
    const attached = (incoming.get(node.id) ?? []).some((edge) => {
      const from = nodeById.get(edge.from)?.kind
      return from === "action" || from === "dca"
    })
    if (!attached) continue
    connected.add(node.id)
    // ...and anything wired INTO it (a Sessions node feeding a stop) rides
    // along, or it would read as a dangling node.
    markAncestors(node.id)
  }
  for (const node of nodes) {
    if (!connected.has(node.id)) {
      addError({
        code: "dangling",
        nodeId: node.id,
        message: "Node is not connected to an action or DCA.",
      })
    }
  }

  if (errors.length > 0) return { config: null, errors }

  // A Look Back node caps every filter upstream of it: the whole branch that
  // feeds through it must have signalled within `bars` candles. When the same
  // ancestor reaches the trigger over several paths (diamonds, nested caps),
  // the strictest (smallest) cap wins — a capped path AND an uncapped one
  // still means capped. Nodes re-walk only when their cap improves, so shared
  // subgraphs stay linear instead of exploding per path. A Timeframe node
  // works the same way in the other dimension: every indicator upstream of it
  // evaluates on its higher interval.
  const timeframeConflicts = new Set<string>()
  const collectFilters = (triggerId: string): AutomationFilter[] => {
    const INF = Number.POSITIVE_INFINITY
    const bestCap = new Map<string, number>()
    const intervalByNode = new Map<string, AutomationInterval | undefined>()
    const walk = (
      nodeId: string,
      cap: number,
      interval: AutomationInterval | undefined
    ) => {
      for (const edge of incoming.get(nodeId) ?? []) {
        const upstream = nodeById.get(edge.from)
        if (!upstream || upstream.id === triggerId) continue
        const nextCap =
          upstream.kind === "lookback" ? Math.min(cap, upstream.bars) : cap
        const nextInterval =
          upstream.kind === "timeframe" ? upstream.interval : interval
        if (
          upstream.kind !== "lookback" &&
          upstream.kind !== "indicator" &&
          upstream.kind !== "timeframe"
        ) {
          continue
        }
        // Ambiguity guard: the same ancestor reaching ONE entry both through
        // a Timeframe node and around it would gate that entry on two clocks
        // at once — there is no right answer, so it is rejected. (Different
        // entries, or trigger-role vs filter-role, may use different clocks.)
        if (
          intervalByNode.has(upstream.id) &&
          intervalByNode.get(upstream.id) !== nextInterval &&
          !timeframeConflicts.has(upstream.id)
        ) {
          timeframeConflicts.add(upstream.id)
          addError({
            code: "invalid_timeframe",
            nodeId: upstream.id,
            message:
              "This node gates the same entry on two timeframes at once — give each timeframe its own copy of the node.",
          })
        }
        intervalByNode.set(upstream.id, nextInterval)
        // Absent means unvisited — an uncapped visit still has to be
        // recorded, so "already at least as strict" only applies once seen.
        const seenCap = bestCap.get(upstream.id)
        if (seenCap !== undefined && seenCap <= nextCap) continue
        bestCap.set(upstream.id, nextCap)
        walk(upstream.id, nextCap, nextInterval)
      }
    }
    walk(triggerId, INF, undefined)
    const filters: AutomationFilter[] = []
    for (const [nodeId, cap] of bestCap) {
      const node = nodeById.get(nodeId)
      if (!node || node.kind !== "indicator") continue
      const interval = intervalByNode.get(nodeId)
      filters.push({
        nodeId,
        indicator: node.indicator,
        ...(cap < INF ? { maxAgeBars: cap } : {}),
        ...(interval && interval !== input.interval ? { interval } : {}),
      })
    }
    return filters
  }

  const compileEdge = (edge: AutomationEdge): AutomationCondition => {
    const source = nodeById.get(edge.from)
    if (source?.kind === "whaleWall") {
      return {
        kind: "liveWall",
        nodeId: source.id,
        side: edge.sourcePort === "bidWall" ? "bid" : "ask",
        minUsd: source.minUsd,
        relativeSize: source.relativeSize,
        maxDistancePct: source.maxDistancePct,
        confirmationMs: source.confirmationMs,
      }
    }
    if (!source || source.kind !== "indicator")
      throw new Error("Invalid compiled graph")
    const filters = collectFilters(source.id)
    return {
      kind: "trigger",
      nodeId: source.id,
      indicator: source.indicator,
      side: edge.sourcePort === "bullish" ? "buy" : "sell",
      ...(filters.length > 0 ? { filters } : {}),
    }
  }

  let marketScanner: AutomationMarketScannerConfig | undefined
  const dcaNode = dcaNodes[0]
  let dca: AutomationDcaConfig | undefined
  if (dcaNode) {
    // The Market Scanner feeds the ladder its market list.
    const scannerEdge = (incoming.get(dcaNode.id) ?? []).find(
      (edge) => edge.sourcePort === "markets"
    )
    const scannerNode = scannerEdge ? nodeById.get(scannerEdge.from) : undefined
    if (scannerNode?.kind === "marketScanner") {
      marketScanner = {
        nodeId: scannerNode.id,
        ...marketScannerSettingsSchema.parse(scannerNode),
      }
    }
    // Every indicator wired into the ladder that ISN'T the Base supplying its
    // levels becomes a buy confirmation: a rung only fires while all of them are
    // bullish. A Look Back directly upstream sets how long that opinion stays
    // valid. These wires used to compile to nothing.
    const confirmations: AutomationFilter[] = []
    const baseEdge = (incoming.get(dcaNode.id) ?? []).find((edge) => {
      const from = nodeById.get(edge.from)
      return from?.kind === "indicator" && from.indicator.type === "base"
    })
    for (const edge of incoming.get(dcaNode.id) ?? []) {
      if (edge === baseEdge) continue
      if (edge.sourcePort !== "bullish" && edge.sourcePort !== "trend") continue
      let source = nodeById.get(edge.from)
      // A Look Back on the wire caps how long the confirmation counts for:
      // `indicator -> Look Back -> DCA`, the same grammar entry filters use.
      let maxAgeBars: number | undefined
      if (source?.kind === "lookback") {
        maxAgeBars = source.bars
        const upstream = (incoming.get(source.id) ?? [])
          .map((up) => nodeById.get(up.from))
          .find((up) => up?.kind === "indicator")
        source = upstream
      }
      if (source?.kind !== "indicator") continue
      confirmations.push({
        nodeId: source.id,
        indicator: source.indicator,
        ...(maxAgeBars !== undefined ? { maxAgeBars } : {}),
      })
    }
    if (confirmations.length > 8) {
      addError({
        code: "invalid_strategy",
        nodeId: dcaNode.id,
        message: "A DCA ladder can take at most 8 indicator confirmations.",
      })
    }
    const baseNode = baseEdge ? nodeById.get(baseEdge.from) : undefined
    if (!baseNode || baseNode.kind !== "indicator") {
      addError({
        code: "invalid_strategy",
        nodeId: dcaNode.id,
        message: "Connect a Base indicator to the DCA node.",
      })
    } else {
      // Base params passed the per-node indicator check above; parse to read the
      // base DETECTION settings the runtime ladder anchors to. Everything about
      // breaking that base lives on the DCA node itself.
      const baseParams = INDICATORS.base.paramsSchema.parse(
        baseNode.indicator.params
      ) as { basePeriods: number; pumpPeriods: number }
      dca = {
        nodeId: dcaNode.id,
        rungs: dcaNode.rungs.map((rung) => ({ ...rung })),
        maxPositionPct: dcaNode.maxPositionPct,
        sizeMultiplier: dcaNode.sizeMultiplier,
        compound: dcaNode.compound,
        rungEntry: dcaNode.rungEntry,
        requireTwoGreen: dcaNode.requireTwoGreen,
        basePeriods: baseParams.basePeriods,
        pumpPeriods: baseParams.pumpPeriods,
        crackPct: dcaNode.crackPct,
        maxCrackBars: dcaNode.maxCrackBars,
        respectFilterEnabled: dcaNode.respectFilterEnabled,
        respectLookbackMonths: dcaNode.respectLookbackMonths,
        minRespectPct: dcaNode.minRespectPct,
        recoveryTargetPct: dcaNode.recoveryTargetPct,
        sellBelowBasePct: dcaNode.sellBelowBasePct,
        trendFilterEnabled: dcaNode.trendFilterEnabled,
        trendMaBars: dcaNode.trendMaBars,
        exitOnTrendBreak: dcaNode.exitOnTrendBreak,
        maxCycleBars: dcaNode.maxCycleBars,
        ...(confirmations.length > 0 ? { confirmations } : {}),
      }
    }
  }

  const rules = actions.map((node): AutomationRule => {
    const inputs = (incoming.get(node.id) ?? []).map(compileEdge)
    const rule: AutomationRule = {
      id: node.id,
      action: node.action,
      condition:
        inputs.length === 1
          ? inputs[0]
          : { kind: "or", nodeId: node.id, children: inputs },
    }
    if (node.action !== "close") rule.targetEquityPct = node.targetEquityPct
    return rule
  })

  // Fold every Take Profit / Stop Loss node into its entry's side (Long → long,
  // Short → short). One side set twice with different numbers is a conflict.
  const protection: AutomationProtection = {}
  const setLevel = (
    side: "long" | "short",
    key: "takeProfitPct" | "stopLossPct",
    pct: number,
    nodeId: string
  ) => {
    const existing = protection[side]?.[key]
    if (existing !== undefined && existing !== pct) {
      addError({
        code: "invalid_protection",
        nodeId,
        message: `${side === "long" ? "Long" : "Short"} ${key === "takeProfitPct" ? "take-profit" : "stop-loss"} is set twice with different values.`,
      })
      return
    }
    protection[side] = { ...protection[side], [key]: pct }
  }
  // A stop's behavior (fixed vs trailing + activation) folds alongside its
  // percent; two stops on one side must agree on behavior like they must on
  // percent. Only trailing is stored — absent mode means fixed, so configs
  // compiled before trailing existed stay byte-identical.
  const stopBehavior: Partial<
    Record<
      "long" | "short",
      { trailing: boolean; activationPct?: number; anchor?: "average" | "first" }
    >
  > = {}
  // A take-profit's "previous rung" mode only applies when a DCA node feeds it
  // (it references the buy ladder). Collected here and folded in after.
  let longTpMode: ProtectionLevels["takeProfitMode"]
  // A stop anchored to a session open, and a take-profit measured as a
  // multiple of the stop, both need the OTHER exit before they can be resolved
  // — so they are collected per side here and folded in after the loop.
  const stopLevel: Partial<Record<"long" | "short", SessionKey | "percent">> =
    {}
  const tpRatio: Partial<
    Record<"long" | "short", { ratio: number; nodeId: string }>
  > = {}
  const setStopLevel = (
    side: "long" | "short",
    node: AutomationStopLossNode
  ) => {
    // "percent" is recorded too, so two stops on one entry that disagree about
    // WHERE the stop sits are caught the same way disagreeing percentages and
    // fixed-vs-trailing are — silently upgrading a percent stop to a session
    // one would move a level the user set deliberately.
    const level =
      node.level === "sessionOpen"
        ? (sessionWiredInto(node.id) ?? "percent")
        : "percent"
    const existing = stopLevel[side]
    if (existing !== undefined && existing !== level) {
      addError({
        code: "invalid_protection",
        nodeId: node.id,
        message: `${side === "long" ? "Long" : "Short"} stop-loss is set twice with different levels (a percent and a session open, or two different sessions).`,
      })
      return
    }
    stopLevel[side] = level
  }
  const setTpRatio = (
    side: "long" | "short",
    node: AutomationTakeProfitNode
  ) => {
    const ratio = node.rrRatio
    if (ratio === undefined) return
    const existing = tpRatio[side]
    if (existing !== undefined && existing.ratio !== ratio) {
      addError({
        code: "invalid_protection",
        nodeId: node.id,
        message: `${side === "long" ? "Long" : "Short"} take-profit is set twice with different risk-reward ratios.`,
      })
      return
    }
    tpRatio[side] = { ratio, nodeId: node.id }
  }
  const setStopBehavior = (
    side: "long" | "short",
    node: AutomationStopLossNode
  ) => {
    const behavior = {
      trailing: node.mode === "trailing",
      ...(node.mode === "trailing" && node.activationPct
        ? { activationPct: node.activationPct }
        : {}),
      ...(node.anchor === "first" ? { anchor: "first" as const } : {}),
    }
    const existing = stopBehavior[side]
    if (
      existing &&
      (existing.trailing !== behavior.trailing ||
        existing.activationPct !== behavior.activationPct ||
        existing.anchor !== behavior.anchor)
    ) {
      addError({
        code: "invalid_protection",
        nodeId: node.id,
        message: `${side === "long" ? "Long" : "Short"} stop-loss is set twice with different behavior (fixed vs trailing).`,
      })
      return
    }
    stopBehavior[side] = behavior
  }
  for (const node of nodes) {
    if (node.kind !== "takeProfit" && node.kind !== "stopLoss") continue
    const key = node.kind === "takeProfit" ? "takeProfitPct" : "stopLossPct"
    const fold = (side: "long" | "short") => {
      // A take-profit measured as a risk-reward multiple has no percent of its
      // own; it is worked out from the stop once both sides are collected.
      if (node.kind === "takeProfit" && node.rrRatio !== undefined) {
        setTpRatio(side, node)
      } else {
        setLevel(side, key, node.pct, node.id)
      }
      if (node.kind === "stopLoss") {
        setStopBehavior(side, node)
        setStopLevel(side, node)
      }
    }
    for (const edge of incoming.get(node.id) ?? []) {
      const parent = nodeById.get(edge.from)
      // A DCA node is a long entry — its exits fold into the long side.
      if (parent?.kind === "dca") {
        fold("long")
        if (
          node.kind === "takeProfit" &&
          node.mode &&
          node.mode !== "average"
        ) {
          longTpMode = node.mode
        }
        continue
      }
      if (parent?.kind !== "action") continue
      if (parent.action === "buy") fold("long")
      else if (parent.action === "short") fold("short")
    }
  }
  for (const side of ["long", "short"] as const) {
    const behavior = stopBehavior[side]
    if (!behavior || protection[side]?.stopLossPct === undefined) continue
    // Only non-default behavior is written, so configs compiled before these
    // options existed stay byte-identical.
    if (behavior.trailing) {
      protection[side] = {
        ...protection[side],
        stopLossMode: "trailing",
        ...(behavior.activationPct !== undefined
          ? { trailActivationPct: behavior.activationPct }
          : {}),
      }
    }
    if (behavior.anchor === "first") {
      protection[side] = { ...protection[side], stopAnchor: "first" }
    }
  }
  // A session-anchored stop rides on the side it guards. The percent stays
  // beside it as the fallback for a trade opened outside the session's hours.
  for (const side of ["long", "short"] as const) {
    const session = stopLevel[side]
    if (
      !session ||
      session === "percent" ||
      protection[side]?.stopLossPct === undefined
    ) {
      continue
    }
    protection[side] = {
      ...protection[side],
      stopLossLevel: { kind: "sessionOpen", session },
    }
  }
  // Risk-reward take profits. Against a plain percent stop the target is known
  // right here (stop distance × ratio), so every engine — live, backtest, DCA
  // — sees an ordinary percent and nothing else has to change. Against a
  // session-open stop the distance only exists once the trade opens, so the
  // ratio rides along for the engine to apply and the percent it would have
  // been stays as the outside-session fallback.
  for (const side of ["long", "short"] as const) {
    const entry = tpRatio[side]
    if (!entry) continue
    const levels = protection[side]
    const stopPct = levels?.stopLossPct
    if (stopPct === undefined) {
      addError({
        code: "invalid_protection",
        nodeId: entry.nodeId,
        message: `A risk-reward take profit measures against the stop, so the ${side === "long" ? "long" : "short"} entry needs a Stop Loss too.`,
      })
      continue
    }
    const pct = Math.round(stopPct * entry.ratio * 10_000) / 10_000
    if (!(pct > 0 && pct <= 1000)) {
      addError({
        code: "invalid_protection",
        nodeId: entry.nodeId,
        message: `A ${entry.ratio}:1 target on a ${stopPct}% stop works out at ${pct}%, past the 1000% take-profit cap.`,
      })
      continue
    }
    protection[side] = {
      ...levels,
      takeProfitPct: pct,
      ...(levels?.stopLossLevel ? { takeProfitRr: entry.ratio } : {}),
    }
  }
  // Fold the DCA "previous rung" take-profit mode onto the long side (DCA is
  // long-only). Left absent for the default "average" so existing configs stay
  // byte-identical.
  if (longTpMode && protection.long) {
    protection.long = { ...protection.long, takeProfitMode: longTpMode }
  }

  // A capped filter must be able to SEE a signal maxAgeBars old inside the
  // engine window: the indicator's own warmup plus the cap has to fit, or
  // the automation would silently never trade.
  const checkedCaps = new Set<string>()
  const checkFilters = (filters: AutomationFilter[]) => {
    for (const filter of filters) {
      // v1: a Look Back's "N candles" would be ambiguous between the two
      // clocks, so it cannot share a signal path with a Timeframe node.
      if (filter.interval && filter.maxAgeBars !== undefined) {
        addError({
          code: "invalid_lookback",
          nodeId: filter.nodeId,
          message:
            "Look Back can't cap a higher-timeframe signal yet — remove the Look Back or the Timeframe node.",
        })
        continue
      }
      // Warmup fit for the higher-timeframe series: the HTF indicator's
      // warmup plus coverage of a worst-case (1400-bar) base window must fit
      // inside the same per-series ceiling.
      if (filter.interval) {
        const key = `${filter.nodeId}:htf`
        if (checkedCaps.has(key)) continue
        checkedCaps.add(key)
        const ratio = automationIntervalRatio(input.interval, filter.interval)
        const module = INDICATORS[filter.indicator.type]
        const parsed = module.paramsSchema.safeParse(filter.indicator.params)
        if (ratio !== null && parsed.success) {
          const warmup = module.warmupBars(parsed.data as never)
          const maxWarmup =
            AUTOMATION_MAX_WINDOW_BARS -
            Math.ceil(AUTOMATION_MAX_WINDOW_BARS / ratio) -
            5
          if (warmup > maxWarmup) {
            addError({
              code: "invalid_timeframe",
              nodeId: filter.nodeId,
              message: `${module.label} needs ${warmup} warm-up candles on ${filter.interval} — more than the engine can hold next to the ${input.interval} window (at most ${Math.max(1, maxWarmup)}).`,
            })
          }
        }
        continue
      }
      if (filter.maxAgeBars === undefined) continue
      const key = `${filter.nodeId}:${filter.maxAgeBars}`
      if (checkedCaps.has(key)) continue
      checkedCaps.add(key)
      const module = INDICATORS[filter.indicator.type]
      const parsed = module.paramsSchema.safeParse(filter.indicator.params)
      if (!parsed.success) continue
      const warmup = module.warmupBars(parsed.data as never)
      const maxCap = AUTOMATION_MAX_WINDOW_BARS - warmup - 5
      if (filter.maxAgeBars > maxCap) {
        addError({
          code: "invalid_lookback",
          nodeId: filter.nodeId,
          message: `Look Back ${filter.maxAgeBars} candles is more than the engine can check back for ${module.label} (it needs ${warmup} warm-up candles — the Look Back here can be at most ${Math.max(1, maxCap)}).`,
        })
      }
    }
  }
  const triggersOf = (condition: AutomationCondition): void => {
    if (condition.kind === "liveWall") return
    if (condition.kind !== "trigger") {
      condition.children.forEach(triggersOf)
      return
    }
    checkFilters(condition.filters ?? [])
  }
  for (const rule of rules) triggersOf(rule.condition)
  // v1 cap: one distinct higher timeframe per graph keeps live subscriptions
  // and backtest data volume sane.
  const timeframeNodes = nodes.filter(
    (node): node is AutomationTimeframeNode => node.kind === "timeframe"
  )
  const distinctHtf = [...new Set(timeframeNodes.map((node) => node.interval))]
  if (distinctHtf.length > 1) {
    addError({
      code: "invalid_timeframe",
      nodeId: timeframeNodes[timeframeNodes.length - 1].id,
      message: `An automation can watch at most one higher timeframe — this graph mixes ${distinctHtf.join(" and ")}.`,
    })
  }
  if (errors.length > 0) return { config: null, errors }

  return {
    config: {
      v: 2,
      kind: "automation",
      interval: input.interval,
      rules,
      protection,
      ...(marketScanner ? { marketScanner } : {}),
      ...(dca ? { dca } : {}),
    },
    errors: [],
  }
}

/** Runtime capabilities are derived from rules, not stored as another version. */
export function automationCapabilities(config: AutomationConfig): {
  requiresLiveBook: boolean
  supportsHistoricalBacktest: boolean
} {
  const requiresLiveBook = config.rules.some((rule) =>
    conditionHasLiveWall(rule.condition)
  )
  return {
    requiresLiveBook,
    supportsHistoricalBacktest: !requiresLiveBook,
  }
}

/**
 * Latched trend per filter state key: the side of its most recent signal and
 * how many candles ago it fired (0 = this candle).
 */
export type AutomationFilterLatch = { side: "buy" | "sell"; age: number }
export type AutomationFilterState = ReadonlyMap<string, AutomationFilterLatch>

/**
 * The latch-map key for a filter. One node can gate on the bot timeframe AND
 * on a higher one (e.g. its Bullish fires entries while its Trend feeds a
 * Timeframe node), so the clock is part of the identity — the evaluator and
 * the resolver must build keys the same way.
 */
export function automationFilterStateKey(
  filter: Pick<AutomationFilter, "nodeId" | "interval">
): string {
  return filter.interval ? `${filter.nodeId}@${filter.interval}` : filter.nodeId
}

const NO_FILTER_STATE: AutomationFilterState = new Map()

function conditionMatches(
  condition: AutomationCondition,
  fired: ReadonlySet<string>,
  filterState: AutomationFilterState
): boolean {
  if (condition.kind === "liveWall") return false
  if (condition.kind === "trigger") {
    return (
      fired.has(`${condition.nodeId}:${condition.side}`) &&
      (condition.filters ?? []).every((filter) => {
        const latch = filterState.get(automationFilterStateKey(filter))
        return (
          latch !== undefined &&
          latch.side === condition.side &&
          (filter.maxAgeBars === undefined || latch.age < filter.maxAgeBars)
        )
      })
    )
  }
  return condition.kind === "and"
    ? condition.children.every((child) =>
        conditionMatches(child, fired, filterState)
      )
    : condition.children.some((child) =>
        conditionMatches(child, fired, filterState)
      )
}

export type ResolvedAutomationAction =
  | { action: "buy" | "short"; targetEquityPct: number }
  | { action: "reverse"; targetEquityPct: number }
  | { action: "close" }

export function resolveAutomationActions(
  rules: AutomationRule[],
  fired: ReadonlySet<string>,
  filterState: AutomationFilterState = NO_FILTER_STATE
): { action: ResolvedAutomationAction | null; warning: string | null } {
  const matched = rules.filter((rule) =>
    conditionMatches(rule.condition, fired, filterState)
  )
  // Precedence: close > reverse > entries. Close always flattens; a reverse
  // (flip whatever is held) outranks a plain entry so a trend flip wins over a
  // same-candle entry signal.
  if (matched.some((rule) => rule.action === "close")) {
    return { action: { action: "close" }, warning: null }
  }
  const reverses = matched.filter((rule) => rule.action === "reverse")
  if (reverses.length > 0) {
    return {
      action: {
        action: "reverse",
        targetEquityPct: Math.max(
          ...reverses.map((rule) => rule.targetEquityPct ?? 0)
        ),
      },
      warning: null,
    }
  }
  const buys = matched.filter((rule) => rule.action === "buy")
  const shorts = matched.filter((rule) => rule.action === "short")
  if (buys.length > 0 && shorts.length > 0) {
    return {
      action: null,
      warning:
        "Long and Short matched on the same candle; no entry was placed.",
    }
  }
  const candidates = buys.length > 0 ? buys : shorts
  if (candidates.length === 0) return { action: null, warning: null }
  const targetEquityPct = Math.max(
    ...candidates.map((rule) => rule.targetEquityPct ?? 0)
  )
  return {
    action: { action: buys.length > 0 ? "buy" : "short", targetEquityPct },
    warning: null,
  }
}
