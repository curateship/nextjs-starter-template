import { describe, expect, it } from "vitest"

import {
  buildLiveTrades,
  gridHoldingFees,
  gridRoundTrips,
  journalPageCursor,
  journalTradePageCursor,
  openFillMarks,
  fillsOutsideTrades,
  unmatchedTradeHistories,
  tradeEndingLabel,
  tradeFillMarks,
  type LiveFill,
  type LiveTriggerKind,
} from "@/lib/trade/live-trades"

/**
 * Turning real fills into real trades.
 *
 * Everything the Journal shows is arithmetic on these rows, so the cases that
 * matter are the ones where the arithmetic could quietly go wrong: a position
 * added to before it is closed, a close that goes straight through flat and
 * out the other side, and a history that starts halfway through a trade.
 */

const MINUTE = 60_000

function fill(over: Partial<LiveFill> & Pick<LiveFill, "side" | "px" | "sz">): LiveFill {
  return {
    fillId: `f${Math.round(over.px * 1000)}-${over.side}-${over.sz}`,
    orderId: "o1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    at: 1_000_000,
    closedPnl: 0,
    fee: 0,
    dir: "",
    liquidation: false,
    ...over,
  }
}

const noTriggers = new Map<string, { kind: LiveTriggerKind; px: number }>()

