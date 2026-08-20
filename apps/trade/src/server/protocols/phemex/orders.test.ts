import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth } from "@/lib/protocols/contracts"
import { packPhemexCredential } from "@/server/protocols/phemex/client"

// Phemex is mainnet-only, so every test runs against "mainnet" — which puts
// the real-money gate in the way. Its environment layer is kept exactly as
// it is (the refusal test below depends on it); only the Settings-toggle
// layer is stubbed out, because reading it needs a database no unit test
// here has.
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
import {
  clearPhemexOrderCaches,
  fetchPhemexOrderInfo,
  fetchPhemexPortfolio,
  placePhemexOrder,
} from "@/server/protocols/phemex/orders"
import { clearPhemexAccountCache } from "@/server/protocols/phemex/account"

/**
 * The order path against canned exchange answers. What is pinned down:
 *
 * - the real-money gate refuses a mainnet order before a single request
 *   leaves the machine;
 * - a "market" order goes out as a capped ImmediateOrCancel LIMIT — never a
 *   naked market order — with the size floored to the exchange's own step;
 * - the portfolio read merges the untriggered protection legs back onto the
 *   position, ids included, so `setBrackets` can replace them;
 * - a long-dead stop still reads as a stop.
 */

const AUTH: OrderAuth = {
  agentKey: packPhemexCredential({ address: "key-id-0000000000", secret: "s3cret" }),
  allocateNonce: async () => 1,
}

const PRODUCTS = {
  code: 0,
  msg: "",
  data: {
    perpProductsV2: [
      {
        symbol: "BTCUSDT",
        status: "Listed",
        settleCurrency: "USDT",
        tickSize: "0.5",
        qtyStepSize: "0.001",
      },
    ],
  },
}

type Sent = { method: string; url: URL }

function stubExchange(
  answers: Array<{ path: string; answer: unknown }>,
  sent: Sent[]
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: string | URL, init?: RequestInit) => {
      const url = new URL(String(rawUrl))
      sent.push({ method: init?.method ?? "GET", url })
      for (const one of answers) {
        if (url.pathname === one.path) return Response.json(one.answer)
      }
      return new Response(null, { status: 404 })
    })
  )
}

beforeEach(() => {
  delete process.env.TRADE_ENABLE_MAINNET
  // The connector shares an answer for two seconds; without this, one case's
  // reply would still be standing when the next one asks.
  clearPhemexOrderCaches()
  clearPhemexAccountCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TRADE_ENABLE_MAINNET
})

