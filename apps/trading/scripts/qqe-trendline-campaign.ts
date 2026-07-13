import { eq } from "drizzle-orm"
import { z } from "zod"

import type { ResolvedAutomationAction } from "@/lib/automations/automation"
import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import { computeTrendlines } from "@/lib/strategies/trendline"
import {
  computeConsolidation,
  computeQqeSeries,
  type QqeInputs,
} from "@/lib/strategies/qqe"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import { db } from "@/server/db"
import { createUserBacktest, finishUserBacktest } from "@/server/backtests"
import {
  fetchCandleHistory,
  INTERVAL_MS,
  type HistoryCandle,
} from "@/server/backtest/history"
import { customShellUsers } from "@/server/schema"
import { runBacktest } from "../worker/src/backtest/runner"
import {
  createAutomationStrategy,
  type AutomationState,
} from "../worker/src/engine/automation-strategy"
import type { Strategy } from "../worker/src/strategies/contract"

const MARKETS = [
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "SOL",
  "LINK",
  "LTC",
  "BCH",
  "DOT",
  "UNI",
  "AVAX",
  "AAVE",
  "FIL",
  "ATOM",
  "ETC",
  "XLM",
  "TRX",
  "EOS",
  "VET",
  "NEO",
  "THETA",
  "ALGO",
  "MKR",
] as const

const ALTERNATE_MARKETS = [
  "APE",
  "APT",
  "ARB",
  "COMP",
  "CRV",
  "DASH",
  "DYDX",
  "EGLD",
  "ENJ",
  "FET",
  "GALA",
  "ICP",
  "INJ",
  "IOTA",
  "KSM",
  "MANA",
  "NEAR",
  "ONT",
  "OP",
  "ORDI",
  "RUNE",
  "SAND",
  "SEI",
  "SUI",
  "SUSHI",
] as const

const INTERVAL = "4h" as const
const STARTING_EQUITY = 10_000
const COSTS: BacktestCosts = {
  takerFeeBps: 4.5,
  makerFeeBps: 1.5,
  slippageBps: 4,
}
const STRESS_COSTS: BacktestCosts = { ...COSTS, slippageBps: 8 }
const WARMUP_BARS = 500

const PHASES = {
  train: ["2022-07-01T00:00:00Z", "2025-01-01T00:00:00Z"],
  validate: ["2025-01-01T00:00:00Z", "2025-10-01T00:00:00Z"],
  final: ["2025-10-01T00:00:00Z", "2026-07-01T00:00:00Z"],
} as const

type Phase = keyof typeof PHASES

const candidateSchema = z.object({
  threshold: z.number().min(0).max(100),
  smoothing: z.number().int().min(1).max(100),
  swingLookback: z.number().int().min(2).max(400),
  confirmationBars: z.number().int().min(1).max(20),
  breakBuffer: z.number().min(0).max(10),
  stopBuffer: z.number().min(0).max(20),
  lookbackBars: z.number().int().min(1).max(500),
})

type Candidate = z.infer<typeof candidateSchema>

type MarketData = {
  market: string
  candles: HistoryCandle[]
  simStartMs: number
}

type MarketRun = {
  market: string
  result: BacktestResult
}

type Score = {
  candidate: Candidate | null
  phase: Phase
  costs: BacktestCosts
  monthlyPct: number
  totalPct: number
  portfolioDrawdownPct: number
  greenMarkets: number
  markets: number
  trades: number
  worstMarketPct: number
  worstMarketDrawdownPct: number
  warnings: number
  runs: MarketRun[]
}

type SignalSeries = { buy: boolean[]; sell: boolean[] }
type TrendlineSeries = SignalSeries & {
  resistance: number[]
  support: number[]
}
type CampaignState = AutomationState & {
  activeStop: number | null
  pendingStop: number | null
}

const QQE_BASELINE: Candidate = {
  threshold: 8,
  smoothing: 5,
  swingLookback: 30,
  confirmationBars: 2,
  breakBuffer: 0.1,
  stopBuffer: 0.5,
  lookbackBars: 48,
}

const round = (value: number) => Math.round(value * 100) / 100

function qqeInputs(candidate: Candidate): QqeInputs {
  return {
    rsiPeriod: 14,
    rsiSmoothing: candidate.smoothing,
    qqeFactor: 4.238,
    threshold: candidate.threshold,
    maType: "EMA",
    rsiSource: "close",
  }
}

