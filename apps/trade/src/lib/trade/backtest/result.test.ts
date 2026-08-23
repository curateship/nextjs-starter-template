import { describe, expect, it } from "vitest"

import {
  BACKTEST_STOPPED_EARLY,
  buildFillMarks,
  fillMarksFromStored,
  coinWorstDip,
  middleOf,
  openPnlOf,
  openTradePnls,
  pairTrades,
  sideStatsFromTrades,
  worstDip,
  backtestSummarySchema,
  resultSummary,
  stoppedEarly,
  whyNoLadder,
  type BacktestFill,
  type BacktestSummary,
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
    expect(coinWorstDip(pairTrades([buy(0, 100, 1), sell(HOUR, 110, 1)]))).toBe(
      0
    )
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
    const wild = sideStatsFromTrades(
      [trip(30), trip(-20), trip(25), trip(-15)],
      0
    )

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
    const won = buildFillMarks([
      buy(0, 100, 1),
      sell(HOUR, 120, 1, 0.5, "take_profit", 20),
    ])
    const lost = buildFillMarks([
      buy(0, 100, 1),
      sell(HOUR, 70, 1, 0.5, "stop_loss", -30),
    ])

    expect(won[1].label).toBe("Sold $120.00 · made +$19.50")
    expect(lost[1].label).toBe("Sold $70.00 · lost -$30.50")
    expect(lost[1].detail).toBe("Stopped out · all out")
  })

  it("keeps the money on the first line and the detail on the second", () => {
    // One line of five figures separated by dots is unreadable by the fourth.
    const marks = buildFillMarks([
      buy(0, 100, 1, 0, 0),
      sell(HOUR, 120, 1, 0, "take_profit", 20),
    ])

    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBe("Rung 1")
    expect(marks[1].label).toBe("Sold $120.00 · made +$20.00")
    expect(marks[1].detail).toBe("Took profit · rung 1 · all out")
  })

  it("leaves the second line off a buy that was never a ladder step", () => {
    const marks = buildFillMarks([
      {
        at: 0,
        side: "buy",
        px: 100,
        sz: 1,
        fee: 0,
        closedPnl: 0,
        reason: "order",
        rung: null,
      },
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
      {
        at: 0,
        side: "buy",
        px: 100,
        sz: 1,
        fee: 0,
        closedPnl: 0,
        reason: "order",
        rung: 0,
      },
    ])
    expect(marks[0].label).toBe("Bought $100.00")
    expect(marks[0].detail).toBe("Rung 1")
  })

  it("hands back a run saved as sentences rather than making NaN of it", () => {
    // Runs from before the words moved to read time hold no rung, fee or
    // profit — rebuilding from those printed "Rung NaN" on the chart.
    const marks = fillMarksFromStored([
      {
        at: 0,
        side: "buy",
        px: 100,
        sz: 1,
        valueUsd: 100,
        label: "Bought $100.00 · Rung 1",
      },
      {
        at: 1,
        side: "sell",
        px: 120,
        sz: 1,
        valueUsd: 120,
        label: "Sold $604.57 · Rung 8 · $103.92 left",
      },
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
      {
        at: 0,
        side: "buy",
        px: 100,
        sz: 1,
        fee: 0,
        closedPnl: 0,
        reason: "order",
      } as never,
    ])
    expect(marks[0].detail).toBeNull()
  })
})

describe("open profit in a coin result", () => {
  it("separates closed trade money from the total", () => {
    const stats = sideStatsFromTrades(
      [
        {
          n: 1,
          entryAt: 0,
          entryPx: 100,
          exitAt: HOUR,
          exitPx: 108,
          sz: 1,
          amountUsd: 100,
          pnl: 8,
          returnPct: 8,
          exitReason: "take_profit",
        },
      ],
      0
    )

    expect(openPnlOf({ madeOrLost: 2_904, openAtEndUsd: 3_026, stats })).toBe(
      2_896
    )
  })

  it("shows zero when nothing remains open", () => {
    expect(openPnlOf({ madeOrLost: 8, openAtEndUsd: 0, stats: null })).toBe(0)
  })

  it("does not invent the split for an old run without trade stats", () => {
    expect(
      openPnlOf({ madeOrLost: 100, openAtEndUsd: 200, stats: null })
    ).toBeNull()
  })

  it("splits the exact open total across open trade rows", () => {
    const openTrades: BacktestTrade[] = [
      {
        n: 1,
        entryAt: 0,
        entryPx: 100,
        exitAt: null,
        exitPx: null,
        sz: 1,
        amountUsd: 100,
        pnl: 0,
        returnPct: 0,
        exitReason: null,
      },
      {
        n: 2,
        entryAt: 0,
        entryPx: 80,
        exitAt: null,
        exitPx: null,
        sz: 2,
        amountUsd: 160,
        pnl: 0,
        returnPct: 0,
        exitReason: null,
      },
    ]
    const split = openTradePnls(openTrades, {
      madeOrLost: 72,
      openAtEndUsd: 330,
      stats: sideStatsFromTrades([], 0),
    })

    expect(split).not.toBeNull()
    expect(
      [...(split?.values() ?? [])].reduce((sum, pnl) => sum + pnl, 0)
    ).toBe(72)
    expect(split?.get(1)).toBeCloseTo(10.67, 2)
    expect(split?.get(2)).toBeCloseTo(61.33, 2)
  })
})

