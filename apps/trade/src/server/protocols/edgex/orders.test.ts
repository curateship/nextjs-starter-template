import { beforeEach, describe, expect, it, vi } from "vitest"

import saved from "./edgex.fixture.json"
import sdk from "./sdk-signatures.fixture.json"
import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
import { readEdgexAccount, type EdgexAccountRead } from "@/server/protocols/edgex/account"
import { toEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { edgexPrivate, edgexSignedValue, packEdgexCredential } from "@/server/protocols/edgex/client"
import { edgexMarketOpen } from "@/server/protocols/edgex/live-prices"
import { fetchEdgexPrices } from "@/server/protocols/edgex/markets"
import {
  cancelEdgexOrder,
  closeEdgexPosition,
  edgexClientOrderId,
  edgexOrderBody,
  edgexSnapPrice,
  edgexSnapSize,
  edgexWrongSide,
  modifyEdgexOrder,
  placeEdgexOrder,
  setEdgexBrackets,
  setEdgexLeverage,
  setEdgexSettleDelaysForTests,
} from "@/server/protocols/edgex/orders"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"

const catalogue = toEdgexCatalogue(saved.metadata)

vi.mock("@/server/protocols/edgex/client", async (original) => ({
  ...(await original<typeof import("@/server/protocols/edgex/client")>()),
  edgexPrivate: vi.fn(),
}))
vi.mock("@/server/protocols/edgex/catalogue", async (original) => {
  const real = await original<typeof import("@/server/protocols/edgex/catalogue")>()
  return {
    ...real,
    edgexContract: vi.fn(async (_network: unknown, marketId: string) => {
      const found = catalogue.contracts.find((one) => one.marketId === marketId)
      if (!found) throw new Error("EDGEX_MARKET_UNKNOWN")
      return found
    }),
    edgexMarketIdOf: vi.fn(
      async (_network: unknown, contractId: string) =>
        catalogue.contracts.find((one) => one.contractId === contractId)?.marketId ?? null
    ),
    edgexSigningFacts: vi.fn(async () => catalogue.signing),
  }
})
vi.mock("@/server/protocols/edgex/account", async (original) => ({
  ...(await original<typeof import("@/server/protocols/edgex/account")>()),
  readEdgexAccount: vi.fn(),
}))
vi.mock("@/server/protocols/edgex/markets", () => ({ fetchEdgexPrices: vi.fn() }))
vi.mock("@/server/protocols/edgex/live-prices", () => ({ edgexMarketOpen: vi.fn(() => true) }))
vi.mock("@/server/protocols/real-money", () => ({ assertRealMoneyAllowed: vi.fn() }))

const privateCall = vi.mocked(edgexPrivate)
const account = vi.mocked(readEdgexAccount)
const prices = vi.mocked(fetchEdgexPrices)
const marketOpen = vi.mocked(edgexMarketOpen)
const realMoney = vi.mocked(assertRealMoneyAllowed)

const auth: OrderAuth = {
  agentKey: packEdgexCredential({
    address: sdk.accountId,
    secret: `made-up-key made-up-secret ${sdk.signerKey}`,
    passphrase: "made-up-passphrase",
  }),
  accountAddress: sdk.accountId,
  allocateNonce: async () => 1,
}
const base: PlaceOrderParams = {
  marketId: "BTCUSDC",
  side: "buy",
  kind: "limit",
  px: 84000.04,
  sz: 0.0019,
  reduceOnly: false,
  leverage: null,
  tpPx: null,
  slPx: null,
}

function accountRead(leverage = new Map<string, number>()): EdgexAccountRead {
  return {
    accountId: sdk.accountId,
    l2Key: null,
    liquidating: false,
    equity: 250,
    free: 12.4,
    inTrades: 0,
    leverageByContract: leverage,
    defaultLeverage: null,
    positions: [],
  }
}

type Call = { method: string; path: string; body: Record<string, unknown> }
let calls: Call[]
let openOrders: Array<Record<string, unknown>>
let orderReads: Record<string, Record<string, unknown>>
let leverageHeld: Map<string, number>

beforeEach(() => {
  setEdgexSettleDelaysForTests([0, 0])
  calls = []
  openOrders = []
  orderReads = {}
  leverageHeld = new Map()
  realMoney.mockReset()
  realMoney.mockResolvedValue()
  marketOpen.mockReturnValue(true)
  account.mockImplementation(async () => accountRead(new Map(leverageHeld)))
  prices.mockReset()
  prices.mockResolvedValue(new Map([["BTCUSDC", 84000]]))
  let next = 700
  privateCall.mockReset()
  privateCall.mockImplementation(async (_network, _credential, method, path, params = {}) => {
    const body = params as Record<string, unknown>
    calls.push({ method, path, body })
    if (path.endsWith("/createOrder")) {
      next += 1
      const id = String(next)
      orderReads[id] ??= { id, status: "OPEN", cumFillSize: "0", cumFillValue: "0", type: body.type }
      openOrders.push({
        id,
        contractId: body.contractId,
        type: body.type,
        side: body.side,
        size: body.size,
        price: body.price,
        triggerPrice: body.triggerPrice,
        reduceOnly: body.reduceOnly,
        isPositionTpsl: body.isPositionTpsl,
      })
      return { orderId: id }
    }
    if (path.endsWith("/cancelOrderById")) {
      const [id] = body.orderIdList as string[]
      openOrders = openOrders.filter((one) => one.id !== id)
      return { cancelResultMap: { [id]: "SUCCESS" } }
    }
    if (path.endsWith("/getActiveOrderPage")) return { dataList: openOrders, nextPageOffsetData: "" }
    if (path.endsWith("/getOrderById")) return [orderReads[String(body.orderIdList)]]
    if (path.endsWith("/updateLeverageSetting")) {
      leverageHeld.set(String(body.contractId), Number(body.leverage))
      return null
    }
    throw new Error(`unexpected ${method} ${path}`)
  })
})

const posts = () => calls.filter((one) => one.method === "POST")

describe("an edgeX order's body", () => {
  it("carries the same fields and signature edgeX's SDK sends", async () => {
    const vector = sdk.orders[0]
    const body = await edgexOrderBody(
      {
        credential: { accountId: sdk.accountId, key: "k", secret: "s", passphrase: "p", signerKey: sdk.signerKey as `0x${string}` },
        contract: catalogue.contracts.find((one) => one.contractId === "30000001")!,
        facts: catalogue.signing!,
      },
      {
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GOOD_TIL_CANCEL",
        size: "0.001",
        price: "84000.5",
        l2Price: "84000.5",
        reduceOnly: false,
        clientOrderId: "trade-abc123",
      },
      sdk.nowMs
    )
    // The SDK's body with its empty fields dropped, the account id filled in
    // by the client, and the signature written with its 0x.
    const expected = Object.fromEntries(
      Object.entries(vector.body).filter(
        ([key, value]) => value !== null && value !== "" && key !== "accountId" && !/^isSetOpen|^isPositionTpsl$/.test(key)
      )
    )
    expected.l2Signature = `0x${vector.body.l2Signature}`
    expect(body).toEqual(expected)
    expect(edgexSignedValue({ ...body, accountId: sdk.accountId })).toContain("l2Nonce=2296946694")
  })
})

describe("placing an edgeX order", () => {
  it("rests a limit order on the tick and step, good till cancelled", async () => {
    const outcome = await placeEdgexOrder("mainnet", auth, base)
    expect(outcome).toMatchObject({ status: "resting", orderId: "701" })
    const [order] = posts()
    expect(order.path).toBe("/api/v2/private/order/createOrder")
    expect(order.body).toMatchObject({
      contractId: "30000001",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GOOD_TIL_CANCEL",
      size: "0.001",
      price: "84000",
      l2Value: "84",
      reduceOnly: false,
    })
    expect(String(order.body.clientOrderId)).toMatch(/^trade-/)
    expect(realMoney).toHaveBeenCalled()
  })

  it("sends a market order as an Immediate-or-Cancel limit 3% through, never edgeX's MARKET", async () => {
    privateCall.mockImplementationOnce(async (_n, _c, method, path, params = {}) => {
      calls.push({ method, path, body: params as Record<string, unknown> })
      orderReads["777"] = { id: "777", status: "FILLED", cumFillSize: "0.001", cumFillValue: "84.1" }
      return { orderId: "777" }
    })
    const outcome = await placeEdgexOrder("mainnet", auth, { ...base, kind: "market", sz: 0.001 })
    expect(posts()[0].body).toMatchObject({ type: "LIMIT", timeInForce: "IMMEDIATE_OR_CANCEL", price: "86520" })
    expect(outcome).toMatchObject({ status: "filled", filledSz: 0.001 })
    expect(outcome.avgPx).toBeCloseTo(84100, 6)
  })

  it("rests a post-only order as POST_ONLY, and says why edgeX cancelled one", async () => {
    privateCall.mockImplementationOnce(async (_n, _c, method, path, params = {}) => {
      calls.push({ method, path, body: params as Record<string, unknown> })
      orderReads["888"] = { id: "888", status: "CANCELED" }
      return { orderId: "888" }
    })
    await expect(placeEdgexOrder("mainnet", auth, { ...base, kind: "postOnly" })).rejects.toThrow(
      /would have filled at once, and it was sent to rest only/
    )
    expect(posts()[0].body.timeInForce).toBe("POST_ONLY")
  })

  it("refuses an order below the minimum in dollars, before anything is sent", async () => {
    await expect(placeEdgexOrder("mainnet", auth, { ...base, sz: 0.0004 })).rejects.toThrow(
      "LIVE_ORDER_TOO_SMALL:edgeX's smallest BTC order is 0.001 BTC, about $84.00 at this price. This order is $0.00. Use a bigger size."
    )
    expect(calls).toEqual([])
  })

  it("refuses a stock contract while its exchange is shut", async () => {
    marketOpen.mockReturnValue(false)
    await expect(placeEdgexOrder("mainnet", auth, { ...base, marketId: "SAMSUNGUSDC", px: 200, sz: 1 })).rejects.toThrow(
      /closed right now, because the stock exchange it follows is shut/
    )
    expect(posts()).toEqual([])
  })

  it("sends nothing while a real-money switch is off", async () => {
    realMoney.mockRejectedValue(new Error("LIVE_REAL_MONEY_OFF"))
    await expect(placeEdgexOrder("mainnet", auth, base)).rejects.toThrow("LIVE_REAL_MONEY_OFF")
    expect(posts()).toEqual([])
  })

  it("carries its own stop and target when the entry knows both", async () => {
    await placeEdgexOrder("mainnet", auth, { ...base, slPx: 80000, tpPx: 90000 })
    const body = posts()[0].body
    expect(body.isSetOpenSl).toBe(true)
    expect(body.isSetOpenTp).toBe(true)
    expect(body.openSl).toMatchObject({ side: "SELL", size: "0.001", triggerPrice: "80000", triggerPriceType: "ORACLE_PRICE", price: "77600" })
    expect(body.openTp).toMatchObject({ side: "SELL", triggerPrice: "90000", price: "87300" })
    expect(String((body.openSl as { l2Signature: string }).l2Signature)).toMatch(/^0x[0-9a-f]{130}$/)
  })

  it("signs once more when edgeX refuses the order's own signature, and only once", async () => {
    let refused = 0
    privateCall.mockImplementation(async (_n, _c, method, path, params = {}) => {
      calls.push({ method, path, body: params as Record<string, unknown> })
      if (path.endsWith("/createOrder")) {
        refused += 1
        throw new Error(
          "LIVE_ORDER_REFUSED:edgeX refused the order's own signature. Trade signs every order afresh with the signer key, so this usually means the signer key does not belong to this account. Copy the signer key again from edgeX's SDK Signer dialog."
        )
      }
      return null
    })
    await expect(placeEdgexOrder("mainnet", auth, base)).rejects.toThrow(/order's own signature/)
    expect(refused).toBe(2)
  })
})

describe("moving, cancelling and closing an edgeX order", () => {
  it("cancels then places, and says so when the place fails after the cancel", async () => {
    await placeEdgexOrder("mainnet", auth, base)
    await modifyEdgexOrder("mainnet", auth, { marketId: "BTCUSDC", orderId: "701", side: "buy", px: 83000, sz: 0.001, reduceOnly: false })
    expect(posts().map((one) => one.path.split("/").at(-1))).toEqual(["createOrder", "cancelOrderById", "createOrder"])
    expect(openOrders.map((one) => one.price)).toEqual(["83000"])

    await expect(
      modifyEdgexOrder("mainnet", auth, { marketId: "BTCUSDC", orderId: "702", side: "buy", px: 83000, sz: 0.0001, reduceOnly: false })
    ).rejects.toThrow(/^LIVE_MOVE_HALF_DONE:The old order came off, but edgeX refused the new one/)
  })

  it("says an order that already filled is gone", async () => {
    privateCall.mockImplementationOnce(async () => ({ cancelResultMap: { "55": "ORDER_NOT_FOUND" } }))
    await expect(cancelEdgexOrder("mainnet", auth, { marketId: "BTCUSDC", orderId: "55" })).rejects.toThrow(
      /not open any more/
    )
  })

  it("closes the whole position with a reduce-only IOC at the 3% cap", async () => {
    privateCall.mockImplementationOnce(async (_n, _c, method, path, params = {}) => {
      calls.push({ method, path, body: params as Record<string, unknown> })
      orderReads["990"] = { id: "990", status: "FILLED", cumFillSize: "0.002", cumFillValue: "167.8" }
      return { orderId: "990" }
    })
    const closed = await closeEdgexPosition("mainnet", auth, { marketId: "BTCUSDC", szi: 0.002 })
    expect(posts()[0].body).toMatchObject({ side: "SELL", size: "0.002", price: "81480", reduceOnly: true, timeInForce: "IMMEDIATE_OR_CANCEL" })
    expect(closed.filledSz).toBe(0.002)
    expect(closed.avgPx).toBeCloseTo(83900, 6)
  })
})

describe("edgeX leverage", () => {
  it("sets the contract's leverage, reads it back, then places at it", async () => {
    await placeEdgexOrder("mainnet", auth, { ...base, leverage: 5 })
    expect(posts()[0]).toMatchObject({
      path: "/api/v2/private/account/updateLeverageSetting",
      body: { contractId: "30000001", leverage: "5" },
    })
    expect(posts()[1].path).toBe("/api/v2/private/order/createOrder")
  })

  it("refuses a leverage above the market's ceiling before sending", async () => {
    await expect(setEdgexLeverage("mainnet", auth, { marketId: "BTCUSDC", leverage: 150, szi: 0 })).rejects.toThrow(
      "LIVE_LEVERAGE:edgeX allows 1x to 100x on BTC. Pick a leverage in that range."
    )
    expect(posts()).toEqual([])
  })

  it("says so when edgeX answers but still holds the old leverage", async () => {
    privateCall.mockImplementationOnce(async () => null)
    leverageHeld.set("30000001", 10)
    await expect(setEdgexLeverage("mainnet", auth, { marketId: "BTCUSDC", leverage: 5, szi: 0 })).rejects.toThrow(
      "LIVE_LEVERAGE:edgeX answered the leverage change but still holds 10x on BTC. Nothing else was sent."
    )
  })
})

describe("edgeX stops and targets", () => {
  const position = { szi: 0.002, protectionOrderIds: [] as string[] }

  it("places a stop and target as edgeX's own conditional orders on the oracle price", async () => {
    const { slOrderId } = await setEdgexBrackets("mainnet", auth, {
      marketId: "BTCUSDC",
      position,
      targets: [{ px: 90000, sz: null }],
      slPx: 80000,
      slSz: null,
    })
    const [stop, target] = posts()
    expect(stop.body).toMatchObject({
      type: "STOP_MARKET",
      side: "SELL",
      price: "0",
      size: "0.002",
      triggerPrice: "80000",
      triggerPriceType: "ORACLE_PRICE",
      reduceOnly: true,
      isPositionTpsl: true,
      timeInForce: "IMMEDIATE_OR_CANCEL",
      // A sell stop signs the SDK's worst price, one tick.
      l2Value: "0.0002",
    })
    expect(target.body).toMatchObject({ type: "TAKE_PROFIT_MARKET", triggerPrice: "90000" })
    expect(slOrderId).toBe("701")
  })

  it("places the new stop before the old one comes off, so edgeX never shows none", async () => {
    openOrders.push({ id: "500", contractId: "30000001", type: "STOP_MARKET", side: "SELL", size: "0.002", triggerPrice: "79000", reduceOnly: true, isPositionTpsl: true })
    await setEdgexBrackets("mainnet", auth, { marketId: "BTCUSDC", position: { ...position, protectionOrderIds: ["500"] }, targets: [], slPx: 81000, slSz: null })
    const steps = calls.map((one) => `${one.method} ${one.path.split("/").at(-1)}`)
    expect(steps.indexOf("POST createOrder")).toBeLessThan(steps.lastIndexOf("GET getActiveOrderPage"))
    expect(steps.lastIndexOf("GET getActiveOrderPage")).toBeLessThan(steps.indexOf("POST cancelOrderById"))
    expect(openOrders.map((one) => one.id)).toEqual(["701"])
  })

  it("leaves the old stop standing when the new one is refused", async () => {
    openOrders.push({ id: "500", contractId: "30000001", type: "STOP_MARKET", reduceOnly: true, isPositionTpsl: true })
    privateCall.mockImplementation(async (_n, _c, method, path) => {
      calls.push({ method, path, body: {} })
      if (path.endsWith("/getActiveOrderPage")) return { dataList: openOrders }
      throw new Error("LIVE_ORDER_REFUSED:edgeX refused the trigger price because it sits on the wrong side.")
    })
    await expect(
      setEdgexBrackets("mainnet", auth, { marketId: "BTCUSDC", position: { ...position, protectionOrderIds: ["500"] }, targets: [], slPx: 81000, slSz: null })
    ).rejects.toThrow(/^LIVE_BRACKET_REPLACE_PARTIAL:edgeX refused the new stop or target .*The old stop and target still stand\./)
    expect(openOrders.map((one) => one.id)).toEqual(["500"])
  })

  it("clears every guard without needing a price", async () => {
    openOrders.push({ id: "500", contractId: "30000001", type: "STOP_MARKET", reduceOnly: true, isPositionTpsl: true })
    prices.mockResolvedValue(new Map())
    await setEdgexBrackets("mainnet", auth, { marketId: "BTCUSDC", position: { ...position, protectionOrderIds: ["500"] }, targets: [], slPx: null, slSz: null })
    expect(openOrders).toEqual([])
    expect(prices).not.toHaveBeenCalled()
  })

  it("refuses a trigger on the wrong side of the price in one sentence", async () => {
    await expect(
      setEdgexBrackets("mainnet", auth, { marketId: "BTCUSDC", position, targets: [], slPx: 85000, slSz: null })
    ).rejects.toThrow(
      "LIVE_EXCHANGE:A long position's stop has to sit below the price, which is 84000 now. Move the stop to the other side."
    )
    expect(posts()).toEqual([])
    expect(edgexWrongSide(-1, 100, null, [{ px: 110 }])).toContain("short position's target has to sit below")
  })

  it("names an old stop edgeX would not cancel, so both are known to be waiting", async () => {
    openOrders.push({ id: "500", contractId: "30000001", type: "STOP_MARKET", reduceOnly: true, isPositionTpsl: true })
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params) => {
      if (path.endsWith("/cancelOrderById")) return { cancelResultMap: { "500": "CANCEL_REJECTED_BUSY" } }
      return real(network, credential, method, path, params)
    })
    await expect(
      setEdgexBrackets("mainnet", auth, { marketId: "BTCUSDC", position: { ...position, protectionOrderIds: ["500"] }, targets: [], slPx: 81000, slSz: null })
    ).rejects.toThrow(/^LIVE_BRACKET_REPLACE_DOUBLED:.*\(order 500\)/)
  })
})

describe("edgeX's order helpers", () => {
  it("snaps a cap so it never rounds past itself", () => {
    expect(edgexSnapPrice(86520.04, 0.1, "down")).toBe(86520)
    expect(edgexSnapPrice(81479.96, 0.1, "up")).toBe(81480)
    expect(edgexSnapSize(0.0019, 0.001)).toBe(0.001)
  })

  it("keeps the same client order id for the same app id", () => {
    expect(edgexClientOrderId("0xABCDEF")).toBe("trade-ABCDEF")
    expect(edgexClientOrderId(null)).toMatch(/^trade-[0-9a-f]{24}$/)
  })
})