describe("buildLiveTrades", () => {
  it("one buy and one sell is one trade", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 2, at: 0, fee: 1 }),
        fill({ side: "sell", px: 110, sz: 2, at: 5 * MINUTE, closedPnl: 20, fee: 1 }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(1)
    expect(trades[0].direction).toBe("long")
    expect(trades[0].entryPx).toBe(100)
    expect(trades[0].exitPx).toBe(110)
    expect(trades[0].sz).toBe(2)
    expect(trades[0].amountUsd).toBe(200)
    // The exchange's own figure, less what it charged either way.
    expect(trades[0].pnl).toBeCloseTo(18, 10)
    expect(trades[0].returnPct).toBeCloseTo(9, 10)
    expect(trades[0].heldMs).toBe(5 * MINUTE)
    expect(trades[0].ending).toBe("closed")
  })

  it("adding to a position keeps it one trade, at the blended price", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        fill({ side: "buy", px: 90, sz: 1, at: MINUTE }),
        fill({ side: "sell", px: 110, sz: 2, at: 2 * MINUTE, closedPnl: 30 }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(1)
    expect(trades[0].entryPx).toBe(95)
    expect(trades[0].sz).toBe(2)
    expect(trades[0].pnl).toBeCloseTo(30, 10)
  })

  it("a short is a trade too", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "sell", px: 100, sz: 1, at: 0 }),
        fill({ side: "buy", px: 90, sz: 1, at: MINUTE, closedPnl: 10 }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(1)
    expect(trades[0].direction).toBe("short")
    expect(trades[0].pnl).toBeCloseTo(10, 10)
  })

  it("a fill that goes through flat ends one trade and starts the other", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        // Sells two: one closes the long, one opens a short.
        fill({
          fillId: "flip",
          side: "sell",
          px: 110,
          sz: 2,
          at: MINUTE,
          closedPnl: 10,
          fee: 2,
          dir: "Long > Short",
        }),
        fill({ side: "buy", px: 105, sz: 1, at: 2 * MINUTE, closedPnl: 5 }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(2)
    const long = trades.find((one) => one.direction === "long")
    const short = trades.find((one) => one.direction === "short")
    // Everything the flip banked was made by the long. The short only carries
    // its share of the fee, plus what it makes when it is closed later.
    expect(long?.pnl).toBeCloseTo(9, 10)
    expect(short?.pnl).toBeCloseTo(4, 10)
    expect(short?.entryPx).toBe(110)
  })

  it("leaves out a position that is still open", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 2, at: 0 }),
        fill({ side: "sell", px: 110, sz: 1, at: MINUTE, closedPnl: 10 }),
      ],
      noTriggers
    )

    expect(trades).toEqual([])
  })

  it("ignores a close belonging to a trade older than the records", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "sell", px: 110, sz: 1, at: 0, dir: "Close Long", closedPnl: 5 }),
        fill({ side: "buy", px: 100, sz: 1, at: MINUTE, dir: "Open Long" }),
        fill({ side: "sell", px: 105, sz: 1, at: 2 * MINUTE, dir: "Close Long", closedPnl: 5 }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(1)
    expect(trades[0].entryPx).toBe(100)
  })

  it("overlaps a trade cut by the oldest fill on a Journal page", () => {
    const cutClose = fill({
      fillId: "old-close",
      side: "sell",
      px: 110,
      sz: 1,
      at: 100,
      dir: "Close Long",
      closedPnl: 10,
    })
    const newerTrade = [
      fill({ fillId: "new-open", side: "buy", px: 120, sz: 1, at: 110 }),
      fill({
        fillId: "new-close",
        side: "sell",
        px: 125,
        sz: 1,
        at: 120,
        dir: "Close Long",
        closedPnl: 5,
      }),
    ]
    const page = [cutClose, ...newerTrade]
    const trades = buildLiveTrades(page, noTriggers)

    expect(trades.map((trade) => trade.id)).toEqual([
      "w1:hyperliquid:mainnet:BTC:new-open",
    ])
    // Asking strictly before 101 includes the close at 100 again. The next
    // page can then combine it with the older opening fill.
    expect(journalPageCursor(page, trades)).toBe(101)

    const olderPage = [
      fill({ fillId: "old-open", side: "buy", px: 100, sz: 1, at: 50 }),
      cutClose,
    ]
    expect(buildLiveTrades(olderPage, noTriggers)).toHaveLength(1)
  })

  it("overlaps the boundary timestamp on a complete Journal page", () => {
    const page = [
      fill({ fillId: "open", side: "buy", px: 100, sz: 1, at: 50 }),
      fill({
        fillId: "close",
        side: "sell",
        px: 110,
        sz: 1,
        at: 100,
        dir: "Close Long",
        closedPnl: 10,
      }),
    ]
    expect(journalPageCursor(page, buildLiveTrades(page, noTriggers))).toBe(51)
  })

  it("continues after the oldest trade returned when a trade page is capped", () => {
    const trades = buildLiveTrades(
      [
        fill({ fillId: "old-open", side: "buy", px: 100, sz: 1, at: 50 }),
        fill({ fillId: "old-close", side: "sell", px: 110, sz: 1, at: 60 }),
        fill({ fillId: "new-open", side: "buy", px: 120, sz: 1, at: 100 }),
        fill({ fillId: "new-close", side: "sell", px: 130, sz: 1, at: 110 }),
      ],
      noTriggers
    )
    expect(journalTradePageCursor(trades)).toBe(51)
  })

  it("says it was stopped out when the closing order was the stop", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        fill({
          side: "sell",
          px: 94,
          sz: 1,
          at: MINUTE,
          orderId: "stop-1",
          closedPnl: -6,
        }),
      ],
      new Map([["stop-1", { kind: "stop" as const, px: 95 }]])
    )

    expect(trades[0].ending).toBe("stop")
    expect(trades[0].stopPx).toBe(95)
  })

  it("a stop that closed in profit reads as a trailing one", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        fill({
          side: "sell",
          px: 112,
          sz: 1,
          at: MINUTE,
          orderId: "stop-2",
          closedPnl: 12,
        }),
      ],
      new Map([["stop-2", { kind: "stop" as const, px: 112 }]])
    )

    expect(trades[0].ending).toBe("stop")
    expect(tradeEndingLabel(trades[0])).toBe("Trailing stopped out")
    // The plain words are still there for the stop that cut a loss.
    expect(tradeEndingLabel({ ending: "stop", pnl: -6 })).toBe("Stopped out")
    expect(tradeEndingLabel({ ending: "target", pnl: 12 })).toBe("Took profit")
  })

  it("the exchange closing it itself beats every other reason", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        fill({
          side: "sell",
          px: 50,
          sz: 1,
          at: MINUTE,
          orderId: "stop-1",
          liquidation: true,
        }),
      ],
      new Map([["stop-1", { kind: "stop" as const, px: 95 }]])
    )

    expect(trades[0].ending).toBe("liquidated")
  })

  it("keeps each wallet and market apart, newest trade first", () => {
    const trades = buildLiveTrades(
      [
        fill({ side: "buy", px: 100, sz: 1, at: 0 }),
        fill({ side: "sell", px: 110, sz: 1, at: MINUTE }),
        fill({ side: "buy", px: 10, sz: 1, at: 0, marketKey: "hyperliquid:mainnet:ETH" }),
        fill({
          side: "sell",
          px: 11,
          sz: 1,
          at: 3 * MINUTE,
          marketKey: "hyperliquid:mainnet:ETH",
        }),
        fill({ side: "buy", px: 100, sz: 1, at: 0, walletId: "w2" }),
        fill({ side: "sell", px: 120, sz: 1, at: 2 * MINUTE, walletId: "w2" }),
      ],
      noTriggers
    )

    expect(trades).toHaveLength(3)
    expect(trades.map((one) => one.closedAt)).toEqual([
      3 * MINUTE,
      2 * MINUTE,
      MINUTE,
    ])
  })
})

