import { describe, expect, it } from "vitest"

import {
  buildFillMarks,
  fillMarksFromStored,
  coinWorstDip,
  middleOf,
  pairTrades,
  sideStatsFromTrades,
  worstDip,
  type BacktestFill,
  type BacktestTrade,
} from "@/lib/trade/backtest/result"

/**
 * Turning fills into trades.
 *
 * A ladder buys five times and sells once, and five fills in a list says
 * nothing about whether any of it worked. The row that matters is "this money
 * went in here and came out there, for this" — so the pairing is what makes the
 * results page readable, and getting it wrong would flatter or damn a strategy
 * without changing a single figure the engine produced.
 */

const HOUR = 3_600_000

function buy(
  at: number,
  px: number,
  sz: number,
  fee = 0,
  rung: number | null = null
): BacktestFill {
  return { at, side: "buy", px, sz, fee, closedPnl: 0, reason: "order", rung }
}

function sell(
  at: number,
  px: number,
  sz: number,
  fee = 0,
  reason = "take_profit",
  closedPnl = 0
): BacktestFill {
  return { at, side: "sell", px, sz, fee, closedPnl, reason, rung: null }
}

describe("pairing a buy with the sell that closed it", () => {
  it("makes one round trip out of two fills", () => {
    const [trade] = pairTrades([buy(0, 100, 1), sell(HOUR, 110, 1)])

    expect(trade).toMatchObject({
      n: 1,
      entryAt: 0,
      entryPx: 100,
      exitAt: HOUR,
      exitPx: 110,
      sz: 1,
      amountUsd: 100,
      pnl: 10,
      returnPct: 10,
      exitReason: "take_profit",
    })
  })

  it("splits one sell across every buy it closed, oldest first", () => {
    // A ladder's five rungs and the one take-profit that closed the lot. First
    // in, first out: the deepest rung is the newest buy, and letting a partial
    // sell claim it would flatter the result.
    const trades = pairTrades([
      buy(0, 100, 1),
      buy(HOUR, 90, 1),
      sell(2 * HOUR, 100, 2),
    ])

    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ entryPx: 100, exitPx: 100, pnl: 0 })
    expect(trades[1]).toMatchObject({ entryPx: 90, exitPx: 100, pnl: 10 })
  })

  it("splits a buy when only part of it is sold", () => {
    const trades = pairTrades([buy(0, 100, 2), sell(HOUR, 110, 1)])

    expect(trades).toHaveLength(2)
    // The half that sold, and the half still held.
    expect(trades.find((trade) => trade.exitAt !== null)).toMatchObject({
      sz: 1,
      pnl: 10,
    })
    expect(trades.find((trade) => trade.exitAt === null)).toMatchObject({
      sz: 1,
      pnl: 0,
    })
  })

  it("shares a sell's fee out by size rather than putting it all on one row", () => {
    // Otherwise the first row carries every fee and reads as the loser.
    const trades = pairTrades([
      buy(0, 100, 1),
      buy(HOUR, 100, 1),
      sell(2 * HOUR, 100, 2, 2),
    ])

    expect(trades[0].pnl).toBeCloseTo(-1, 10)
    expect(trades[1].pnl).toBeCloseTo(-1, 10)
  })

  it("counts a buy that never sold, rather than dropping it", () => {
    // A strategy that ends holding its worst coin has to say so.
    const trades = pairTrades([buy(0, 100, 1)])

    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({
      exitAt: null,
      exitPx: null,
      pnl: 0,
      exitReason: null,
    })
  })

  it("numbers them oldest entry first, whatever order the fills arrive in", () => {
    const trades = pairTrades([
      sell(2 * HOUR, 110, 1),
      buy(HOUR, 100, 1),
      buy(0, 90, 1),
    ])

    expect(trades.map((trade) => trade.n)).toEqual([1, 2])
    expect(trades[0].entryAt).toBe(0)
    expect(trades[1].entryAt).toBe(HOUR)
  })

  it("ignores a sell with nothing to close", () => {
    // The engine never writes one, but a row from an older build must not
    // become a trade with no entry.
    expect(pairTrades([sell(0, 100, 1)])).toEqual([])
  })
})

