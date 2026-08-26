import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
import {
  cancelLighterOrder,
  fetchLighterOrderPortfolio,
  modifyLighterOrder,
  placeLighterOrder,
  setLighterBrackets,
} from "@/server/protocols/lighter/orders"
import {
  lighterPrivate,
  lighterSendTx,
} from "@/server/protocols/lighter/client"
import { lighterAccountFacts } from "@/server/protocols/lighter/agent"
import {
  lighterMarketByIndex,
  lighterMarketFacts,
} from "@/server/protocols/lighter/markets"
import { clearLighterNonces } from "@/server/protocols/lighter/nonces"
import { loadLighterKey } from "@/server/protocols/lighter/signer"

vi.mock("@/server/protocols/lighter/client", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/server/protocols/lighter/client")>()
  return { ...real, lighterSendTx: vi.fn(), lighterPrivate: vi.fn() }
})
vi.mock("@/server/protocols/lighter/account", () => ({
  fetchLighterPortfolio: vi.fn(async () => ({ positions: [], orders: [] })),
}))
vi.mock("@/server/protocols/lighter/agent", () => ({
  lighterAccountFacts: vi.fn(),
}))
vi.mock("@/server/protocols/lighter/markets", () => ({
  lighterMarketFacts: vi.fn(),
  lighterMarketByIndex: vi.fn(),
}))
vi.mock("@/server/protocols/lighter/nonces", () => ({
  nextLighterNonce: vi.fn(async () => 7),
  forgetLighterNonce: vi.fn(),
  clearLighterNonces: vi.fn(),
}))

const sent = vi.mocked(lighterSendTx)
const facts = vi.mocked(lighterAccountFacts)
const market = vi.mocked(lighterMarketFacts)
const byIndex = vi.mocked(lighterMarketByIndex)
const privateRead = vi.mocked(lighterPrivate)

const KEY = `0x${"11".repeat(40)}`

/** BTC as Lighter states it: one decimal on price, five on size. */
const BTC = { id: 1, bornAt: null, priceDecimals: 1, sizeDecimals: 5 }

function auth(): OrderAuth {
  return {
    agentKey: KEY,
    accountAddress: "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
    allocateNonce: async () => 42,
  }
}

function order(over: Partial<PlaceOrderParams> = {}): PlaceOrderParams {
  return {
    marketId: "BTC",
    side: "buy",
    kind: "postOnly",
    px: 78_584.1,
    sz: 0.0006,
    reduceOnly: false,
    leverage: null,
    tpPx: null,
    slPx: null,
    ...over,
  }
}

/** The signed body Lighter was actually handed, read back as JSON. */
function bodySent() {
  const call = sent.mock.calls[0]?.[1]
  return JSON.parse(String(call?.txInfo)) as Record<string, unknown>
}

beforeEach(async () => {
  sent.mockReset()
  sent.mockResolvedValue({ code: 200 })
  facts.mockReset()
  facts.mockResolvedValue({ accountIndex: 5, apiKeyIndex: 2 })
  market.mockReset()
  market.mockResolvedValue(BTC)
  byIndex.mockReset()
  byIndex.mockResolvedValue({ symbol: "BTC", facts: BTC })
  privateRead.mockReset()
  clearLighterNonces()
  // The real signer, because what it produces is the thing under test.
  await loadLighterKey({ privateKey: KEY, accountIndex: 5, apiKeyIndex: 2 })
})

afterEach(() => {
  clearLighterNonces()
})

