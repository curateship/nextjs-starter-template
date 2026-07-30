import type { PnlCostEntry, PnlTrade, PnlWallet } from "@/lib/api/pnl"
import { compactUsd, pct, signedCompactUsd } from "@/lib/format"

// ————————————————————————————————————————————————————————————————
// Constants
// ————————————————————————————————————————————————————————————————

// Trading polarity, consistent with the price chart and calendar.
export const UP = "#089981"
export const DOWN = "#f23645"
export const UP_RGB = "8, 153, 129"
export const DOWN_RGB = "242, 54, 69"
export const MUTED = "var(--muted-foreground)"

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
export const SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export const RANGES = ["30D", "90D", "YTD", "ALL"] as const
export type RangeKey = (typeof RANGES)[number]

export type CalView = "days" | "months" | "year"
export type Today = { y: number; m: number; d: number }

// ————————————————————————————————————————————————————————————————
// Formatting & color helpers
// ————————————————————————————————————————————————————————————————

/** A drawdown magnitude always reads as money lost, e.g. "-$12.3K". */
export function ddStr(n: number) {
  return compactUsd(-Math.abs(n))
}

/** Color a value by sign: up green, down red, flat muted. */
export function tone(n: number) {
  return n > 0 ? UP : n < 0 ? DOWN : MUTED
}

/** Short date label, e.g. "Jul 14". */
export function dstr(t: number) {
  const d = new Date(t)
  return `${SHORT[d.getMonth()]} ${d.getDate()}`
}

function rgb(hex: string) {
  return hex === UP ? UP_RGB : DOWN_RGB
}

/** Heatmap tint: intensity scales with |pnl| relative to the group's max. */
export function tint(pnl: number, maxAbs: number) {
  if (pnl === 0) return "transparent"
  const inten = Math.min(1, Math.abs(pnl) / (maxAbs || 1))
  const a = (0.1 + 0.5 * inten).toFixed(3)
  return `rgba(${rgb(pnl > 0 ? UP : DOWN)}, ${a})`
}

// ————————————————————————————————————————————————————————————————
// Day index — buckets realizing fills into local calendar days
// ————————————————————————————————————————————————————————————————

/** One local calendar day's aggregate (already filtered to a symbol). */
export type DayAgg = {
  /** Local-midday timestamp for the day. */
  t: number
  /** True daily net: gross − every fee ± funding. */
  pnl: number
  trades: number
  wins: number
  losses: number
  gw: number
  gl: number
}

export type DayIndex = {
  map: Map<string, DayAgg>
  /**
   * Days in chronological order. A day exists when anything moved money —
   * a realizing fill, a fee, or a funding payment — so a day can carry costs
   * with trades = 0 (e.g. funding on a held position).
   */
  ordered: DayAgg[]
}

function dayKey(y: number, m: number, d: number) {
  return `${y}-${m}-${d}`
}

/**
 * Bucket everything that moved money into local calendar days, honoring the
 * symbol filter. Daily net is the actual number: realized gross minus every
 * fee (entry fills included) plus/minus funding — the same arithmetic as the
 * True cost table, so every figure on the page reconciles with it.
 */
export function buildDayIndex(wallet: PnlWallet, symbol: string): DayIndex {
  const map = new Map<string, DayAgg>()

  function dayFor(time: number): DayAgg {
    const dt = new Date(time)
    const y = dt.getFullYear()
    const m = dt.getMonth()
    const d = dt.getDate()
    const key = dayKey(y, m, d)
    let day = map.get(key)
    if (!day) {
      day = {
        t: new Date(y, m, d, 12).getTime(),
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        gw: 0,
        gl: 0,
      }
      map.set(key, day)
    }
    return day
  }

  for (const trade of wallet.trades) {
    if (symbol !== "All" && trade.coin !== symbol) continue
    const day = dayFor(trade.time)
    day.pnl += trade.gross
    day.trades += 1
    if (trade.gross > 0) {
      day.wins += 1
      day.gw += trade.gross
    } else if (trade.gross < 0) {
      day.losses += 1
      day.gl += Math.abs(trade.gross)
    }
  }
  for (const fee of wallet.fees) {
    if (symbol !== "All" && fee.coin !== symbol) continue
    dayFor(fee.time).pnl -= fee.amount
  }
  for (const payment of wallet.funding) {
    if (symbol !== "All" && payment.coin !== symbol) continue
    dayFor(payment.time).pnl += payment.amount
  }

  const ordered = [...map.values()].sort((a, b) => a.t - b.t)
  return { map, ordered }
}