describe("how far one coin's money fell", () => {
  it("measures the fall from its own high, in the order things closed", () => {
    // +100 then −40 then −20: the high was 100 and it ended at 40, so the
    // worst it was ever down from its own peak is 60.
    const trades = pairTrades([
      buy(0, 100, 1),
      sell(HOUR, 200, 1),
      buy(2 * HOUR, 100, 1),
      sell(3 * HOUR, 60, 1),
      buy(4 * HOUR, 100, 1),
      sell(5 * HOUR, 80, 1),
    ])

    expect(coinWorstDip(trades)).toBeCloseTo(60, 10)
  })

  it("is nothing at all when it only ever went up", () => {
    expect(
      coinWorstDip(pairTrades([buy(0, 100, 1), sell(HOUR, 110, 1)]))
    ).toBe(0)
  })
})

describe("the run's own worst dip", () => {
  it("is measured on the one combined line", () => {
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 10_500 },
      { t: 3, usd: 9_900 },
      { t: 4, usd: 10_200 },
    ])

    expect(dip.usd).toBe(600)
    expect(dip.at).toBe(3)
  })

  it("carries the top it fell from, not the starting balance", () => {
    // The bug this is here for: a run that grew from $10,000 to $14,700 and
    // then gave back $4,500 fell 31%, not 45% — and the better the run did,
    // the more that mistake overstated it.
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 14_700 },
      { t: 3, usd: 10_200 },
      { t: 4, usd: 11_900 },
    ])

    expect(dip.usd).toBe(4_500)
    expect(dip.peak).toBe(14_700)
    expect((dip.usd / dip.peak) * 100).toBeCloseTo(30.6, 1)
  })

  it("has no top to speak of when nothing ever fell", () => {
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 11_000 },
    ])
    expect(dip.usd).toBe(0)
    expect(dip.at).toBeNull()
  })
})

describe("the typical value", () => {
  it("is the middle one, not the average", () => {
    // An average is dragged around by one enormous day; the middle is not.
    expect(middleOf([1, 2, 3, 4, 1000])).toBe(3)
    expect(middleOf([1, 2, 3, 4])).toBe(2.5)
    expect(middleOf([])).toBe(0)
  })
})

describe("the arrows on the chart", () => {
  it("draws one per fill, not one per round trip", () => {
    // A ladder that bought three times and sold once really did four things at
    // four prices. One blended entry would hide the shape of the ladder, which
    // is the thing you opened the chart to look at.
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      buy(HOUR, 95, 1, 0, 1),
      buy(2 * HOUR, 90, 1, 0, 2),
      sell(3 * HOUR, 98, 3),
    ])

    expect(marks).toHaveLength(4)
    expect(marks.map((mark) => `${mark.label} / ${mark.detail}`)).toEqual([
      "Bought $100.00 / Rung 1",
      "Bought $95.00 / Rung 2",
      "Bought $90.00 / Rung 3",
      "Sold $294.00 · made $0.00 / Took profit · rungs 1-3 · all out",
    ])
  })

  it("names the steps a sell closed, not how many", () => {
    // "all 1 rung" reads as rung #1 rather than "one rung", and throws away the
    // one thing worth knowing: WHICH step just closed.
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      buy(HOUR, 90, 1, 0, 2),
      sell(2 * HOUR, 95, 2, 0, "stop_loss"),
    ])

    expect(marks[2].detail).toBe("Stopped out · rungs 1, 3 · all out")
  })

  it("says plainly when a buy was not one of the rungs", () => {
    // A two-green confirmation or a buy-back lands nowhere near a rung, and
    // inventing a number for it would be worse than saying nothing.
    const [mark] = buildFillMarks([buy(0, 100, 1)])
    expect(mark.label).toBe("Bought $100.00")
    expect(mark.detail).toBeNull()
  })

  it("starts the rungs again after a sell closed the position", () => {
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      sell(HOUR, 110, 1),
      buy(2 * HOUR, 100, 1, 0, 1),
      sell(3 * HOUR, 110, 1),
    ])

    expect(marks[1].detail).toBe("Took profit · rung 1 · all out")
    // The second cycle's own rung, not both cycles' put together.
    expect(marks[3].detail).toBe("Took profit · rung 2 · all out")
  })

  it("carries the dollars, so identical arrows can be told apart", () => {
    const [mark] = buildFillMarks([buy(0, 200, 1.5, 0, 0)])
    expect(mark.valueUsd).toBe(300)
  })
})

