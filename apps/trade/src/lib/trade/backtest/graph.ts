import { DAY_MS } from "@/lib/format/format-time"

import { worstDip } from "./result"

/**
 * The sums behind the backtest Graph, with no React and no fetching in them.
 *
 * The screen's whole promise is that you drag a box across the pot's line and
 * every figure on the page answers for that stretch of time instead of the
 * whole run. That is arithmetic, and arithmetic belongs somewhere it can be
 * checked by a test rather than by squinting at a chart — see `graph.test.ts`.
 *
 * **What the run actually saved, and what is worked out here.** A finished run
 * stores two things per bar and nothing else: the pot (`equity`) and the money
 * it had at work (`inPlay`). How far below its own high it was, how many trades
 * were open, and how much of the pot was banked rather than on paper are all
 * derived here — the first from the pot's line alone, the last two by sweeping
 * the run's trades against it.
 */

/**
 * One round trip, stripped to what a question about a stretch of time needs.
 *
 * Deliberately not `BacktestTrade`: that carries prices, sizes and exit reasons
 * for one coin's chart, and the Graph asks about every coin at once. Six
 * numbers a trade keeps this small enough to send in one request.
 */
export type BacktestRunTrade = {
  coin: string
  entryAt: number
  /** Null while the trade is still open at the end of the run. */
  exitAt: number | null
  amountUsd: number
  /** After both fees. Zero while open. */
  pnl: number
  liquidated: boolean
}

/** One pot point as the run stored it. */
export type EquityPoint = { t: number; usd: number }

export type GraphSeries = {
  /** Bar times, ascending — the x of everything else. */
  t: number[]
  /** The pot at each bar. */
  usd: number[]
  /** Money at work at each bar. Empty on runs saved before it was kept. */
  inPlay: number[]
  /** How far below its own running high, as a percent — zero or negative. */
  offPeakPct: number[]
  /** How many trades were live. Null until the run's trades are in hand. */
  openCount: number[] | null
  /** The pot counting only banked trades. Null until the trades are in hand. */
  banked: number[] | null
  /**
   * How low the pot went **inside** each bar, as far as the trades can prove.
   *
   * The run writes the pot once a bar, at its close, so a crash and its
   * recovery inside one candle leave no mark: on 10 October 2025 the pot went
   * 21,421 → 39,392 between two four-hour stamps, with twenty-two liquidations
   * and a rally in between, and the line drew a clean step up.
   *
   * This is not a guess at the shape. Every trade that closed in a bar carries
   * what it lost, and those losses were taken before the bar ended, so the pot
   * was at least that far down at some instant inside it. Winners are left out
   * on purpose: a loss is money that was definitely gone by the close, while
   * assuming a winner had already banked would flatter the trough.
   *
   * A lower bound, then, never a story. Null until the trades are in hand.
   */
  trough: number[] | null
}

/**
 * The per-bar lines the graph draws.
 *
 * The two trade-derived lines are built with a difference array rather than by
 * asking "which trades were open?" at every bar. A three-year run at one-hour
 * bars against a few thousand trades is a hundred million comparisons done that
 * way, on every render; this is one pass over the trades and one over the bars.
 */