describe("whether a run counts as having a result", () => {
  function summaryOf(coinsTested: number): BacktestSummary {
    return backtestSummarySchema.parse({
      startingUsd: 10_000,
      endingUsd: 10_000,
      madeOrLost: 0,
      madeOrLostPct: 0,
      fundingPaid: 0,
      worstDipUsd: 0,
      worstDipAt: null,
      coinsTested,
      coinsSkipped: 0,
      coinsThatMadeMoney: 0,
      peakInPlayUsd: 0,
      peakInPlayAt: null,
      peakInPlayHeldMs: 0,
      typicalInPlayUsd: 0,
      potAtWorstDipUsd: null,
      coinsOpenAtEnd: 0,
      openAtEndUsd: 0,
      buyAndHold: 0,
      trades: 0,
      tradesClosed: 0,
      tradesWon: 0,
      warnings: [],
    })
  }

  it("is nothing when the run never tested a coin", () => {
    // The case this exists for: a run stopped in its first fraction of a
    // second still writes a full set of zeroes, and drawn as figures it reads
    // as a finished backtest rather than one that never ran.
    expect(resultSummary(summaryOf(0))).toBeNull()
  })

  it("is nothing when there is no summary at all", () => {
    expect(resultSummary(null)).toBeNull()
    expect(resultSummary(undefined)).toBeNull()
  })

  it("is the figures once a coin was actually walked", () => {
    const summary = summaryOf(1)
    expect(resultSummary(summary)).toBe(summary)
  })
})

describe("why a coin never got a ladder", () => {
  it("says the heaviest reason, in the app's own words", () => {
    // Two reasons over five years of bars. The one that held it back for a
    // thousand of them is the answer; the one that happened twice is noise.
    const why = whyNoLadder({
      trades: 0,
      armRefusals: [
        { reason: "SMART_LADDER_UNDER_BASE", bars: 1_204, lastAt: 1_700 },
        { reason: "SMART_LADDER_COST", bars: 2, lastAt: 900 },
      ],
    })

    expect(why?.words).toBe("Price has already fallen through the base")
    expect(why?.bars).toBe(1_204)
    expect(why?.lastAt).toBe(1_700)
  })

  it("says nothing about a coin that traded", () => {
    expect(
      whyNoLadder({
        trades: 4,
        armRefusals: [{ reason: "SMART_LADDER_COST", bars: 9, lastAt: 1 }],
      })
    ).toBeNull()
  })

  it("says nothing on a run saved before the reasons were kept", () => {
    // Not "never refused" — nothing was recorded, and inventing an answer for
    // an old run is worse than leaving the row quiet.
    expect(whyNoLadder({ trades: 0, armRefusals: [] })).toBeNull()
  })
})

describe("the worst dip on a run that grew", () => {
  it("reports the deepest fall by share, not the biggest one in dollars", () => {
    // The real shape this exists for: an early collapse below the starting
    // pot, then years of growth ending in a shallower but far bigger fall.
    // Picking by dollars reported 19.6% on a run that had been 40.5% down.
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 15_000 },
      { t: 3, usd: 9_000 }, // -40% of 15,000 — only $6,000
      { t: 4, usd: 130_000 },
      { t: 5, usd: 105_000 }, // -19% of 130,000 — but $25,000
    ])

    expect(dip.at).toBe(3)
    expect(dip.peak).toBe(15_000)
    expect(dip.usd).toBe(6_000)
    expect((dip.usd / dip.peak) * 100).toBeCloseTo(40, 5)
  })

  it("still measures against the top it fell from, not the opening balance", () => {
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 20_000 },
      { t: 3, usd: 14_000 },
    ])

    // 30% off its peak, not 40% off what it started with.
    expect(dip.peak).toBe(20_000)
    expect((dip.usd / dip.peak) * 100).toBeCloseTo(30, 5)
  })

  it("says nothing fell when a run only ever went up", () => {
    const dip = worstDip([
      { t: 1, usd: 10_000 },
      { t: 2, usd: 11_000 },
    ])

    expect(dip.usd).toBe(0)
    expect(dip.at).toBeNull()
  })
})

describe("stoppedEarly", () => {
  const summary = (warnings: string[]) => ({ warnings })

  it("spots the run that never reached the end of its window", () => {
    expect(stoppedEarly(summary([BACKTEST_STOPPED_EARLY]))).toBe(true)
  })

  it("is quiet about a run that finished, whatever else it warns about", () => {
    expect(stoppedEarly(summary([]))).toBe(false)
    expect(stoppedEarly(summary(["2 of 156 coins were skipped."]))).toBe(false)
    expect(stoppedEarly(null)).toBe(false)
  })

  it("matches the sentence the engine actually writes", () => {
    // The engine pushes this exact constant, so a reworded warning cannot
    // silently stop the toast. If this ever fails, the two have drifted.
    expect(BACKTEST_STOPPED_EARLY).toContain("stopped early")
  })
})
