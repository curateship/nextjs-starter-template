/**
 * QFL / DCA ladder optimisation campaign.
 *
 * Follows workspace/docs/backtesting-guide.md: one shared wallet across a 25+
 * market basket (high/mid/low volatility), Binance candles, real costs, 1x bet,
 * walk-forward train -> validate -> final, and the OUT-OF-SAMPLE number is the
 * one that counts.
 *
 * Usage (from apps/trading):
 *   npx tsx scripts/qfl-campaign.ts smoke 4h
 *   npx tsx scripts/qfl-campaign.ts train 4h
 *   npx tsx scripts/qfl-campaign.ts final 4h '<candidate json>'
 *   npx tsx scripts/qfl-campaign.ts save  4h '<candidate json>'
 */
import { readFileSync } from "node:fs"
import { z } from "zod"

// The app loads .env.local through Vite; a bare tsx script does not, so without
// this it silently falls back to the SHARED custom_shell database on port 54320
// (which has no trading tables) instead of trading's own on 54161.
for (const line of readFileSync(
  new URL("../.env.local", import.meta.url),
  "utf8"
).split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (!match) continue
  const value = match[2].trim().replace(/^["']|["']$/g, "")
  process.env[match[1]] ??= value
}

import type { AutomationConfig } from "@/lib/automations/automation"
import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import {
  fetchCandleHistory,
  INTERVAL_MS,
  type CandleInterval,
  type HistoryCandle,
} from "@/server/backtest/history"
import type { AutomationFilter } from "@/lib/automations/automation"
import { INDICATORS } from "@/lib/indicators/registry"
import { runDcaPortfolioBacktests } from "../worker/src/backtest/runner"
import { resolveStrategy } from "../worker/src/strategies/registry"

/**
 * Every Binance USDT-perp with 4h history reaching back before June 2021,
 * alphabetical. Spans low vol (BTC/ETH/BNB), mid (LINK/ATOM/AVAX/DOT) and high
 * (DOGE/THETA/SAND/CRV). The list is "whatever had the history", not a hand-pick.
 */
const LONG_HISTORY = [
  "AAVE", "ADA", "ALGO", "ATOM", "AVAX", "BCH", "BNB", "BTC", "COMP", "CRV",
  "DASH", "DOGE", "DOT", "EGLD", "ENJ", "EOS", "ETC", "ETH", "FIL", "IOTA",
  "KSM", "LINK", "LTC", "MANA", "MKR", "NEAR", "NEO", "ONT", "RUNE", "SAND",
  "SNX", "SOL", "SUSHI", "THETA", "TRX", "UNI", "VET", "XLM", "XRP", "XTZ",
  "YFI", "ZEC",
] as const

/**
 * Coins that only listed later, so they cannot appear in the training window at
 * all. They join the out-of-sample windows, which makes those windows a test of
 * unseen TIME and unseen COINS at once.
 */
const NEWER_MARKETS = [
  "APE", "APT", "ARB", "DYDX", "FET", "GALA", "ICP", "INJ", "OP", "ORDI",
  "SEI", "STX", "SUI", "TIA", "WLD",
] as const

// Deterministic 2:1 split of the long-history list by position, decided before
// any result was seen. Two thirds are tunable; the other third is never trained
// on and only ever appears out of sample.
const MARKETS = LONG_HISTORY.filter((_, index) => index % 3 !== 2)
const HELD_OUT_MARKETS = LONG_HISTORY.filter((_, index) => index % 3 === 2)
// Out-of-sample basket: the tuned coins, the never-tuned third, and every later
// listing. 57 markets against 28 tuned on.
const ALTERNATE_MARKETS = [
  ...LONG_HISTORY,
  ...NEWER_MARKETS,
] as readonly string[]

/**
 * Majors only — the coins you would actually run this on, rather than the whole
 * survivorship-flattered basket. Large caps with 2020 history, no micro-caps.
 * Selected by market cap standing, not by how they backtested.
 */
const MAJORS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "LINK", "LTC", "BCH",
  "DOT", "AVAX", "ATOM", "UNI", "XLM", "TRX", "NEAR", "AAVE", "ETC", "FIL",
] as const

/** QFL_BASKET=majors switches every window onto the majors list. */
const BASKET =
  process.env.QFL_BASKET === "majors"
    ? (MAJORS as readonly string[])
    : null

const STARTING_EQUITY = 10_000
// Hyperliquid taker 0.045%, maker 0.015%, 0.04% slippage. STRESS doubles the
// slippage, per the guide's "measured cost is a calm-market number" rule.
const COSTS: BacktestCosts = {
  takerFeeBps: 4.5,
  makerFeeBps: 1.5,
  slippageBps: 4,
}
const STRESS_COSTS: BacktestCosts = { ...COSTS, slippageBps: 8 }
const WARMUP_BARS = 400

/**
 * Walk-forward split. The 4h cache reaches back to 2020-10-31 for the majors, so
 * training gets 3.7 years covering the 2021 run-up, the 2022 crash and the 2023
 * grind — three genuinely different regimes. Validate picks the finalist;
 * final is touched once, at the end, and is the only number that counts.
 */
const SPLITS = {
  // Untouched window = the Sep-2025 -> Jul-2026 crash.
  crash: {
    train: ["2020-11-01T00:00:00Z", "2024-07-01T00:00:00Z"],
    validate: ["2024-07-01T00:00:00Z", "2025-09-01T00:00:00Z"],
    final: ["2025-09-01T00:00:00Z", "2026-07-01T00:00:00Z"],
  },
  // Untouched window = the 2024 bull run. Everything from Oct 2023 on is held
  // back, so the search never sees it and the result is a clean read on what
  // this does when the market RISES — the question one crash window cannot
  // answer.
  bull: {
    train: ["2020-11-01T00:00:00Z", "2023-01-01T00:00:00Z"],
    validate: ["2023-01-01T00:00:00Z", "2023-10-01T00:00:00Z"],
    final: ["2023-10-01T00:00:00Z", "2025-01-01T00:00:00Z"],
  },
} as const

/** QFL_SPLIT=bull holds back the 2024 bull run instead of the 2026 crash. */
const PHASES =
  process.env.QFL_SPLIT === "bull" ? SPLITS.bull : SPLITS.crash

type Phase = keyof typeof PHASES

const candidateSchema = z.object({
  basePeriods: z.number().int().min(4).max(500),
  pumpPeriods: z.number().int().min(1).max(499),
  crackPct: z.number().positive().max(50),
  maxCrackBars: z.number().int().min(1).max(500),
  rungCount: z.number().int().min(1).max(8),
  firstDeviation: z.number().positive().max(50),
  deviationStep: z.number().min(0).max(20),
  maxPositionPct: z.number().positive().max(100),
  sizeMultiplier: z.number().min(1).max(10),
  rungEntry: z.enum(["market", "limit"]),
  requireTwoGreen: z.boolean(),
  tpMode: z.enum([
    "average",
    "previousRungSellAll",
    "nearestRungSellAll",
    "moneyBackThenBase",
  ]),
  takeProfitPct: z.number().positive().max(200),
  sellBelowBasePct: z.number().min(-500).max(50),
  stopLossPct: z.number().positive().max(100),
  stopAnchor: z.enum(["average", "first"]),
  trendFilterEnabled: z.boolean(),
  trendMaBars: z.number().int().min(2).max(1000),
  /** Which entries of CONFIRMATIONS gate the rung buys. Empty = no confirmation.
   * Checked lazily against the catalog, which is declared further down. */
  confirms: z
    .array(z.string())
    .max(3)
    .refine(
      (keys) => keys.every((key) => key in CONFIRMATIONS),
      "Unknown confirmation key"
    ),
  /** How many candles a confirmation's signal stays valid for. */
  confirmMaxAgeBars: z.number().int().min(1).max(200),
  exitOnTrendBreak: z.boolean(),
  maxCycleBars: z.number().int().min(0).max(5000),
})

type Candidate = z.infer<typeof candidateSchema>

type MarketData = { market: string; candles: HistoryCandle[]; simStartMs: number }
type MarketRun = { market: string; result: BacktestResult }

type Score = {
  candidate: Candidate
  phase: Phase
  costs: BacktestCosts
  monthlyPct: number
  totalPct: number
  portfolioDrawdownPct: number
  greenMarkets: number
  markets: number
  trades: number
  cycles: number
  worstMarketPct: number
  /** Share of closed trades that were profitable. 90%+ means losses are being
   * parked in open positions rather than avoided. */
  winRate: number
  warnings: number
  runs: MarketRun[]
}

/**
 * The confirmation catalog: every indicator the app has, with settings that make
 * it a usable "is this dip worth buying" opinion. A rung only fires while EVERY
 * selected confirmation's latest signal is a buy.
 *
 * These are the ten indicators to mix and match. Each entry is one wire into the
 * DCA node.
 */
const CONFIRMATIONS: Record<string, AutomationFilter> = {
  paSweep: {
    nodeId: "c-pa-sweep",
    indicator: {
      type: "price_action",
      params: {
        bullHammer: false, bearShootingStar: false,
        bullEngulfing: false, bearEngulfing: false,
        bullSweep: true, bearSweep: true,
        bullBos: false, bearBos: false,
        wickBodyRatio: 2, extremeLookback: 20, sweepLookback: 20, swingLookback: 20,
      },
    },
  },
  paReversal: {
    nodeId: "c-pa-rev",
    indicator: {
      type: "price_action",
      params: {
        bullHammer: true, bearShootingStar: true,
        bullEngulfing: true, bearEngulfing: true,
        bullSweep: false, bearSweep: false,
        bullBos: false, bearBos: false,
        wickBodyRatio: 2, extremeLookback: 20, sweepLookback: 20, swingLookback: 20,
      },
    },
  },
  paStructure: {
    nodeId: "c-pa-bos",
    indicator: {
      type: "price_action",
      params: {
        bullHammer: false, bearShootingStar: false,
        bullEngulfing: false, bearEngulfing: false,
        bullSweep: false, bearSweep: false,
        bullBos: true, bearBos: true,
        wickBodyRatio: 2, extremeLookback: 20, sweepLookback: 20, swingLookback: 20,
      },
    },
  },
  rsi: {
    nodeId: "c-rsi",
    indicator: { type: "rsi_levels", params: { period: 14, buyBelow: 30, sellAbove: 70 } },
  },
  rsiSlow: {
    nodeId: "c-rsi-slow",
    indicator: { type: "rsi_levels", params: { period: 21, buyBelow: 35, sellAbove: 65 } },
  },
  emaFast: {
    nodeId: "c-ema-fast",
    indicator: { type: "ema_cross", params: { fast: 9, slow: 21, showFast: true, showSlow: true } },
  },
  emaSlow: {
    nodeId: "c-ema-slow",
    indicator: { type: "ema_cross", params: { fast: 21, slow: 55, showFast: true, showSlow: true } },
  },
  macd: {
    nodeId: "c-macd",
    indicator: { type: "macd_cross", params: { fast: 12, slow: 26, signal: 9 } },
  },
  bollinger: {
    nodeId: "c-boll",
    indicator: { type: "bollinger", params: { period: 20, k: 2, mode: "revert" } },
  },
  breakout: {
    nodeId: "c-breakout",
    indicator: { type: "breakout", params: { lookback: 20 } },
  },
  trendline: {
    nodeId: "c-trendline",
    indicator: {
      type: "trendline",
      params: { swingLookback: 30, confirmationBars: 2, breakBuffer: 0.1, requireCounterSlope: true },
    },
  },
  fvg: {
    nodeId: "c-fvg",
    indicator: { type: "fair_value_gap", params: { minGapSize: 1, showFilled: true } },
  },
  qqe: {
    nodeId: "c-qqe",
    indicator: {
      type: "qqe",
      params: {
        rsiPeriod: 14, rsiSmoothing: 5, qqeFactor: 4.238, threshold: 8,
        maType: "EMA", rsiSource: "close",
        consolidationFilter: false, loopbackPeriod: 50,
        minConsolidationLen: 5, swingLookback: 50,
      },
    },
  },
}

const CONFIRMATION_KEYS = Object.keys(CONFIRMATIONS)

// Fail loudly at startup rather than silently dropping a mis-specified indicator
// into the search, where it would just look like "that combination is bad".
for (const [key, filter] of Object.entries(CONFIRMATIONS)) {
  const module = INDICATORS[filter.indicator.type]
  const parsed = module.paramsSchema.safeParse(filter.indicator.params)
  if (!parsed.success) {
    throw new Error(
      `Confirmation "${key}" (${filter.indicator.type}) has invalid params: ` +
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")
    )
  }
}

const round = (value: number) => Math.round(value * 100) / 100

function deviations(candidate: Candidate): { deviation: number }[] {
  return Array.from({ length: candidate.rungCount }, (_, i) => ({
    deviation: round(candidate.firstDeviation + i * candidate.deviationStep),
  }))
}

function configFor(
  candidate: Candidate,
  interval: CandleInterval
): AutomationConfig {
  return {
    v: 2,
    kind: "automation",
    interval: interval as AutomationConfig["interval"],
    rules: [],
    protection: {
      long: {
        takeProfitPct: candidate.takeProfitPct,
        ...(candidate.tpMode !== "average"
          ? { takeProfitMode: candidate.tpMode }
          : {}),
        stopLossPct: candidate.stopLossPct,
        ...(candidate.stopAnchor === "first"
          ? { stopAnchor: "first" as const }
          : {}),
      },
    },
    dca: {
      nodeId: "dca",
      rungs: deviations(candidate),
      maxPositionPct: candidate.maxPositionPct,
      sizeMultiplier: candidate.sizeMultiplier,
      compound: true,
      rungEntry: candidate.rungEntry,
      requireTwoGreen: candidate.requireTwoGreen,
      basePeriods: candidate.basePeriods,
      pumpPeriods: candidate.pumpPeriods,
      crackPct: candidate.crackPct,
      maxCrackBars: candidate.maxCrackBars,
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
      sellBelowBasePct: candidate.sellBelowBasePct,
      trendFilterEnabled: candidate.trendFilterEnabled,
      trendMaBars: candidate.trendMaBars,
      exitOnTrendBreak: candidate.exitOnTrendBreak,
      maxCycleBars: candidate.maxCycleBars,
      ...(candidate.confirms.length > 0
        ? {
            confirmations: candidate.confirms.map((key) => ({
              ...CONFIRMATIONS[key],
              // Explicit staleness: a confirmation counts for this many candles
              // after it fires, then stops counting. Searched like any knob.
              maxAgeBars: candidate.confirmMaxAgeBars,
            })),
          }
        : {}),
    },
  }
}

async function loadPhase(
  phase: Phase,
  interval: CandleInterval,
  markets: readonly string[] = MARKETS
): Promise<MarketData[]> {
  if (BASKET) markets = BASKET
  const [startIso, endIso] = PHASES[phase]
  const simStartMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  const fetchStart = simStartMs - WARMUP_BARS * INTERVAL_MS[interval]
  const out: MarketData[] = []
  for (const market of markets) {
    let candles: HistoryCandle[]
    try {
      candles = await fetchCandleHistory(market, interval, fetchStart, endMs)
    } catch (error) {
      console.log(`[${phase}] skip ${market}: ${(error as Error).message}`)
      continue
    }
    const simBars = candles.filter((candle) => candle.t >= simStartMs).length
    // 200, not 300: a 9-month daily window is 273 candles, so a 300-bar floor
    // silently skipped EVERY market and made the validate stage return nothing.
    // "The worse of train and validate" then collapsed to min(train, 0) = 0 for
    // every candidate, so ~9,500 candidates all tied and the ranking picked at
    // random. Any window that loads zero markets is now a hard error, because
    // silently returning an empty result is how that went unnoticed.
    if (simBars < 200) {
      console.log(`[${phase}] skip ${market}: only ${simBars} bars`)
      continue
    }
    out.push({ market, candles, simStartMs })
  }
  console.log(`[${phase}] ${out.length} markets loaded at ${interval}`)
  if (out.length === 0) {
    throw new Error(
      `[${phase}] loaded ZERO markets at ${interval} — the window is too short for the bar floor. Refusing to score against an empty basket.`
    )
  }
  return out
}

/**
 * ONE shared wallet: every market trades the same account, so the basket's
 * equity at any moment is the wallet plus the sum of every market's P&L delta.
 * Drawdown is measured on that single blended curve, not per market.
 */
function sharedDrawdown(runs: MarketRun[]): number {
  const times = [
    ...new Set(runs.flatMap(({ result }) => result.equityCurve.map((p) => p.t))),
  ].sort((a, b) => a - b)
  const cursors = runs.map(() => 0)
  const deltas = runs.map(() => 0)
  let peak = STARTING_EQUITY
  let maxDrawdown = 0
  for (const time of times) {
    for (let i = 0; i < runs.length; i += 1) {
      const curve = runs[i].result.equityCurve
      while (cursors[i] < curve.length && curve[cursors[i]].t <= time) {
        deltas[i] = curve[cursors[i]].eq - STARTING_EQUITY
        cursors[i] += 1
      }
    }
    const total = STARTING_EQUITY + deltas.reduce((sum, d) => sum + d, 0)
    peak = Math.max(peak, total)
    maxDrawdown = Math.min(maxDrawdown, ((total - peak) / peak) * 100)
  }
  return maxDrawdown
}

function summarize(
  phase: Phase,
  costs: BacktestCosts,
  candidate: Candidate,
  runs: MarketRun[]
): Score {
  // Shared wallet: the denominator is ONE account, not N.
  const delta = runs.reduce(
    (sum, run) => sum + (run.result.stats.endingEquity - STARTING_EQUITY),
    0
  )
  const totalPct = (delta / STARTING_EQUITY) * 100
  const [startIso, endIso] = PHASES[phase]
  const months =
    (Date.parse(endIso) - Date.parse(startIso)) / (86_400_000 * 30.4375)
  return {
    candidate,
    phase,
    costs,
    monthlyPct: totalPct / months,
    totalPct,
    portfolioDrawdownPct: sharedDrawdown(runs),
    greenMarkets: runs.filter((run) => run.result.stats.netPnlPct > 0).length,
    markets: runs.length,
    trades: runs.reduce((sum, run) => sum + run.result.trades.length, 0),
    cycles: runs.reduce(
      (sum, run) =>
        sum +
        run.result.fills.filter((fill) => fill.purpose === "dca:b:0").length,
      0
    ),
    worstMarketPct: Math.min(...runs.map((r) => r.result.stats.netPnlPct)),
    winRate: (() => {
      const trades = runs.flatMap((run) => run.result.trades)
      return trades.length === 0
        ? 0
        : (trades.filter((trade) => trade.pnl > 0).length / trades.length) * 100
    })(),
    warnings: runs.reduce(
      (sum, run) => sum + (run.result.stats.warnings?.length ?? 0),
      0
    ),
    runs,
  }
}

function publicScore(score: Score) {
  return {
    monthlyPct: round(score.monthlyPct),
    totalPct: round(score.totalPct),
    ddPct: round(score.portfolioDrawdownPct),
    green: `${score.greenMarkets}/${score.markets}`,
    cycles: score.cycles,
    trades: score.trades,
    worstMarketPct: round(score.worstMarketPct),
    winRate: round(score.winRate),
    warnings: score.warnings,
    phase: score.phase,
    slipBps: score.costs.slippageBps,
    candidate: score.candidate,
  }
}

/**
 * Ranking, straight from the guide's targets: 3-6%/month, majority of the basket
 * green, drawdown under ~20-30%.
 *
 * The return contribution is CAPPED at 8%/month on purpose. An unbounded return
 * term makes the search chase one shape: a huge, rarely-stopped bet that scores
 * 9%/month with a 41% drawdown and a coin down 68%. That is leverage-by-another-
 * name, not an edge, and it is what the first search run drifted into. Past the
 * cap, extra return buys nothing and the risk terms decide.
 */
function scoreRank(score: Score): number {
  // Hard rejects: a wiped-out market's numbers are fiction, and a basket that
  // barely traded has no statistical meaning.
  if (score.worstMarketPct <= -90 || score.cycles < 40) return -1e6
  // HIDDEN TAIL RISK. A ladder with no working exit posts a 90%+ win rate by
  // never closing a loser — the losses sit in open bags and the backtest looks
  // flawless right up until the one cycle that never comes back. The sealed
  // window can't catch this if it contains no crash, so reject the shape here.
  if (score.winRate >= 90) return -1e6
  // SHARED-WALLET WIPEOUT. The engine's own tripwire checks each market's equity
  // curve separately, and in a shared-wallet run every market keeps its own
  // $10k baseline — so 56 markets each losing a few percent of THEIR baseline
  // sums to more than the one real wallet, the account goes deeply negative, and
  // nothing warns. A candidate reported -235%/-216% drawdown with zero warnings
  // and would have been shortlisted. Past roughly half the wallet, a real account
  // is gone and everything after is fiction.
  if (score.portfolioDrawdownPct <= -60) return -1e6

  const greenRatio = score.greenMarkets / Math.max(1, score.markets)
  const cappedMonthly = Math.min(score.monthlyPct, 8)
  const drawdownPenalty =
    Math.max(0, Math.abs(score.portfolioDrawdownPct) - 20) * 1.5
  // Below 60% of the basket green it is a few lucky coins, not an edge.
  const greenPenalty = greenRatio < 0.6 ? (0.6 - greenRatio) * 100 : 0
  // Any single coin down more than 25% is a warning about position sizing.
  const worstPenalty = Math.max(0, -score.worstMarketPct - 25) * 0.5

  return (
    cappedMonthly * 3 +
    greenRatio * 10 -
    drawdownPenalty -
    greenPenalty -
    worstPenalty -
    score.warnings * 50
  )
}

async function runCandidate(
  data: MarketData[],
  phase: Phase,
  candidate: Candidate,
  interval: CandleInterval,
  costs: BacktestCosts
): Promise<Score> {
  const params = configFor(candidate, interval)
  const strategy = resolveStrategy(params)
  if (!strategy) throw new Error("DCA strategy did not resolve from config")
  const results = await runDcaPortfolioBacktests(
    data.map(({ market, candles, simStartMs }) => ({
      strategy,
      params,
      candles,
      simStartMs,
      startingEquity: STARTING_EQUITY,
      market,
      interval: interval as AutomationConfig["interval"],
      costs,
    }))
  )
  const runs = data.map(({ market }) => {
    const result = results.get(market)
    if (!result) throw new Error(`Missing portfolio result for ${market}`)
    return { market, result }
  })
  return summarize(phase, costs, candidate, runs)
}

const BASELINE: Candidate = {
  basePeriods: 36,
  pumpPeriods: 8,
  crackPct: 2.5,
  maxCrackBars: 4,
  rungCount: 5,
  firstDeviation: 5,
  deviationStep: 3,
  maxPositionPct: 25,
  sizeMultiplier: 2,
  rungEntry: "market",
  requireTwoGreen: false,
  tpMode: "nearestRungSellAll",
  takeProfitPct: 3,
  sellBelowBasePct: 2,
  stopLossPct: 15,
  stopAnchor: "first",
  trendFilterEnabled: false,
  trendMaBars: 200,
  confirms: [],
  confirmMaxAgeBars: 5,
  exitOnTrendBreak: false,
  maxCycleBars: 0,
}

export { BASELINE, candidateSchema, configFor, loadPhase, runCandidate, publicScore, scoreRank, PHASES, COSTS, STRESS_COSTS, STARTING_EQUITY, MARKETS, ALTERNATE_MARKETS }
export type { Candidate, Score, MarketData }

// ---------------------------------------------------------------- modes ----

// ------------------------------------------------------------- search ------

/** Deterministic RNG so a campaign can be replayed exactly. */
function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const pick = <T,>(random: () => number, values: readonly T[]): T =>
  values[Math.floor(random() * values.length)]

const GRID = {
  basePeriods: [12, 18, 24, 36, 48, 72, 96],
  pumpPeriods: [2, 4, 6, 8, 12],
  crackPct: [1, 1.5, 2, 2.5, 3.5, 5],
  maxCrackBars: [2, 3, 4, 6, 10],
  rungCount: [1, 2, 3, 4, 5, 6],
  firstDeviation: [1.5, 2, 3, 4, 5, 7],
  deviationStep: [0, 1, 2, 3, 5],
  maxPositionPct: [10, 20, 30, 50, 75, 100],
  sizeMultiplier: [1, 1.5, 2, 3],
  rungEntry: ["market", "limit"],
  requireTwoGreen: [true, false],
  tpMode: [
    "average",
    "previousRungSellAll",
    "nearestRungSellAll",
    "moneyBackThenBase",
  ],
  takeProfitPct: [1, 2, 3, 5, 8],
  // Negative rests the free coins ABOVE the base: Luc's "keep the free coins and
  // ride them all the way up" rather than selling at the crack's ceiling.
  sellBelowBasePct: [2, 0, -10, -25, -50, -100, -200],
  stopLossPct: [8, 12, 15, 20, 30, 50],
  stopAnchor: ["average", "first"],
  // The regime gate. `false` stays in the grid so the search can still prove
  // whether gating helps rather than being told it does.
  trendFilterEnabled: [true, false],
  trendMaBars: [50, 100, 150, 200, 300],
  confirmMaxAgeBars: [1, 2, 3, 5, 10, 20, 50],
  // Real exits for a losing ladder: close when the trend breaks, and/or abandon
  // a cycle that has gone this many candles without resolving. Without these the
  // ladder cannot give up, and every tuned configuration exploited that by
  // parking losses in open positions (95% win rates, hidden tail risk).
  exitOnTrendBreak: [true, false],
  maxCycleBars: [0, 20, 40, 80, 160, 320],
} as const

function randomCandidate(random: () => number): Candidate {
  return candidateSchema.parse({
    basePeriods: pick(random, GRID.basePeriods),
    pumpPeriods: pick(random, GRID.pumpPeriods),
    crackPct: pick(random, GRID.crackPct),
    maxCrackBars: pick(random, GRID.maxCrackBars),
    rungCount: pick(random, GRID.rungCount),
    firstDeviation: pick(random, GRID.firstDeviation),
    deviationStep: pick(random, GRID.deviationStep),
    maxPositionPct: pick(random, GRID.maxPositionPct),
    sizeMultiplier: pick(random, GRID.sizeMultiplier),
    rungEntry: pick(random, GRID.rungEntry),
    requireTwoGreen: pick(random, GRID.requireTwoGreen),
    tpMode: pick(random, GRID.tpMode),
    takeProfitPct: pick(random, GRID.takeProfitPct),
    sellBelowBasePct: pick(random, GRID.sellBelowBasePct),
    stopLossPct: pick(random, GRID.stopLossPct),
    stopAnchor: pick(random, GRID.stopAnchor),
    trendFilterEnabled: pick(random, GRID.trendFilterEnabled),
    trendMaBars: pick(random, GRID.trendMaBars),
    confirms: randomConfirms(random),
    confirmMaxAgeBars: pick(random, GRID.confirmMaxAgeBars),
    exitOnTrendBreak: pick(random, GRID.exitOnTrendBreak),
    maxCycleBars: pick(random, GRID.maxCycleBars),
  })
}

/** 0, 1 or 2 distinct confirmations — the indicator mix for this candidate. */
function randomConfirms(random: () => number): string[] {
  const count = Math.floor(random() * 3)
  const chosen: string[] = []
  while (chosen.length < count) {
    const key = pick(random, CONFIRMATION_KEYS)
    if (!chosen.includes(key)) chosen.push(key)
  }
  return chosen
}

/** Local search: copy a good candidate and re-roll a couple of its knobs. */
function mutate(random: () => number, parent: Candidate): Candidate {
  const keys = Object.keys(GRID) as (keyof typeof GRID)[]
  const next: Record<string, unknown> = { ...parent }
  const changes = 1 + Math.floor(random() * 2)
  for (let i = 0; i < changes; i += 1) {
    // A quarter of mutations re-roll the indicator mix rather than a scalar, so
    // the search explores combinations as hard as it explores numbers.
    if (random() < 0.25) {
      next.confirms = randomConfirms(random)
      continue
    }
    const key = pick(random, keys)
    next[key] = pick(random, GRID[key] as readonly unknown[])
  }
  return candidateSchema.parse(next)
}

const fingerprint = (candidate: Candidate) =>
  JSON.stringify(candidate, Object.keys(candidate).sort())

/**
 * Train-window search. Random exploration first, then rounds that mutate the
 * current leaders. Every candidate is judged on the WHOLE basket at 1x with real
 * costs, and the leaderboard is printed as it goes so a long run can be watched.
 */
async function train(
  interval: CandleInterval,
  rounds: number,
  perRound: number,
  seed: number
) {
  const data = await loadPhase("train", interval)
  const random = rng(seed)
  const seen = new Set<string>()
  const scores: Score[] = []


  // TWO STAGE, on purpose. Stage 1 screens every candidate on the TRAIN window
  // only — cheap, 28 markets. Stage 2 pays for the 57-market validate window on
  // the shortlist alone, and ranks by the WORSE of the two.
  //
  // Running both windows for every candidate is what robustness "should" cost,
  // and it made a 4h search 12x slower (50s -> 600s per 8 candidates) for
  // information about hundreds of candidates that were never going to be picked.
  // Screening cheaply and validating the survivors gets the same selection at a
  // fraction of the work.
  const evaluate = async (candidate: Candidate) => {
    const key = fingerprint(candidate)
    if (seen.has(key)) return
    seen.add(key)
    try {
      const trainScore = await runCandidate(
        data,
        "train",
        candidate,
        interval,
        COSTS
      )
      scores.push({ ...trainScore, runs: [] })
    } catch (error) {
      console.log("SKIP", (error as Error).message)
    }
  }

  // Seed the search with both the plain ladder AND the one configuration already
  // known to survive all three windows, so the local search can improve on it
  // instead of having to rediscover it by chance.
  const SEEDS: Candidate[] = [
    BASELINE,
    candidateSchema.parse({
      ...BASELINE,
      basePeriods: 36,
      pumpPeriods: 12,
      crackPct: 2.5,
      maxCrackBars: 2,
      rungCount: 5,
      firstDeviation: 7,
      deviationStep: 1,
      maxPositionPct: 50,
      sizeMultiplier: 2,
      rungEntry: "limit",
      tpMode: "nearestRungSellAll",
      stopLossPct: 50,
      stopAnchor: "first",
      confirms: ["paReversal"],
      confirmMaxAgeBars: 20,
    }),
  ]
  for (const candidate of SEEDS) await evaluate(candidate)
  scores.forEach((score, index) =>
    console.log(`SEED${index}`, JSON.stringify(publicScore(score)))
  )

  for (let round = 0; round < rounds; round += 1) {
    const leaders = [...scores].sort((a, b) => scoreRank(b) - scoreRank(a))
    const started = Date.now()
    for (let i = 0; i < perRound; i += 1) {
      // Round 0 is pure exploration; later rounds spend 70% of their budget
      // mutating the leaders and 30% still exploring, so the search can escape
      // a local optimum instead of polishing one shape forever.
      const explore = round === 0 || random() < 0.3 || leaders.length === 0
      await evaluate(
        explore
          ? randomCandidate(random)
          : mutate(random, pick(random, leaders.slice(0, 8)).candidate)
      )
    }
    const best = [...scores].sort((a, b) => scoreRank(b) - scoreRank(a))[0]
    console.log(
      `ROUND ${round + 1}/${rounds} (${scores.length} tested, ${Math.round((Date.now() - started) / 1000)}s)`,
      JSON.stringify(publicScore(best))
    )
  }

  // A PERMISSIVE screen. The train leader is repeatedly not the robust winner —
  // the one configuration that survives every window earns only 0.85%/month on
  // train — so this filter only removes the plainly broken (wiped-out markets,
  // too few cycles) and hands the rest to the validate stage in size.
  const shortlist = [...scores]
    .filter(
      (score) =>
        score.warnings === 0 &&
        score.worstMarketPct > -90 &&
        score.cycles >= 40 &&
        score.portfolioDrawdownPct > -60 &&
        Math.abs(score.portfolioDrawdownPct) <= 35
    )
    .sort((a, b) => scoreRank(b) - scoreRank(a))
    .slice(0, 40)
  console.log(`SHORTLIST ${shortlist.length} of ${scores.length} tested`)

  const validateData = await loadPhase("validate", interval, ALTERNATE_MARKETS)
  const robust: { train: Score; validate: Score; worse: number }[] = []
  for (const score of shortlist) {
    try {
      const validateScore = await runCandidate(
        validateData,
        "validate",
        score.candidate,
        interval,
        COSTS
      )
      robust.push({
        train: score,
        validate: { ...validateScore, runs: [] },
        worse: Math.min(scoreRank(score), scoreRank(validateScore)),
      })
    } catch (error) {
      console.log("SKIP", (error as Error).message)
    }
  }
  robust.sort((a, b) => b.worse - a.worse)

  console.log("ROBUST_FINALISTS (ranked by the worse of train and validate)")
  for (const row of robust.slice(0, 12)) {
    console.log(
      JSON.stringify({
        train: {
          monthlyPct: round(row.train.monthlyPct),
          ddPct: round(row.train.portfolioDrawdownPct),
          green: `${row.train.greenMarkets}/${row.train.markets}`,
          cycles: row.train.cycles,
        },
        validate: {
          monthlyPct: round(row.validate.monthlyPct),
          ddPct: round(row.validate.portfolioDrawdownPct),
          green: `${row.validate.greenMarkets}/${row.validate.markets}`,
          cycles: row.validate.cycles,
        },
        candidate: row.train.candidate,
      })
    )
  }
  console.log("VALIDATION")
}

// ------------------------------------------------------------- modes -------

/**
 * Systematic one- or two-axis sweep: hold everything fixed, walk the named
 * field(s) through their whole grid, and report every window. Random search over
 * this many dimensions barely touches any single axis; this is how you actually
 * learn what a knob does.
 */
async function sweep(
  base: Candidate,
  interval: CandleInterval,
  fields: (keyof typeof GRID)[]
) {
  const phases = ["train", "validate", "final"] as const
  const data: Record<string, MarketData[]> = {}
  for (const phase of phases) {
    data[phase] = await loadPhase(phase, interval, ALTERNATE_MARKETS)
  }
  const axes = fields.map((f) => GRID[f] as readonly unknown[])
  let combos: Record<string, unknown>[] = [{}]
  for (let i = 0; i < fields.length; i += 1) {
    const next: Record<string, unknown>[] = []
    for (const combo of combos) {
      for (const value of axes[i]) next.push({ ...combo, [fields[i]]: value })
    }
    combos = next
  }
  console.log(`SWEEP ${fields.join(" x ")} — ${combos.length} combinations`)
  for (const combo of combos) {
    const candidate = candidateSchema.parse({ ...base, ...combo })
    const row: string[] = []
    for (const phase of phases) {
      const score = await runCandidate(
        data[phase],
        phase,
        candidate,
        interval,
        COSTS
      )
      row.push(
        `${phase}: ${round(score.monthlyPct).toFixed(2)}%/mo dd${round(score.portfolioDrawdownPct).toFixed(0)} grn${score.greenMarkets}/${score.markets} cyc${score.cycles}`
      )
    }
    console.log(
      fields.map((f) => `${f}=${combo[f]}`).join(" ").padEnd(46),
      row.join("  |  ")
    )
  }
}

/** One candidate across all three windows on the wide basket — the full-cycle
 * picture, so a strategy that only works in a bull market is visible as such. */
async function evaluate(candidate: Candidate, interval: CandleInterval) {
  for (const phase of ["train", "validate", "final"] as const) {
    const data = await loadPhase(phase, interval, ALTERNATE_MARKETS)
    const score = await runCandidate(data, phase, candidate, interval, COSTS)
    console.log(phase.toUpperCase().padEnd(9), JSON.stringify(publicScore(score)))
  }
}

/**
 * Open-position audit. A DCA ladder can end a window holding deeply underwater
 * bags, so this proves the headline return already carries them: it splits the
 * result into REALISED trade profit and the mark-to-market value of whatever is
 * still open, and checks the two reconcile to the reported equity.
 */
async function audit(candidate: Candidate, interval: CandleInterval) {
  for (const phase of ["train", "validate", "final"] as const) {
    const data = await loadPhase(phase, interval, ALTERNATE_MARKETS)
    const score = await runCandidate(data, phase, candidate, interval, COSTS)
    let realised = 0
    let openUnrealised = 0
    let openMarkets = 0
    let openCostBasis = 0
    for (const { result } of score.runs) {
      realised += result.trades.reduce((sum, trade) => sum + trade.pnl, 0)
      const open = result.openPosition
      if (open && Math.abs(open.szi) > 1e-9) {
        openMarkets += 1
        const lastClose = result.equityCurve.at(-1)
        // Ending equity already includes this; we recover it as
        // endingEquity - startingEquity - realised.
        openUnrealised +=
          result.stats.endingEquity - STARTING_EQUITY - 
          result.trades.reduce((sum, trade) => sum + trade.pnl, 0)
        openCostBasis += open.szi * open.entryPx
        void lastClose
      }
    }
    const total = realised + openUnrealised
    console.log(
      phase.toUpperCase().padEnd(9),
      JSON.stringify({
        reportedPct: round(score.totalPct),
        realisedPct: round((realised / STARTING_EQUITY) * 100),
        openMarkToMarketPct: round((openUnrealised / STARTING_EQUITY) * 100),
        reconcilesPct: round((total / STARTING_EQUITY) * 100),
        marketsStillHolding: `${openMarkets}/${score.markets}`,
        openCostBasisUsd: Math.round(openCostBasis),
      })
    )
  }
}

/** Where the money actually came from: per-market contribution and trade shape. */
async function profile(
  candidate: Candidate,
  interval: CandleInterval,
  phase: Phase
) {
  const data = await loadPhase(phase, interval, ALTERNATE_MARKETS)
  const score = await runCandidate(data, phase, candidate, interval, COSTS)
  const rows = score.runs
    .map(({ market, result }) => ({
      market,
      pnlPct: (result.stats.endingEquity - STARTING_EQUITY) / 100,
      trades: result.trades.length,
      wins: result.trades.filter((t) => t.pnl > 0).length,
      avgWinPct:
        result.trades.filter((t) => t.pnl > 0).length > 0
          ? result.trades
              .filter((t) => t.pnl > 0)
              .reduce((s, t) => s + t.returnPct, 0) /
            result.trades.filter((t) => t.pnl > 0).length
          : 0,
      avgLossPct:
        result.trades.filter((t) => t.pnl <= 0).length > 0
          ? result.trades
              .filter((t) => t.pnl <= 0)
              .reduce((s, t) => s + t.returnPct, 0) /
            result.trades.filter((t) => t.pnl <= 0).length
          : 0,
    }))
    .sort((a, b) => b.pnlPct - a.pnlPct)
  const total = rows.reduce((s, r) => s + r.pnlPct, 0)
  const allTrades = score.runs.flatMap((r) => r.result.trades)
  const wins = allTrades.filter((t) => t.pnl > 0)
  const losses = allTrades.filter((t) => t.pnl <= 0)
  console.log(`PHASE ${phase} — total ${round(total)}% across ${rows.length} markets`)
  console.log(
    `TRADES ${allTrades.length}  winRate ${round((wins.length / allTrades.length) * 100)}%  avgWin ${round(wins.reduce((s, t) => s + t.returnPct, 0) / Math.max(1, wins.length))}%  avgLoss ${round(losses.reduce((s, t) => s + t.returnPct, 0) / Math.max(1, losses.length))}%  medianHoldBars n/a`
  )
  const top = rows.slice(0, 8)
  const bottom = rows.slice(-5)
  console.log("TOP CONTRIBUTORS")
  for (const r of top)
    console.log(
      `  ${r.market.padEnd(7)} ${round(r.pnlPct).toFixed(1).padStart(8)}%  ${round((r.pnlPct / total) * 100).toFixed(1).padStart(5)}% of total  trades ${String(r.trades).padStart(3)}  win ${round((r.wins / Math.max(1, r.trades)) * 100)}%`
    )
  console.log("WORST")
  for (const r of bottom)
    console.log(
      `  ${r.market.padEnd(7)} ${round(r.pnlPct).toFixed(1).padStart(8)}%  trades ${String(r.trades).padStart(3)}`
    )
  const share = top.reduce((s, r) => s + r.pnlPct, 0) / total
  console.log(`TOP 8 MARKETS ARE ${round(share * 100)}% OF ALL PROFIT`)
}

/**
 * "All profits go into BTC."
 *
 * The ladder trades its wallet as normal, but every time the wallet rises above
 * its starting size the surplus is swept into BTC at that bar's price and never
 * sold. So the trading float stays constant, drawdowns come out of the float,
 * and everything the strategy earns accumulates as a BTC stack that rides the
 * recovery.
 *
 * This is a portfolio overlay, not an engine change: the ladder still closes its
 * cycles normally, so it keeps re-arming instead of being frozen holding bags.
 */
async function btcSweep(candidate: Candidate, interval: CandleInterval) {
  const btcRaw = await fetchCandleHistory(
    "BTC",
    interval,
    Date.parse(PHASES.train[0]) - 5 * 86_400_000,
    Date.parse(PHASES.final[1])
  )
  const btcAt = (time: number): number => {
    let lo = 0
    let hi = btcRaw.length - 1
    let best = btcRaw[0]?.c ?? 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (btcRaw[mid].t <= time) {
        best = btcRaw[mid].c
        lo = mid + 1
      } else hi = mid - 1
    }
    return best
  }

  let btcStack = 0
  let sweptUsd = 0
  let combinedPeak = STARTING_EQUITY
  let combinedDd = 0
  let btcPeak = 0
  let btcDd = 0
  let lastInBtc = 0
  for (const phase of ["train", "validate", "final"] as const) {
    const data = await loadPhase(phase, interval, ALTERNATE_MARKETS)
    const score = await runCandidate(data, phase, candidate, interval, COSTS)

    // Rebuild the ONE shared wallet curve: start + every market's delta.
    const times = [
      ...new Set(
        score.runs.flatMap(({ result }) => result.equityCurve.map((p) => p.t))
      ),
    ].sort((a, b) => a - b)
    const cursors = score.runs.map(() => 0)
    const deltas = score.runs.map(() => 0)
    let float = STARTING_EQUITY
    let carried = 0
    let peakFloat = STARTING_EQUITY
    let worstFloat = STARTING_EQUITY
    for (const time of times) {
      for (let i = 0; i < score.runs.length; i += 1) {
        const curve = score.runs[i].result.equityCurve
        while (cursors[i] < curve.length && curve[cursors[i]].t <= time) {
          deltas[i] = curve[cursors[i]].eq - STARTING_EQUITY
          cursors[i] += 1
        }
      }
      const raw = STARTING_EQUITY + deltas.reduce((sum, d) => sum + d, 0)
      float = raw - carried
      // Sweep everything above the starting float into BTC, and never sell it.
      if (float > STARTING_EQUITY) {
        const surplus = float - STARTING_EQUITY
        const px = btcAt(time)
        if (px > 0) {
          btcStack += surplus / px
          sweptUsd += surplus
          carried += surplus
          float = STARTING_EQUITY
        }
      }
      peakFloat = Math.max(peakFloat, float)
      worstFloat = Math.min(worstFloat, float)
      // Combined portfolio marked to market at every bar: the trading float plus
      // the BTC stack at that bar's price. Sampling only at phase ends hides the
      // real peak-to-trough.
      const combined = float + btcStack * btcAt(time)
      combinedPeak = Math.max(combinedPeak, combined)
      if (combinedPeak > 0) {
        combinedDd = Math.min(
          combinedDd,
          ((combined - combinedPeak) / combinedPeak) * 100
        )
      }
      // The same portfolio priced in BTC — the yardstick where "never sell"
      // actually means never lose.
      const px = btcAt(time)
      if (px > 0) {
        const inBtc = float / px + btcStack
        btcPeak = Math.max(btcPeak, inBtc)
        btcDd = Math.min(btcDd, ((inBtc - btcPeak) / btcPeak) * 100)
        lastInBtc = inBtc
      }
    }
    const endBtc = btcAt(times.at(-1) ?? 0)
    const btcValue = btcStack * endBtc
    const total = float + btcValue
    console.log(
      phase.toUpperCase().padEnd(9),
      JSON.stringify({
        tradingFloatUsd: Math.round(float),
        sweptIntoBtcUsd: Math.round(sweptUsd),
        btcStack: Number(btcStack.toFixed(4)),
        btcValueUsd: Math.round(btcValue),
        totalUsd: Math.round(total),
        totalPctOfStart: round(((total - STARTING_EQUITY) / STARTING_EQUITY) * 100),
        worstFloatUsd: Math.round(worstFloat),
        btcPx: Math.round(endBtc),
        worstCombinedDdPct: round(combinedDd),
        portfolioInBtc: Number(lastInBtc.toFixed(4)),
        worstDdPricedInBtcPct: round(btcDd),
      })
    )
  }
}

