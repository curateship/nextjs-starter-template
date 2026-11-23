import { describe, expect, it } from "vitest"

import type { ChartPosition } from "@/lib/trading/chart-positions"
import type { HistoryCandle } from "@/server/backtest/history"

import { ManualSession } from "./manual-sim"
import type { BacktestCosts } from "./types"

const BAR_MS = 900_000
const START_MS = 1_700_000_000_000

const FREE: BacktestCosts = { takerFeeBps: 0, makerFeeBps: 0, slippageBps: 0 }

/** Candle n bars after the session start. */
function bar(
  n: number,
  o: number,
  h: number,
  l: number,
  c: number
): HistoryCandle {
  const t = START_MS + n * BAR_MS
  return { t, T: t + BAR_MS, o, h, l, c, v: 0, n: 0 }
}

/** A long/short box lasting until `endBar` bars after the start. */
function box(
  overrides: Partial<ChartPosition> & { entry: number; stop: number; target: number },
  endBar = 100
): ChartPosition {
  return {
    id: overrides.id ?? "b1",
    side: overrides.side ?? "long",
    startTime: Math.floor(START_MS / 1000),
    endTime: Math.floor((START_MS + endBar * BAR_MS) / 1000),
    ...overrides,
  }
}

function session(riskPct = 1, costs: BacktestCosts = FREE) {
  return new ManualSession({
    simStartMs: START_MS,
    startingEquity: 10_000,
    riskPct,
    costs,
  })
}

