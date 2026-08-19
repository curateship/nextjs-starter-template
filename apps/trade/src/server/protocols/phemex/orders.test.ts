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
  fetchPhemexOrderInfo,
  fetchPhemexPortfolio,
  placePhemexOrder,
} from "@/server/protocols/phemex/orders"

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
          path: "/g-positions/switch-pos-mode-sync",
          answer: { code: 0, msg: "", data: {} },
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
    expect(create?.url.searchParams.get("posSide")).toBe("Merged")
    expect(create?.url.searchParams.get("orderQtyRq")).toBe("0.012")
    // 3% through $50,000 is $51,500 — already on the half-dollar tick.
    expect(create?.url.searchParams.get("priceRp")).toBe("51500")

    expect(outcome.status).toBe("filled")
    expect(outcome.filledSz).toBe(0.012)
    expect(outcome.avgPx).toBe(51_000)
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