/** Save all three windows for one candidate so each can be inspected in the app. */
async function saveAll(
  candidate: Candidate,
  interval: CandleInterval,
  label: string
) {
  for (const phase of ["train", "validate", "final"] as const) {
    const data = await loadPhase(phase, interval, ALTERNATE_MARKETS)
    const score = await runCandidate(data, phase, candidate, interval, COSTS)
    console.log(phase.toUpperCase().padEnd(9), JSON.stringify(publicScore(score)))
    await save(score, interval, label)
  }
}

/**
 * Is the result distinguishable from luck? Bootstraps the sealed window's own
 * trades: resample them with replacement 5,000 times and see how often the
 * total comes out at or below zero. With few trades a good-looking average can
 * be one or two winners doing all the work, and this is what exposes that.
 */
async function significance(candidate: Candidate, interval: CandleInterval) {
  const data = await loadPhase("final", interval, ALTERNATE_MARKETS)
  const score = await runCandidate(data, "final", candidate, interval, COSTS)
  const trades = score.runs.flatMap(({ result }) => result.trades)
  const pnls = trades.map((trade) => trade.pnl)
  const total = pnls.reduce((sum, value) => sum + value, 0)
  const wins = pnls.filter((value) => value > 0)
  const sorted = [...pnls].sort((a, b) => b - a)
  const top5 = sorted.slice(0, 5).reduce((sum, value) => sum + value, 0)

  // Deterministic RNG so this is reproducible.
  let state = 12345
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const totals: number[] = []
  for (let i = 0; i < 5000; i += 1) {
    let sum = 0
    for (let j = 0; j < pnls.length; j += 1) {
      sum += pnls[Math.floor(rand() * pnls.length)]
    }
    totals.push(sum)
  }
  totals.sort((a, b) => a - b)
  const pct = (q: number) => totals[Math.floor(q * (totals.length - 1))]
  const losing = totals.filter((value) => value <= 0).length / totals.length

  console.log(
    JSON.stringify(
      {
        trades: pnls.length,
        totalUsd: Math.round(total),
        winRate: round((wins.length / pnls.length) * 100),
        top5TradesShareOfProfit: round((top5 / total) * 100),
        bootstrap5thPct: Math.round(pct(0.05)),
        bootstrapMedian: Math.round(pct(0.5)),
        bootstrap95thPct: Math.round(pct(0.95)),
        chanceOfLosingMoney: round(losing * 100),
      },
      null,
      1
    )
  )
}

