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
  clearKucoinMarginModes,
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
  // The account's margin mode is held for five minutes, and a held answer
  // from one test is a wrong answer in the next.
  clearKucoinMarginModes()
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

  it("makes the account's leverage match what was asked, on cross margin", async () => {
    // **On cross the order's own leverage is ignored.** KuCoin keeps a
    // leverage per market on the account and a cross order takes that, so an
    // order asking for 1x on a market set to 3x is accepted, opens at 3x, and
    // says nothing. A real position ended up on three times the leverage it
    // was asked for on 20 Aug 2026.
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        {
          path: "/api/v2/position/getMarginMode",
          answer: ok({ symbol: "XBTUSDTM", marginMode: "CROSS" }),
        },
        { path: "/api/v2/getCrossUserLeverage", answer: ok({ symbol: "XBTUSDTM", leverage: 3 }) },
        { path: "/api/v2/changeCrossUserLeverage", answer: ok(true) },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-11" }) },
        {
          path: "/api/v1/orders/ord-11",
          answer: ok({
            id: "ord-11",
            symbol: "XBTUSDTM",
            status: "open",
            isActive: true,
            filledSize: 0,
            filledValue: 0,
          }),
        },
      ],
      sent
    )

    await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "limit",
      px: 60_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: 1,
      tpPx: null,
      slPx: null,
    })

    const changed = sent.find(
      (one) => one.url.pathname === "/api/v2/changeCrossUserLeverage"
    )
    expect(changed).toBeDefined()
    expect((changed?.body as Record<string, unknown>).leverage).toBe("1")
    // And it happened BEFORE the order, not after.
    const orderAt = sent.findIndex(
      (one) => one.url.pathname === "/api/v1/orders" && one.method === "POST"
    )
    expect(sent.indexOf(changed!)).toBeLessThan(orderAt)
  })

  it("refuses the order rather than opening at a leverage nobody chose", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        {
          path: "/api/v2/position/getMarginMode",
          answer: ok({ symbol: "XBTUSDTM", marginMode: "CROSS" }),
        },
        { path: "/api/v2/getCrossUserLeverage", answer: ok({ symbol: "XBTUSDTM", leverage: 3 }) },
        {
          path: "/api/v2/changeCrossUserLeverage",
          answer: { code: "300009", msg: "cannot change with a position open" },
        },
      ],
      sent
    )

    await expect(
      placeKucoinOrder("mainnet", AUTH, {
        marketId: "XBTUSDTM",
        side: "buy",
        kind: "limit",
        px: 60_000,
        sz: 0.012,
        reduceOnly: false,
        leverage: 1,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow(/LIVE_LEVERAGE/)
    // Nothing was ordered.
    expect(
      sent.some((one) => one.url.pathname === "/api/v1/orders" && one.method === "POST")
    ).toBe(false)
  })

  it("names the market's own margin mode on every order it sends", async () => {
    // KuCoin keeps this per market. An order that says nothing is taken as
    // isolated, and on a market set to cross the exchange refuses it with
    // "the order's margin mode does not match the selected one" — which is
    // what stopped a plain buy on 20 Aug 2026. The account's setting is sent
    // back rather than a preference of ours: it decides how much of the
    // balance is at risk, and an order is no place to change that quietly.
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        {
          path: "/api/v2/position/getMarginMode",
          answer: ok({ symbol: "XBTUSDTM", marginMode: "CROSS" }),
        },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-9" }) },
        {
          path: "/api/v1/orders/ord-9",
          answer: ok({
            id: "ord-9",
            symbol: "XBTUSDTM",
            status: "open",
            isActive: true,
            filledSize: 0,
            filledValue: 0,
          }),
        },
      ],
      sent
    )

    await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "limit",
      px: 60_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: null,
      tpPx: 70_000,
      slPx: 50_000,
    })

    const placed = sent.filter(
      (one) => one.url.pathname === "/api/v1/orders" && one.method === "POST"
    )
    expect(placed.length).toBeGreaterThan(1)
    // The entry AND its protection legs — a leg refused on its own would
    // leave the position open with no stop.
    for (const one of placed) {
      expect((one.body as Record<string, unknown>).marginMode).toBe("CROSS")
    }
  })

  it("assumes the smaller promise when the exchange will not say", async () => {
    // Isolated risks only what is put behind the trade. Guessing cross would
    // quietly put the whole balance behind it.
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-10" }) },
        {
          path: "/api/v1/orders/ord-10",
          answer: ok({
            id: "ord-10",
            symbol: "XBTUSDTM",
            status: "open",
            isActive: true,
            filledSize: 0,
            filledValue: 0,
          }),
        },
      ],
      sent
    )

    await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "limit",
      px: 60_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: null,
      tpPx: null,
      slPx: null,
    })

    const placed = sent.find(
      (one) => one.url.pathname === "/api/v1/orders" && one.method === "POST"
    )
    expect((placed?.body as Record<string, unknown>).marginMode).toBe("ISOLATED")
  })

  it("lets a resting order actually rest, at the price asked", async () => {
    // The other half of the same rule. A market order is capped and taken
    // immediately; a postOnly order must sit on the book at the price asked
    // and never cross. Sent as an ordinary limit by mistake it would cross
    // and pay the taker fee, quietly, on every rung of every ladder.
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/api/v1/contracts/active", answer: CONTRACTS },
        { path: "/api/v1/orders", answer: ok({ orderId: "ord-2" }) },
        {
          path: "/api/v1/orders/ord-2",
          answer: ok({
            id: "ord-2",
            symbol: "XBTUSDTM",
            status: "open",
            isActive: true,
            filledSize: 0,
            filledValue: 0,
          }),
        },
      ],
      sent
    )

    await placeKucoinOrder("mainnet", AUTH, {
      marketId: "XBTUSDTM",
      side: "buy",
      kind: "postOnly",
      px: 60_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: null,
      tpPx: null,
      slPx: null,
    })

    const placed = sent.find(
      (one) => one.url.pathname === "/api/v1/orders" && one.method === "POST"
    )
    const body = placed?.body as Record<string, unknown>
    expect(body.postOnly).toBe(true)
    // Good till cancelled, not immediate-or-cancel: it is meant to wait.
    expect(body.timeInForce).toBe("GTC")
    // The price asked for, untouched — never capped through the market.
    expect(body.price).toBe("60000")
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

