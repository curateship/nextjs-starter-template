import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth } from "@/lib/protocols/contracts"
import { clearAsterAccountCache } from "@/server/protocols/aster/account"
import {
  clearAsterClientState,
  packAsterCredential,
} from "@/server/protocols/aster/client"
import {
  changeAsterAccountMarginMode,
  clearAsterOrderState,
  closeAsterPosition,
  fetchAsterOrderPortfolio,
  modifyAsterOrder,
  placeAsterOrder,
  readAsterAccountMarginMode,
  setAsterBrackets,
} from "@/server/protocols/aster/orders"

const ACCOUNT = "0x1111111111111111111111111111111111111111"
const AUTH: OrderAuth = {
  accountAddress: ACCOUNT,
  agentKey: packAsterCredential({
    agentKey: `0x${"2".padStart(64, "0")}`,
  }),
  allocateNonce: async () => 1,
}

type Sent = { method: string; url: URL }

function exchangeInfo() {
  return {
    rateLimits: [
      {
        rateLimitType: "REQUEST_WEIGHT",
        interval: "MINUTE",
        intervalNum: 1,
        limit: 20_000,
      },
      {
        rateLimitType: "ORDERS",
        interval: "MINUTE",
        intervalNum: 1,
        limit: 10_000,
      },
    ],
  }
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 42,
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT",
    status: "NEW",
    price: "90",
    origQty: "1",
    executedQty: "0",
    ...overrides,
  }
}

function stub(
  answer: (method: string, url: URL) => unknown,
  sent: Sent[]
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL, init?: RequestInit) => {
      const url = new URL(String(raw))
      const method = init?.method ?? "GET"
      sent.push({ method, url })
      if (url.pathname.endsWith("/exchangeInfo")) {
        return Response.json(exchangeInfo())
      }
      if (url.pathname.endsWith("/time")) {
        return Response.json({ serverTime: Date.now() })
      }
      return Response.json(answer(method, url))
    })
  )
}