describe("the real-money gate", () => {
  it("refuses a mainnet order before anything reaches the exchange", async () => {
    const sent: Sent[] = []
    stubExchange([], sent)
    await expect(
      placePhemexOrder("mainnet", AUTH, {
        marketId: "BTCUSDT",
        side: "buy",
        kind: "limit",
        px: 50_000,
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
  it("sends a market order as a capped IOC limit on a legal tick and step", async () => {
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/public/products", answer: PRODUCTS },
        {
          path: "/g-accounts/positions",
          answer: {
            code: 0,
            msg: "",
            data: {
              account: { accountBalanceRv: "1000", totalUsedBalanceRv: "0" },
              // A hedged account, which is what Tyler's really is: every
              // order must name the position it belongs to.
              positions: [{ symbol: "BTCUSDT", posMode: "Hedged" }],
            },
          },
        },
        {
          path: "/g-orders/create",
          answer: {
            code: 0,
            msg: "",
            data: { orderID: "ord-1", ordStatus: "Filled", cumQtyRq: "0.012" },
          },
        },
        {
          path: "/api-data/g-futures/orders/by-order-id",
          answer: {
            code: 0,
            msg: "",
            data: {
              rows: [
                {
                  orderID: "ord-1",
                  symbol: "BTCUSDT",
                  side: "Buy",
                  ordStatus: "Filled",
                  cumQtyRq: "0.012",
                  cumValueRv: "612",
                },
              ],
            },
          },
        },
      ],
      sent
    )

    process.env.TRADE_ENABLE_MAINNET = "true"
    const outcome = await placePhemexOrder("mainnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "market",
      px: 50_000,
      sz: 0.0129, // floors to 0.012 on the 0.001 step
      reduceOnly: false,
      leverage: null,
      tpPx: null,
      slPx: null,
    })

    const create = sent.find((one) => one.url.pathname === "/g-orders/create")
    expect(create?.method).toBe("PUT")
    expect(create?.url.searchParams.get("ordType")).toBe("Limit")
    expect(create?.url.searchParams.get("timeInForce")).toBe("ImmediateOrCancel")
    // Hedged account: an opening buy belongs to the Long. Sending "Merged"
    // here is what the exchange refused with TE_ERR_INCONSISTENT_POS_MODE,
    // which is why an order placed on phemex.com could not be cancelled.
    expect(create?.url.searchParams.get("posSide")).toBe("Long")
    expect(create?.url.searchParams.get("orderQtyRq")).toBe("0.012")
    // 3% through $50,000 is $51,500 — already on the half-dollar tick.
    expect(create?.url.searchParams.get("priceRp")).toBe("51500")

    expect(outcome.status).toBe("filled")
    expect(outcome.filledSz).toBe(0.012)
    expect(outcome.avgPx).toBe(51_000)
  })

  it("sets leverage the way a hedged account demands", async () => {
    // A hedged account holds a long and a short at once, each with its own
    // leverage, and it refuses the one-way field with the same complaint it
    // gives a wrongly-labelled order: TE_ERR_INCONSISTENT_POS_MODE. Sent that
    // way, "buy $100 of Bitcoin" was refused before the order was looked at,
    // and the message pointed at the order rather than the leverage.
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/public/products", answer: PRODUCTS },
        {
          path: "/g-accounts/positions",
          answer: {
            code: 0,
            msg: "",
            data: {
              account: { accountBalanceRv: "1000", totalUsedBalanceRv: "0" },
              positions: [{ symbol: "BTCUSDT", posMode: "Hedged" }],
            },
          },
        },
        { path: "/g-positions/leverage", answer: { code: 0, msg: "", data: {} } },
        {
          path: "/g-orders/create",
          answer: {
            code: 0,
            msg: "",
            data: { orderID: "ord-3", ordStatus: "New", cumQtyRq: "0" },
          },
        },
      ],
      sent
    )

    process.env.TRADE_ENABLE_MAINNET = "true"
    await placePhemexOrder("mainnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "limit",
      px: 60_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: 3,
      tpPx: null,
      slPx: null,
    })

    const lev = sent.find((one) => one.url.pathname === "/g-positions/leverage")
    // The long side, because this buy opens a long.
    expect(lev?.url.searchParams.get("longLeverageRr")).toBe("3")
    // Never the one-way field, which is what the exchange refuses.
    expect(lev?.url.searchParams.get("leverageRr")).toBeNull()
    // And the short side is left alone — it is a real setting on a position
    // this order has nothing to do with.
    expect(lev?.url.searchParams.get("shortLeverageRr")).toBeNull()
  })

  it("lets a resting order actually rest, at the price asked", async () => {
    // The other half of the same rule. A market order is capped and taken
    // immediately; a postOnly order must sit on the book at the price asked
    // and never cross. Sent as an ordinary limit by mistake it would cross
    // and pay the taker fee, quietly, on every rung of every ladder.
    const sent: Sent[] = []
    stubExchange(
      [
        { path: "/public/products", answer: PRODUCTS },
        {
          path: "/g-accounts/positions",
          answer: {
            code: 0,
            msg: "",
            data: {
              account: { accountBalanceRv: "1000", totalUsedBalanceRv: "0" },
              positions: [{ symbol: "BTCUSDT", posMode: "Hedged" }],
            },
          },
        },
        {
          path: "/g-orders/create",
          answer: {
            code: 0,
            msg: "",
            data: { orderID: "ord-2", ordStatus: "New", cumQtyRq: "0" },
          },
        },
      ],
      sent
    )

    process.env.TRADE_ENABLE_MAINNET = "true"
    await placePhemexOrder("mainnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "postOnly",
      px: 49_000,
      sz: 0.012,
      reduceOnly: false,
      leverage: null,
      tpPx: null,
      slPx: null,
    })

    const create = sent.find((one) => one.url.pathname === "/g-orders/create")
    expect(create?.url.searchParams.get("ordType")).toBe("Limit")
    // Not ImmediateOrCancel: it is meant to wait on the book.
    expect(create?.url.searchParams.get("timeInForce")).toBe("PostOnly")
    // The price asked for, untouched — never capped through the market.
    expect(create?.url.searchParams.get("priceRp")).toBe("49000")
  })

  it("refuses a size the step floors to nothing", async () => {
    process.env.TRADE_ENABLE_MAINNET = "true"
    const sent: Sent[] = []
    stubExchange([{ path: "/public/products", answer: PRODUCTS }], sent)
    await expect(
      placePhemexOrder("mainnet", AUTH, {
        marketId: "BTCUSDT",
        side: "buy",
        kind: "limit",
        px: 50_000,
        sz: 0.0004,
        reduceOnly: false,
        leverage: null,
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_SIZE_TOO_SMALL")
    // The refusal is ours; the exchange never hears about an impossible order.
    expect(
      sent.filter((one) => one.url.pathname === "/g-orders/create")
    ).toHaveLength(0)
  })
})

describe("reading the account back", () => {
  it("shows an order placed on the exchange's own website", async () => {
    // The row below is verbatim from Tyler's account on 19 Aug 2026, after he
    // placed a limit buy on phemex.com and it did not appear here. This
    // endpoint answers in CODE NUMBERS — side 1 is a buy, ordType 2 a limit,
    // ordStatus 5 resting — and a parser that insisted on words threw the
    // whole row away, so the order was invisible.
    stubExchange(
      [
        {
          path: "/g-accounts/positions",
          answer: {
            code: 0,
            msg: "",
            data: {
              account: { accountBalanceRv: "1290.5", totalUsedBalanceRv: "0" },
              positions: [],
            },
          },
        },
        {
          path: "/exchange/order/v2/orderList",
          answer: {
            code: 0,
            msg: "",
            data: [
              {
                orderID: "3124000e-6d99-4a88-91f2-fc0ec46c2454",
                symbol: "HYPEUSDT",
                side: 1,
                ordType: 2,
                ordStatus: 5,
                priceRp: "61",
                orderQtyRq: "1",
              },
            ],
          },
        },
      ],
      []
    )

    const portfolio = await fetchPhemexPortfolio(
      "mainnet",
      "key-id",
      () => AUTH.agentKey
    )
    expect(portfolio.orders).toHaveLength(1)
    const order = portfolio.orders[0]
    expect(order.marketId).toBe("HYPEUSDT")
    expect(order.side).toBe("buy")
    expect(order.px).toBe(61)
    expect(order.sz).toBe(1)
    // Resting on the book, not a trigger waiting to be armed.
    expect(order.trigger).toBe(false)
  })


  it("hangs the untriggered protection legs back on the position", async () => {
    stubExchange(
      [
        {
          path: "/g-accounts/positions",
          answer: {
            code: 0,
            msg: "",
            data: {
              account: {
                accountBalanceRv: "1000",
                totalUsedBalanceRv: "100",
              },
              positions: [
                {
                  symbol: "BTCUSDT",
                  side: "Buy",
                  size: "0.01",
                  avgEntryPriceRp: "50000",
                  positionMarginRv: "100",
                  liquidationPriceRp: "25000",
                  leverageRr: "5",
                },
              ],
            },
          },
        },
        {
          path: "/exchange/order/v2/orderList",
          // This endpoint answers a bare ARRAY and speaks in CODE NUMBERS —
          // ordType 3 is a Stop, 5 a MarketIfTouched, ordStatus 1 is
          // Untriggered. Learned from a live response after a fixture
          // written in the other endpoints' word dialect passed while the
          // real thing failed.
          answer: {
            code: 0,
            msg: "",
            data: [
              {
                orderId: "sl-1",
                symbol: "BTCUSDT",
                side: "Sell",
                ordType: 3,
                ordStatus: 1,
                stopPxRp: "45000",
                orderQtyRq: "0.01",
              },
              {
                orderId: "tp-1",
                symbol: "BTCUSDT",
                side: "Sell",
                ordType: 5,
                ordStatus: 1,
                stopPxRp: "60000",
                orderQtyRq: "0.01",
              },
            ],
          },
        },
      ],
      []
    )

    const portfolio = await fetchPhemexPortfolio(
      "mainnet",
      "key-id",
      () => AUTH.agentKey
    )
    expect(portfolio.positions).toHaveLength(1)
    const held = portfolio.positions[0]
    expect(held.szi).toBe(0.01)
    expect(held.slPx).toBe(45_000)
    expect(held.slOrderId).toBe("sl-1")
    expect(held.tpPx).toBe(60_000)
    expect(held.tpOrderId).toBe("tp-1")
    // The whole position — so no partial-target size is claimed.
    expect(held.tpSz).toBeNull()
    expect(portfolio.orders.every((one) => one.trigger)).toBe(true)
  })

  it("still recognises a dead stop as a stop", async () => {
    stubExchange(
      [
        {
          path: "/api-data/g-futures/orders/by-order-id",
          answer: {
            code: 0,
            msg: "",
            data: {
              rows: [
                {
                  orderID: "sl-9",
                  symbol: "BTCUSDT",
                  side: "Sell",
                  ordType: "Stop",
                  ordStatus: "Filled",
                  stopPxRp: "45000",
                },
              ],
            },
          },
        },
      ],
      []
    )

    await expect(
      fetchPhemexOrderInfo(
        "mainnet",
        "key-id",
        "sl-9",
        "BTCUSDT",
        () => AUTH.agentKey
      )
    ).resolves.toEqual({ kind: "stop", triggerPx: 45_000 })
  })
})