function automationConfig(
  candidate: Candidate,
  withTrendline = true
): AutomationConfig {
  const qqe = {
    type: "qqe" as const,
    params: {
      ...qqeInputs(candidate),
      consolidationFilter: true,
      loopbackPeriod: 50,
      minConsolidationLen: 5,
      swingLookback: 50,
    },
  }
  const trendline = {
    type: "trendline" as const,
    params: {
      swingLookback: candidate.swingLookback,
      confirmationBars: candidate.confirmationBars,
      breakBuffer: candidate.breakBuffer,
      requireCounterSlope: true,
    },
  }
  const combinedTrigger = (side: "buy" | "sell") => ({
    kind: "trigger" as const,
    nodeId: "trendline",
    indicator: trendline,
    side,
    filters: [
      {
        nodeId: "qqe",
        indicator: qqe,
        maxAgeBars: candidate.lookbackBars,
      },
    ],
  })
  const qqeTrigger = (side: "buy" | "sell") => ({
    kind: "trigger" as const,
    nodeId: "qqe",
    indicator: qqe,
    side,
  })
  return {
    v: 2,
    kind: "automation",
    interval: INTERVAL,
    rules: [
      {
        id: "qqe-trendline-long",
        action: "buy",
        targetEquityPct: 100,
        condition: withTrendline ? combinedTrigger("buy") : qqeTrigger("buy"),
      },
      {
        id: "qqe-trendline-short",
        action: "short",
        targetEquityPct: 100,
        condition: withTrendline ? combinedTrigger("sell") : qqeTrigger("sell"),
      },
    ],
    protection: {
      long: {},
      short: {},
    },
  }
}

function actionMap(
  candles: HistoryCandle[],
  qqe: SignalSeries,
  trendline: TrendlineSeries | null,
  lookbackBars: number
): Map<number, ResolvedAutomationAction> {
  const actions = new Map<number, ResolvedAutomationAction>()
  let latch: { side: "buy" | "sell"; index: number } | null = null
  for (let i = 0; i < candles.length; i += 1) {
    if (!trendline) {
      const side = qqe.buy[i] ? "buy" : qqe.sell[i] ? "sell" : null
      if (side) {
        actions.set(candles[i].t, {
          action: side === "buy" ? "buy" : "short",
          targetEquityPct: 100,
        })
      }
      continue
    }

    if (qqe.buy[i]) latch = { side: "buy", index: i }
    else if (qqe.sell[i]) latch = { side: "sell", index: i }

    const side = trendline.buy[i] ? "buy" : trendline.sell[i] ? "sell" : null
    if (!side) continue
    if (!latch || latch.side !== side || i - latch.index >= lookbackBars) {
      continue
    }
    actions.set(candles[i].t, {
      action: side === "buy" ? "buy" : "short",
      targetEquityPct: 100,
    })
    latch = null
  }
  return actions
}

function cachedStrategy(
  actions: Map<number, ResolvedAutomationAction>,
  config: AutomationConfig,
  exitSignals: Map<number, "buy" | "sell">,
  entryStops: Map<number, number>
): Strategy<never, CampaignState> {
  const strategy = createAutomationStrategy(config)
  return {
    ...strategy,
    init: () => ({
      ...strategy.init(undefined as never),
      activeStop: null,
      pendingStop: null,
    }),
    onCandleClose: (ctx, _params, candle) => {
      const time = Number(candle.t)
      const entryAction = actions.get(time) ?? null
      const exitSide = exitSignals.get(time)
      const positionSize = Number(ctx.position?.szi ?? 0)
      const shouldClose =
        !entryAction &&
        ((positionSize > 0 && exitSide === "sell") ||
          (positionSize < 0 && exitSide === "buy"))
      ctx.setState({
        ...ctx.state,
        pendingAction: shouldClose ? { action: "close" } : entryAction,
        pendingStop: entryAction ? (entryStops.get(time) ?? null) : null,
        lastEvaluatedCandleTime: time,
      })
    },
    onTick: (ctx) => {
      if (ctx.state.exitRequested || !ctx.position || !ctx.state.activeStop) {
        return
      }
      const positionSize = Number(ctx.position.szi)
      const price = Number(ctx.mid)
      const hit =
        positionSize > 0
          ? price <= ctx.state.activeStop
          : price >= ctx.state.activeStop
      if (hit) {
        ctx.setState({
          ...ctx.state,
          pendingAction: null,
          exitRequested: true,
        })
      }
    },
    onFill: (ctx) => {
      if (ctx.position && ctx.state.pendingStop) {
        ctx.setState({
          ...ctx.state,
          activeStop: ctx.state.pendingStop,
          pendingStop: null,
        })
      } else if (!ctx.position && !ctx.state.pendingStop) {
        ctx.setState({ ...ctx.state, activeStop: null })
      }
    },
    exitTriggers: (ctx) =>
      ctx.position && ctx.state.activeStop && !ctx.state.exitRequested
        ? [ctx.state.activeStop]
        : [],
  }
}