describe("placing a Lighter order", () => {
  it("scales the price and size into Lighter's whole numbers", async () => {
    await placeLighterOrder("mainnet", auth(), order())
    const body = bodySent()
    // $78,584.10 at one decimal place, 0.0006 BTC at five.
    expect(body.Price).toBe(785_841)
    expect(body.BaseAmount).toBe(60)
    expect(body.MarketIndex).toBe(1)
    expect(body.AccountIndex).toBe(5)
    expect(body.ApiKeyIndex).toBe(2)
  }, 60_000)

  it("is always post-only, and never a market order", async () => {
    // Tyler's rule, and Lighter's own numbering: time in force 2 is
    // post-only, and order type 1 is the market order this never sends.
    await placeLighterOrder("mainnet", auth(), order())
    const body = bodySent()
    expect(body.TimeInForce).toBe(2)
    expect(body.Type).toBe(0)
    expect(body.Type).not.toBe(1)
  }, 60_000)

  it("says which way round the order goes", async () => {
    await placeLighterOrder("mainnet", auth(), order())
    expect(bodySent().IsAsk).toBe(0)

    sent.mockClear()
    await placeLighterOrder("mainnet", auth(), order({ side: "sell" }))
    expect(bodySent().IsAsk).toBe(1)
  }, 60_000)

  it("carries the app's own order number and a real signature", async () => {
    const outcome = await placeLighterOrder("mainnet", auth(), order())
    const body = bodySent()
    expect(body.ClientOrderIndex).toBe(42)
    expect(body.Nonce).toBe(7)
    expect(String(body.Sig).length).toBeGreaterThan(20)
    // Post-only rests or is refused; it never fills on arrival, so claiming
    // a fill price here would be inventing one.
    expect(outcome.status).toBe("resting")
    expect(outcome.orderId).toBe("42")
    expect(outcome.avgPx).toBeNull()
  }, 60_000)

  it("marks a reduce-only order as one", async () => {
    await placeLighterOrder("mainnet", auth(), order({ reduceOnly: true }))
    expect(bodySent().ReduceOnly).toBe(1)
  }, 60_000)

  it("refuses a price Lighter's number field cannot hold", async () => {
    // Six decimals on a four-figure price overflows Lighter's 32-bit price.
    // An overflowed price is a real order at a wildly wrong price.
    market.mockResolvedValue({ ...BTC, priceDecimals: 6 })
    await expect(
      placeLighterOrder("mainnet", auth(), order({ px: 5_000 }))
    ).rejects.toThrow(/^LIGHTER_ORDER_SHAPE:/)
    expect(sent).not.toHaveBeenCalled()
  }, 60_000)

  it("refuses a size that rounds away to nothing", async () => {
    // A size under the market's smallest step scales to zero, and an order
    // for nothing is not an order.
    await expect(
      placeLighterOrder("mainnet", auth(), order({ sz: 0.000_000_1 }))
    ).rejects.toThrow(/^LIGHTER_ORDER_SHAPE:/)
    expect(sent).not.toHaveBeenCalled()
  }, 60_000)

  it("does not pretend a stop or target went on with the order", async () => {
    // Lighter takes protection as its own separate order, so saying "ok"
    // here would report a position as protected when nothing was sent.
    const outcome = await placeLighterOrder(
      "mainnet",
      auth(),
      order({ slPx: 70_000 })
    )
    expect(outcome.protection).toBe("partial")
    expect(outcome.protectionNote).toContain("its own order")
  }, 60_000)
})

describe("cancelling a Lighter order", () => {
  it("sends a cancel naming the market and the order", async () => {
    await cancelLighterOrder("mainnet", auth(), {
      marketId: "BTC",
      orderId: "12345",
    })
    expect(sent).toHaveBeenCalledTimes(1)
    // 15 is Lighter's own number for a cancel; 14 is a new order.
    expect(sent.mock.calls[0]?.[1].txType).toBe(15)
    const body = bodySent()
    expect(body.MarketIndex).toBe(1)
    expect(body.Index).toBe(12_345)
  }, 60_000)
})

describe("moving a Lighter order", () => {
  it("cancels the old one before placing the new one", async () => {
    // Lighter has an amend transaction and it is deliberately not used: an
    // amend that half-applies leaves an order at a price nobody chose, and
    // there is no way to rehearse that. Cancel-then-place fails safe.
    await modifyLighterOrder("mainnet", auth(), {
      marketId: "BTC",
      orderId: "12345",
      side: "buy",
      px: 78_000,
      sz: 0.0006,
      reduceOnly: false,
    })
    expect(sent).toHaveBeenCalledTimes(2)
    // The cancel goes first, or the wallet briefly holds two live orders.
    expect(sent.mock.calls[0]?.[1].txType).toBe(15)
    expect(sent.mock.calls[1]?.[1].txType).toBe(14)
    const placed = JSON.parse(String(sent.mock.calls[1]?.[1].txInfo)) as Record<
      string,
      unknown
    >
    expect(placed.Price).toBe(780_000)
    // Still post-only after the move.
    expect(placed.TimeInForce).toBe(2)
  }, 60_000)

  it("does not place a replacement when the cancel is refused", async () => {
    // Placing after a failed cancel is how a wallet ends up holding two
    // orders where it wanted one.
    sent.mockRejectedValueOnce(new Error("EXCHANGE_BUSY"))
    await expect(
      modifyLighterOrder("mainnet", auth(), {
        marketId: "BTC",
        orderId: "12345",
        side: "buy",
        px: 78_000,
        sz: 0.0006,
        reduceOnly: false,
      })
    ).rejects.toThrow("EXCHANGE_BUSY")
    expect(sent).toHaveBeenCalledTimes(1)
  }, 60_000)
})

