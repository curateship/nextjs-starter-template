import type { PnlTrade } from "@/lib/api/pnl"

// Trading polarity, consistent with the price chart.
export const UP = "#089981"
export const DOWN = "#f23645"
export const UP_RGB = "8, 153, 129"
export const DOWN_RGB = "242, 54, 69"

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
export const SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

type Today = { y: number; m: number; d: number }

export type DayAgg = {
  pnl: number
  wins: number
  losses: number
  gw: number
  gl: number
  trades: PnlTrade[]
}

const EMPTY_DAY: DayAgg = {
  pnl: 0,
  wins: 0,
  losses: 0,
  gw: 0,
  gl: 0,
  trades: [],
}

// ————————————————————————————————————————————————————————————————
// Formatting & color helpers
// ————————————————————————————————————————————————————————————————

export function money(n: number, cents = false) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : ""
  const v = Math.abs(n)
  const str = cents
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : Math.round(v).toLocaleString("en-US")
  return `${sign}$${str}`
}

export function pctStr(pct: number) {
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`
}

/** Day win rate as a whole-number percent (0 when there were no trades). */
export function winRateOf(agg: DayAgg) {
  return agg.trades.length
    ? Math.round((agg.wins / agg.trades.length) * 100)
    : 0
}

// Heatmap tint: intensity scales with |pnl| relative to the month's max.
export function tint(pnl: number, maxAbs: number) {
  if (pnl === 0) return "transparent"
  const inten = Math.min(1, Math.abs(pnl) / (maxAbs || 1))
  const a = (0.09 + 0.46 * inten).toFixed(3)
  return `rgba(${pnl > 0 ? UP_RGB : DOWN_RGB}, ${a})`
}

// Week-summary cells use a fixed, subtle tint (they aren't part of the day
// heatmap's relative-intensity scale).
export function weekTint(total: number, days: number) {
  if (!days || total === 0) return "var(--muted)"
  return `rgba(${total > 0 ? UP_RGB : DOWN_RGB}, 0.08)`
}

export function toneColor(n: number) {
  return n > 0 ? UP : n < 0 ? DOWN : "var(--muted-foreground)"
}

export function sideColor(trade: PnlTrade) {
  if (trade.dir.includes("Long")) return "#2563eb"
  if (trade.dir.includes("Short")) return "#9333ea"
  return trade.side === "B" ? UP : DOWN
}

// ————————————————————————————————————————————————————————————————
// Day index — buckets realizing fills into local calendar days
// ————————————————————————————————————————————————————————————————

function dateKey(y: number, m: number, d: number) {
  return `${y}-${m}-${d}`
}

/** Bucket realizing fills into local calendar days, honoring the symbol filter. */
export function buildDayIndex(
  trades: PnlTrade[],
  symbol: string
): Map<string, DayAgg> {
  const map = new Map<string, DayAgg>()
  for (const trade of trades) {
    if (symbol !== "All" && trade.coin !== symbol) continue
    const dt = new Date(trade.time)
    const key = dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate())
    let day = map.get(key)
    if (!day) {
      day = { pnl: 0, wins: 0, losses: 0, gw: 0, gl: 0, trades: [] }
      map.set(key, day)
    }
    day.pnl += trade.pnl
    day.trades.push(trade)
    if (trade.gross > 0) {
      day.wins += 1
      day.gw += trade.gross
    } else if (trade.gross < 0) {
      day.losses += 1
      day.gl += Math.abs(trade.gross)
    }
  }
  return map
}

export function aggFrom(
  index: Map<string, DayAgg>,
  y: number,
  m: number,
  d: number
): DayAgg {
  return index.get(dateKey(y, m, d)) ?? EMPTY_DAY
}

// ————————————————————————————————————————————————————————————————
// View-model builders
// ————————————————————————————————————————————————————————————————

/** Largest absolute daily P&L in the month — the heatmap's intensity scale. */
function monthMaxAbs(
  index: Map<string, DayAgg>,
  year: number,
  month: number
) {
  const dim = new Date(year, month + 1, 0).getDate()
  let maxAbs = 1
  for (let d = 1; d <= dim; d++) {
    maxAbs = Math.max(maxAbs, Math.abs(aggFrom(index, year, month, d).pnl))
  }
  return maxAbs
}

// SVG viewBox for the cumulative-equity sparkline.
const EQ_W = 288
const EQ_H = 92
const EQ_PAD = 8

/** Cumulative equity across the month's trading days, as an SVG line + area. */
function equityCurve(
  index: Map<string, DayAgg>,
  year: number,
  month: number
) {
  const dim = new Date(year, month + 1, 0).getDate()
  const pts: number[] = []
  let cum = 0
  for (let d = 1; d <= dim; d++) {
    const agg = aggFrom(index, year, month, d)
    if (agg.trades.length > 0) {
      cum += agg.pnl
      pts.push(cum)
    }
  }

  let eqPath = ""
  let eqArea = ""
  let eqZeroY = EQ_H / 2
  if (pts.length > 1) {
    const mn = Math.min(0, ...pts)
    const mx = Math.max(0, ...pts)
    const span = mx - mn || 1
    const X = (i: number) =>
      EQ_PAD + (i / (pts.length - 1)) * (EQ_W - 2 * EQ_PAD)
    const Y = (v: number) =>
      EQ_H - EQ_PAD - ((v - mn) / span) * (EQ_H - 2 * EQ_PAD)
    eqZeroY = Y(0)
    eqPath = pts
      .map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)
      .join(" ")
    eqArea = `${eqPath} L${X(pts.length - 1).toFixed(1)} ${eqZeroY.toFixed(
      1
    )} L${X(0).toFixed(1)} ${eqZeroY.toFixed(1)} Z`
  }

  return { eqPath, eqArea, eqZeroY, W: EQ_W, H: EQ_H }
}

export type MonthView = ReturnType<typeof buildMonthView>

export function buildMonthView(
  index: Map<string, DayAgg>,
  year: number,
  month: number,
  today: Today
) {
  const dim = new Date(year, month + 1, 0).getDate()
  const first = new Date(year, month, 1).getDay()
  const maxAbs = monthMaxAbs(index, year, month)

  const rows = Math.ceil((first + dim) / 7)
  const weeks: {
    days: {
      dnum: number
      inMonth: boolean
      hasData: boolean
      isToday: boolean
      agg: DayAgg
    }[]
    total: number
    wDays: number
  }[] = []

  let monthTotal = 0
  let trades = 0
  let winDays = 0
  let tradingDays = 0
  let gw = 0
  let gl = 0
  let best = { pnl: -Infinity, d: 0 }
  let worst = { pnl: Infinity, d: 0 }

  for (let r = 0; r < rows; r++) {
    const days: (typeof weeks)[number]["days"] = []
    let wTotal = 0
    let wDays = 0
    for (let c = 0; c < 7; c++) {
      const dnum = r * 7 + c - first + 1
      const inMonth = dnum >= 1 && dnum <= dim
      const agg = inMonth ? aggFrom(index, year, month, dnum) : EMPTY_DAY
      const hasData = inMonth && agg.trades.length > 0
      const isToday =
        inMonth && year === today.y && month === today.m && dnum === today.d

      if (hasData) {
        monthTotal += agg.pnl
        trades += agg.trades.length
        tradingDays += 1
        gw += agg.gw
        gl += agg.gl
        if (agg.pnl > 0) winDays += 1
        if (agg.pnl > best.pnl) best = { pnl: agg.pnl, d: dnum }
        if (agg.pnl < worst.pnl) worst = { pnl: agg.pnl, d: dnum }
        wTotal += agg.pnl
        wDays += 1
      }

      days.push({ dnum, inMonth, hasData, isToday, agg })
    }
    weeks.push({ days, total: wTotal, wDays })
  }

  const eq = equityCurve(index, year, month)

  const winRate = tradingDays ? Math.round((winDays / tradingDays) * 100) : 0
  const pf = gl > 0 ? gw / gl : gw > 0 ? Infinity : 0

  return {
    weeks,
    maxAbs,
    monthTotal,
    trades,
    tradingDays,
    winDays,
    winRate,
    profitFactor: pf === Infinity ? "∞" : pf.toFixed(2),
    avgDay: tradingDays ? Math.round(monthTotal / tradingDays) : 0,
    best,
    worst,
    ...eq,
  }
}

export function buildStreak(index: Map<string, DayAgg>, today: Today) {
  let streak = 0
  let up: boolean | null = null
  const dt = new Date(today.y, today.m, today.d)
  for (let i = 0; i < 90; i++) {
    const agg = aggFrom(index, dt.getFullYear(), dt.getMonth(), dt.getDate())
    if (agg.trades.length > 0) {
      const pos = agg.pnl > 0
      if (up === null) up = pos
      if (pos === up) streak += 1
      else break
    }
    dt.setDate(dt.getDate() - 1)
  }

  if (streak === 0) {
    return {
      title: "No active streak",
      detail: "Last trading day was flat or had no trades",
      icon: "·",
      bg: "var(--muted)",
    }
  }
  return {
    title: `${streak} ${up ? "green" : "red"} day${streak > 1 ? "s" : ""}`,
    detail: up
      ? `Winning run through ${SHORT[today.m]} ${today.d}`
      : "Drawdown streak — stay disciplined",
    icon: up ? "🔥" : "🧊",
    bg: `rgba(${up ? UP_RGB : DOWN_RGB}, 0.12)`,
  }
}

export type YearViewModel = ReturnType<typeof buildYearView>

export function buildYearView(index: Map<string, DayAgg>, year: number) {
  const months: {
    mo: number
    name: string
    total: number
    tradingDays: number
    winDays: number
    cells: string[]
  }[] = []
  let yearTotal = 0

  for (let mo = 0; mo < 12; mo++) {
    const first = new Date(year, mo, 1).getDay()
    const dim = new Date(year, mo + 1, 0).getDate()
    const maxAbs = monthMaxAbs(index, year, mo)
    const cells: string[] = []
    for (let i = 0; i < first; i++) cells.push("transparent")
    let total = 0
    let tradingDays = 0
    let winDays = 0
    for (let d = 1; d <= dim; d++) {
      const agg = aggFrom(index, year, mo, d)
      let bg = "var(--muted)"
      if (agg.trades.length > 0) {
        total += agg.pnl
        tradingDays += 1
        if (agg.pnl > 0) winDays += 1
        bg = tint(agg.pnl, maxAbs)
        if (bg === "transparent") bg = "var(--muted)"
      }
      cells.push(bg)
    }
    yearTotal += total
    months.push({ mo, name: SHORT[mo], total, tradingDays, winDays, cells })
  }

  return { months, yearTotal }
}