describe("ManualSession", () => {
  it("fills a waiting entry at its own price when the bar trades through it", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 120 })])
    sim.processBar(bar(0, 105, 106, 99, 105))
    const snap = sim.snapshot()
    expect(snap.positions).toEqual([
      { boxId: "b1", side: "long", entryPx: 100, qty: 10, stop: 90, target: 120 },
    ])
    expect(snap.pendingOrders).toBe(0)
  })

  it("takes profit at the target and books the risk-sized P&L", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 120 })])
    sim.processBar(bar(0, 105, 106, 99, 105))
    sim.processBar(bar(1, 105, 121, 104, 118))
    const result = sim.finalize()
    expect(result.trades).toHaveLength(1)
    // Risking 1% ($100) over a $10 stop distance = 10 units; +$20 × 10 = $200.
    expect(result.trades[0].exitPx).toBe(120)
    expect(result.trades[0].pnl).toBeCloseTo(200)
    expect(result.stats.endingEquity).toBeCloseTo(10_200)
  })

  it("fills at the open when a bar gaps through the entry", () => {
    const sim = session()
    sim.processBar(bar(0, 100, 101, 99, 100))
    sim.syncBoxes([box({ entry: 95, stop: 85, target: 115 })])
    sim.processBar(bar(1, 90, 91, 88, 89))
    expect(sim.snapshot().positions[0]?.entryPx).toBe(90)
  })

  it("assumes the stop when entry, stop and target share one candle", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 110 })])
    sim.processBar(bar(0, 100, 111, 89, 105))
    const result = sim.finalize()
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitPx).toBe(90)
    expect(result.trades[0].pnl).toBeCloseTo(-100)
  })

  it("exits at the open, not the stop price, when a bar gaps through the stop", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 200 })])
    sim.processBar(bar(0, 100, 101, 99, 100))
    sim.processBar(bar(1, 85, 86, 84, 85))
    const result = sim.finalize()
    expect(result.trades[0].exitPx).toBe(85)
    expect(result.trades[0].pnl).toBeCloseTo(-150)
  })

  it("mirrors the rules for shorts", () => {
    const sim = session()
    sim.syncBoxes([box({ side: "short", entry: 100, stop: 110, target: 80 })])
    sim.processBar(bar(0, 95, 101, 94, 96))
    expect(sim.snapshot().positions[0]?.side).toBe("short")
    sim.processBar(bar(1, 96, 97, 79, 82))
    const result = sim.finalize()
    expect(result.trades[0].exitPx).toBe(80)
    expect(result.trades[0].pnl).toBeCloseTo(200)
  })

  it("rests a waiting order past the box's right edge until price reaches it", () => {
    // The box is drawn 2 bars wide; the entry is only touched on bar 40. That
    // used to cancel the order on bar 3 — the reason planned trades "never
    // triggered", since a clicked box is a couple of hours wide and the tape
    // runs 60 candles a second.
    const sim = session()
    sim.syncBoxes([box({ entry: 50, stop: 45, target: 80 }, 2)])
    for (let n = 0; n < 40; n += 1) {
      sim.processBar(bar(n, 100, 101, 99, 100))
    }
    expect(sim.drainConsumedBoxes()).toEqual([])
    expect(sim.snapshot().pendingOrders).toBe(1)
    sim.processBar(bar(40, 60, 61, 50, 55))
    expect(sim.snapshot().positions).toHaveLength(1)
    expect(sim.snapshot().positions[0]?.entryPx).toBe(50)
  })

  it("cancels a waiting order when its box is deleted", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 50, stop: 45, target: 60 })])
    sim.processBar(bar(0, 100, 101, 99, 100))
    expect(sim.snapshot().pendingOrders).toBe(1)
    sim.syncBoxes([])
    expect(sim.snapshot().pendingOrders).toBe(0)
    sim.processBar(bar(1, 100, 101, 50, 55))
    expect(sim.snapshot().positions).toHaveLength(0)
    expect(sim.finalize().trades).toHaveLength(0)
  })

  it("caps position size at 10× equity when the stop is razor-thin", () => {
    const sim = session(10)
    sim.syncBoxes([box({ entry: 100, stop: 99.9, target: 120 })])
    sim.processBar(bar(0, 100, 101, 99.95, 100))
    // Uncapped: $1,000 risk / $0.10 = 10,000 units ($1M). Cap: 10×$10k / $100.
    expect(sim.snapshot().positions[0]?.qty).toBeCloseTo(1000)
  })

  it("treats deleting the open position's box as a market close", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 200 })])
    sim.processBar(bar(0, 100, 101, 99, 104))
    sim.syncBoxes([])
    const result = sim.finalize()
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitPx).toBe(104)
    expect(result.trades[0].pnl).toBeCloseTo(40)
  })

  it("moves the live stop when the open position's box is edited", () => {
    const sim = session()
    const drawn = box({ entry: 100, stop: 90, target: 200 })
    sim.syncBoxes([drawn])
    sim.processBar(bar(0, 100, 101, 99, 100))
    sim.syncBoxes([{ ...drawn, stop: 98 }])
    sim.processBar(bar(1, 99, 100, 97, 99))
    const result = sim.finalize()
    expect(result.trades[0].exitPx).toBe(98)
  })

  it("halts and flattens when equity is wiped out", () => {
    const sim = session(10)
    sim.syncBoxes([box({ entry: 100, stop: 99.9, target: 120 })])
    sim.processBar(bar(0, 100, 101, 99.95, 100))
    // 1000 units, then a gap to $2: −$98 × 1000 ≈ −$98k on $10k equity.
    sim.processBar(bar(1, 2, 3, 1, 2))
    const snap = sim.snapshot()
    expect(snap.halted).toBe(true)
    expect(snap.haltReason).toMatch(/depleted/i)
    expect(snap.positions).toEqual([])
    // New boxes refuse to become orders once halted.
    sim.syncBoxes([box({ id: "b2", entry: 2, stop: 1, target: 3 })])
    expect(sim.snapshot().pendingOrders).toBe(0)
  })

  it("force-closes an open position at the last price on finalize", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 200 })])
    sim.processBar(bar(0, 100, 101, 99, 108))
    const result = sim.finalize()
    expect(result.openPosition).toBeNull()
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].exitPx).toBe(108)
  })

  it("runs several boxes concurrently — a second buy triggers while the first is open", () => {
    const sim = session()
    sim.syncBoxes([
      box({ id: "b1", entry: 100, stop: 90, target: 200 }),
      box({ id: "b2", entry: 95, stop: 85, target: 190 }),
    ])
    // First bar fills b1 at 100; b2 (95) not yet touched.
    sim.processBar(bar(0, 100, 101, 99, 100))
    expect(sim.snapshot().positions).toHaveLength(1)
    // Second bar dips to 94 — b2 must fill even though b1 is still open.
    sim.processBar(bar(1, 99, 100, 94, 96))
    const snap = sim.snapshot()
    expect(snap.positions).toHaveLength(2)
    expect(snap.pendingOrders).toBe(0)
    // Both stops hit on a crash bar → two closed trades.
    sim.processBar(bar(2, 95, 96, 84, 86))
    const result = sim.finalize()
    expect(result.trades).toHaveLength(2)
    expect(result.trades.every((trade) => trade.pnl < 0)).toBe(true)
  })

  it("survives a session with zero trades", () => {
    const sim = session()
    sim.processBar(bar(0, 100, 101, 99, 100))
    const result = sim.finalize()
    expect(result.trades).toHaveLength(0)
    expect(result.stats.netPnl).toBe(0)
    expect(result.stats.all.winRate).toBe(0)
  })

  it("charges maker fees on touched fills and taker on stops", () => {
    const costs: BacktestCosts = { takerFeeBps: 10, makerFeeBps: 5, slippageBps: 0 }
    const sim = session(1, costs)
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 200 })])
    sim.processBar(bar(0, 105, 106, 99, 100))
    sim.processBar(bar(1, 95, 96, 89, 91))
    const result = sim.finalize()
    const [entryFill, exitFill] = result.fills
    // Entry touched at $100 → maker 5 bps on ~$1,000 notional.
    expect(entryFill.fee).toBeCloseTo((entryFill.px * entryFill.sz * 5) / 10_000)
    // Stop-out → taker 10 bps.
    expect(exitFill.fee).toBeCloseTo((exitFill.px * exitFill.sz * 10) / 10_000)
    expect(result.stats.fees).toBeCloseTo(entryFill.fee + exitFill.fee)
  })

  it("records a replayable tape of order and protection events", () => {
    const sim = session()
    sim.syncBoxes([box({ entry: 100, stop: 90, target: 120 })])
    sim.processBar(bar(0, 105, 106, 99, 105))
    sim.processBar(bar(1, 105, 121, 104, 118))
    const events = sim.finalize().timeline?.events ?? []
    const ops = events.map((event) => (event.k === "order" ? event.op : event.k))
    expect(ops).toEqual(["place", "fill", "protect", "protect"])
  })
})