describe("reading Lighter's resting orders", () => {
  it("turns Lighter's whole numbers back into a price and a size", async () => {
    // **The bug this pins.** Lighter answers 785841 and 60, meaning
    // $78,584.10 and 0.0006 BTC. Copied across unscaled they read as a price
    // ten times over and a size a hundred thousand times over, on a screen
    // about real money.
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        {
          order_index: 991,
          market_index: 1,
          is_ask: false,
          price: "785841",
          remaining_base_amount: "60",
          reduce_only: false,
          trigger_price: "0",
        },
      ],
    })

    const portfolio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    expect(portfolio.orders).toHaveLength(1)
    const resting = portfolio.orders[0]
    expect(resting.px).toBeCloseTo(78_584.1, 4)
    expect(resting.sz).toBeCloseTo(0.0006, 8)
    // The symbol, not Lighter's number, or it matches nothing beside it.
    expect(resting.marketId).toBe("BTC")
    expect(resting.side).toBe("buy")
    expect(resting.trigger).toBe(false)
  }, 60_000)

  it("leaves out a row whose market it cannot name", async () => {
    // Guessing a symbol would put an order on the wrong coin's chart.
    byIndex.mockResolvedValue(null)
    privateRead.mockResolvedValue({
      code: 200,
      orders: [{ order_index: 5, market_index: 999, price: "1", remaining_base_amount: "1" }],
    })
    const portfolio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    expect(portfolio.orders).toEqual([])
  }, 60_000)
})

describe("stops and targets on a Lighter position", () => {
  const longPosition = { szi: 0.0006, protectionOrderIds: [] as string[] }

  /** Every signed body Lighter was handed, in order. */
  function allBodies() {
    return sent.mock.calls.map(
      (call) => JSON.parse(String(call[1].txInfo)) as Record<string, unknown>
    )
  }

  it("guards a long by selling, reduce-only, at the trigger", async () => {
    await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: longPosition,
      targets: [],
      slPx: 70_000,
      slSz: null,
    })
    const [stop] = allBodies()
    expect(stop.IsAsk).toBe(1)
    expect(stop.ReduceOnly).toBe(1)
    expect(stop.TriggerPrice).toBe(700_000)
    // Type 3 is the stop-loss LIMIT. Type 2 fills at whatever the market is,
    // and this app sends no market orders.
    expect(stop.Type).toBe(3)
    expect(stop.Type).not.toBe(2)
    // The whole position, since no size was named.
    expect(stop.BaseAmount).toBe(60)
  }, 60_000)

  it("prices the stop's limit through its trigger so it actually fills", async () => {
    // A stop that rests at its own trigger sits above a market that has
    // already fallen past it, and never gets out.
    await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: longPosition,
      targets: [],
      slPx: 70_000,
      slSz: null,
    })
    const [stop] = allBodies()
    expect(Number(stop.Price)).toBeLessThan(Number(stop.TriggerPrice))
  }, 60_000)

  it("guards a short by buying back, with the limit above the trigger", async () => {
    await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: { szi: -0.0006, protectionOrderIds: [] },
      targets: [],
      slPx: 90_000,
      slSz: null,
    })
    const [stop] = allBodies()
    expect(stop.IsAsk).toBe(0)
    expect(Number(stop.Price)).toBeGreaterThan(Number(stop.TriggerPrice))
  }, 60_000)

  it("takes the old legs off before putting new ones on", async () => {
    // A leg left behind sells the position a second time. On 24 Aug 2026 a
    // Hyperliquid position was found holding four.
    await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: { szi: 0.0006, protectionOrderIds: ["111", "222"] },
      targets: [{ px: 90_000, sz: null }],
      slPx: 70_000,
      slSz: null,
    })
    const kinds = sent.mock.calls.map((call) => call[1].txType)
    // Two cancels first, then the stop and the target.
    expect(kinds).toEqual([15, 15, 14, 14])
  }, 60_000)

  it("places a take-profit as its own limit leg", async () => {
    await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: longPosition,
      targets: [{ px: 90_000, sz: 0.0003 }],
      slPx: null,
      slSz: null,
    })
    const [target] = allBodies()
    // Type 5 is the take-profit LIMIT.
    expect(target.Type).toBe(5)
    expect(target.ReduceOnly).toBe(1)
    // A sized target sells only what it was given, so a second strategy's
    // coins on the same position survive it.
    expect(target.BaseAmount).toBe(30)
  }, 60_000)

  it("answers the stop's own id, and none when there is no stop", async () => {
    const withStop = await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: longPosition,
      targets: [],
      slPx: 70_000,
      slSz: null,
    })
    expect(withStop.slOrderId).toBe("42")

    sent.mockClear()
    const targetsOnly = await setLighterBrackets("mainnet", auth(), {
      marketId: "BTC",
      position: longPosition,
      targets: [{ px: 90_000, sz: null }],
      slPx: null,
      slSz: null,
    })
    expect(targetsOnly.slOrderId).toBeNull()
  }, 60_000)

  it("refuses to guard a position that is not there", async () => {
    await expect(
      setLighterBrackets("mainnet", auth(), {
        marketId: "BTC",
        position: { szi: 0, protectionOrderIds: [] },
        targets: [],
        slPx: 70_000,
        slSz: null,
      })
    ).rejects.toThrow("LIVE_POSITION_GONE")
    expect(sent).not.toHaveBeenCalled()
  }, 60_000)
})