export function buildGraphSeries(
  equity: readonly EquityPoint[],
  /**
   * Missing entirely on runs saved before it was kept — the stored result is
   * read straight out of the database rather than parsed, so the schema's
   * default never runs on an old row. Treated as "nothing recorded", which
   * draws no exposure and leaves the wallet figures at zero rather than taking
   * the page down.
   */
  inPlay: readonly number[] | null | undefined,
  trades: readonly BacktestRunTrade[] | null,
  startingUsd: number
): GraphSeries {
  const atWork = inPlay ?? []
  const t = equity.map((point) => point.t)
  const usd = equity.map((point) => point.usd)

  const offPeakPct: number[] = new Array(usd.length)
  let high = Number.NEGATIVE_INFINITY
  for (let bar = 0; bar < usd.length; bar++) {
    if (usd[bar] > high) high = usd[bar]
    offPeakPct[bar] = high > 0 ? (usd[bar] / high - 1) * 100 : 0
  }

  if (!trades) {
    return {
      t,
      usd,
      inPlay: [...atWork],
      offPeakPct,
      openCount: null,
      banked: null,
      trough: null,
    }
  }

  const opens = new Array<number>(usd.length + 1).fill(0)
  const closes = new Array<number>(usd.length + 1).fill(0)
  const lost = new Array<number>(usd.length + 1).fill(0)
  for (const trade of trades) {
    const from = barAt(t, trade.entryAt)
    // A trade with no exit was still open when the run stopped, so it runs to
    // the last bar rather than being dropped — it is money that was at risk.
    const to = trade.exitAt === null ? usd.length - 1 : barAt(t, trade.exitAt)
    if (from > to) continue
    opens[from] += 1
    opens[to + 1] -= 1
    if (trade.exitAt !== null) {
      closes[to] += trade.pnl
      if (trade.pnl < 0) lost[to] += trade.pnl
    }
  }

  // The pot going into the bar, less everything that was lost during it. Bars
  // where nothing was lost sit at their own close, so the line is unchanged
  // anywhere a crash did not happen.
  const trough: number[] = new Array(usd.length)
  for (let bar = 0; bar < usd.length; bar++) {
    // No loss taken in the bar is no hole in it. Measuring every bar from the
    // one before would hang a wick off every rise, which says nothing except
    // that the pot went up.
    if (lost[bar] === 0) {
      trough[bar] = usd[bar]
      continue
    }
    const before = bar === 0 ? startingUsd : usd[bar - 1]
    trough[bar] = Math.min(usd[bar], before + lost[bar])
  }

  const openCount: number[] = new Array(usd.length)
  const banked: number[] = new Array(usd.length)
  let live = 0
  let takings = 0
  for (let bar = 0; bar < usd.length; bar++) {
    live += opens[bar]
    takings += closes[bar]
    openCount[bar] = live
    banked[bar] = startingUsd + takings
  }

  return {
    t,
    usd,
    inPlay: [...atWork],
    offPeakPct,
    openCount,
    banked,
    trough,
  }
}

/**
 * The bar a moment falls on — the last bar at or before it.
 *
 * Binary search rather than a scan, because it is called once per trade and a
 * run can hold thousands of both.
 */