beforeEach(() => {
  clearAsterClientState()
  clearAsterOrderState()
  clearAsterAccountCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Aster orders", () => {
  it("checks Aster again when Settings explicitly saves a mode", async () => {
    const sent: Sent[] = []
    let multiAssets = false
    stub((method, url) => {
      if (!url.pathname.endsWith("/multiAssetsMargin")) return {}
      if (method === "GET") return { multiAssetsMargin: multiAssets }
      multiAssets = url.searchParams.get("multiAssetsMargin") === "true"
      return { code: 200 }
    }, sent)

    await readAsterAccountMarginMode("testnet", AUTH)
    multiAssets = true
    await changeAsterAccountMarginMode("testnet", AUTH, "isolated", true)

    expect(
      sent.filter(
        (one) =>
          one.method === "GET" &&
          one.url.pathname.endsWith("/multiAssetsMargin")
      )
    ).toHaveLength(2)
    expect(
      sent.find(
        (one) =>
          one.method === "POST" &&
          one.url.pathname.endsWith("/multiAssetsMargin")
      )?.url.searchParams.get("multiAssetsMargin")
    ).toBe("false")
    expect(multiAssets).toBe(false)
  })

  it("sets the wallet margin mode and leverage before the opening order, once", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/multiAssetsMargin")) {
        return method === "GET" ? { multiAssetsMargin: true } : { code: 200 }
      }
      if (url.pathname.endsWith("/positionRisk")) {
        return [{ symbol: "BTCUSDT", marginType: "cross", leverage: "1" }]
      }
      if (url.pathname.endsWith("/marginType")) return { code: 200 }
      if (url.pathname.endsWith("/leverage")) return { leverage: 3 }
      if (method === "POST" && url.pathname.endsWith("/order")) return order()
      return {}
    }, sent)
    const params = {
      marketId: "BTCUSDT",
      side: "buy" as const,
      kind: "limit" as const,
      px: 90,
      sz: 1,
      reduceOnly: false,
      leverage: 3,
      marginMode: "isolated" as const,
      tpPx: null,
      slPx: null,
    }

    await placeAsterOrder("testnet", AUTH, params)
    await placeAsterOrder("testnet", AUTH, params)

    const mutations = sent.filter((one) => one.method === "POST")
    expect(mutations.map((one) => one.url.pathname)).toEqual([
      "/fapi/v3/multiAssetsMargin",
      "/fapi/v3/marginType",
      "/fapi/v3/leverage",
      "/fapi/v3/order",
      "/fapi/v3/order",
    ])
    expect(mutations[0].url.searchParams.get("multiAssetsMargin")).toBe("false")
    expect(mutations[1].url.searchParams.get("marginType")).toBe("ISOLATED")
    expect(mutations[2].url.searchParams.get("leverage")).toBe("3")
  })

  it("does not rewrite settings Aster already has before the order", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/multiAssetsMargin")) {
        return { multiAssetsMargin: false }
      }
      if (url.pathname.endsWith("/positionRisk")) {
        return [{ symbol: "BTCUSDT", marginType: "isolated", leverage: "1" }]
      }
      if (method === "POST" && url.pathname.endsWith("/order")) return order()
      return {}
    }, sent)

    await placeAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "market",
      px: 100,
      sz: 1,
      reduceOnly: false,
      leverage: 1,
      marginMode: "isolated",
      tpPx: null,
      slPx: null,
    })

    expect(sent.some((one) => one.url.pathname.endsWith("/marginType"))).toBe(
      false
    )
    expect(sent.some((one) => one.url.pathname.endsWith("/leverage"))).toBe(
      false
    )
    expect(
      sent.some(
        (one) =>
          one.method === "POST" &&
          one.url.pathname.endsWith("/multiAssetsMargin")
      )
    ).toBe(false)
    expect(
      sent.some(
        (one) => one.method === "POST" && one.url.pathname.endsWith("/order")
      )
    ).toBe(true)
  })

  it("switches Aster to Multi-Assets Mode before a cross order", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/multiAssetsMargin")) {
        return method === "GET" ? { multiAssetsMargin: false } : { code: 200 }
      }
      if (url.pathname.endsWith("/positionRisk")) {
        return [{ symbol: "BTCUSDT", marginType: "isolated", leverage: "3" }]
      }
      if (url.pathname.endsWith("/order")) {
        return order({ status: "FILLED", executedQty: "1" })
      }
      return {}
    }, sent)

    await placeAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "limit",
      px: 90,
      sz: 1,
      reduceOnly: false,
      leverage: 3,
      marginMode: "cross",
      tpPx: null,
      slPx: null,
    })

    const accountChange = sent.find(
      (one) =>
        one.method === "POST" && one.url.pathname.endsWith("/multiAssetsMargin")
    )
    expect(accountChange?.url.searchParams.get("multiAssetsMargin")).toBe(
      "true"
    )
    const marketChange = sent.find(
      (one) => one.method === "POST" && one.url.pathname.endsWith("/marginType")
    )
    expect(marketChange?.url.searchParams.get("marginType")).toBe("CROSSED")
  })

  it("does not touch account settings for a reducing order", async () => {
    const sent: Sent[] = []
    stub(
      (_method, url) => (url.pathname.endsWith("/order") ? order() : {}),
      sent
    )

    await placeAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      side: "sell",
      kind: "limit",
      px: 110,
      sz: 1,
      reduceOnly: true,
      leverage: 5,
      marginMode: "cross",
      tpPx: null,
      slPx: null,
    })

    expect(sent.some((one) => one.url.pathname.endsWith("/leverage"))).toBe(
      false
    )
    expect(sent.some((one) => one.url.pathname.endsWith("/marginType"))).toBe(
      false
    )
  })

  it("sends no isolated order when Aster refuses Single-Asset Mode", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/multiAssetsMargin")) {
        return method === "GET"
          ? { multiAssetsMargin: true }
          : { code: -4048, msg: "positions exist" }
      }
      return {}
    }, sent)

    await expect(
      placeAsterOrder("testnet", AUTH, {
        marketId: "BTCUSDT",
        side: "buy",
        kind: "limit",
        px: 90,
        sz: 1,
        reduceOnly: false,
        leverage: 3,
        marginMode: "isolated",
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_MARGIN_MODE")
    expect(sent.some((one) => one.url.pathname.endsWith("/positionRisk"))).toBe(
      false
    )
    expect(sent.some((one) => one.url.pathname.endsWith("/order"))).toBe(false)
  })

  it("caps an immediate order with IOC instead of sending a naked market order", async () => {
    const sent: Sent[] = []
    stub(
      (_method, url) => (url.pathname.endsWith("/order") ? order() : {}),
      sent
    )

    await placeAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "market",
      px: 100,
      sz: 1,
      reduceOnly: false,
      leverage: null,
      marginMode: null,
      tpPx: null,
      slPx: null,
    })
    const placed = sent.find(
      (one) => one.method === "POST" && one.url.pathname.endsWith("/order")
    )
    expect(placed?.url.searchParams.get("type")).toBe("LIMIT")
    expect(placed?.url.searchParams.get("timeInForce")).toBe("IOC")
    expect(placed?.url.searchParams.get("price")).toBe("103")
  })

  it("snaps an immediate order cap to Aster's price tick", async () => {
    const sent: Sent[] = []
    stub(
      (_method, url) => (url.pathname.endsWith("/order") ? order() : {}),
      sent
    )

    await placeAsterOrder("testnet", AUTH, {
      marketId: "ETHUSDT",
      side: "buy",
      kind: "market",
      px: 2_467.43,
      priceTick: 0.01,
      priceMultiplierUp: 1.02,
      sz: 0.008,
      reduceOnly: false,
      leverage: null,
      marginMode: null,
      tpPx: null,
      slPx: null,
    })

    const placed = sent.find(
      (one) => one.method === "POST" && one.url.pathname.endsWith("/order")
    )
    expect(placed?.url.searchParams.get("price")).toBe("2514.31")
  })

  it("sends no order when Aster refuses the wallet margin mode", async () => {
    const sent: Sent[] = []
    stub(
      (_method, url) =>
        url.pathname.endsWith("/positionRisk")
          ? [{ symbol: "BTCUSDT", marginType: "isolated", leverage: "1" }]
          : url.pathname.endsWith("/marginType")
            ? { code: -4048, msg: "position exists" }
            : order(),
      sent
    )

    await expect(
      placeAsterOrder("testnet", AUTH, {
        marketId: "BTCUSDT",
        side: "buy",
        kind: "limit",
        px: 90,
        sz: 1,
        reduceOnly: false,
        leverage: 3,
        marginMode: "cross",
        tpPx: null,
        slPx: null,
      })
    ).rejects.toThrow("LIVE_MARGIN_MODE")
    expect(
      sent.filter(
        (one) => one.method === "POST" && one.url.pathname.endsWith("/order")
      )
    ).toHaveLength(0)
  })

  it("amends in one PUT and never cancels or replaces", async () => {
    const sent: Sent[] = []
    stub(() => order({ price: "88" }), sent)

    await modifyAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      orderId: "42",
      side: "buy",
      px: 88,
      sz: 1.5,
      reduceOnly: false,
    })

    const mutations = sent.filter((one) =>
      ["POST", "PUT", "DELETE"].includes(one.method)
    )
    expect(mutations).toHaveLength(1)
    expect(mutations[0].method).toBe("PUT")
    expect(mutations[0].url.pathname).toBe("/fapi/v3/order")
    expect(mutations[0].url.searchParams.get("quantity")).toBe("1.5")
    expect(mutations[0].url.searchParams.has("side")).toBe(false)
  })

  it("reports a fill race without falling back to cancel and replace", async () => {
    const sent: Sent[] = []
    stub(() => ({ code: -2013, msg: "Order does not exist" }), sent)

    await expect(
      modifyAsterOrder("testnet", AUTH, {
        marketId: "BTCUSDT",
        orderId: "42",
        side: "buy",
        px: 88,
        sz: 1,
        reduceOnly: false,
      })
    ).rejects.toThrow("LIVE_ORDER_GONE")
    const mutations = sent.filter((one) =>
      ["POST", "PUT", "DELETE"].includes(one.method)
    )
    expect(mutations.map((one) => one.method)).toEqual(["PUT"])
  })

  it("uses whole-position protection by default and a quantity for a partial target", async () => {
    const sent: Sent[] = []
    let id = 1
    stub(
      (_method, url) =>
        url.pathname.endsWith("/order")
          ? order({ orderId: id++, type: url.searchParams.get("type") })
          : {},
      sent
    )

    await placeAsterOrder("testnet", AUTH, {
      marketId: "BTCUSDT",
      side: "buy",
      kind: "limit",
      px: 90,
      sz: 2,
      reduceOnly: false,
      leverage: null,
      marginMode: null,
      tpPx: 110,
      slPx: 80,
    })
    const protection = sent.filter((one) =>
      one.url.searchParams.get("type")?.endsWith("_MARKET")
    )
    expect(protection).toHaveLength(2)
    expect(
      protection.every(
        (one) => one.url.searchParams.get("closePosition") === "true"
      )
    ).toBe(true)
    expect(
      protection.every((one) => !one.url.searchParams.has("quantity"))
    ).toBe(true)

    sent.length = 0
    await setAsterBrackets("testnet", AUTH, {
      marketId: "BTCUSDT",
      position: { szi: 2, tpOrderId: null, slOrderId: null },
      tpPx: 120,
      tpSz: 0.5,
      slPx: null,
    })
    const partial = sent.find(
      (one) => one.url.searchParams.get("type") === "TAKE_PROFIT_MARKET"
    )
    expect(partial?.url.searchParams.get("quantity")).toBe("0.5")
    expect(partial?.url.searchParams.has("closePosition")).toBe(false)
  })

  it("reads a whole-position target back as tracking everything left", async () => {
    const sent: Sent[] = []
    stub((_method, url) => {
      if (url.pathname.endsWith("/accountWithJoinMargin")) {
        return {
          totalMarginBalance: "100",
          totalUnrealizedProfit: "0",
          availableBalance: "90",
          positions: [
            {
              symbol: "BTCUSDT",
              positionSide: "BOTH",
              positionInitialMargin: "10",
            },
          ],
        }
      }
      if (url.pathname.endsWith("/positionRisk")) {
        return [
          {
            symbol: "BTCUSDT",
            positionAmt: "2",
            entryPrice: "90",
            leverage: "3",
            marginType: "cross",
            positionSide: "BOTH",
            isolatedMargin: "0",
          },
        ]
      }
      if (url.pathname.endsWith("/openOrders")) {
        return [
          order({
            orderId: 9,
            side: "SELL",
            type: "TAKE_PROFIT_MARKET",
            stopPrice: "110",
            closePosition: true,
          }),
        ]
      }
      return {}
    }, sent)

    const portfolio = await fetchAsterOrderPortfolio(
      "testnet",
      ACCOUNT,
      () => AUTH.agentKey
    )
    expect(portfolio.positions[0]).toMatchObject({
      tpPx: 110,
      tpSz: null,
      tpOrderId: "9",
    })
    expect(portfolio.orders).toEqual([])

    await fetchAsterOrderPortfolio("testnet", ACCOUNT, () => AUTH.agentKey)
    expect(
      sent.filter((one) =>
        one.url.pathname.endsWith("/accountWithJoinMargin")
      )
    ).toHaveLength(1)
    expect(
      sent.filter((one) => one.url.pathname.endsWith("/openOrders"))
    ).toHaveLength(1)
  })

  it("removes whole-position legs after closing the position", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/premiumIndex")) return { markPrice: "100" }
      if (method === "POST" && url.pathname.endsWith("/order")) {
        return order({
          type: "MARKET",
          status: "FILLED",
          avgPrice: "100",
          executedQty: "2",
        })
      }
      if (method === "GET" && url.pathname.endsWith("/order")) {
        return order({
          type: "MARKET",
          status: "FILLED",
          avgPrice: "100",
          executedQty: "2",
        })
      }
      if (url.pathname.endsWith("/openOrders")) {
        return [
          order({ orderId: 8, type: "STOP_MARKET" }),
          order({ orderId: 9, type: "TAKE_PROFIT_MARKET" }),
        ]
      }
      return order()
    }, sent)

    await closeAsterPosition("testnet", AUTH, {
      marketId: "BTCUSDT",
      szi: 2,
    })
    expect(
      sent
        .filter((one) => one.method === "DELETE")
        .map((one) => one.url.searchParams.get("orderId"))
    ).toEqual(["8", "9"])
  })

  it("keeps a close cap inside Aster's price band and on its tick", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/premiumIndex")) {
        return { markPrice: "2467.43" }
      }
      if (
        (method === "POST" || method === "GET") &&
        url.pathname.endsWith("/order")
      ) {
        return order({ status: "FILLED", executedQty: "0.008" })
      }
      if (url.pathname.endsWith("/openOrders")) return []
      return {}
    }, sent)

    await closeAsterPosition("testnet", AUTH, {
      marketId: "ETHUSDT",
      szi: 0.008,
      priceTick: 0.1,
      priceMultiplierDown: 0.98,
    })

    const close = sent.find(
      (one) => one.method === "POST" && one.url.pathname.endsWith("/order")
    )
    expect(close?.url.searchParams.get("price")).toBe("2420.5")
  })

  it("keeps protection when an immediate close only fills part of the position", async () => {
    const sent: Sent[] = []
    stub((method, url) => {
      if (url.pathname.endsWith("/premiumIndex")) return { markPrice: "100" }
      if (
        (method === "POST" || method === "GET") &&
        url.pathname.endsWith("/order")
      ) {
        return order({
          status: "EXPIRED",
          avgPrice: "100",
          executedQty: "0.5",
        })
      }
      return {}
    }, sent)

    const closed = await closeAsterPosition("testnet", AUTH, {
      marketId: "BTCUSDT",
      szi: 2,
    })

    expect(closed.filledSz).toBe(0.5)
    expect(sent.some((one) => one.method === "DELETE")).toBe(false)
    expect(sent.some((one) => one.url.pathname.endsWith("/openOrders"))).toBe(
      false
    )
  })
})
