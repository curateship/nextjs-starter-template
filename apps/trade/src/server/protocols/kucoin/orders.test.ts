import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth } from "@/lib/protocols/contracts"
import { packKucoinCredential } from "@/server/protocols/kucoin/client"

/**
 * The order path against canned exchange answers. What is pinned down:
 *
 * - the real-money gate refuses an order before a single request leaves the
 *   machine — the only thing standing between a click and money on a venue
 *   with no practice network;
 * - sizes go out as whole contracts, floored, and an order that floors to
 *   nothing is refused rather than sent;
 * - a "market" order is a capped immediate-or-cancel LIMIT, never a naked
 *   market order;
 * - a stop and a target fire the right way round for the position they
 *   guard, which is the one mapping that would arm a stop where the profit
 *   was meant to be;
 * - the portfolio read merges the separate untriggered book back onto the
 *   position, ids included, so `setBrackets` can replace them;
 * - a closed position's money lands on the fill that closed it, because
 *   KuCoin states no profit on a fill and the Journal is built on that.
 */

// Only the Settings-toggle half of the gate is stubbed: reading it needs a
// database no unit test here has. The environment half is left exactly as it
// is, because the refusal test below depends on it.
vi.mock("@/server/protocols/real-money", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/protocols/real-money")>()
  return {
    ...original,
    assertRealMoneyAllowed: async (network: "mainnet" | "testnet") => {
      original.assertRealOrdersAllowed(network)
    },
  }
})

const {
  fetchKucoinOrderFills,
  fetchKucoinPortfolio,
  placeKucoinOrder,
  triggerDirection,
} = await import("@/server/protocols/kucoin/orders")

const AUTH: OrderAuth = {
  agentKey: packKucoinCredential({
    address: "key-id-000000000000",
    secret: "s3cret",
    passphrase: "pass",
  }),
  allocateNonce: async () => 1,
}

/** XBTUSDTM's real rules: a thousandth of a coin per contract, 10c ticks. */
const CONTRACTS = {
  code: "200000",
  data: [
    {
      symbol: "XBTUSDTM",
      status: "Open",
      settleCurrency: "USDT",
      quoteCurrency: "USDT",
      baseCurrency: "XBT",
      isInverse: false,
      multiplier: 0.001,
      lotSize: 1,
      tickSize: 0.1,
      maxLeverage: 125,
      markPrice: 69000,
      priceChgPct: 0.01,
      turnoverOf24h: 1_000_000,
      openInterest: "1000",
      fundingFeeRate: -0.0001,
      fundingRateGranularity: 28_800_000,
    },
  ],
}

type Sent = { method: string; url: URL; body: unknown }

function stubExchange(answers: Array<{ path: string; answer: unknown }>, sent: Sent[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string | URL, init?: RequestInit) => {
      const url = new URL(String(rawUrl))
      sent.push({
        method: init?.method ?? "GET",
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      for (const one of answers) {
        if (url.pathname === one.path) return Response.json(one.answer)
      }
      return Response.json({ code: "200000", data: null })
    })
  )
}

const ok = (data: unknown) => ({ code: "200000", data })

beforeEach(() => {
  delete process.env.TRADE_ENABLE_MAINNET
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TRADE_ENABLE_MAINNET
})

describe("which way a guard fires", () => {
  it("maps a stop and a target to the side the position needs", () => {
    // A long is sold to get out: its stop fires on the way down, its target
    // on the way up. A short is bought back, so both are the other way round.
    expect(triggerDirection("stop", true)).toBe("down")
    expect(triggerDirection("target", true)).toBe("up")
    expect(triggerDirection("stop", false)).toBe("up")
    expect(triggerDirection("target", false)).toBe("down")
  })
})

describe("the real-money gate", () => {
  it("refuses an order before anything reaches the exchange", async () => {
    const sent: Sent[] = []
    stubExchange([], sent)
    await expect(
      placeKucoinOrder("mainnet", AUTH, {
        marketId: "XBTUSDTM",
        side: "buy",
        kind: "limit",
        px: 69_000,
        sz: 0.01,
        reduceOnly: false,
        leverage: null,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_MAINNET_OFF")
    expect(sent).toHaveLength(0)
  })
})

describe("placing", () => {
  it("sends a market order as a capped IOC limit, sized in whole contracts", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-1" }) },
        {
          path: "/api/v1/orders/ord-1",
          answer: ok({
            id: "ord-1",
            symbol: "XBTUSDTM",
            status: "done",
            isActive: false,
            filledSize: 12,
            filledValue: 828,
          }),
        },
      ],
      sent
    )

    const outcome = await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "market",
      px: 69_000,
      // 0.0129 of a coin is twelve contracts and a remainder that is dropped.
      sz: 0.0129,
      reduceOnly: false,
      leverage: null,
      tpPx: null,
      slPx: null,
    })

    const placed = sent.find(
      (one) => one.url.pathname === "/api/v1/orders" && one.method === "POST"
    )
    const body = placed?.body as Record<string, unknown>
    expect(body.type).toBe("limit")
    expect(body.timeInForce).toBe("IOC")
    expect(body.size).toBe(12)
    // 3% through $69,000 is $71,070, already on the 10c tick.
    expect(body.price).toBe("71070")

    expect(outcome.status).toBe("filled")
    // Twelve contracts is 0.012 of a coin, and the venue's own value over it
    // is the price it actually got.
    expect(outcome.filledSz).toBeCloseTo(0.012, 12)
    expect(outcome.avgPx).toBe(69_000)
  })

  it("refuses a size smaller than one contract", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange([{ path: "/api/v1/contracts/active", answer: CONTRACTS }], sent)
    await expect(
      placeKucoinOrder("mainnet", AUTH, {
        marketId: "XBTUSDTM",
        side: "buy",
        kind: "limit",
        px: 69_000,
        sz: 0.0004,
        reduceOnly: false,
        leverage: null,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_SIZE_TOO_SMALL")
    // The refusal is ours; the exchange never hears about an impossible order.
    expect(
      sent.filter((one) => one.method === "POST")
    ).toHaveLength(0)
  })

  it("arms a stop and a target the right way round, and says so", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-2" }) },
        {
          path: "/api/v1/orders/ord-2",
          answer: ok({ id: "ord-2", isActive: true, filledSize: 0 }),
        },
      ],
      sent
    )

    const outcome = await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "limit",
      px: 69_000,
      sz: 0.01,
      reduceOnly: false,
      leverage: null,
      tpPx: 75_000,
      slPx: 65_000,
    })

    const legs = sent
      .filter((one) => one.method === "POST")
      .map((one) => one.body as Record<string, unknown>)
      .filter((body) => body.stop !== undefined)
    expect(legs).toHaveLength(2)
    const stop = legs.find((leg) => leg.stopPrice === "65000")
    const target = legs.find((leg) => leg.stopPrice === "75000")
    // Guarding a long: both exit by selling, the stop downwards and the
    // target upwards, and both close whatever is held when they fire.
    expect(stop?.side).toBe("sell")
    expect(stop?.stop).toBe("down")
    expect(stop?.closeOrder).toBe(true)
    expect(stop?.stopPriceType).toBe("MP")
    expect(target?.stop).toBe("up")
    expect(outcome.protection).toBe("ok")
  })
})