describe("unmatched trade history", () => {
  it("keeps every fill the finished-trade builder cannot pair", () => {
    const fills = [
      fill({ fillId: "old-close", side: "buy", px: 100, sz: 2, at: 1 }),
      fill({ fillId: "later-open", side: "sell", px: 105, sz: 1, at: 2 }),
    ]
    const trades = buildLiveTrades(fills, noTriggers)
    const unmatched = unmatchedTradeHistories(
      fillsOutsideTrades(fills, trades),
      []
    )

    expect(trades).toEqual([])
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]).toMatchObject({
      id: "unpaired:w1:hyperliquid:mainnet:BTC:old-close",
      walletId: "w1",
      marketKey: "hyperliquid:mainnet:BTC",
      open: false,
      firstAt: 1,
      lastAt: 2,
    })
    expect(unmatched[0].fills.map((one) => one.fillId)).toEqual([
      "old-close",
      "later-open",
    ])
  })
})

describe("tradeFillMarks", () => {
  it("keeps only fills from the position that has not finished", () => {
    const fills = [
      fill({ fillId: "closed-in", side: "buy", px: 100, sz: 1, at: 0 }),
      fill({ fillId: "closed-out", side: "sell", px: 110, sz: 1, at: MINUTE }),
      fill({ fillId: "open-in", side: "buy", px: 120, sz: 1, at: 2 * MINUTE }),
    ]
    const trades = buildLiveTrades(fills, noTriggers)

    expect(fillsOutsideTrades(fills, trades).map((one) => one.fillId)).toEqual([
      "open-in",
    ])
  })

  it("one order is one arrow, however many pieces the exchange filled it in", () => {
    // The real case this comes from: an order for 0.69 ate two prices off the
    // book, so the exchange sent back 0.05 and 0.64 at the same millisecond.
    // Two arrows would sit on top of each other, and pointing at the stack
    // would show whichever landed on top — "$0.50" for a sell that made $6.83.
    const [trade] = buildLiveTrades(
      [
        fill({ fillId: "a", orderId: "in", side: "buy", px: 224.82, sz: 0.69, at: 0 }),
        fill({
          fillId: "b",
          orderId: "out",
          side: "sell",
          px: 234.75,
          sz: 0.05,
          at: MINUTE,
          closedPnl: 0.4965,
          fee: 0.001056,
        }),
        fill({
          fillId: "c",
          orderId: "out",
          side: "sell",
          px: 234.74,
          sz: 0.64,
          at: MINUTE,
          closedPnl: 6.3488,
          fee: 0.013521,
        }),
      ],
      noTriggers
    )

    const marks = tradeFillMarks(trade)
    expect(marks).toHaveLength(2)
    expect(marks[1].sz).toBeCloseTo(0.69, 10)
    // The money on the arrow now agrees with the money on the row.
    expect(marks[1].label).toBe("Sold $161.97 · made $6.83")
    expect(trade.pnl).toBeCloseTo(6.830723, 6)
  })

  it("two goes at a resting order an hour apart stay two arrows", () => {
    const [trade] = buildLiveTrades(
      [
        fill({ fillId: "a", orderId: "in", side: "buy", px: 100, sz: 1, at: 0 }),
        fill({ fillId: "b", orderId: "in", side: "buy", px: 100, sz: 1, at: 60 * MINUTE }),
        fill({ fillId: "c", orderId: "out", side: "sell", px: 110, sz: 2, at: 90 * MINUTE }),
      ],
      noTriggers
    )

    expect(tradeFillMarks(trade)).toHaveLength(3)
  })

  it("says money to the cent, never to six places", () => {
    const [trade] = buildLiveTrades(
      [
        fill({ fillId: "a", orderId: "in", side: "buy", px: 0.039, sz: 100, at: 0 }),
        fill({
          fillId: "b",
          orderId: "out",
          side: "sell",
          px: 0.0395,
          sz: 100,
          at: MINUTE,
          closedPnl: 0.495444,
        }),
      ],
      noTriggers
    )

    // The price keeps its places, because a cent coin needs them. The money
    // does not.
    expect(tradeFillMarks(trade)[1].label).toBe("Sold $3.95 · made $0.50")
  })

  it("names a finished grid's rung instead of its buy and sell sides", () => {
    const [trade] = buildLiveTrades(
      [
        fill({
          fillId: "grid-in",
          orderId: "grid-in",
          side: "buy",
          px: 100,
          sz: 1,
          at: 0,
          fee: 0.5,
          grid: true,
          gridDirection: "long",
          gridRung: 1,
        }),
        fill({
          fillId: "grid-out",
          orderId: "grid-out",
          side: "sell",
          px: 110,
          sz: 1,
          at: MINUTE,
          closedPnl: 10,
          fee: 0.5,
          grid: true,
          gridDirection: "long",
        }),
      ],
      noTriggers
    )

    expect(tradeFillMarks(trade).map((mark) => mark.label)).toEqual([
      "Enter rung 1 - for $100.00",
      "Grid run ended - profit $9.00",
    ])
  })

  it("gives the last grid arrow the whole run, not the rung it closed", () => {
    // Two rungs, and the dearer one is still holding when the cheaper sells.
    // The last sale carries that dearer rung's loss on its own; the run did
    // not. Tyler's USELESS grid, 29 September 2026.
    const [trade] = buildLiveTrades(
      [
        fill({
          fillId: "in-1",
          orderId: "in-1",
          side: "buy",
          px: 100,
          sz: 1,
          at: 0,
          grid: true,
          gridDirection: "long",
          gridRung: 1,
        }),
        fill({
          fillId: "in-2",
          orderId: "in-2",
          side: "buy",
          px: 80,
          sz: 1,
          at: MINUTE,
          grid: true,
          gridDirection: "long",
          gridRung: 2,
        }),
        fill({
          fillId: "out-2",
          orderId: "out-2",
          side: "sell",
          px: 90,
          sz: 1,
          at: MINUTE * 2,
          closedPnl: 0,
          grid: true,
          gridDirection: "long",
        }),
        fill({
          fillId: "out-1",
          orderId: "out-1",
          side: "sell",
          px: 90,
          sz: 1,
          at: MINUTE * 3,
          closedPnl: 0,
          grid: true,
          gridDirection: "long",
        }),
      ],
      noTriggers
    )

    const marks = tradeFillMarks(trade)
    // Rung 2 bought at 80 and sold at 90, so it made $10 on its own coins.
    expect(marks[2].label).toBe("Rung 2 sold - made $10.00")
    // Rung 1 bought at 100 and sold at 90, which is $10 lost on its own. The
    // run bought at 100 and 80 and sold both at 90, so the run is flat.
    expect(marks[3].label).toBe("Grid run ended - profit $0.00")
    expect(trade.pnl).toBe(0)
  })
})