describe("measuring one coin's trades", () => {
  /** A closed round trip with a chosen result — the rest is not measured. */
  function trip(pnl: number, returnPct = pnl): BacktestTrade {
    return {
      n: 1,
      entryAt: 0,
      entryPx: 100,
      exitAt: HOUR,
      exitPx: 100 + pnl,
      sz: 1,
      amountUsd: 100,
      pnl,
      returnPct,
      exitReason: "take_profit",
    }
  }

  it("splits the winners from the losers", () => {
    const stats = sideStatsFromTrades([trip(10), trip(-4), trip(6)], 0)

    expect(stats).toMatchObject({
      trades: 3,
      wins: 2,
      losses: 1,
      grossProfit: 16,
      grossLoss: 4,
      largestWin: 10,
      largestLoss: -4,
    })
  })

  it("says what the winners made for every dollar the losers lost", () => {
    expect(sideStatsFromTrades([trip(10), trip(-5)], 0).profitFactor).toBe(2)
  })

  it("refuses to call that infinity when nothing lost", () => {
    // A ratio with nothing under the line is unknown, not enormous — and a
    // strategy that has never lost is the one most likely to be lying.
    expect(sideStatsFromTrades([trip(10), trip(4)], 0).profitFactor).toBeNull()
  })

  it("averages only over the trades that count", () => {
    const stats = sideStatsFromTrades([trip(10), trip(-4)], 0)
    expect(stats.avgTrade).toBe(3)
    expect(stats.avgWin).toBe(10)
    expect(stats.avgLoss).toBe(-4)
  })

  it("leaves an open trip out of the measurements", () => {
    // Nothing has been made or lost yet, so it is not a result.
    const open: BacktestTrade = { ...trip(0), exitAt: null, exitPx: null }
    expect(sideStatsFromTrades([trip(10), open], 0).trades).toBe(1)
  })

  it("says nothing about steadiness with too few trades", () => {
    // One trade has no spread to divide by, and a number there would be a
    // claim rather than a measurement.
    expect(sideStatsFromTrades([trip(10)], 0).sharpe).toBe(0)
    expect(sideStatsFromTrades([], 0).sharpe).toBe(0)
  })

  it("rates a steady run above a wild one that made the same", () => {
    const steady = sideStatsFromTrades([trip(5), trip(5), trip(4), trip(6)], 0)
    const wild = sideStatsFromTrades([trip(30), trip(-20), trip(25), trip(-15)], 0)

    expect(steady.sharpe).toBeGreaterThan(wild.sharpe)
  })

  it("carries the fees it was handed", () => {
    expect(sideStatsFromTrades([trip(10)], 2.5).fees).toBe(2.5)
  })
})