async function smoke(interval: CandleInterval) {
  const data = await loadPhase("train", interval, MARKETS.slice(0, 4))
  const started = Date.now()
  const score = await runCandidate(data, "train", BASELINE, interval, COSTS)
  console.log("SMOKE", JSON.stringify(publicScore(score)))
  console.log(
    `elapsed ${Math.round((Date.now() - started) / 1000)}s for ${data.length} markets`
  )
}

async function final(candidate: Candidate, interval: CandleInterval) {
  // The wide basket at normal and stressed costs, plus the never-trained-on
  // markets alone — if the edge only exists on the coins it was tuned on, that
  // last number is where it shows.
  const data = await loadPhase("final", interval, ALTERNATE_MARKETS)
  const normal = await runCandidate(data, "final", candidate, interval, COSTS)
  const stress = await runCandidate(
    data,
    "final",
    candidate,
    interval,
    STRESS_COSTS
  )
  console.log("FINAL", JSON.stringify(publicScore(normal)))
  console.log("FINAL_STRESS", JSON.stringify(publicScore(stress)))

  const unseenData = await loadPhase("final", interval, [
    ...HELD_OUT_MARKETS,
    ...NEWER_MARKETS,
  ])
  const unseen = await runCandidate(
    unseenData,
    "final",
    candidate,
    interval,
    COSTS
  )
  console.log("FINAL_UNSEEN_COINS_ONLY", JSON.stringify(publicScore(unseen)))
  return { normal, stress, unseen }
}