async function loadPhase(
  phase: Phase,
  markets: readonly string[] = MARKETS
): Promise<MarketData[]> {
  const [startIso, endIso] = PHASES[phase]
  const simStartMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  const fetchStart = simStartMs - WARMUP_BARS * INTERVAL_MS[INTERVAL]
  const out: MarketData[] = []
  for (const market of markets) {
    const candles = await fetchCandleHistory(
      market,
      INTERVAL,
      fetchStart,
      endMs
    )
    const simBars = candles.filter((candle) => candle.t >= simStartMs).length
    if (simBars < 300) {
      console.log(`[${phase}] skip ${market}: only ${simBars} bars`)
      continue
    }
    out.push({ market, candles, simStartMs })
    console.log(`[${phase}] loaded ${market}: ${simBars} bars`)
  }
  return out
}

function blendDrawdown(runs: MarketRun[]): number {
  const times = [
    ...new Set(
      runs.flatMap(({ result }) => result.equityCurve.map((p) => p.t))
    ),
  ].sort((a, b) => a - b)
  const cursors = runs.map(() => 0)
  const equity = runs.map(() => STARTING_EQUITY)
  let peak = STARTING_EQUITY * runs.length
  let maxDrawdown = 0
  for (const time of times) {
    for (let i = 0; i < runs.length; i += 1) {
      const curve = runs[i].result.equityCurve
      while (cursors[i] < curve.length && curve[cursors[i]].t <= time) {
        equity[i] = curve[cursors[i]].eq
        cursors[i] += 1
      }
    }
    const total = equity.reduce((sum, value) => sum + value, 0)
    peak = Math.max(peak, total)
    maxDrawdown = Math.min(maxDrawdown, ((total - peak) / peak) * 100)
  }
  return maxDrawdown
}

function summarize(
  phase: Phase,
  costs: BacktestCosts,
  candidate: Candidate | null,
  runs: MarketRun[]
): Score {
  const start = STARTING_EQUITY * runs.length
  const end = runs.reduce((sum, run) => sum + run.result.stats.endingEquity, 0)
  const totalPct = ((end - start) / start) * 100
  const [startIso, endIso] = PHASES[phase]
  const months =
    (Date.parse(endIso) - Date.parse(startIso)) / (86_400_000 * 30.4375)
  return {
    candidate,
    phase,
    costs,
    monthlyPct: totalPct / months,
    totalPct,
    portfolioDrawdownPct: blendDrawdown(runs),
    greenMarkets: runs.filter((run) => run.result.stats.netPnlPct > 0).length,
    markets: runs.length,
    trades: runs.reduce((sum, run) => sum + run.result.trades.length, 0),
    worstMarketPct: Math.min(...runs.map((run) => run.result.stats.netPnlPct)),
    worstMarketDrawdownPct: Math.min(
      ...runs.map((run) => -run.result.stats.maxDrawdownPct)
    ),
    warnings: runs.reduce(
      (sum, run) => sum + (run.result.stats.warnings?.length ?? 0),
      0
    ),
    runs,
  }
}

function publicScore(score: Score) {
  return {
    candidate: score.candidate,
    phase: score.phase,
    slippageBps: score.costs.slippageBps,
    monthlyPct: round(score.monthlyPct),
    totalPct: round(score.totalPct),
    portfolioDrawdownPct: round(score.portfolioDrawdownPct),
    greenMarkets: `${score.greenMarkets}/${score.markets}`,
    trades: score.trades,
    worstMarketPct: round(score.worstMarketPct),
    worstMarketDrawdownPct: round(score.worstMarketDrawdownPct),
    warnings: score.warnings,
  }
}

