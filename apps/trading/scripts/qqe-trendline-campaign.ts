import { eq } from "drizzle-orm"
import { z } from "zod"

import type { ResolvedAutomationAction } from "@/lib/automations/automation"
import type { BacktestCosts, BacktestResult } from "@/lib/backtest/types"
import { computeTrendlines } from "@/lib/strategies/trendline"
import { computeQqeSeries, type QqeInputs } from "@/lib/strategies/qqe"
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
  breakBuffer: z.number().min(0).max(10),
  lookbackBars: z.number().int().min(1).max(500),
  stopLossPct: z.number().positive().max(100),
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

function automationConfig(candidate: Candidate): AutomationConfig {
  const qqe = {
    type: "qqe" as const,
    params: {
      ...qqeInputs(candidate),
      consolidationFilter: false,
      loopbackPeriod: 50,
      minConsolidationLen: 5,
      swingLookback: 50,
    },
  }
  const trendline = {
    type: "trendline" as const,
    params: {
      swingLookback: candidate.swingLookback,
      breakBuffer: candidate.breakBuffer,
      requireCounterSlope: true,
    },
  }
  const trigger = (side: "buy" | "sell") => ({
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
  return {
    v: 2,
    kind: "automation",
    interval: INTERVAL,
    rules: [
      {
        id: "qqe-trendline-long",
        action: "buy",
        targetEquityPct: 100,
        condition: trigger("buy"),
      },
      {
        id: "qqe-trendline-short",
        action: "short",
        targetEquityPct: 100,
        condition: trigger("sell"),
      },
    ],
    protection: {
      long: { stopLossPct: candidate.stopLossPct },
      short: { stopLossPct: candidate.stopLossPct },
    },
  }
}

function actionMap(
  candles: HistoryCandle[],
  qqe: SignalSeries,
  trendline: SignalSeries | null,
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
  }
  return actions
}

function cachedStrategy(
  actions: Map<number, ResolvedAutomationAction>,
  config: AutomationConfig
): Strategy<never, AutomationState> {
  const strategy = createAutomationStrategy(config)
  return {
    ...strategy,
    onCandleClose: (ctx, _params, candle) => {
      ctx.setState({
        ...ctx.state,
        pendingAction: actions.get(Number(candle.t)) ?? null,
        lastEvaluatedCandleTime: Number(candle.t),
      })
    },
  }
}

async function loadPhase(phase: Phase): Promise<MarketData[]> {
  const [startIso, endIso] = PHASES[phase]
  const simStartMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  const fetchStart = simStartMs - WARMUP_BARS * INTERVAL_MS[INTERVAL]
  const out: MarketData[] = []
  for (const market of MARKETS) {
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
  candidate: Candidate | null,
  costs: BacktestCosts
): Score {
  const runs = data.map(({ market, candles, simStartMs }) => {
    const qqe = computeQqeSeries(
      candles,
      candidate
        ? qqeInputs(candidate)
        : {
            rsiPeriod: 14,
            rsiSmoothing: 5,
            qqeFactor: 4.238,
            threshold: 8,
            maType: "EMA",
            rsiSource: "close",
          }
    )
    const trendline = candidate
      ? computeTrendlines(candles, {
          swingLookback: candidate.swingLookback,
          breakBuffer: candidate.breakBuffer,
          requireCounterSlope: true,
        })
      : null
    const actions = candidate
      ? actionMap(candles, qqe, trendline, candidate.lookbackBars)
      : actionMap(candles, qqe, null, 1)
    const params = candidate
      ? automationConfig(candidate)
      : automationConfig({
          threshold: 8,
          smoothing: 5,
          swingLookback: 30,
          breakBuffer: 0.1,
          lookbackBars: 1,
          stopLossPct: 10,
        })
    return {
      market,
      result: runBacktest({
        strategy: cachedStrategy(actions, params),
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
  return summarize(phase, costs, candidate, runs)
}

function candidates(): Candidate[] {
  const out: Candidate[] = []
  for (const threshold of [6, 8, 10])
    for (const swingLookback of [10, 20, 30, 50])
      for (const lookbackBars of [6, 12, 24, 48])
        for (const stopLossPct of [5, 10, 15])
          out.push({
            threshold,
            smoothing: 5,
            swingLookback,
            breakBuffer: 0.1,
            lookbackBars,
            stopLossPct,
          })
  return out
}

async function train() {
  const trainData = await loadPhase("train")
  const baseline = runCandidate(trainData, "train", null, COSTS)
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
  const baseline = runCandidate(data, "final", null, COSTS)
  const normal = runCandidate(data, "final", candidate, COSTS)
  const stress = runCandidate(data, "final", candidate, STRESS_COSTS)
  console.log("FINAL_QQE_ONLY", JSON.stringify(publicScore(baseline)))
  console.log("FINAL", JSON.stringify(publicScore(normal)))
  console.log("FINAL_STRESS", JSON.stringify(publicScore(stress)))
  return { normal, stress }
}

async function save(score: Score) {
  const [user] = await db
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(eq(customShellUsers.email, "typham2@gmail.com"))
    .limit(1)
  if (!user) throw new Error("Backtest user not found")
  if (!score.candidate) throw new Error("Cannot save a baseline run")
  const name = `QQE + Trendline 4h WF OOS — thr${score.candidate.threshold} sf${score.candidate.smoothing} swing${score.candidate.swingLookback} buf${score.candidate.breakBuffer} age${score.candidate.lookbackBars} stop${score.candidate.stopLossPct} 1x ${score.costs.slippageBps}bps slip`
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
  if (mode !== "final" && mode !== "save") {
    throw new Error(`Unknown mode: ${mode}`)
  }
  if (!candidateJson) throw new Error("Candidate JSON is required")
  const candidate = candidateSchema.parse(JSON.parse(candidateJson))
  const result = await final(candidate)
  if (mode === "save") {
    await save(result.normal)
    await save(result.stress)
  }
}

await main()
process.exit(0)