describe("reading the account back", () => {
  it("hangs the separate untriggered book back on the position", async () => {
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        {
          path: "/api/v1/positions",
          answer: ok([
            {
              symbol: "XBTUSDTM",
              currentQty: 10,
              avgEntryPrice: 69_000,
              liquidationPrice: 50_000,
              posMargin: 100,
              realLeverage: 5,
              isOpen: true,
            },
          ]),
        },
        {
          path: "/api/v1/orders",
          answer: ok({ currentPage: 1, totalPage: 1, items: [] }),
        },
        {
          path: "/api/v1/stopOrders",
          answer: ok({
            currentPage: 1,
            totalPage: 1,
            items: [
              {
                id: "sl-1",
                symbol: "XBTUSDTM",
                side: "sell",
                stop: "down",
                stopPrice: 65_000,
                closeOrder: true,
              },
              {
                id: "tp-1",
                symbol: "XBTUSDTM",
                side: "sell",
                stop: "up",
                stopPrice: 75_000,
                closeOrder: true,
              },
            ],
          }),
        },
      ],
      []
    )

    const portfolio = await fetchKucoinPortfolio(
      "mainnet",
      "key-id",
      () => AUTH.agentKey
    )
    expect(portfolio.positions).toHaveLength(1)
    const held = portfolio.positions[0]
    // Ten contracts of a thousandth of a coin each.
    expect(held.szi).toBeCloseTo(0.01, 12)
    expect(held.slPx).toBe(65_000)
    expect(held.slOrderId).toBe("sl-1")
    expect(held.tpPx).toBe(75_000)
    expect(held.tpOrderId).toBe("tp-1")
    // A leg that closes the whole position states no size, which is what
    // "all of it" means.
    expect(held.tpSz).toBeNull()
    expect(portfolio.orders.every((one) => one.trigger)).toBe(true)
  })
})

describe("what a finished trade made", () => {
  it("puts the closed position's money on the fill that closed it", async () => {
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        {
          path: "/api/v1/fills",
          answer: ok({
            currentPage: 1,
            totalPage: 1,
            items: [
              {
                tradeId: "f1",
                orderId: "o1",
                symbol: "XBTUSDTM",
                side: "buy",
                price: 69_000,
                size: 10,
                fee: 0.4,
                tradeTime: 1_000_000,
              },
              {
                tradeId: "f2",
                orderId: "o2",
                symbol: "XBTUSDTM",
                side: "sell",
                price: 70_000,
                size: 10,
                fee: 0.4,
                tradeTime: 2_000_000,
              },
            ],
          }),
        },
        {
          path: "/api/v1/history-positions",
          answer: ok({
            items: [
              {
                symbol: "XBTUSDTM",
                closeTime: 2_000_000,
                pnl: 9.2,
                tradeFee: 0.8,
              },
            ],
          }),
        },
      ],
      []
    )

    const fills = await fetchKucoinOrderFills(
      "mainnet",
      "key-id",
      0,
      () => AUTH.agentKey
    )
    expect(fills).toHaveLength(2)
    // The opening buy banked nothing, and says so with a zero rather than a
    // share of the result.
    expect(fills[0].closedPnl).toBe(0)
    // The closing sell carries the venue's own realised figure with its
    // trading fee added back, because the app subtracts each fill's fee again
    // when it totals the trade: 9.2 + 0.8 − 0.4 − 0.4 lands on 9.2.
    expect(fills[1].closedPnl).toBeCloseTo(10, 10)
    expect(fills[1].closedPnl - fills[1].fee - fills[0].fee).toBeCloseTo(9.2, 10)
    // Sizes come back in coins, never contracts.
    expect(fills[0].sz).toBeCloseTo(0.01, 12)
  })
})
