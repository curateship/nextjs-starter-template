import { describe, expect, it } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import {
  applyPaperFill,
  bracketsTie,
  candleLegs,
  capReduceOnly,
  isMarketable,
  legCrosses,
  liquidationAway,
  liquidationPx,
  nextEventOnLeg,
  paperAccountFigures,
  positionMargin,
  positionProfit,
  projectedProfit,
  TAKER_FEE_RATE,
  type PaperPosition,
  type PositionCore,
} from "@/lib/trade/paper"

function core(over: Partial<PositionCore> = {}): PositionCore {
  return {
    szi: 1,
    entryPx: 100,
    leverage: 5,
    maxLeverage: 50,
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    ...over,
  }
}

function bar(over: Partial<CandleBar> = {}): CandleBar {
  return {
    openTime: 1_000,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1,
    ...over,
  }
}

describe("what a fill does to a position", () => {
  it("opens one at the price it filled, with its own leverage", () => {
    const { position, closedPnl, fee } = applyPaperFill(null, {
      side: "buy",
      px: 100,
      sz: 2,
      feeRate: TAKER_FEE_RATE,
      leverage: 5,
      maxLeverage: 50,
    })
    expect(position).toMatchObject({ szi: 2, entryPx: 100, leverage: 5 })
    // Nothing was closed, so nothing was banked — only the fee was paid.
    expect(closedPnl).toBe(0)
    expect(fee).toBeCloseTo(100 * 2 * TAKER_FEE_RATE, 12)
    expect(position?.feesPaid).toBeCloseTo(fee, 12)
  })

  it("averages the entry price when more is bought, and keeps the leverage", () => {
    const opened = applyPaperFill(null, {
      side: "buy",
      px: 100,
      sz: 1,
      feeRate: 0,
      leverage: 5,
      maxLeverage: 50,
    }).position
    // A second buy at 200, asking for 10x — the position it joins keeps its 5x.
    const added = applyPaperFill(opened, {
      side: "buy",
      px: 200,
      sz: 1,
      feeRate: 0,
      leverage: 10,
      maxLeverage: 50,
    })
    expect(added.position).toMatchObject({ szi: 2, entryPx: 150, leverage: 5 })
    expect(added.closedPnl).toBe(0)
  })

  it("banks profit only on the part that closed", () => {
    const held = core({ szi: 2, entryPx: 100 })
    const { position, closedPnl } = applyPaperFill(held, {
      side: "sell",
      px: 120,
      sz: 1,
      feeRate: 0,
      leverage: 5,
      maxLeverage: 50,
    })
    // Sold one of two at 120 having paid 100: $20 banked, one still held at 100.
    expect(closedPnl).toBe(20)
    expect(position).toMatchObject({ szi: 1, entryPx: 100 })
  })

  it("a short banks money when price falls", () => {
    const held = core({ szi: -1, entryPx: 100 })
    const { closedPnl, position } = applyPaperFill(held, {
      side: "buy",
      px: 80,
      sz: 1,
      feeRate: 0,
      leverage: 5,
      maxLeverage: 50,
    })
    expect(closedPnl).toBe(20)
    expect(position).toBeNull()
  })

  it("turning around banks the old trade and starts a fresh one with no brackets", () => {
    const held = core({ szi: 1, entryPx: 100, tpPx: 120, slPx: 90 })
    const { position, closedPnl } = applyPaperFill(held, {
      side: "sell",
      px: 110,
      sz: 2,
      feeRate: 0,
      leverage: 3,
      maxLeverage: 50,
    })
    expect(closedPnl).toBe(10)
    // The new position is short, at the price it turned, on the new leverage —
    // and the old targets are gone, because they pointed the other way.
    expect(position).toMatchObject({
      szi: -1,
      entryPx: 110,
      leverage: 3,
      tpPx: null,
      slPx: null,
    })
  })

  it("closing a position built in pieces leaves nothing behind", () => {
    let held = applyPaperFill(null, {
      side: "buy",
      px: 100,
      sz: 0.1,
      feeRate: 0,
      leverage: 5,
      maxLeverage: 50,
    }).position
    for (const px of [101, 102, 103]) {
      held = applyPaperFill(held, {
        side: "buy",
        px,
        sz: 0.1,
        feeRate: 0,
        leverage: 5,
        maxLeverage: 50,
      }).position
    }
    const flat = applyPaperFill(held, {
      side: "sell",
      px: 105,
      sz: Math.abs(held?.szi ?? 0),
      feeRate: 0,
      leverage: 5,
      maxLeverage: 50,
    })
    // Adding tenths and selling the total back lands on float dust, not zero;
    // without the snap that dust reads as a position that never quite closes.
    expect(flat.position).toBeNull()
  })

  it("a reduce-only order can only ever shrink what is held", () => {
    const long = core({ szi: 2 })
    expect(capReduceOnly(long, "sell", 5)).toBe(2)
    expect(capReduceOnly(long, "buy", 1)).toBeNull()
    expect(capReduceOnly(null, "sell", 1)).toBeNull()
  })
})