/**
 * The rule these tests are for, in `trading-rules.md`'s words: a real resting
 * order moves without ever leaving its level empty.
 *
 * They are written at the level of that rule and not of the mechanism under
 * it. What is asserted is the ORDER of what left the machine — a level covered
 * throughout, or covered twice, but never nothing. A later rewrite of how
 * KuCoin is talked to cannot quietly put the cancel back in front.
 */
describe("moving an order never uncovers its level", () => {
  /** The transcript, one line per request, in the order they went out. */
  function transcript(sent: Sent[]): string[] {
    return sent
      .filter((one) => one.url.pathname.startsWith("/api/v1/orders"))
      .map((one) => `${one.method} ${one.url.pathname}`)
  }

  /**
   * A refusal the exchange made at the HTTP level — a bare status code — as
   * opposed to a body it answered 200 with. Told apart by a guard rather than
   * by `"status" in refusal`, because a union with `unknown` in it collapses
   * to `unknown` and narrowing it gives an `unknown` status back.
   */
  const isHttpRefusal = (value: unknown): value is { status: number } =>
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as { status: unknown }).status === "number"

  /** An exchange that refuses whichever calls the test names. */
  function stubMovingExchange(
    refuse: (method: string, path: string) => unknown,
    sent: Sent[],
    oldOrder: unknown = null
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (rawUrl: string | URL, init?: RequestInit) => {
        const url = new URL(String(rawUrl))
        const method = init?.method ?? "GET"
        sent.push({
          method,
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        const refusal = refuse(method, url.pathname)
        if (isHttpRefusal(refusal)) {
          return new Response("{}", { status: refusal.status })
        }
        if (refusal) return Response.json(refusal)
        if (url.pathname === "/api/v1/contracts/active") {
          return Response.json(CONTRACTS)
        }
        if (url.pathname === "/api/v1/orders" && method === "POST") {
          return Response.json(ok({ orderId: "ord-new" }))
        }
        if (url.pathname === "/api/v1/orders/ord-old" && method === "GET") {
          return Response.json(ok(oldOrder))
        }
        return Response.json(ok(null))
      })
    )
  }

  const MOVE = {
    marketId: "XBTUSDTM",
    orderId: "ord-old",
    side: "buy" as const,
    px: 68_000,
    sz: 0.01,
    reduceOnly: false,
  }

  beforeEach(() => {
    process.env.TRADE_ENABLE_MAINNET = "true"
  })

  it("puts the new order on before taking the old one off", async () => {
    const sent: Sent[] = []
    stubMovingExchange(() => null, sent)
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    await modifyKucoinOrder("mainnet", AUTH, MOVE)

    expect(transcript(sent)).toEqual([
      "POST /api/v1/orders",
      "DELETE /api/v1/orders/ord-old",
    ])
  })

  it("leaves the old order exactly where it was when the new one is refused", async () => {
    const sent: Sent[] = []
    stubMovingExchange(
      (method, path) =>
        method === "POST" && path === "/api/v1/orders"
          ? { code: "300000", msg: "Balance insufficient" }
          : null,
      sent
    )
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    await expect(modifyKucoinOrder("mainnet", AUTH, MOVE)).rejects.toThrow(
      /^LIVE_MOVE_REFUSED:/
    )
    // The one thing that matters: nothing was cancelled, so the level the
    // order was resting on is still covered by that order.
    expect(transcript(sent)).toEqual(["POST /api/v1/orders"])
  })

  it("says two orders are resting when the old one would not come off", async () => {
    const sent: Sent[] = []
    stubMovingExchange(
      (method, path) =>
        method === "DELETE" && path === "/api/v1/orders/ord-old"
          ? { code: "100001", msg: "System busy" }
          : null,
      sent,
      { id: "ord-old", symbol: "XBTUSDTM", status: "open", isActive: true }
    )
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    await expect(modifyKucoinOrder("mainnet", AUTH, MOVE)).rejects.toThrow(
      /^LIVE_MOVE_DOUBLED:.*TWO orders/s
    )
  })

  it("says nothing when the old order had already gone", async () => {
    const sent: Sent[] = []
    stubMovingExchange(
      (method, path) =>
        method === "DELETE" && path === "/api/v1/orders/ord-old"
          ? { code: "100004", msg: "order_not_exist" }
          : null,
      sent,
      { id: "ord-old", symbol: "XBTUSDTM", status: "done", isActive: false }
    )
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    // The old order filled while the new one was going on. One order rests,
    // which is what a move is supposed to leave behind, so there is no alarm.
    await expect(
      modifyKucoinOrder("mainnet", AUTH, MOVE)
    ).resolves.toBeUndefined()
  })

  it("hands back a rate limit as itself, not as a KuCoin move story", async () => {
    const sent: Sent[] = []
    stubMovingExchange(
      (method, path) =>
        method === "POST" && path === "/api/v1/orders" ? { status: 429 } : null,
      sent
    )
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    // The whole message, not a message with the code buried in it. Wrapping a
    // rate limit inside a sentence about how KuCoin moves orders reads as
    // "your order cannot be moved" when the truth is "ask again in a moment",
    // and a substring match would not tell the two apart.
    await expect(modifyKucoinOrder("mainnet", AUTH, MOVE)).rejects.toThrow(
      /^EXCHANGE_BUSY$/
    )
    expect(transcript(sent)).toEqual(["POST /api/v1/orders"])
  })

  it("speaks up when it cannot find out whether the old order went", async () => {
    const sent: Sent[] = []
    stubMovingExchange(
      (method, path) =>
        path === "/api/v1/orders/ord-old" && method !== "POST"
          ? { code: "100001", msg: "System busy" }
          : null,
      sent
    )
    const { modifyKucoinOrder } = await import(
      "@/server/protocols/kucoin/orders"
    )

    // The cancel failed and the read that would settle it failed too. An
    // exchange that will not say is not an exchange saying the old order has
    // gone, and being wrong quietly here means two live orders nobody knows
    // about.
    await expect(modifyKucoinOrder("mainnet", AUTH, MOVE)).rejects.toThrow(
      /^LIVE_MOVE_DOUBLED:.*TWO orders/s
    )
  })
})