async function save(
  score: Score,
  interval: CandleInterval,
  basket: string
) {
  // Imported HERE, not at the top. Static imports are hoisted and evaluated
  // before the .env.local loader above runs, so `db` would capture the default
  // connection (custom_shell on 54320, which has no trading tables) instead of
  // trading's own database on 54161.
  const { eq } = await import("drizzle-orm")
  const { db } = await import("@/server/db")
  const { createCompletedUserBacktest } = await import("@/server/backtests")
  const { customShellUsers } = await import("@/server/schema")
  const [user] = await db
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(eq(customShellUsers.email, "typham2@gmail.com"))
    .limit(1)
  if (!user) throw new Error("Backtest user not found")
  const c = score.candidate
  const name = `QFL ${interval} ${score.phase.toUpperCase()} ${basket} — base${c.basePeriods}/${c.pumpPeriods} crack${c.crackPct} fall${c.maxCrackBars} ${c.rungCount}rungs ${c.firstDeviation}+${c.deviationStep} pos${c.maxPositionPct} ramp${c.sizeMultiplier} ${c.rungEntry}${c.requireTwoGreen ? "+2green" : ""} tp:${c.tpMode}${c.tpMode === "moneyBackThenBase" ? `@${c.sellBelowBasePct}` : ""} sl${c.stopLossPct}/${c.stopAnchor}${c.trendFilterEnabled ? ` trendMA${c.trendMaBars}` : ""}${c.confirms.length ? ` confirm:${c.confirms.join("+")}@${c.confirmMaxAgeBars}bars` : ""} 1x ${score.costs.slippageBps}bps`
  let groupId: string | undefined
  for (const { market, result } of score.runs) {
    const row = await createCompletedUserBacktest(
      user.id,
      {
        name,
        groupId,
        automationId: null,
        market,
        network: "mainnet",
        interval: interval as AutomationConfig["interval"],
        params: configFor(score.candidate, interval),
        costs: score.costs,
        startTime: new Date(PHASES[score.phase][0]),
        endTime: new Date(PHASES[score.phase][1]),
        startingEquity: STARTING_EQUITY,
      },
      result
    )
    groupId ??= row.id
  }
  console.log("SAVED", groupId, name)
}

