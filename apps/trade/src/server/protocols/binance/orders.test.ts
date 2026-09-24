import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderAuth } from "@/lib/protocols/contracts"
import { clearBinanceAccountReads } from "@/server/protocols/binance/account"
import {
  clearBinanceClientState,
  packBinanceCredential,
} from "@/server/protocols/binance/client"
import {
  cancelBinanceOrder,
  clearBinanceOrderState,
  closeBinancePosition,
  fetchBinanceOrderFills,
  fetchBinanceOrderInfo,
  immediateLimitPrice,
  joinBinancePortfolio,
  placeBinanceOrder,
  setBinanceBrackets,
} from "@/server/protocols/binance/orders"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"

vi.mock("@/server/protocols/real-money", () => ({
  assertRealMoneyAllowed: vi.fn(),
}))

const realMoney = vi.mocked(assertRealMoneyAllowed)
const BLOB = packBinanceCredential({ address: "k".repeat(64), secret: "s".repeat(64) })
const AUTH: OrderAuth = {
  accountAddress: "k".repeat(64),
  agentKey: BLOB,
  allocateNonce: async () => 1,
}

type Sent = { method: string; path: string; params: URLSearchParams }

function stub(
  answer: (method: string, path: string, params: URLSearchParams) => unknown
): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL, init?: RequestInit) => {
      const url = new URL(String(raw))
      if (url.pathname === "/fapi/v1/time") {
        return Response.json({ serverTime: Date.now() })
      }
      const method = init?.method ?? "GET"
      sent.push({ method, path: url.pathname, params: url.searchParams })
      return Response.json(answer(method, url.pathname, url.searchParams))
    })
  )
  return sent
}

const base = {
  side: "buy" as const,
  sz: 100,
  reduceOnly: false,
  leverage: null,
  tpPx: null,
  slPx: null,
}