/** Merge several wallets into one synthetic "All wallets" dataset. */
export function mergeWallets(wallets: PnlWallet[]): PnlWallet {
  const symbols = new Set<string>()
  const trades: PnlTrade[] = []
  const fees: PnlCostEntry[] = []
  const funding: PnlCostEntry[] = []
  let accountValue = 0
  let fundingSince: number | null = null
  let fundingStale = false
  for (const wallet of wallets) {
    accountValue += wallet.accountValue
    for (const symbol of wallet.symbols) symbols.add(symbol)
    for (const trade of wallet.trades) trades.push(trade)
    for (const fee of wallet.fees) fees.push(fee)
    for (const payment of wallet.funding) funding.push(payment)
    if (
      wallet.fundingSince !== null &&
      (fundingSince === null || wallet.fundingSince < fundingSince)
    ) {
      fundingSince = wallet.fundingSince
    }
    if (wallet.fundingStale) fundingStale = true
  }
  return {
    id: "all",
    label: "All wallets",
    network: "mainnet",
    accountValue,
    symbols: [...symbols].sort(),
    trades,
    fees,
    funding,
    fundingSince,
    fundingStale,
  }
}

// ————————————————————————————————————————————————————————————————
// Cost breakdown — where the money actually went
// ————————————————————————————————————————————————————————————————

export type CostBreakdown = {
  /** Realized trading result before any costs (sum of closedPnl). */
  gross: number
  /** Every fill's fee — entry and exit fills alike. Positive = paid. */
  fees: number
  /** Net funding: positive = received, negative = paid. */
  funding: number
  /** gross − fees + funding. */
  net: number
  /** True when funding is unknown: the refresh failed and nothing is stored. */
  fundingUnknown: boolean
}