function scoreRank(score: Score): number {
  const greenRatio = score.greenMarkets / score.markets
  const drawdownPenalty = Math.max(0, Math.abs(score.portfolioDrawdownPct) - 20)
  const wipeoutPenalty = score.worstMarketPct <= -90 ? 100 : 0
  return (
    score.monthlyPct +
    greenRatio * 4 -
    drawdownPenalty -
    score.warnings * 20 -
    wipeoutPenalty
  )
}

function runCandidate(
  data: MarketData[],
  phase: Phase,
  candidate: Candidate,
  costs: BacktestCosts,
  withTrendline = true
): Score {
  const runs = data.map(({ market, candles, simStartMs }) => {
    const qqe = computeQqeSeries(candles, qqeInputs(candidate))
    const consolidation = computeConsolidation(candles, 50, 5)
    const qqeSignals = {
      buy: qqe.buy.map(
        (signal, index) => signal && !consolidation.inZone[index]
      ),
      sell: qqe.sell.map(
        (signal, index) => signal && !consolidation.inZone[index]
      ),
    }
    const trendline = withTrendline
      ? computeTrendlines(candles, {
          swingLookback: candidate.swingLookback,
          confirmationBars: candidate.confirmationBars,
          breakBuffer: candidate.breakBuffer,
          requireCounterSlope: true,
        })
      : null
    const actions = actionMap(
      candles,
      qqeSignals,
      trendline,
      candidate.lookbackBars
    )
    const exitSignals = new Map<number, "buy" | "sell">()
    const entryStops = new Map<number, number>()
    if (withTrendline) {
      for (let i = 0; i < candles.length; i += 1) {
        if (qqe.buy[i]) exitSignals.set(candles[i].t, "buy")
        else if (qqe.sell[i]) exitSignals.set(candles[i].t, "sell")
        const action = actions.get(candles[i].t)
        if (action?.action === "buy") {
          const line = trendline!.resistance[i]
          entryStops.set(candles[i].t, line * (1 - candidate.stopBuffer / 100))
        } else if (action?.action === "short") {
          const line = trendline!.support[i]
          entryStops.set(candles[i].t, line * (1 + candidate.stopBuffer / 100))
        }
      }
    }
    const params = automationConfig(candidate, withTrendline)
    return {
      market,
      result: runBacktest({
        strategy: cachedStrategy(actions, params, exitSignals, entryStops),
        params,
        candles,
        simStartMs,
        startingEquity: STARTING_EQUITY,
        market,
        interval: INTERVAL,
        costs,
      }),
    }
  })
  return summarize(phase, costs, withTrendline ? candidate : null, runs)
}

function candidates(): Candidate[] {
  const out: Candidate[] = []
  for (const swingLookback of [10, 15, 20, 30])
    for (const confirmationBars of [1, 2, 3, 5])
      for (const lookbackBars of [12, 24, 48, 500])
        for (const stopBuffer of [0.25, 0.5, 1, 2])
          out.push({
            threshold: 8,
            smoothing: 5,
            swingLookback,
            confirmationBars,
            breakBuffer: 0.1,
            stopBuffer,
            lookbackBars,
          })
  return out
}

async function train() {
  const trainData = await loadPhase("train")
  const baseline = runCandidate(trainData, "train", QQE_BASELINE, COSTS, false)
  console.log("BASELINE", JSON.stringify(publicScore(baseline)))
  const scores: Score[] = []
  const grid = candidates()
  for (let i = 0; i < grid.length; i += 1) {
    const score = runCandidate(trainData, "train", grid[i], COSTS)
    scores.push(score)
    if ((i + 1) % 12 === 0) {
      const best = [...scores].sort((a, b) => scoreRank(b) - scoreRank(a))[0]
      console.log(
        `TRAIN ${i + 1}/${grid.length}`,
        JSON.stringify(publicScore(best))
      )
    }
  }
  const finalists = scores
    .filter(
      (score) =>
        score.greenMarkets > score.markets / 2 &&
        score.warnings === 0 &&
        score.worstMarketPct > -90
    )
    .sort((a, b) => scoreRank(b) - scoreRank(a))
    .slice(0, 12)
  console.log("TRAIN_FINALISTS")
  finalists.forEach((score) => console.log(JSON.stringify(publicScore(score))))

  const validationData = await loadPhase("validate")
  const validation = finalists
    .map((score) =>
      runCandidate(validationData, "validate", score.candidate, COSTS)
    )
    .sort((a, b) => scoreRank(b) - scoreRank(a))
  console.log("VALIDATION")
  validation.forEach((score) => console.log(JSON.stringify(publicScore(score))))
}