describe("arrows on a position that is still open", () => {
  const fill = (over: Partial<LiveFill> = {}): LiveFill => ({
    fillId: "f1",
    orderId: "o1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy",
    px: 100,
    sz: 1,
    at: 1_000,
    closedPnl: 0,
    fee: 0,
    dir: "Open Long",
    liquidation: false,
    ...over,
  })

  it("says what one sell banked while the rest is still held", () => {
    // A grid recycles a level without the position ever going flat, so this
    // sell is never part of a finished trade — and it still made money.
    const marks = openFillMarks([
      fill({ sz: 2 }),
      fill({
        fillId: "f2",
        orderId: "o2",
        side: "sell",
        closedPnl: 12.5,
        fee: 0.5,
        dir: "Close Long",
        at: 2_000,
      }),
    ])
    const mark = marks[1]
    expect(mark.label).toContain("made $12.00")
    expect(mark.detail).toEqual(["Part closed · $100.00 left"])
  })

  it("says lost when the sell closed under what it paid", () => {
    const [mark] = openFillMarks([
      fill({ side: "sell", closedPnl: -8, fee: 0.25, dir: "Close Long" }),
    ])
    expect(mark.label).toContain("lost $8.25")
    expect(mark.detail).toEqual(["Part closed"])
  })

  it("puts no money on a fill that only opened", () => {
    // Zero here would read as "made nothing", which is a different claim.
    const [mark] = openFillMarks([fill()])
    expect(mark.label).toBe("Bought $100.00")
    expect(mark.detail).toEqual([])
  })

  it("names the FLOCK grid rung entered and exited", () => {
    const marks = openFillMarks([
      fill({
        fillId: "1740958669440",
        orderId: "485554173086064641",
        marketKey: "kucoin:mainnet:FLOCKUSDTM",
        side: "sell",
        px: 0.05229149,
        sz: 1_340,
        at: 1,
        fee: 0.04204236,
        dir: "Sell",
        grid: true,
        gridDirection: "short",
        gridRung: 2,
      }),
      fill({
        fillId: "1740958700036",
        orderId: "485554556588138496",
        marketKey: "kucoin:mainnet:FLOCKUSDTM",
        side: "sell",
        px: 0.05554482,
        sz: 1_930,
        at: 2,
        fee: 0.0643209,
        dir: "Sell",
        grid: true,
        gridDirection: "short",
        gridRung: 3,
      }),
      fill({
        fillId: "1740959206642",
        orderId: "485575236838940672",
        marketKey: "kucoin:mainnet:FLOCKUSDTM",
        side: "buy",
        px: 0.05254477,
        sz: 1_930,
        at: 3,
        fee: 0.06084684,
        dir: "Buy",
        grid: true,
        gridDirection: "short",
      }),
    ])

    expect(marks.map((mark) => mark.label)).toEqual([
      "Enter rung 2 - for $70.07",
      "Enter rung 3 - for $107.20",
      "Rung 3 bought back - made $5.66",
    ])
    expect(marks[2].detail).toEqual(["Still holding $70.41"])
  })
})