async function main() {
  const [mode = "smoke", intervalArg = "4h", candidateJson] =
    process.argv.slice(2)
  const interval = intervalArg as CandleInterval
  if (mode === "smoke") return smoke(interval)
  if (mode === "train") {
    // argv: [node, script, mode, interval, rounds, perRound, seed]
    const [rounds = "6", perRound = "40", seed = "1"] = process.argv.slice(4)
    return train(interval, Number(rounds), Number(perRound), Number(seed))
  }
  if (mode === "sweep") {
    const fields = (process.argv[5] ?? "stopLossPct").split(
      ","
    ) as (keyof typeof GRID)[]
    if (!candidateJson) throw new Error("Base candidate JSON is required")
    return sweep(
      candidateSchema.parse(JSON.parse(candidateJson)),
      interval,
      fields
    )
  }
  if (mode === "significance") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return significance(
      candidateSchema.parse(JSON.parse(candidateJson)),
      interval
    )
  }
  if (mode === "saveall") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return saveAll(
      candidateSchema.parse(JSON.parse(candidateJson)),
      interval,
      process.argv[5] ?? "wide57"
    )
  }
  if (mode === "btcsweep") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return btcSweep(candidateSchema.parse(JSON.parse(candidateJson)), interval)
  }
  if (mode === "profile") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return profile(
      candidateSchema.parse(JSON.parse(candidateJson)),
      interval,
      (process.argv[5] ?? "train") as Phase
    )
  }
  if (mode === "audit") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return audit(candidateSchema.parse(JSON.parse(candidateJson)), interval)
  }
  if (mode === "eval") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    return evaluate(candidateSchema.parse(JSON.parse(candidateJson)), interval)
  }
  if (mode === "final" || mode === "save") {
    if (!candidateJson) throw new Error("Candidate JSON is required")
    const candidate = candidateSchema.parse(JSON.parse(candidateJson))
    const result = await final(candidate, interval)
    if (mode === "save") {
      await save(result.normal, interval, "wide57")
      await save(result.stress, interval, "wide57")
      await save(result.unseen, interval, "unseen-coins")
    }
    return
  }
  throw new Error(`Unknown mode: ${mode}`)
}

await main()
process.exit(0)