export function barAt(times: readonly number[], at: number): number {
  if (times.length === 0) return 0
  if (at <= times[0]) return 0
  if (at >= times[times.length - 1]) return times.length - 1
  let low = 0
  let high = times.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (times[middle] <= at) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Every figure the tiles show, for one stretch of the run.
 *
 * The ones that need trades are null when the trades are not in hand — an old
 * run, or a page that has not finished loading them. Null draws a dash; a zero
 * would read as "none happened", which is a different and wrong answer.
 */
export type WindowStats = {
  /** What the window is: whole run, a preset, or a dragged box. */
  fromT: number
  toT: number
  bars: number
  days: number

  net: number
  netPct: number
  /** What the pot was worth going in — what `net` is measured against. */
  base: number

  worstDipPct: number
  worstDipUsd: number
  worstDipPeak: number
  worstDipAt: number | null
  /** Days from the low back to the old high. Null when it never got back. */
  recoveryDays: number | null

  peakWalletPct: number
  peakWalletUsd: number
  peakWalletAt: number
  typicalWalletPct: number
  typicalWalletUsd: number
  inCoinsUsd: number

  tradesClosed: number | null
  tradesWon: number | null
  profitFactor: number | null
  expectancy: number | null
  coinsTraded: number | null
  coinsGreen: number | null
  liquidatedCount: number | null
  liquidatedUsd: number | null
  timeInMarketPct: number | null
  avgHoldMs: number | null
  openNow: number | null
}

export function windowStats(
  series: GraphSeries,
  trades: readonly BacktestRunTrade[] | null,
  first: number,
  last: number,
  startingUsd: number
): WindowStats {
  const { t, usd, inPlay, openCount } = series
  const i0 = Math.max(0, Math.min(first, usd.length - 1))
  const i1 = Math.max(i0, Math.min(last, usd.length - 1))

  // What the pot was worth going in. On the whole run that is the money it
  // started with; on a window it is the pot as it stood at the left edge —
  // otherwise a window in the middle of a run that doubled reports the earlier
  // doubling as its own.
  const base = i0 === 0 ? startingUsd : usd[i0]
  const net = usd[i1] - base

  // Measured against the top it fell from inside this window, by the same rule
  // the whole run uses — never against what the run started with.
  const slice: EquityPoint[] = []
  for (let bar = i0; bar <= i1; bar++) slice.push({ t: t[bar], usd: usd[bar] })
  const dip = worstDip(slice)
  const dipAtBar = dip.at === null ? null : barAt(t, dip.at)
  let recoveryDays: number | null = null
  if (dipAtBar !== null && dip.peak > 0) {
    for (let bar = dipAtBar; bar <= i1; bar++) {
      if (usd[bar] >= dip.peak) {
        recoveryDays = Math.max(0, Math.round((t[bar] - t[dipAtBar]) / DAY_MS))
        break
      }
    }
  }

  let peakWalletPct = 0
  let peakWalletAt = i0
  let walletShareTotal = 0
  let walletUsdTotal = 0
  let barsInMarket = 0
  for (let bar = i0; bar <= i1; bar++) {
    const atWork = inPlay[bar] ?? 0
    const share = usd[bar] > 0 ? (atWork / usd[bar]) * 100 : 0
    if (share > peakWalletPct) {
      peakWalletPct = share
      peakWalletAt = bar
    }
    walletShareTotal += share
    walletUsdTotal += atWork
    if (openCount ? openCount[bar] > 0 : atWork > 0) barsInMarket++
  }
  const bars = i1 - i0 + 1

  const fromTheLine = {
    fromT: t[i0] ?? 0,
    toT: t[i1] ?? 0,
    bars,
    days: Math.max(1, Math.round(((t[i1] ?? 0) - (t[i0] ?? 0)) / DAY_MS)),
    net,
    netPct: base > 0 ? (net / base) * 100 : 0,
    base,
    worstDipPct: dip.peak > 0 ? (dip.usd / dip.peak) * 100 : 0,
    worstDipUsd: dip.usd,
    worstDipPeak: dip.peak,
    worstDipAt: dip.at,
    recoveryDays,
    peakWalletPct,
    peakWalletUsd: inPlay[peakWalletAt] ?? 0,
    peakWalletAt: t[peakWalletAt] ?? 0,
    typicalWalletPct: bars > 0 ? walletShareTotal / bars : 0,
    typicalWalletUsd: bars > 0 ? walletUsdTotal / bars : 0,
    inCoinsUsd: inPlay[i1] ?? 0,
  }

  if (!trades) {
    return {
      ...fromTheLine,
      tradesClosed: null,
      tradesWon: null,
      profitFactor: null,
      expectancy: null,
      coinsTraded: null,
      coinsGreen: null,
      liquidatedCount: null,
      liquidatedUsd: null,
      timeInMarketPct: null,
      avgHoldMs: null,
      openNow: null,
    }
  }

  // A trade belongs to the window it FINISHED in. A round trip is one event
  // with one answer, and counting it in every window it passed through would
  // let the same win be won three times.
  const from = t[i0] ?? 0
  const to = t[i1] ?? 0
  const closed = trades.filter(
    (trade) => trade.exitAt !== null && trade.exitAt >= from && trade.exitAt <= to
  )

  let grossProfit = 0
  let grossLoss = 0
  let holdTotal = 0
  let liquidatedCount = 0
  let liquidatedUsd = 0
  const byCoin = new Map<string, number>()
  for (const trade of closed) {
    if (trade.pnl > 0) grossProfit += trade.pnl
    else grossLoss += Math.abs(trade.pnl)
    holdTotal += (trade.exitAt ?? 0) - trade.entryAt
    if (trade.liquidated) {
      liquidatedCount++
      liquidatedUsd += trade.pnl
    }
    byCoin.set(trade.coin, (byCoin.get(trade.coin) ?? 0) + trade.pnl)
  }
  let coinsGreen = 0
  for (const total of byCoin.values()) if (total > 0) coinsGreen++

  return {
    ...fromTheLine,
    tradesClosed: closed.length,
    tradesWon: closed.filter((trade) => trade.pnl > 0).length,
    // Null, not infinity, when nothing lost money: "no losses to weigh against"
    // is not a ratio, and drawing it as one invites a comparison that has no
    // second side.
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancy: closed.length
      ? closed.reduce((sum, trade) => sum + trade.pnl, 0) / closed.length
      : 0,
    coinsTraded: byCoin.size,
    coinsGreen,
    liquidatedCount,
    liquidatedUsd,
    timeInMarketPct: bars > 0 ? (barsInMarket / bars) * 100 : 0,
    avgHoldMs: closed.length ? holdTotal / closed.length : 0,
    openNow: openCount ? openCount[i1] : null,
  }
}

export const GRAPH_PRESETS = ["1w", "1m", "3m", "6m", "all"] as const
export type GraphPreset = (typeof GRAPH_PRESETS)[number]

/** How the page is currently scoped: a preset or dates, plus a dragged box. */
export type GraphWindow = {
  preset: GraphPreset
  /** Typed dates, which beat the preset when they are set. */
  from: number | null
  to: number | null
  /** A box dragged across the graph, in bar numbers. */
  sel: [number, number] | null
}

export const WHOLE_RUN: GraphWindow = {
  preset: "all",
  from: null,
  to: null,
  sel: null,
}

const PRESET_DAYS: Record<GraphPreset, number | null> = {
  "1w": 7,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  all: null,
}

/**
 * The two ranges the screen works in: what the graph draws, and what the
 * figures answer for.
 *
 * They are different on purpose. Dragging a box does not zoom — the line stays
 * where it was so you can see the stretch you picked in the shape of the whole
 * run, with the rest of it still on screen either side. Only the figures narrow.
 */
export function graphView(
  series: GraphSeries,
  window: GraphWindow
): { view: [number, number]; stats: [number, number] } {
  const last = Math.max(0, series.t.length - 1)
  let view: [number, number] = [0, last]

  if (window.from !== null || window.to !== null) {
    const one = window.from !== null ? barAt(series.t, window.from) : 0
    const two = window.to !== null ? barAt(series.t, window.to) : last
    if (Math.abs(two - one) > 1) view = [Math.min(one, two), Math.max(one, two)]
  } else {
    const days = PRESET_DAYS[window.preset]
    if (days !== null && series.t.length > 1) {
      const barMs = Math.max(1, series.t[1] - series.t[0])
      const bars = Math.round((days * DAY_MS) / barMs)
      view = [Math.max(0, last - bars), last]
    }
  }

  let stats: [number, number] = view
  if (window.sel) {
    const one = Math.max(view[0], Math.min(window.sel[0], window.sel[1]))
    const two = Math.min(view[1], Math.max(window.sel[0], window.sel[1]))
    if (two - one > 1) stats = [one, two]
  }
  return { view, stats }
}

/**
 * Where the pot's axis should start and stop, and whether it is a log one.
 *
 * **Log only when the run needs it.** A run that ends at forty times what it
 * started with draws its first year as a flat line on an even axis — a fall
 * from $51,655 to $10,716, four fifths of everything there was, becomes
 * invisible while the headline still reports it. On a log axis a halving is
 * the same height wherever it happens, which is how a fall is actually judged.
 *
 * But most runs do not grow like that, and on those an even axis is easier to
 * read and gives the round gridlines the design draws. So the rule is the ratio
 * between the high and the low: past four times, the picture is being erased
 * and log wins.
 */
export function potScale(
  values: readonly number[],
  first: number,
  last: number
): { log: boolean; lo: number; hi: number } {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (let bar = first; bar <= last; bar++) {
    const value = values[bar]
    if (!Number.isFinite(value)) continue
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { log: false, lo: 0, hi: 1 }

  const log = lo > 0 && hi / lo > 4
  if (log) {
    // A log scale cannot draw zero, so the floor is explicit and sits below the
    // lowest the pot reached — otherwise the worst moment of the run is clipped
    // off the bottom of the picture that exists to show it.
    return { log: true, lo: lo * 0.9, hi: hi * 1.05 }
  }
  const span = Math.max(1, hi - lo)
  return { log: false, lo: lo - span * 0.1, hi: hi + span * 0.08 }
}

/**
 * Turns a pot value into a height, for whichever box is drawing it.
 *
 * Both charts on this screen draw the same line at different sizes, and both
 * have to honour the log rule above. Written once so the big one and the small
 * one cannot disagree about where a dollar sits — which they would, silently,
 * the first time only one of them was edited.
 *
 * `bottom` is the pixel the lowest value sits on and `height` is how far up the
 * highest one reaches.
 */
export function potHeight(
  scale: { log: boolean; lo: number; hi: number },
  bottom: number,
  height: number
): (value: number) => number {
  if (scale.log) {
    const low = Math.log(Math.max(1e-9, scale.lo))
    const high = Math.log(Math.max(low + 1e-9, scale.hi))
    return (value) =>
      bottom - ((Math.log(Math.max(1e-9, value)) - low) / (high - low)) * height
  }
  const span = Math.max(1e-9, scale.hi - scale.lo)
  return (value) => bottom - ((value - scale.lo) / span) * height
}

/**
 * The other way round: what a height on the chart is worth.
 *
 * The mirror of `potHeight`, and written beside it so the two cannot drift —
 * a crosshair that names a different dollar figure than the line it crosses is
 * worse than no crosshair.
 */
export function potValue(
  scale: { log: boolean; lo: number; hi: number },
  bottom: number,
  height: number
): (y: number) => number {
  if (scale.log) {
    const low = Math.log(Math.max(1e-9, scale.lo))
    const high = Math.log(Math.max(low + 1e-9, scale.hi))
    return (y) => Math.exp(low + ((bottom - y) / height) * (high - low))
  }
  const span = Math.max(1e-9, scale.hi - scale.lo)
  return (y) => scale.lo + ((bottom - y) / height) * span
}

/**
 * One line across a stretch of bars, at no more than a point per pixel.
 *
 * The stride is the whole reason this is shared. A two-year run at one-hour
 * bars is 17,000 points and a minute-bar run can be a million; drawing every
 * one of them puts a megabyte of path into the page to paint a line the same
 * shape. Both charts need that and neither should be trusted to remember it.
 *
 * With a `floor` it closes the shape into an area instead.
 */
export function linePath(
  values: readonly number[],
  first: number,
  last: number,
  xOf: (bar: number) => number,
  yOf: (value: number) => number,
  floor?: number
): string {
  const width = Math.max(60, Math.abs(xOf(last) - xOf(first)))
  const stride = Math.max(1, Math.ceil((last - first) / width))
  let path = ""
  for (let bar = first; bar <= last; bar += stride) {
    path +=
      (path ? "L" : "M") +
      xOf(bar).toFixed(1) +
      " " +
      yOf(values[bar] ?? 0).toFixed(1)
  }
  // Always finishes on the last bar, whatever the stride landed on: a line that
  // stops three bars early reads as a run that ended early.
  path += `L${xOf(last).toFixed(1)} ${yOf(values[last] ?? 0).toFixed(1)}`
  if (floor === undefined) return path
  return `${path}L${xOf(last).toFixed(1)} ${floor.toFixed(1)}L${xOf(first).toFixed(1)} ${floor.toFixed(1)}Z`
}

/**
 * Where to rule the gridlines for a pot axis.
 *
 * **A log axis needs its own ticks.** Evenly-spaced values are the wrong
 * answer on one: a run from $1,000 to $400,000 would be ruled at $100k, $200k,
 * $300k and $400k, all four bunched into the top quarter, leaving the years
 * where the money actually was without a single line to read against. So a log
 * axis is ruled at 1, 2 and 5 times each power of ten, which is evenly spaced
 * once the scale is applied.
 */
export function potTicks(scale: {
  log: boolean
  lo: number
  hi: number
}): number[] {
  if (!scale.log) return niceTicks(scale.lo, scale.hi)
  const ticks: number[] = []
  let power = Math.floor(Math.log10(Math.max(1e-9, scale.lo)))
  // Ten powers of ten is a run from a dollar to ten billion; the guard is only
  // here so a nonsense scale cannot spin forever.
  for (let step = 0; step < 12; step++, power++) {
    for (const multiple of [1, 2, 5]) {
      const value = multiple * Math.pow(10, power)
      if (value < scale.lo) continue
      if (value > scale.hi) return ticks
      ticks.push(value)
    }
  }
  return ticks
}

/** Round gridline values across a span — 1, 2, 2.5 or 5 times a power of ten. */
export function niceTicks(lo: number, hi: number, wanted = 4): number[] {
  const rough = (hi - lo) / Math.max(1, wanted)
  if (!Number.isFinite(rough) || rough <= 0) return []
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const step =
    [1, 2, 2.5, 5, 10].map((one) => one * magnitude).find((one) => one >= rough) ??
    magnitude * 10
  const ticks: number[] = []
  for (let value = Math.ceil(lo / step) * step; value < hi; value += step) {
    ticks.push(value)
  }
  return ticks
}