beforeEach(() => {
  clearBinanceClientState()
  clearBinanceOrderState()
  clearBinanceAccountReads()
  realMoney.mockReset()
  realMoney.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe("Binance orders", () => {
  it("sends an immediate buy as a limit 3% through the mark, cancelled if it cannot fill", async () => {
    const sent = stub(() => ({
      orderId: 7,
      symbol: "1000PEPEUSDT",
      side: "BUY",
      type: "LIMIT",
      status: "FILLED",
      executedQty: "100",
      avgPrice: "0.0100500",
    }))
    const outcome = await placeBinanceOrder("mainnet", AUTH, {
      ...base,
      marketId: "kPEPE",
      kind: "market",
      px: 0.01,
      priceTick: 0.0000001,
      priceMultiplierUp: 1.15,
    })
    const order = sent.find((one) => one.path === "/fapi/v1/order")!
    expect(order.method).toBe("POST")
    expect(Object.fromEntries(order.params)).toMatchObject({
      symbol: "1000PEPEUSDT",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "IOC",
      price: "0.0103",
      quantity: "100",
      newOrderRespType: "RESULT",
    })
    expect(order.params.has("reduceOnly")).toBe(false)
    expect(outcome).toMatchObject({ status: "filled", orderId: "7", filledSz: 100, avgPx: 0.01005 })
  })

  it("says nothing was bought when an immediate order fills none of it", async () => {
    stub(() => ({ orderId: 8, symbol: "BTCUSDT", side: "BUY", type: "LIMIT", status: "EXPIRED", executedQty: "0" }))
    await expect(
      placeBinanceOrder("mainnet", AUTH, { ...base, marketId: "BTC", kind: "market", px: 60_000, sz: 0.001 })
    ).rejects.toThrow(/^LIVE_ORDER_REFUSED:.*nothing was bought or sold/)
  })

  it("keeps an immediate sell inside the market's band and on its tick", () => {
    // 3% under $100 is $97. A band of 0.98 allows 95% of the 2% drop, $98.10.
    expect(
      immediateLimitPrice({ mark: 100, side: "sell", priceTick: 0.1, priceMultiplierUp: null, priceMultiplierDown: 0.98 })
    ).toBe(98.1)
    expect(
      immediateLimitPrice({ mark: 100, side: "buy", priceTick: 0.1, priceMultiplierUp: 1.05, priceMultiplierDown: null })
    ).toBe(103)
  })

  it("reads the leverage first and sets it only when it differs", async () => {
    const sent = stub((_method, path) => {
      if (path === "/fapi/v1/symbolConfig") return [{ symbol: "BTCUSDT", leverage: 5, marginType: "CROSSED" }]
      if (path === "/fapi/v1/leverage") return { leverage: 3, symbol: "BTCUSDT" }
      return { orderId: 9, symbol: "BTCUSDT", side: "BUY", type: "LIMIT", status: "NEW", executedQty: "0" }
    })
    await placeBinanceOrder("mainnet", AUTH, { ...base, marketId: "BTC", kind: "limit", px: 50_000, sz: 0.002, leverage: 3 })
    expect(sent.map((one) => one.path)).toEqual(["/fapi/v1/symbolConfig", "/fapi/v1/leverage", "/fapi/v1/order"])
    await placeBinanceOrder("mainnet", AUTH, { ...base, marketId: "BTC", kind: "limit", px: 50_000, sz: 0.002, leverage: 5 })
    expect(sent.slice(3).map((one) => one.path)).toEqual(["/fapi/v1/symbolConfig", "/fapi/v1/order"])
  })

  it("puts an entry's stop and target on Binance's stop-order service", async () => {
    let algoId = 100
    const sent = stub((_method, path, params) => {
      if (path === "/fapi/v1/algoOrder") {
        return { algoId: algoId++, symbol: "BTCUSDT", side: "SELL", orderType: params.get("type") }
      }
      return { orderId: 10, symbol: "BTCUSDT", side: "BUY", type: "LIMIT", status: "NEW", executedQty: "0" }
    })
    const outcome = await placeBinanceOrder("mainnet", AUTH, {
      ...base, marketId: "BTC", kind: "limit", px: 50_000, sz: 0.002, slPx: 48_000, tpPx: 55_000,
    })
    const legs = sent.filter((one) => one.path === "/fapi/v1/algoOrder").map((one) => Object.fromEntries(one.params))
    expect(legs).toEqual([
      expect.objectContaining({ algoType: "CONDITIONAL", type: "STOP_MARKET", side: "SELL", triggerPrice: "48000", closePosition: "true", workingType: "MARK_PRICE" }),
      expect.objectContaining({ algoType: "CONDITIONAL", type: "TAKE_PROFIT_MARKET", side: "SELL", triggerPrice: "55000", closePosition: "true" }),
    ])
    expect(outcome.protection).toBe("ok")
  })

  it("sends nothing while a real-money switch is off", async () => {
    realMoney.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
    const sent = stub(() => ({}))
    await expect(
      placeBinanceOrder("mainnet", AUTH, { ...base, marketId: "BTC", kind: "limit", px: 50_000, sz: 0.002 })
    ).rejects.toThrow("LIVE_MAINNET_OFF")
    await expect(
      cancelBinanceOrder("mainnet", AUTH, { marketId: "BTC", orderId: "1" })
    ).rejects.toThrow("LIVE_MAINNET_OFF")
    expect(sent).toHaveLength(0)
  })

  it("cancels a stop on the stop-order service and a plain order on the book", async () => {
    const sent = stub(() => ({ code: 200 }))
    await cancelBinanceOrder("mainnet", AUTH, { marketId: "BTC", orderId: "algo:55" })
    await cancelBinanceOrder("mainnet", AUTH, { marketId: "BTC", orderId: "66" })
    expect(sent.map((one) => [one.method, one.path, Object.fromEntries(one.params)])).toEqual([
      ["DELETE", "/fapi/v1/algoOrder", expect.objectContaining({ algoId: "55" })],
      ["DELETE", "/fapi/v1/order", expect.objectContaining({ symbol: "BTCUSDT", orderId: "66" })],
    ])
  })
})

describe("Binance stops and targets", () => {
  it("puts the new stop on before taking the old one off", async () => {
    let open = [{ algoId: 1, symbol: "BTCUSDT", side: "SELL", orderType: "STOP_MARKET", triggerPrice: "47000", closePosition: true }]
    const sent = stub((method, path, params) => {
      if (method === "POST" && path === "/fapi/v1/algoOrder") return { algoId: 2, symbol: "BTCUSDT", side: "SELL", orderType: "STOP_MARKET" }
      if (method === "DELETE" && path === "/fapi/v1/algoOrder") {
        open = open.filter((one) => String(one.algoId) !== params.get("algoId"))
        return { algoId: 1, code: "200" }
      }
      if (path === "/fapi/v1/openAlgoOrders") return open
      return {}
    })
    const result = await setBinanceBrackets("mainnet", AUTH, {
      marketId: "BTC",
      position: { szi: 0.002, protectionOrderIds: ["algo:1"] },
      targets: [],
      slPx: 48_000,
      slSz: null,
    })
    expect(sent.map((one) => `${one.method} ${one.path}`)).toEqual([
      "POST /fapi/v1/algoOrder",
      "DELETE /fapi/v1/algoOrder",
      "GET /fapi/v1/openAlgoOrders",
    ])
    expect(result.slOrderId).toBe("algo:2")
  })

  it("leaves the old stop on and says so when Binance refuses the new one", async () => {
    const sent = stub((method, path) => {
      if (method === "POST" && path === "/fapi/v1/algoOrder") return { code: -2021, msg: "Order would immediately trigger." }
      return {}
    })
    await expect(
      setBinanceBrackets("mainnet", AUTH, {
        marketId: "BTC",
        position: { szi: 0.002, protectionOrderIds: ["algo:1"] },
        targets: [],
        slPx: 70_000,
        slSz: null,
      })
    ).rejects.toThrow(/^LIVE_BRACKET_REPLACE_PARTIAL:The old protection is still on\..*fire the moment it went on/)
    expect(sent.some((one) => one.method === "DELETE")).toBe(false)
  })

  it("joins positions to their stops, targets and resting orders", () => {
    const joined = joinBinancePortfolio(
      {
        positions: [
          { marketId: "BTC", szi: 0.002, entryPx: 50_000, leverage: 5, marginUsed: 20, liquidationPx: null, targets: [], tpPx: null, tpSz: null, slPx: null, tpOrderId: null, slOrderId: null, protectionOrderIds: [] },
        ],
        orders: [],
      },
      [{ orderId: 3, symbol: "ETHUSDT", side: "BUY", type: "LIMIT", price: "2000", origQty: "0.01" }],
      [
        { algoId: 12, symbol: "BTCUSDT", side: "SELL", orderType: "TAKE_PROFIT_MARKET", triggerPrice: "56000", quantity: "0.001", closePosition: false },
        { algoId: 11, symbol: "BTCUSDT", side: "SELL", orderType: "STOP_MARKET", triggerPrice: "48000", closePosition: true },
      ]
    )
    expect(joined.positions[0]).toMatchObject({
      slPx: 48_000,
      slOrderId: "algo:11",
      tpPx: 56_000,
      tpSz: 0.001,
      tpOrderId: "algo:12",
      protectionOrderIds: ["algo:11", "algo:12"],
    })
    expect(joined.orders).toEqual([
      { orderId: "3", marketId: "ETH", side: "buy", px: 2000, sz: 0.01, reduceOnly: false, trigger: false },
    ])
  })
})

describe("Binance closes and order history", () => {
  it("closes at a capped price and takes the stops off once flat", async () => {
    const sent = stub((method, path) => {
      if (path === "/fapi/v1/premiumIndex") return { symbol: "BTCUSDT", markPrice: "50000" }
      if (method === "POST" && path === "/fapi/v1/order") {
        return { orderId: 20, symbol: "BTCUSDT", side: "SELL", type: "LIMIT", status: "FILLED", executedQty: "0.002", avgPrice: "49990" }
      }
      if (path === "/fapi/v1/openAlgoOrders") return [{ algoId: 5, symbol: "BTCUSDT", side: "SELL", orderType: "STOP_MARKET", triggerPrice: "48000" }]
      return { algoId: 5 }
    })
    const result = await closeBinancePosition("mainnet", AUTH, { marketId: "BTC", szi: 0.002, priceTick: 0.1 })
    const close = sent.find((one) => one.method === "POST")!
    expect(Object.fromEntries(close.params)).toMatchObject({ side: "SELL", price: "48500", reduceOnly: "true", timeInForce: "IOC" })
    expect(sent.at(-1)).toMatchObject({ method: "DELETE", path: "/fapi/v1/algoOrder" })
    expect(result).toEqual({ avgPx: 49_990, filledSz: 0.002 })
  })

  it("says the position closed when only an old stop would not come off", async () => {
    stub((method, path) => {
      if (path === "/fapi/v1/premiumIndex") return { symbol: "BTCUSDT", markPrice: "50000" }
      if (method === "POST") {
        return { orderId: 21, symbol: "BTCUSDT", side: "SELL", type: "LIMIT", status: "FILLED", executedQty: "0.002", avgPrice: "49990" }
      }
      if (path === "/fapi/v1/openAlgoOrders") return [{ algoId: 5, symbol: "BTCUSDT", side: "SELL", orderType: "TAKE_PROFIT_MARKET", triggerPrice: "56000" }]
      return { code: -1109, msg: "Invalid account." }
    })
    await expect(
      closeBinancePosition("mainnet", AUTH, { marketId: "BTC", szi: 0.002, priceTick: 0.1 })
    ).rejects.toThrow(/^LIVE_EXCHANGE:The position closed, but a stop or target/)
  })

  it("finds fills on a coin this process has never seen, after a restart", async () => {
    // Nothing is held and nothing rests, so only the account's money history
    // can say ETH was traded while the server was down.
    const sent = stub((_method, path, params) => {
      if (path === "/fapi/v1/income") {
        return [{ symbol: "ETHUSDT", incomeType: "COMMISSION", income: "-0.01" }, { symbol: "", incomeType: "TRANSFER" }]
      }
      if (path === "/fapi/v1/userTrades" && params.get("symbol") === "ETHUSDT") {
        return [{ id: 1, orderId: 2, symbol: "ETHUSDT", side: "SELL", price: "2000", qty: "0.01", realizedPnl: "1.5", commission: "0.01", time: Date.now() - 1_000 }]
      }
      return []
    })
    const fills = await fetchBinanceOrderFills("mainnet", AUTH.accountAddress!, Date.now() - 60_000, () => BLOB)
    expect(fills).toEqual([expect.objectContaining({ marketId: "ETH", closedPnl: 1.5, dir: "Close long" })])
    expect(sent.filter((one) => one.path === "/fapi/v1/userTrades").map((one) => one.params.get("symbol"))).toEqual(["ETHUSDT"])
  })

  it("names a fill as the stop it came from", async () => {
    stub((_method, path) => {
      if (path === "/fapi/v1/order") return { orderId: 77, symbol: "BTCUSDT", side: "SELL", type: "MARKET", time: 1_000_000 }
      if (path === "/fapi/v1/allAlgoOrders") {
        return [{ algoId: 9, symbol: "BTCUSDT", side: "SELL", orderType: "STOP_MARKET", triggerPrice: "48000", actualOrderId: "77" }]
      }
      return {}
    })
    await expect(
      fetchBinanceOrderInfo("mainnet", AUTH.accountAddress!, "77", "BTC", () => BLOB)
    ).resolves.toEqual({ kind: "stop", triggerPx: 48_000 })
  })
})