describe("what a position is worth", () => {
  it("puts up value over leverage as margin", () => {
    expect(positionMargin({ szi: 2, entryPx: 100, leverage: 5 })).toBe(40)
    expect(positionMargin({ szi: -2, entryPx: 100, leverage: 5 })).toBe(40)
  })

  it("counts profit with the sign of the holding", () => {
    expect(positionProfit({ szi: 2, entryPx: 100 }, 110)).toBe(20)
    expect(positionProfit({ szi: -2, entryPx: 100 }, 110)).toBe(-20)
  })

  it("projects what a target and a stop would each pay", () => {
    const held = { szi: 1, entryPx: 100 }
    expect(projectedProfit(held, 120)).toBe(20)
    expect(projectedProfit(held, 95)).toBe(-5)
  })

  it("puts liquidation nearer the more leverage is used", () => {
    const at5 = liquidationPx(core({ leverage: 5 }))
    const at20 = liquidationPx(core({ leverage: 20 }))
    if (at5 === null || at20 === null) throw new Error("expected a price")
    expect(at5).toBeLessThan(100)
    expect(at20).toBeGreaterThan(at5)
    // 5x on a market allowing 50x: the stake is a fifth, maintenance is a
    // hundredth, so price has 19% to fall before the position goes.
    expect(at5).toBeCloseTo(100 * (1 - (1 / 5 - 1 / 100)), 10)
  })

  it("puts a short's liquidation above the price it opened at", () => {
    const px = liquidationPx(core({ szi: -1, leverage: 5 }))
    expect(px).toBeGreaterThan(100)
  })

  it("puts liquidation far away when nothing is borrowed", () => {
    // 1x on a market allowing 50x: the whole value is put up and the exchange
    // keeps 1%, so price has to lose almost everything before the position goes.
    expect(liquidationPx(core({ leverage: 1, maxLeverage: 50 }))).toBeCloseTo(1, 10)
  })

  it("gives no answer when the figures cannot support one", () => {
    expect(liquidationPx(core({ entryPx: 0 }))).toBeNull()
    expect(liquidationPx(core({ leverage: 0 }))).toBeNull()
    expect(liquidationAway(core({ leverage: 0 }), 100)).toBeNull()
  })

  it("never closes a cash position out on a market that gave no limit", () => {
    // A max of 1 is the fallback used when the exchange did not say, and read
    // as maintenance it would put the line at exactly half the entry price —
    // $100 in, closed at $50, with nothing borrowed. Every replay coin on
    // Binance candles arrives this way.
    expect(liquidationPx(core({ leverage: 1, maxLeverage: 1 }))).toBeNull()
    expect(liquidationAway(core({ leverage: 1, maxLeverage: 1 }), 100)).toBeNull()
  })

  it("says how far away liquidation is as a share of today's price", () => {
    const away = liquidationAway(core({ leverage: 5 }), 100)
    expect(away).toBeCloseTo(0.19, 10)
  })
})

describe("the account's five figures", () => {
  const position: PaperPosition = {
    id: "p1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    szi: 2,
    entryPx: 100,
    leverage: 5,
    maxLeverage: 50,
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 0,
  }

  it("adds banked money to the starting cash and open profit on top", () => {
    const figures = paperAccountFigures({
      startingBalance: 10_000,
      realized: 250,
      positions: [position],
      marks: new Map([["hyperliquid:mainnet:BTC", 110]]),
    })
    // Cash is 10,250. The position holds 40 of it as margin and is up 20.
    expect(figures.inTrades).toBe(40)
    expect(figures.openProfit).toBe(20)
    expect(figures.free).toBe(10_210)
    expect(figures.equity).toBe(10_270)
  })

  it("says a wallet that has never traded is exactly its starting cash, all free", () => {
    expect(
      paperAccountFigures({
        startingBalance: 5_000,
        realized: 0,
        positions: [],
        marks: new Map(),
      })
    ).toEqual({ equity: 5_000, free: 5_000, inTrades: 0, openProfit: 0 })
  })

  it("leaves open profit out rather than guessing when a price is missing", () => {
    const figures = paperAccountFigures({
      startingBalance: 10_000,
      realized: 0,
      positions: [position],
      marks: new Map(),
    })
    expect(figures.openProfit).toBe(0)
    expect(figures.equity).toBe(10_000)
  })
})