/** The local-day midday timestamp buildDayIndex buckets by, for one entry. */
function localDayMid(t: number) {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

/**
 * Sums gross result, fees, and funding over the selected range and symbol,
 * bucketing by local day exactly like the calendar so the figures line up
 * with the tiles. Net is gross − fees + funding by construction — the lines
 * always add up.
 */
export function computeCosts(
  wallet: PnlWallet,
  symbol: string,
  range: RangeKey,
  now: number
): CostBreakdown {
  const start = rangeStart(range, now)
  let gross = 0
  let fees = 0
  let funding = 0
  for (const trade of wallet.trades) {
    if (symbol !== "All" && trade.coin !== symbol) continue
    if (localDayMid(trade.time) < start) continue
    gross += trade.gross
  }
  for (const fee of wallet.fees) {
    if (symbol !== "All" && fee.coin !== symbol) continue
    if (localDayMid(fee.time) < start) continue
    fees += fee.amount
  }
  for (const payment of wallet.funding) {
    if (symbol !== "All" && payment.coin !== symbol) continue
    if (localDayMid(payment.time) < start) continue
    funding += payment.amount
  }
  const fundingUnknown = wallet.fundingStale && wallet.funding.length === 0
  return {
    gross,
    fees,
    funding,
    net: gross - fees + funding,
    fundingUnknown,
  }
}

// ————————————————————————————————————————————————————————————————
// Metrics over a range
// ————————————————————————————————————————————————————————————————

export function rangeStart(range: RangeKey, now: number) {
  if (range === "30D") return now - 30 * 86_400_000
  if (range === "90D") return now - 90 * 86_400_000
  if (range === "YTD") return new Date(new Date(now).getFullYear(), 0, 1).getTime()
  return -Infinity
}

export type EqPoint = { t: number; cum: number; pnl: number }

export type Metrics = {
  total: number
  trades: number
  tradingDays: number
  greenDays: number
  redDays: number
  best: { pnl: number; t: number }
  worst: { pnl: number; t: number }
  maxDD: number
  winRate: number
  pf: number
  roi: number
  avgDay: number
  acct: number
  eqPts: EqPoint[]
}

export function compute(
  index: DayIndex,
  range: RangeKey,
  acct: number,
  now: number
): Metrics {
  const start = rangeStart(range, now)
  let total = 0
  let trades = 0
  let gw = 0
  let gl = 0
  let tradingDays = 0
  let greenDays = 0
  let redDays = 0
  let best = { pnl: -Infinity, t: 0 }
  let worst = { pnl: Infinity, t: 0 }
  let cum = 0
  const eqPts: EqPoint[] = []

  for (const day of index.ordered) {
    if (day.t < start) continue
    // Totals and the equity curve count every day money moved — including
    // cost-only days (funding on a held position) — so they reconcile with
    // the True cost table.
    total += day.pnl
    trades += day.trades
    gw += day.gw
    gl += day.gl
    cum += day.pnl
    eqPts.push({ t: day.t, cum, pnl: day.pnl })
    // Day-quality stats only judge days that actually traded; a cost-only
    // day is not a green or red trading day.
    if (day.trades === 0) continue
    tradingDays += 1
    if (day.pnl > 0) greenDays += 1
    else if (day.pnl < 0) redDays += 1
    if (day.pnl > best.pnl) best = { pnl: day.pnl, t: day.t }
    if (day.pnl < worst.pnl) worst = { pnl: day.pnl, t: day.t }
  }

  let peak = 0
  let maxDD = 0
  for (const e of eqPts) {
    if (e.cum > peak) peak = e.cum
    const dd = peak - e.cum
    if (dd > maxDD) maxDD = dd
  }

  return {
    total,
    trades,
    tradingDays,
    greenDays,
    redDays,
    best,
    worst,
    maxDD,
    winRate: tradingDays ? Math.round((greenDays / tradingDays) * 100) : 0,
    pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : 0,
    roi: acct > 0 ? (total / acct) * 100 : 0,
    avgDay: tradingDays ? total / tradingDays : 0,
    acct,
    eqPts,
  }
}


/** Consecutive same-sign trading days ending at the latest one. */
export function streakOf(index: DayIndex) {
  let streak = 0
  let up: boolean | null = null
  for (let i = index.ordered.length - 1; i >= 0; i--) {
    // Cost-only days (funding, no trades) neither extend nor break a streak.
    if (index.ordered[i].trades === 0) continue
    const p = index.ordered[i].pnl
    if (p === 0) continue
    const pos = p > 0
    if (up === null) up = pos
    if (pos === up) streak += 1
    else break
  }
  if (streak === 0 || up === null) return { title: "No active streak", up: null }
  return {
    title: `${streak} ${up ? "green" : "red"} day${streak > 1 ? "s" : ""}`,
    up,
  }
}

// ————————————————————————————————————————————————————————————————
// SVG geometry
// ————————————————————————————————————————————————————————————————

export type EqDot = {
  i: number
  x: number
  y: number
  cum: number
  pnl: number
  t: number
  /** Left edge / width of the invisible hover strip that owns this point. */
  rectX: number
  rectW: number
}

export type EqGeom = {
  empty: boolean
  W: number
  H: number
  zeroY: number
  belowH: number
  path: string
  area: string
  pts: EqDot[]
  up: boolean
  mxStr: string
  startLabel: string
  endLabel: string
}

export function eqGeom(eqPts: EqPoint[], W = 1000, H = 280, pad = 14): EqGeom {
  if (eqPts.length < 2) {
    return {
      empty: true,
      W,
      H,
      zeroY: H / 2,
      belowH: H / 2,
      path: "",
      area: "",
      pts: [],
      up: true,
      mxStr: "—",
      startLabel: eqPts.length ? dstr(eqPts[0].t) : "",
      endLabel: eqPts.length ? dstr(eqPts[eqPts.length - 1].t) : "",
    }
  }
  const xs = eqPts.map((e) => e.cum)
  const mn = Math.min(0, ...xs)
  const mx = Math.max(0, ...xs)
  const span = mx - mn || 1
  const X = (i: number) => pad + (i / (eqPts.length - 1)) * (W - 2 * pad)
  const Y = (v: number) => H - pad - ((v - mn) / span) * (H - 2 * pad)
  const zeroY = Y(0)

  let path = ""
  eqPts.forEach((e, i) => {
    path += `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(e.cum).toFixed(1)} `
  })
  path = path.trim()
  const area = `${path} L${X(eqPts.length - 1).toFixed(1)} ${zeroY.toFixed(
    1
  )} L${X(0).toFixed(1)} ${zeroY.toFixed(1)} Z`

  const pts: EqDot[] = eqPts.map((e, i) => ({
    i,
    x: X(i),
    y: Y(e.cum),
    cum: e.cum,
    pnl: e.pnl,
    t: e.t,
    rectX: 0,
    rectW: 0,
  }))
  pts.forEach((p, i) => {
    const prev = i > 0 ? pts[i - 1].x : 0
    const next = i < pts.length - 1 ? pts[i + 1].x : W
    p.rectX = (prev + p.x) / 2
    p.rectW = (next + p.x) / 2 - (prev + p.x) / 2
  })

  return {
    empty: false,
    W,
    H,
    zeroY,
    belowH: H - zeroY,
    path,
    area,
    pts,
    up: eqPts[eqPts.length - 1].cum >= 0,
    mxStr: signedCompactUsd(mx),
    startLabel: dstr(eqPts[0].t),
    endLabel: dstr(eqPts[eqPts.length - 1].t),
  }
}

export type BarDot = {
  i: number
  x: number
  w: number
  y: number
  h: number
  pos: boolean
  pnl: number
  t: number
  hx: number
  hw: number
}

export type BarsGeom = {
  empty: boolean
  W: number
  H: number
  zeroY: number
  bars: BarDot[]
}

export function barsGeom(eqPts: EqPoint[], W = 1000, H = 240, pad = 8): BarsGeom {
  if (!eqPts.length) return { empty: true, W, H, zeroY: H / 2, bars: [] }
  const mx = Math.max(1, ...eqPts.map((e) => Math.abs(e.pnl)))
  const zeroY = H / 2
  const half = H / 2 - pad
  const step = (W - 2 * pad) / eqPts.length
  const bw = Math.max(1.5, step * 0.64)
  const bars: BarDot[] = eqPts.map((e, i) => {
    const cx = pad + step * (i + 0.5)
    const h = Math.max(1, (Math.abs(e.pnl) / mx) * half)
    const pos = e.pnl >= 0
    return {
      i,
      x: cx - bw / 2,
      w: bw,
      y: pos ? zeroY - h : zeroY,
      h,
      pos,
      pnl: e.pnl,
      t: e.t,
      hx: pad + step * i,
      hw: step,
    }
  })
  return { empty: false, W, H, zeroY, bars }
}

export type SparkGeom = { empty: boolean; path: string; area: string }

export function sparkGeom(eqPts: EqPoint[], W = 120, H = 34, pad = 3): SparkGeom {
  if (eqPts.length < 2) return { empty: true, path: "", area: "" }
  const xs = eqPts.map((e) => e.cum)
  const mn = Math.min(0, ...xs)
  const mx = Math.max(0, ...xs)
  const span = mx - mn || 1
  const X = (i: number) => pad + (i / (eqPts.length - 1)) * (W - 2 * pad)
  const Y = (v: number) => H - pad - ((v - mn) / span) * (H - 2 * pad)
  let path = ""
  eqPts.forEach((e, i) => {
    path += `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(e.cum).toFixed(1)} `
  })
  path = path.trim()
  const area = `${path} L${X(eqPts.length - 1).toFixed(1)} ${H - pad} L${X(0).toFixed(
    1
  )} ${H - pad} Z`
  return { empty: false, path, area }
}

export function donutGeom(metrics: Metrics) {
  const r = 54
  const c = 2 * Math.PI * r
  const g = metrics.greenDays
  const rd = metrics.redDays
  const tot = g + rd || 1
  const frac = g / tot
  return {
    r,
    dash: `${(c * frac).toFixed(1)} ${(c * (1 - frac)).toFixed(1)}`,
    winRateStr: pct(Math.round(frac * 100), 0),
    greenDays: g,
    redDays: rd,
  }
}

// ————————————————————————————————————————————————————————————————
// Calendar view-models
// ————————————————————————————————————————————————————————————————

export type CalCell = {
  inMonth: boolean
  has: boolean
  isToday: boolean
  dnum: number
  pnl: number
  bg: string
  tone: string
}

export type CalWeek = {
  cells: CalCell[]
  net: number
  netDays: number
  netBg: string
}

export type CalView2 = {
  label: string
  weeks: CalWeek[]
}

export function calGeom(
  index: DayIndex,
  y: number,
  m: number,
  today: Today
): CalView2 {
  const dim = new Date(y, m + 1, 0).getDate()
  const first = new Date(y, m, 1).getDay()
  let maxAbs = 1
  for (let d = 1; d <= dim; d++) {
    const e = index.map.get(dayKey(y, m, d))
    if (e) maxAbs = Math.max(maxAbs, Math.abs(e.pnl))
  }
  const rows = Math.ceil((first + dim) / 7)
  const weeks: CalWeek[] = []
  for (let r = 0; r < rows; r++) {
    const cells: CalCell[] = []
    let net = 0
    let netDays = 0
    for (let c = 0; c < 7; c++) {
      const dnum = r * 7 + c - first + 1
      const inMonth = dnum >= 1 && dnum <= dim
      const e = inMonth ? index.map.get(dayKey(y, m, dnum)) : undefined
      // Label a cell when it traded or its costs are big enough to show at
      // whole-dollar rounding; a held position's sub-cent funding days would
      // otherwise plaster the calendar with "$0" chips. Weekly nets still
      // count every cent either way.
      const has = Boolean(e && (e.trades > 0 || Math.abs(e.pnl) >= 0.5))
      const isToday =
        inMonth && y === today.y && m === today.m && dnum === today.d
      if (e) {
        net += e.pnl
        if (has) netDays += 1
      }
      cells.push({
        inMonth,
        has,
        isToday,
        dnum,
        pnl: e ? e.pnl : 0,
        bg: e ? tint(e.pnl, maxAbs) : "transparent",
        tone: tone(e ? e.pnl : 0),
      })
    }
    weeks.push({
      cells,
      net,
      netDays,
      netBg: netDays
        ? `rgba(${rgb(net > 0 ? UP : DOWN)}, 0.07)`
        : "transparent",
    })
  }
  return { label: `${MONTHS[m]} ${y}`, weeks }
}

export type MonthlyRow = {
  mo: number
  name: string
  total: number
  has: boolean
  current: boolean
  barPct: string
  barColor: string
  tone: string
}

export function monthlyGeom(index: DayIndex, year: number, today: Today) {
  const totals = new Array(12).fill(0)
  const td = new Array(12).fill(0)
  for (const day of index.ordered) {
    const dt = new Date(day.t)
    if (dt.getFullYear() !== year) continue
    totals[dt.getMonth()] += day.pnl
    if (day.trades > 0) td[dt.getMonth()] += 1
  }
  const maxAbs = Math.max(1, ...totals.map((t) => Math.abs(t)))
  const months: MonthlyRow[] = totals.map((total, mo) => {
    // A month counts when it traded, or when costs alone moved visible money.
    const has = td[mo] > 0 || Math.abs(total) >= 0.5
    return {
      mo,
      name: SHORT[mo],
      total,
      has,
      current: mo === today.m && year === today.y,
      barPct: has ? `${((Math.abs(total) / maxAbs) * 100).toFixed(1)}%` : "0%",
      barColor: has ? (total >= 0 ? UP : DOWN) : "var(--muted)",
      tone: has ? tone(total) : MUTED,
    }
  })
  return { months }
}

export type YearTile = {
  mo: number
  name: string
  total: number
  has: boolean
  tone: string
  sub: string
  cells: string[]
}

export function yearGeom(index: DayIndex, year: number) {
  const months: YearTile[] = []
  for (let mo = 0; mo < 12; mo++) {
    const first = new Date(year, mo, 1).getDay()
    const dim = new Date(year, mo + 1, 0).getDate()
    let maxAbs = 1
    for (let d = 1; d <= dim; d++) {
      const e = index.map.get(dayKey(year, mo, d))
      if (e) maxAbs = Math.max(maxAbs, Math.abs(e.pnl))
    }
    const cells: string[] = []
    for (let i = 0; i < first; i++) cells.push("transparent")
    let total = 0
    let tdays = 0
    let wins = 0
    for (let d = 1; d <= dim; d++) {
      const e = index.map.get(dayKey(year, mo, d))
      let bg = "var(--muted)"
      if (e) {
        total += e.pnl
        // Day count and win rate judge trading days only; cost-only days
        // still color their cell and count toward the month's total.
        if (e.trades > 0) {
          tdays += 1
          if (e.pnl > 0) wins += 1
        }
        bg = tint(e.pnl, maxAbs)
        if (bg === "transparent") bg = "var(--muted)"
      }
      cells.push(bg)
    }
    const has = tdays > 0 || Math.abs(total) >= 0.5
    months.push({
      mo,
      name: SHORT[mo],
      total,
      has,
      tone: has ? tone(total) : MUTED,
      sub: tdays
        ? `${tdays}d · ${Math.round((wins / tdays) * 100)}% win`
        : "no trades",
      cells,
    })
  }
  return { months }
}