async function final(candidate: Candidate) {
  const data = await loadPhase("final")
  const baseline = runCandidate(data, "final", QQE_BASELINE, COSTS, false)
  const normal = runCandidate(data, "final", candidate, COSTS)
  const stress = runCandidate(data, "final", candidate, STRESS_COSTS)
  console.log("FINAL_QQE_ONLY", JSON.stringify(publicScore(baseline)))
  console.log("FINAL", JSON.stringify(publicScore(normal)))
  console.log("FINAL_STRESS", JSON.stringify(publicScore(stress)))
  return { normal, stress }
}

async function validate(candidate: Candidate) {
  const data = await loadPhase("validate")
  const normal = runCandidate(data, "validate", candidate, COSTS)
  console.log("VALIDATE", JSON.stringify(publicScore(normal)))
}

async function holdout(candidate: Candidate) {
  const data = await loadPhase("final", ALTERNATE_MARKETS)
  const normal = runCandidate(data, "final", candidate, COSTS)
  const stress = runCandidate(data, "final", candidate, STRESS_COSTS)
  console.log("ALTERNATE_HOLDOUT", JSON.stringify(publicScore(normal)))
  console.log("ALTERNATE_HOLDOUT_STRESS", JSON.stringify(publicScore(stress)))
  return { normal, stress }
}

async function extended(candidate: Candidate) {
  const primary = await loadPhase("final")
  const alternate = await loadPhase("final", ALTERNATE_MARKETS)
  const data = [...primary, ...alternate]
  const baseline = runCandidate(data, "final", QQE_BASELINE, COSTS, false)
  const normal = runCandidate(data, "final", candidate, COSTS)
  const stress = runCandidate(data, "final", candidate, STRESS_COSTS)
  console.log("EXTENDED_QQE_ONLY", JSON.stringify(publicScore(baseline)))
  console.log("EXTENDED", JSON.stringify(publicScore(normal)))
  console.log("EXTENDED_STRESS", JSON.stringify(publicScore(stress)))
}

async function save(score: Score, basket = "primary24") {
  const [user] = await db
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(eq(customShellUsers.email, "typham2@gmail.com"))
    .limit(1)
  if (!user) throw new Error("Backtest user not found")
  if (!score.candidate) throw new Error("Cannot save a baseline run")
  const name = `QQE + Trendline 4h WF OOS ${basket} — thr${score.candidate.threshold} sf${score.candidate.smoothing} swing${score.candidate.swingLookback} confirm${score.candidate.confirmationBars} break${score.candidate.breakBuffer} stopBuf${score.candidate.stopBuffer} age${score.candidate.lookbackBars} lineSL QQE-exit 1x ${score.costs.slippageBps}bps slip`
  let groupId: string | undefined
  for (const { market, result } of score.runs) {
    const row = await createUserBacktest(user.id, {
      name,
      groupId,
      automationId: null,
      market,
      network: "mainnet",
      interval: INTERVAL,
      params: automationConfig(score.candidate),
      costs: score.costs,
      startTime: new Date(PHASES.final[0]),
      endTime: new Date(PHASES.final[1]),
      startingEquity: STARTING_EQUITY,
    })
    groupId ??= row.id
    await finishUserBacktest(row.id, result)
  }
  console.log("SAVED", groupId, name)
}

async function main() {
  const [mode = "train", candidateJson] = process.argv.slice(2)
  if (mode === "train") return train()
  if (
    mode !== "final" &&
    mode !== "save" &&
    mode !== "save-holdout" &&
    mode !== "validate" &&
    mode !== "holdout" &&
    mode !== "extended"
  ) {
    throw new Error(`Unknown mode: ${mode}`)
  }
  if (!candidateJson) throw new Error("Candidate JSON is required")
  const candidate = candidateSchema.parse(JSON.parse(candidateJson))
  if (mode === "validate") return validate(candidate)
  if (mode === "holdout") return holdout(candidate)
  if (mode === "save-holdout") {
    const result = await holdout(candidate)
    await save(result.normal, "alternate25")
    await save(result.stress, "alternate25")
    return
  }
  if (mode === "extended") return extended(candidate)
  const result = await final(candidate)
  if (mode === "save") {
    await save(result.normal)
    await save(result.stress)
  }
}

await main()
process.exit(0)
