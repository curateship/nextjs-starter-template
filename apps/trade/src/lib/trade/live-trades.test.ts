import { describe, expect, it } from "vitest"

import {
  buildLiveTrades,
  gridRoundTrips,
  journalPageCursor,
  journalTradePageCursor,
  openFillMarks,
  fillsOutsideTrades,
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
    expect(marks[1].label).toBe("Sold $234.74 · made $6.83")
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
    expect(tradeFillMarks(trade)[1].label).toBe("Sold $0.0395 · made $0.50")
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
    const [mark] = openFillMarks([
      fill({ side: "sell", closedPnl: 12.5, fee: 0.5, dir: "Close Long" }),
    ])
    expect(mark.label).toContain("made $12.00")
    expect(mark.detail).toContain("still holding the rest")
  })

  it("says lost when the sell closed under what it paid", () => {
    const [mark] = openFillMarks([
      fill({ side: "sell", closedPnl: -8, fee: 0.25, dir: "Close Long" }),
    ])
    expect(mark.label).toContain("lost $8.25")
  })

  it("puts no money on a fill that only opened", () => {
    // Zero here would read as "made nothing", which is a different claim.
    const [mark] = openFillMarks([fill()])
    expect(mark.label).toBe("Bought $100.00")
    // In dollars: what it put in, not how much of the coin it bought.
    expect(mark.detail).toBe("$100.00 in")
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
    expect(found.get(sell.fillId)?.buyPx).toBeCloseTo(0.027746, 6)
  })

  it("writes made, not lost, on the arrow the exchange called a loss", () => {
    const marks = openFillMarks([...buys, sell])
    const arrow = marks[marks.length - 1]
    expect(arrow.label).toBe("Sold $0.030268 · made $4.28")
    expect(arrow.detail).toBe("Level bought $0.027746 · still holding the rest")
  })

  it("leaves a ladder's part-close on the exchange's figure", () => {
    // Same fills, nothing stamped as a grid's. A ladder's exit takes a share
    // off one blended position, so the average IS its story.
    const marks = openFillMarks(
      [...buys, sell].map((one) => ({ ...one, grid: false }))
    )
    const arrow = marks[marks.length - 1]
    expect(arrow.label).toBe("Sold $0.030268 · lost $1.15")
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
})
