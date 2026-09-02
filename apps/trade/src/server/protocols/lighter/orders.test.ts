import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
import {
  cancelLighterOrder,
  closeLighterPosition,
  fetchLighterOrderPortfolio,
  modifyLighterOrder,
  placeLighterOrder,
  setLighterBrackets,
  setLighterConfirmDelaysForTests,
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
import {
  clearLighterNonces,
  forgetLighterNonce,
} from "@/server/protocols/lighter/nonces"
import { forgetLighterHeldReads } from "@/server/protocols/lighter/private-feed"
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
  fetchLighterPrices: vi.fn(),
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
  // No real waiting between the read-backs; the cases below say what each
  // look answers, so the clock adds nothing but seconds.
  setLighterConfirmDelaysForTests([0, 0])
  clearLighterNonces()
  // The resting orders and the account are held for ten seconds while the
  // socket is down, so one case would otherwise be answered with the last
  // one's rows. Same reason the nonces are cleared above.
  forgetLighterHeldReads("mainnet", 5)
  // The real signer, because what it produces is the thing under test.
  await loadLighterKey({ privateKey: KEY, accountIndex: 5, apiKeyIndex: 2 })
})

afterEach(() => {
  setLighterConfirmDelaysForTests(null)
  clearLighterNonces()
  forgetLighterHeldReads("mainnet", 5)
})

/**
 * The read-backs a placement makes, answered by path. The order goes out,
 * then the active list is asked, then the inactive list — this stands in for
 * Lighter's answers to those two.
 */
function confirmAnswers(input: {
  active?: unknown[]
  inactive?: unknown[]
}): void {
  privateRead.mockImplementation(async (_network, path) => {
    if (path === "/api/v1/accountActiveOrders") {
      return { orders: input.active ?? [] }
    }
    if (path === "/api/v1/accountInactiveOrders") {
      return { orders: input.inactive ?? [] }
    }
    return { orders: [] }
  })
}

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
    ).rejects.toThrow(/^LIVE_EXCHANGE:/)
    expect(sent).not.toHaveBeenCalled()
  }, 60_000)

  it("refuses a size that rounds away to nothing", async () => {
    // A size under the market's smallest step scales to zero, and an order
    // for nothing is not an order.
    await expect(
      placeLighterOrder("mainnet", auth(), order({ sz: 0.000_000_1 }))
    ).rejects.toThrow(/^LIVE_EXCHANGE:/)
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

  it("calls the order resting once the book actually holds it", async () => {
    confirmAnswers({ active: [{ client_order_index: 42, status: "open" }] })
    const outcome = await placeLighterOrder("mainnet", auth(), order())
    expect(outcome.status).toBe("resting")
  }, 60_000)

  it("turns a silent post-only cancel into a refusal", async () => {
    // Lighter answers the send with 200 and cancels the order without a
    // word — measured 31 Aug 2026, four times on one watched LINK sell. The
    // refusal has to carry the LIVE_ORDER_REFUSED prefix, because that is
    // the one wording `nothingStood` trusts to let the chase try again.
    confirmAnswers({
      inactive: [
        {
          client_order_index: 42,
          status: "canceled-post-only",
          filled_base_amount: "0.0",
          filled_quote_amount: "0.000000",
        },
      ],
    })
    await expect(placeLighterOrder("mainnet", auth(), order())).rejects.toThrow(
      /^LIVE_ORDER_REFUSED:.*post-only/
    )
  }, 60_000)

  it("reports a fill the read-back finds, at Lighter's own price", async () => {
    // A fast market can take the order between the send and the look. The
    // inactive row states plain-unit amounts, so the fill price is their
    // quotient and nothing rescaled.
    confirmAnswers({
      inactive: [
        {
          client_order_index: 42,
          status: "filled",
          filled_base_amount: "0.0006",
          filled_quote_amount: "47.15",
        },
      ],
    })
    const outcome = await placeLighterOrder("mainnet", auth(), order())
    expect(outcome.status).toBe("filled")
    expect(outcome.filledSz).toBeCloseTo(0.0006)
    expect(outcome.avgPx).toBeCloseTo(47.15 / 0.0006)
  }, 60_000)

  it("refuses an order on neither list, and resets the nonce count", async () => {
    // Both lists answered properly and twice, and the order is nowhere: the
    // transaction itself died, most likely on a spent sequence number.
    confirmAnswers({ active: [], inactive: [] })
    await expect(placeLighterOrder("mainnet", auth(), order())).rejects.toThrow(
      /^LIVE_ORDER_REFUSED:.*never kept/
    )
    expect(vi.mocked(forgetLighterNonce)).toHaveBeenCalledWith("mainnet", 5, 2)
  }, 60_000)

  it("calls the order resting when the read-back itself fails", async () => {
    // A refusal invented on a failed read would send the chase back in while
    // the real order still rests, and the same thing would be bought twice.
    // An unverified "resting" is what every placement answered before the
    // read-back existed, so it is the safe wrong answer.
    privateRead.mockRejectedValue(new Error("EXCHANGE_BUSY"))
    const outcome = await placeLighterOrder("mainnet", auth(), order())
    expect(outcome.status).toBe("resting")
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
  it("refuses an invalid replacement before cancelling the old order", async () => {
    await expect(
      modifyLighterOrder("mainnet", auth(), {
        marketId: "BTC",
        orderId: "12345",
        side: "buy",
        px: -1,
        sz: 0.0006,
        reduceOnly: false,
      })
    ).rejects.toThrow("LIVE_PRICE")
    expect(sent).not.toHaveBeenCalled()
  })

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
  it("keeps the ordinary-unit price and size Lighter actually answers", async () => {
    /**
     * **The bug this pins.** A row's `price` and `remaining_base_amount`
     * arrive in ordinary units — measured live on 1 Sep 2026, a $108.63 leg
     * came as `price: "108.626"` with the scaled 108626 in a separate
     * `base_price` field this reader never touches. These used to be divided
     * by the market's decimals as if they were the scaled kind, which put
     * every Lighter resting order at a fraction of its real price, off the
     * bottom of the chart.
     */
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        {
          order_index: 991,
          market_index: 1,
          is_ask: false,
          price: "78584.1",
          base_price: 785841,
          remaining_base_amount: "0.0006",
          base_size: 60,
          reduce_only: false,
          trigger_price: "0.0",
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

  it("lists a trigger leg at the price that sets it off", async () => {
    // The leg's limit sits three percent through its trigger so it fills
    // when it fires. Drawn at the limit it reads as a stop three percent
    // from where the stop actually is.
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        {
          order_index: 992,
          market_index: 1,
          is_ask: false,
          price: "108.626",
          remaining_base_amount: "4.949",
          reduce_only: true,
          trigger_price: "105.462",
        },
      ],
    })
    const portfolio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    // No position on the market, so the leg stays a listed order.
    expect(portfolio.orders).toHaveLength(1)
    expect(portfolio.orders[0].px).toBeCloseTo(105.462, 6)
    expect(portfolio.orders[0].trigger).toBe(true)
  }, 60_000)

  it("leaves out a row whose market it cannot name", async () => {
    // Guessing a symbol would put an order on the wrong coin's chart.
    byIndex.mockResolvedValue(null)
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        {
          order_index: 5,
          market_index: 999,
          price: "1",
          remaining_base_amount: "1",
        },
      ],
    })
    const portfolio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    expect(portfolio.orders).toEqual([])
  }, 60_000)
})