/**
 * What a grid level's sell is worth.
 *
 * Every number below is the real CHIP grid on 22 Aug 2026, because that is the
 * day the old arithmetic was caught calling a winning level a loss. Five levels
 * were held, the cheapest one sold, and the exchange booked it against the
 * average of all five.
 */
describe("a grid level's own round trip", () => {
  const CHIP = (over: Partial<LiveFill> & Pick<LiveFill, "side" | "px" | "sz">): LiveFill => ({
    fillId: `${over.side}-${over.px}`,
    orderId: `o-${over.px}`,
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:CHIP",
    at: 1_000,
    closedPnl: 0,
    fee: 0,
    dir: over.side === "buy" ? "Open Long" : "Close Long",
    liquidation: false,
    grid: true,
    ...over,
  })

  // The five buys in the order they happened, cheapest last, which is the
  // order a falling price reaches them in.
  const buys = [
    CHIP({ side: "buy", px: 0.034614, sz: 1403, fee: 0.021853, at: 1 }),
    CHIP({ side: "buy", px: 0.03333, sz: 1470, fee: 0.022047, at: 2 }),
    CHIP({ side: "buy", px: 0.030929, sz: 1543, fee: 0.021475, at: 3 }),
    CHIP({ side: "buy", px: 0.028927, sz: 1624, fee: 0.021139, at: 4 }),
    CHIP({ side: "buy", px: 0.027746, sz: 1713, fee: 0.021388, at: 5 }),
  ]
  // What the exchange booked: 1,713 sold at 0.030268 against an average of
  // 0.030928 across all five levels.
  const sell = CHIP({
    side: "sell",
    px: 0.030268,
    sz: 1713,
    fee: 0.023332,
    closedPnl: -1.13058,
    at: 6,
  })

  it("pays the level that actually sold, not the position average", () => {
    const found = gridRoundTrips([...buys, sell])
    // 1,713 bought at 0.027746 and sold at 0.030268, less both fees.
    expect(found.get(sell.fillId)?.money).toBeCloseTo(4.2755, 3)
  })

  it("writes made, not lost, on the arrow the exchange called a loss", () => {
    const marks = openFillMarks([...buys, sell])
    expect(marks[3].label).toBe("Bought $46.98")
    expect(marks[3].detail).toEqual([])
    const arrow = marks[marks.length - 1]
    expect(arrow.label).toBe("Sold $51.85 · made $4.28")
    expect(arrow.detail).toEqual(["Still holding $182.82"])
  })

  it("leaves a ladder's part-close on the exchange's figure", () => {
    // Same fills, nothing stamped as a grid's. A ladder's exit takes a share
    // off one blended position, so the average IS its story.
    const marks = openFillMarks(
      [...buys, sell].map((one) => ({ ...one, grid: false }))
    )
    const arrow = marks[marks.length - 1]
    expect(arrow.label).toBe("Sold $51.85 · lost $1.15")
  })

  it("keeps the venue's figure on a sell older than the fills on hand", () => {
    // Nothing bought these coins as far as this record goes, so there is no
    // level to pay. Half an answer would be worse than the one it replaced.
    expect(gridRoundTrips([sell]).size).toBe(0)
  })

  it("adds up to the same total once the grid is flat", () => {
    // The whole point: re-attributing WHEN the money is counted must not
    // change HOW MUCH there is. Two levels, both sold, one step each.
    const fills = [
      CHIP({ side: "buy", px: 100, sz: 1, at: 1 }),
      CHIP({ side: "buy", px: 90, sz: 1, at: 2 }),
      CHIP({ side: "sell", px: 95, sz: 1, closedPnl: 0, at: 3 }),
      CHIP({ side: "sell", px: 105, sz: 1, closedPnl: 10, at: 4 }),
    ]
    const found = gridRoundTrips(fills)
    const total = [...found.values()].reduce((sum, one) => sum + one.money, 0)
    // Sold 95 and 105 for coins bought at 90 and 100: $10 either way round.
    expect(total).toBeCloseTo(10, 6)
  })

  it("does not pay one wallet's sell out of another wallet's buy", () => {
    const mine = CHIP({ side: "buy", px: 90, sz: 1, at: 1 })
    const theirs = CHIP({
      side: "sell",
      px: 95,
      sz: 1,
      walletId: "w2",
      fillId: "other",
      at: 2,
    })
    expect(gridRoundTrips([mine, theirs]).size).toBe(0)
  })

  it.each([
    ["long", "buy", "sell"],
    ["short", "sell", "buy"],
  ] as const)(
    "keeps only the opening fees on the %s levels still held",
    (direction, opens, closes) => {
      const openFirst = CHIP({
        side: opens,
        px: 100,
        sz: 2,
        fee: 2,
        at: 10,
      })
      const openLast = CHIP({
        side: opens,
        px: 90,
        sz: 1,
        fee: 1,
        fillId: "last-open",
        at: 20,
      })
      const closeLast = CHIP({
        side: closes,
        px: 95,
        sz: 0.5,
        fee: 9,
        fillId: "part-close",
        at: 30,
      })
      const grid = {
        walletId: "w1",
        marketKey: "hyperliquid:mainnet:CHIP",
        createdAt: 5,
        plan: {
          direction,
          levels: [{ status: "holding" as const, heldSz: 2 }],
          carriedLevels: [{ status: "holding" as const, heldSz: 0.5 }],
        },
      }

      // The close fee belongs to money already banked. Half of the newest
      // opening fee went with it, leaving $2.50 attached to the open lots.
      expect(
        gridHoldingFees([openFirst, openLast, closeLast], grid)
      ).toBeCloseTo(2.5, 10)
    }
  )

  it("does not state an after-fee figure from an incomplete fill history", () => {
    const grid = {
      walletId: "w1",
      marketKey: "hyperliquid:mainnet:CHIP",
      createdAt: 5,
      plan: {
        direction: "long" as const,
        levels: [{ status: "holding" as const, heldSz: 2 }],
        carriedLevels: [],
      },
    }

    expect(
      gridHoldingFees(
        [CHIP({ side: "buy", px: 100, sz: 1, fee: 1, at: 10 })],
        grid
      )
    ).toBeNull()
  })
})