describe("reading a candle as a path", () => {
  it("walks a rising candle down to its low first, then up", () => {
    expect(candleLegs(bar({ open: 100, close: 105 }))).toEqual([
      { from: 100, to: 90 },
      { from: 90, to: 110 },
      { from: 110, to: 105 },
    ])
  })

  it("walks a falling candle up to its high first, then down", () => {
    expect(candleLegs(bar({ open: 105, close: 100 }))).toEqual([
      { from: 105, to: 110 },
      { from: 110, to: 90 },
      { from: 90, to: 100 },
    ])
  })

  it("knows which levels a run passed through, either direction", () => {
    expect(legCrosses({ from: 100, to: 90 }, 95)).toBe(true)
    expect(legCrosses({ from: 90, to: 100 }, 95)).toBe(true)
    expect(legCrosses({ from: 100, to: 90 }, 105)).toBe(false)
    // Touching counts: an order at exactly the low of the run gets filled.
    expect(legCrosses({ from: 100, to: 90 }, 90)).toBe(true)
  })
})

describe("what happens first as price travels", () => {
  it("takes the nearest thing first, not the biggest", () => {
    const event = nextEventOnLeg({
      leg: { from: 100, to: 80 },
      at: 100,
      position: core({ slPx: 85 }),
      orders: [{ id: "o1", px: 95 }],
      ignoreTakeProfit: false,
    })
    expect(event).toEqual({ kind: "order", orderId: "o1", px: 95 })
  })

  it("stops at the stop before the liquidation below it", () => {
    const event = nextEventOnLeg({
      leg: { from: 100, to: 50 },
      at: 100,
      position: core({ leverage: 5, slPx: 95 }),
      orders: [],
      ignoreTakeProfit: false,
    })
    expect(event).toEqual({ kind: "stop_loss", px: 95 })
  })

  it("liquidates when nothing else is in the way", () => {
    const event = nextEventOnLeg({
      leg: { from: 100, to: 50 },
      at: 100,
      position: core({ leverage: 5 }),
      orders: [],
      ignoreTakeProfit: false,
    })
    expect(event?.kind).toBe("liquidated")
    expect(event?.px).toBeCloseTo(81, 10)
  })

  it("finds nothing when the run stops short of everything", () => {
    const event = nextEventOnLeg({
      leg: { from: 100, to: 99 },
      at: 100,
      position: core({ tpPx: 120, slPx: 80 }),
      orders: [{ id: "o1", px: 50 }],
      ignoreTakeProfit: false,
    })
    expect(event).toBeNull()
  })

  it("leaves the take-profit alone when the stop has claimed the candle", () => {
    const event = nextEventOnLeg({
      leg: { from: 100, to: 130 },
      at: 100,
      position: core({ tpPx: 120, slPx: 80 }),
      orders: [],
      ignoreTakeProfit: true,
    })
    expect(event).toBeNull()
  })
})

describe("one candle covering both the target and the stop", () => {
  it("gives the candle to the stop", () => {
    const wide = bar({ low: 80, high: 130 })
    expect(bracketsTie(wide, core({ tpPx: 120, slPx: 90 }))).toBe(true)
  })

  it("leaves an ordinary candle alone", () => {
    expect(bracketsTie(bar(), core({ tpPx: 200, slPx: 90 }))).toBe(false)
    expect(bracketsTie(bar(), core({ tpPx: 105, slPx: null }))).toBe(false)
  })
})

describe("an order already through the market", () => {
  it("spots a buy at or above what it costs and a sell at or below", () => {
    expect(isMarketable("buy", 110, 100)).toBe(true)
    expect(isMarketable("buy", 90, 100)).toBe(false)
    expect(isMarketable("sell", 90, 100)).toBe(true)
    expect(isMarketable("sell", 110, 100)).toBe(false)
  })
})