describe("closing a Lighter position", () => {
  it("signs a reduce-only sale that expires at once", async () => {
    /**
     * **An immediate-or-cancel order must expire at zero.** Lighter's signer
     * refuses "OrderExpiry is invalid" for anything else, so a close built
     * with the usual 28-day default never reached the exchange at all.
     */
    const { fetchLighterPrices } =
      await import("@/server/protocols/lighter/markets")
    vi.mocked(fetchLighterPrices).mockResolvedValue(new Map([["BTC", 78_000]]))
    await closeLighterPosition("mainnet", auth(), {
      marketId: "BTC",
      szi: 0.0006,
    })
    const body = bodySent()
    expect(body.OrderExpiry).toBe(0)
    // Immediate-or-cancel, reduce-only, selling a long, priced through the
    // mark so it actually gets out.
    expect(body.TimeInForce).toBe(0)
    expect(body.ReduceOnly).toBe(1)
    expect(body.IsAsk).toBe(1)
    expect(Number(body.Price)).toBeLessThan(780_000)
  }, 60_000)

  it("buys back to close a short", async () => {
    const { fetchLighterPrices } =
      await import("@/server/protocols/lighter/markets")
    vi.mocked(fetchLighterPrices).mockResolvedValue(new Map([["BTC", 78_000]]))
    await closeLighterPosition("mainnet", auth(), {
      marketId: "BTC",
      szi: -0.0006,
    })
    const body = bodySent()
    expect(body.IsAsk).toBe(0)
    expect(Number(body.Price)).toBeGreaterThan(780_000)
  }, 60_000)

  it("does nothing when there is no position to close", async () => {
    await closeLighterPosition("mainnet", auth(), { marketId: "BTC", szi: 0 })
    expect(sent).not.toHaveBeenCalled()
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

  it("refuses invalid protection before cancelling the old legs", async () => {
    await expect(
      setLighterBrackets("mainnet", auth(), {
        marketId: "BTC",
        position: { szi: 0.0006, protectionOrderIds: ["111"] },
        targets: [{ px: -1, sz: null }],
        slPx: 70_000,
        slSz: null,
      })
    ).rejects.toThrow("LIVE_PRICE")
    expect(sent).not.toHaveBeenCalled()
  })

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

  it("says so when Lighter cancels a leg in silence", async () => {
    /**
     * **The send proves nothing.** Lighter answers 200 and can still cancel
     * the order without a word — the behaviour that killed a real watched
     * LINK sell on 31 Aug 2026. A stop that quietly never stood is a
     * position running unprotected, so each leg is read back like an entry.
     */
    confirmAnswers({
      active: [],
      inactive: [{ client_order_index: 42, status: "canceled" }],
    })
    await expect(
      setLighterBrackets("mainnet", auth(), {
        marketId: "BTC",
        position: longPosition,
        targets: [],
        slPx: 70_000,
        slSz: null,
      })
    ).rejects.toThrow(/^LIVE_ORDER_REFUSED:.*cancelled/)
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

describe("pinning protective orders to their position", () => {
  it("gives a position the ids of the stops standing on it", async () => {
    /**
     * **Without this a stop can never be replaced.** `setBrackets` cancels
     * the ids on the position before placing a new one, so a position that
     * carries none leaves its old stop resting and ends up sold twice over.
     */
    facts.mockResolvedValue({ accountIndex: 5, apiKeyIndex: 2 })
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        // A stop: reduce-only, waiting on a trigger.
        {
          order_index: 900,
          market_index: 1,
          is_ask: true,
          price: "700000",
          remaining_base_amount: "60",
          reduce_only: true,
          trigger_price: "705000",
        },
        // An ordinary resting buy, which is not protection and must not be
        // cancelled when a stop is replaced.
        {
          order_index: 901,
          market_index: 1,
          is_ask: false,
          price: "700000",
          remaining_base_amount: "60",
          reduce_only: false,
          trigger_price: "0",
        },
      ],
    })
    const account = await import("@/server/protocols/lighter/account")
    vi.mocked(account.fetchLighterPortfolio).mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 0.0006,
          entryPx: 78_000,
          leverage: 10,
          marginUsed: 4,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    const folio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    expect(folio.positions[0].protectionOrderIds).toEqual(["900"])
  }, 60_000)

  it("fills in the position's own stop and target from its legs", async () => {
    /**
     * **The disappearing bar.** Only the leg ids were pinned; the stop and
     * target prices stayed null on every read, so the chart's draggable
     * lines vanished on the first real answer after a placement — while
     * both legs stood on the exchange as "pending" the whole time. Seen on
     * a live short on 1 Sep 2026; these rows are that account's real ones.
     */
    facts.mockResolvedValue({ accountIndex: 5, apiKeyIndex: 2 })
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        // The stop: buys the short back above the entry.
        {
          order_index: 1125898789999244,
          market_index: 1,
          is_ask: false,
          price: "108.626",
          remaining_base_amount: "4.949",
          reduce_only: true,
          trigger_price: "105.462",
        },
        // The target below it, for part of the position.
        {
          order_index: 1125898789999219,
          market_index: 1,
          is_ask: false,
          price: "92.581",
          remaining_base_amount: "2.000",
          reduce_only: true,
          trigger_price: "89.884",
        },
      ],
    })
    const account = await import("@/server/protocols/lighter/account")
    vi.mocked(account.fetchLighterPortfolio).mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: -4.949,
          entryPx: 101.025,
          leverage: 10,
          marginUsed: 50,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    const folio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    const held = folio.positions[0]
    // At the trigger prices, which is where each leg actually fires.
    expect(held.slPx).toBeCloseTo(105.462, 6)
    expect(held.slOrderId).toBe("1125898789999244")
    expect(held.tpPx).toBeCloseTo(89.884, 6)
    expect(held.targets).toHaveLength(1)
    // A sized target keeps its size; only a whole-position leg reads null.
    expect(held.targets[0].sz).toBeCloseTo(2, 6)
    expect(held.protectionOrderIds).toHaveLength(2)
    // Pinned legs leave the plain list, or each would be drawn twice.
    expect(folio.orders).toEqual([])
  }, 60_000)

  it("reads a whole-position leg as the kind that grows with it", async () => {
    // A leg for everything held reports a null size, so a later replace
    // sends the whole-position kind again instead of freezing today's size.
    facts.mockResolvedValue({ accountIndex: 5, apiKeyIndex: 2 })
    privateRead.mockResolvedValue({
      code: 200,
      orders: [
        {
          order_index: 700,
          market_index: 1,
          is_ask: true,
          price: "87.191",
          remaining_base_amount: "4.949",
          reduce_only: true,
          trigger_price: "89.884",
        },
      ],
    })
    const account = await import("@/server/protocols/lighter/account")
    vi.mocked(account.fetchLighterPortfolio).mockResolvedValue({
      positions: [
        {
          marketId: "BTC",
          szi: 4.949,
          entryPx: 80,
          leverage: 10,
          marginUsed: 40,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })
    const folio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    // Above a long's entry, so it takes the profit.
    expect(folio.positions[0].tpPx).toBeCloseTo(89.884, 6)
    expect(folio.positions[0].tpSz).toBeNull()
    expect(folio.positions[0].slPx).toBeNull()
  }, 60_000)

  it("keeps the position when the resting orders cannot be read", async () => {
    // A server with no signing files, or a re-registered key. Blanking a real
    // position because its orders could not be read is the worse failure.
    facts.mockRejectedValue(new Error("LIGHTER_SIGNER_MISSING:no files"))
    const account = await import("@/server/protocols/lighter/account")
    vi.mocked(account.fetchLighterPortfolio).mockResolvedValue({
      positions: [
        {
          marketId: "PUMP",
          szi: 4069,
          entryPx: 0.0049,
          leverage: 10,
          marginUsed: 2,
          liquidationPx: null,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          tpOrderId: null,
          slOrderId: null,
          protectionOrderIds: [],
        },
      ],
      orders: [],
    })

    const folio = await fetchLighterOrderPortfolio(
      "mainnet",
      "0x887960F1faffbEC960F22f8F95aa4f311F91ff19",
      () => KEY
    )
    expect(folio.positions).toHaveLength(1)
    expect(folio.positions[0].marketId).toBe("PUMP")
    expect(folio.orders).toEqual([])
  }, 60_000)
})

describe("a refused Lighter order says why", () => {
  /**
   * **`LIVE_EXCHANGE:` is the badge that reaches a screen.** A code this app
   * invented does not: every Lighter refusal on the order path used to arrive
   * as "That did not go through. Try it again." — including the country
   * block, which no amount of trying again will fix. The rendering itself is
   * checked in `trade-refusals.test.ts`.
   */
  it("badges a refused order so its reason survives", async () => {
    sent.mockRejectedValue(
      new Error(
        "LIGHTER_REGION_BLOCKED:Lighter will not accept orders from this server's country."
      )
    )
    await expect(
      placeLighterOrder("mainnet", auth(), order())
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message.startsWith("LIVE_EXCHANGE:")).toBe(true)
      expect(error.message).toContain("country")
      return true
    })
  }, 60_000)

  it("badges a refused close, which is where this was found", async () => {
    const { fetchLighterPrices } =
      await import("@/server/protocols/lighter/markets")
    vi.mocked(fetchLighterPrices).mockResolvedValue(new Map([["BTC", 78_000]]))
    sent.mockRejectedValue(
      new Error("LIGHTER_SIGNER_MISSING:Lighter's signing files are not here.")
    )
    await expect(
      closeLighterPosition("mainnet", auth(), { marketId: "BTC", szi: 0.0006 })
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message.startsWith("LIVE_EXCHANGE:")).toBe(true)
      expect(error.message).toContain("signing files")
      return true
    })
  }, 60_000)
})