describe("what a sell says it sold", () => {
  it("names the rungs when it knows them", () => {
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      buy(HOUR, 90, 1, 0, 1),
      sell(2 * HOUR, 95, 2),
    ])
    expect(marks[2].detail).toBe("Took profit · rungs 1-2 · all out")
  })

  it("says it sold everything when it cannot name them", () => {
    // "Sold" on its own answers nothing — sold what? A buy the ladder never
    // tagged with a rung (a two-green confirmation, a buy-back) leaves the
    // rungs unknown, but whether the position went flat is always knowable.
    const marks = buildFillMarks([buy(0, 100, 2), sell(HOUR, 110, 2)])
    expect(marks[1].detail).toBe("Took profit · all out")
  })

  it("names what is LEFT when it did not sell the lot", () => {
    // "part of it" was the first attempt and answered nothing — part of what?
    // The tooltip already shows what the sell was worth, so the remainder is
    // the half that was missing.
    const marks = buildFillMarks([buy(0, 100, 2), sell(HOUR, 110, 1)])
    // What was sold sits on the top line; what is LEFT on the second.
    expect(marks[1].label).toBe("Sold $110.00 · made $0.00")
    expect(marks[1].detail).toBe("Took profit · $110.00 left")
  })

  it("counts what is left across several buys", () => {
    const marks = buildFillMarks([
      buy(0, 100, 1),
      buy(HOUR, 90, 1),
      sell(2 * HOUR, 95, 1),
      sell(3 * HOUR, 96, 1),
    ])
    expect(marks[2].detail).toBe("Took profit · $95.00 left")
    expect(marks[3].detail).toBe("Took profit · all out")
  })

  it("says the rungs AND the remainder when it knows both", () => {
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      buy(HOUR, 90, 2, 0, 1),
      sell(2 * HOUR, 95, 1),
    ])
    expect(marks[2].label).toBe("Sold $95.00 · made $0.00")
    expect(marks[2].detail).toBe("Took profit · rungs 1-2 · $190.00 left")
  })

  it("says how much it sold AND whether that made money", () => {
    // Two different questions. The size alone says nothing about the outcome,
    // and the outcome alone loses the size.
    const won = buildFillMarks([buy(0, 100, 1), sell(HOUR, 120, 1, 0.5, "take_profit", 20)])
    const lost = buildFillMarks([buy(0, 100, 1), sell(HOUR, 70, 1, 0.5, "stop_loss", -30)])

    expect(won[1].label).toBe("Sold $120.00 · made +$19.50")
    expect(lost[1].label).toBe("Sold $70.00 · lost -$30.50")
    expect(lost[1].detail).toBe("Stopped out · all out")
  })

  it("keeps the money on the first line and the detail on the second", () => {
    // One line of five figures separated by dots is unreadable by the fourth.
    const marks = buildFillMarks([buy(0, 100, 1, 0, 0), sell(HOUR, 120, 1, 0, "take_profit", 20)])

    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBe("Rung 1")
    expect(marks[1].label).toBe("Sold $120.00 · made +$20.00")
    expect(marks[1].detail).toBe("Took profit · rung 1 · all out")
  })

  it("leaves the second line off a buy that was never a ladder step", () => {
    const marks = buildFillMarks([
      { at: 0, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, reason: "order", rung: null },
    ])
    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBeNull()
  })

  it("says which way it went out, not just that it did", () => {
    const marks = buildFillMarks([
      buy(0, 100, 1),
      sell(HOUR, 80, 1, 0, "stop_loss"),
    ])
    expect(marks[1].detail).toBe("Stopped out · all out")
  })
})

describe("reading a run's fills back", () => {
  it("makes the words now, so a wording change reaches old runs", () => {
    const marks = fillMarksFromStored([
      { at: 0, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, reason: "order", rung: 0 },
    ])
    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBe("Rung 1")
  })

  it("hands back a run saved as sentences rather than making NaN of it", () => {
    // Runs from before the words moved to read time hold no rung, fee or
    // profit — rebuilding from those printed "Rung NaN" on the chart.
    const marks = fillMarksFromStored([
      { at: 0, side: "buy", px: 100, sz: 1, valueUsd: 100, label: "Bought $100.00 · Rung 1" },
      { at: 1, side: "sell", px: 120, sz: 1, valueUsd: 120, label: "Sold $604.57 · Rung 8 · $103.92 left" },
    ])
    // Split onto the two lines rather than rebuilt — the rungs and fees were
    // never saved, so rebuilding printed "Rung NaN" on the chart.
    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBe("Rung 1")
    expect(marks[1].label).toBe("Sold $604.57")
    expect(marks[1].detail).toBe("Rung 8 · $103.92 left")
  })

  it("never prints a rung it does not have", () => {
    const marks = buildFillMarks([
      { at: 0, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, reason: "order" } as never,
    ])
    expect(marks[0].detail).toBeNull()
  })
})