/**
 * MARSCOIN on Aster, 3 October 2026, the morning this was found.
 *
 * The real numbers, so the arithmetic can be checked against an account
 * statement rather than against itself. The grid had followed price down seven
 * times and Pair Out was on. At 06:28 UTC two orders went out 850ms apart at
 * the same price: rung 4 sold the 3,269 coins it bought at 22:15 the night
 * before, and Pair Out cleared 1,082 coins bought at 16:09 by a level the
 * range had since left behind.
 *
 * Both screens got both halves wrong, with the sign flipped on each, because
 * a sale was matched to a buy by rung NUMBER: "rung 4" had been handed to a
 * new level by the downward moves, and every Pair Out close was stamped rung 1
 * whatever it really sold.
 */
describe("a grid sale and the Pair Out rescue beside it", () => {
  const MARS = (
    over: Partial<LiveFill> & Pick<LiveFill, "fillId" | "side" | "px" | "sz">
  ): LiveFill => ({
    orderId: over.fillId,
    walletId: "w1",
    marketKey: "aster:mainnet:MARSCOINUSDT",
    at: 1_000,
    closedPnl: 0,
    fee: 0,
    dir: over.side === "buy" ? "Open long" : "Close long",
    liquidation: false,
    grid: true,
    gridDirection: "long",
    ...over,
  })

  /** The two buys the 06:28 event sold, and the two orders that sold them. */
  const marscoin = (): LiveFill[] => [
    // 16:09, rung 4 at the time. The range left it behind, and it became
    // "rung 4 of range 2".
    MARS({
      fillId: "buy-16:09",
      side: "buy",
      px: 0.13064,
      sz: 1082,
      fee: 0.14135248,
      at: 1,
      gridLevelId: "level-carried",
      gridRung: 4,
    }),
    // 22:15, stamped rung 6 that night. By the morning its level was rung 4.
    MARS({
      fillId: "buy-22:15",
      side: "buy",
      px: 0.10805,
      sz: 3269,
      fee: 0.35321545,
      at: 2,
      gridLevelId: "level-in-range",
      gridRung: 6,
    }),
    // The level's own sale, first out.
    MARS({
      fillId: "sell-own",
      side: "sell",
      px: 0.1109,
      sz: 3269,
      fee: 0.3625321,
      at: 3,
      closedPnl: -16.61870796,
      gridLevelId: "level-in-range",
      gridRung: 4,
      gridEventId: "event-06:28",
      gridClosesRung: 4,
    }),
    // What its profit paid to clear, 850ms later at the same price.
    MARS({
      fillId: "sell-rescue",
      side: "sell",
      px: 0.11089833641404806,
      sz: 1082,
      fee: 0.119992,
      at: 4,
      closedPnl: -5.50239406,
      gridLevelId: "level-carried",
      gridRung: 1,
      gridEventId: "event-06:28",
      gridClosesRung: 4,
      gridClosesRange: 2,
      gridPairOut: true,
    }),
  ]

  it("prices each half against the coins that half really sold", () => {
    const trips = gridRoundTrips(marscoin())

    // $362.53 out, $353.22 in, both fees off: the level made money.
    expect(trips.get("sell-own")?.money).toBeCloseTo(8.6, 2)
    expect(trips.get("sell-own")?.entryPx).toBeCloseTo(0.10805, 5)
    // $119.99 out against the $141.35 it cost: a bag being cut loose.
    expect(trips.get("sell-rescue")?.money).toBeCloseTo(-21.62, 2)
    expect(trips.get("sell-rescue")?.entryPx).toBeCloseTo(0.13064, 5)
  })

  it("names the rescued level by the range it was carried out of", () => {
    const trips = gridRoundTrips(marscoin())

    expect(trips.get("sell-own")?.rung).toBe(4)
    expect(trips.get("sell-own")?.range).toBeUndefined()
    expect(trips.get("sell-rescue")?.rung).toBe(4)
    expect(trips.get("sell-rescue")?.range).toBe(2)
  })

  it("draws one arrow for the two orders, with one total", () => {
    const marks = openFillMarks(marscoin())

    expect(marks).toHaveLength(3)
    const arrow = marks[marks.length - 1]
    expect(arrow.label).toBe("Rung 4 sold, and cleared rung 4 of range 2")
    expect(arrow.detail).toEqual([
      "Rung 4 made $8.60. Rung 4 of range 2 lost $21.62.",
      "Together: lost $13.02",
      "Still holding $0.00",
    ])
    // The arrow sits where the event finished, and carries both sales' coins.
    expect(arrow.at).toBe(4)
    expect(arrow.sz).toBe(4351)
  })

  it("matches a sale to its level after the rungs have been renumbered", () => {
    // The only difference from the real history: nothing names the levels, as
    // on every order placed before levels had names. The rung is then all
    // there is, and it picks the wrong coins — a loss on the level that made
    // money, and a profit on the bag that lost it.
    const unnamed = marscoin().map((fill) => ({
      ...fill,
      gridLevelId: undefined,
      gridEventId: undefined,
      gridClosesRung: undefined,
      gridClosesRange: undefined,
      gridRung: fill.fillId === "sell-rescue" ? 1 : fill.gridRung,
    }))
    const trips = gridRoundTrips(unnamed)

    expect(trips.get("sell-own")?.money).toBeLessThan(0)
    expect(trips.get("sell-rescue")?.money).toBeGreaterThan(0)
    // And with the names on, both halves land the right way up.
    const named = gridRoundTrips(marscoin())
    expect(named.get("sell-own")?.money).toBeGreaterThan(0)
    expect(named.get("sell-rescue")?.money).toBeLessThan(0)
  })

  it("calls a rescue with nothing written down an old rung, not rung 1", () => {
    // The repaired MARSCOIN sales: which buy each sale closed is known, but
    // nothing recorded what rung the carried level was or which range it left,
    // and no shift history exists to work it out. Its `gridRung` is 1 because
    // that is where a carried level's arrow is drawn, and reading that as a
    // name put "cleared rung 1" on the chart.
    const repaired = marscoin().map((fill) =>
      fill.fillId === "sell-rescue"
        ? { ...fill, gridClosesRung: undefined, gridClosesRange: undefined }
        : fill
    )
    const trips = gridRoundTrips(repaired)
    expect(trips.get("sell-rescue")?.rung).toBeUndefined()

    const arrow = openFillMarks(repaired).at(-1)
    expect(arrow?.label).toBe("Rung 4 sold, and cleared an old rung")
    expect(arrow?.detail[0]).toBe("Rung 4 made $8.60. An old rung lost $21.62.")
  })

  it("leaves a sale nothing was paired with as its own arrow", () => {
    const alone = marscoin().filter((fill) => fill.fillId !== "sell-rescue")
    const marks = openFillMarks(alone)

    expect(marks).toHaveLength(3)
    expect(marks[2].label).toBe("Rung 4 sold - made $8.60")
    // The 1,082 coins of the carried level, still held, priced at the sale.
    expect(marks[2].detail).toEqual(["Still holding $119.99"])
  })
})