describe("a refusal before anything is sent still says why", () => {
  it("badges a signer failure raised while closing", async () => {
    /**
     * **This is the one that reached a person.** A missing signer, a key that
     * cannot be matched, a price that will not fit — all happen before the
     * send, so badging only the send left exactly these arriving as "That did
     * not go through. Try it again." with the real reason sitting unread in
     * the Journal.
     */
    const { fetchLighterPrices } =
      await import("@/server/protocols/lighter/markets")
    vi.mocked(fetchLighterPrices).mockResolvedValue(new Map([["BTC", 78_000]]))
    facts.mockRejectedValue(
      new Error(
        "LIGHTER_SIGNER_MISSING:Lighter's signing files are not on this server."
      )
    )
    await expect(
      closeLighterPosition("mainnet", auth(), { marketId: "BTC", szi: 0.0006 })
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message.startsWith("LIVE_EXCHANGE:")).toBe(true)
      expect(error.message).toContain("signing files")
      return true
    })
  }, 60_000)

  it("badges the same failure while placing", async () => {
    facts.mockRejectedValue(
      new Error("KEY_NOT_APPROVED:Lighter has not registered that API key.")
    )
    await expect(
      placeLighterOrder("mainnet", auth(), order())
    ).rejects.toSatisfy((error: Error) => {
      expect(error.message.startsWith("LIVE_EXCHANGE:")).toBe(true)
      expect(error.message).toContain("registered")
      return true
    })
  }, 60_000)
})
