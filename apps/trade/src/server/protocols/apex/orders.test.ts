import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "./apex.fixture.json"
import signatures from "./signer/connector-signatures.fixture.json"
import type { OrderAuth, PlaceOrderParams } from "@/lib/protocols/contracts"
import { readApexAccount } from "@/server/protocols/apex/account"
import { apexContract, toApexContracts } from "@/server/protocols/apex/catalogue"
import { apexPrivate } from "@/server/protocols/apex/client"
import { fetchApexPrices } from "@/server/protocols/apex/markets"
import {
  apexClientOrderId,
  apexExpiration,
  apexLimitFee,
  apexMarginRateFor,
  apexWrongSide,
  cancelApexOrder,
  closeApexPosition,
  modifyApexOrder,
  placeApexOrder,
  setApexBrackets,
  setApexLeverage,
  setApexSettleDelaysForTests,
} from "@/server/protocols/apex/orders"
import { signApexContract } from "@/server/protocols/apex/signer"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"

vi.mock("@/server/protocols/apex/client", async (original) => ({
  ...(await original<typeof import("@/server/protocols/apex/client")>()),
  apexPrivate: vi.fn(),
}))
vi.mock("@/server/protocols/apex/catalogue", async (original) => ({
  ...(await original<typeof import("@/server/protocols/apex/catalogue")>()),
  apexContract: vi.fn(),
  apexMarketIdOf: vi.fn(async (_network: unknown, symbol: string) => symbol.replace("-", "")),
}))
vi.mock("@/server/protocols/apex/account", async (original) => ({
  ...(await original<typeof import("@/server/protocols/apex/account")>()),
  readApexAccount: vi.fn(),
}))
vi.mock("@/server/protocols/apex/markets", () => ({ fetchApexPrices: vi.fn() }))
vi.mock("@/server/protocols/real-money", () => ({ assertRealMoneyAllowed: vi.fn() }))

const privateCall = vi.mocked(apexPrivate)
const contract = vi.mocked(apexContract)
const account = vi.mocked(readApexAccount)
const prices = vi.mocked(fetchApexPrices)
const realMoney = vi.mocked(assertRealMoneyAllowed)

const contracts = new Map(toApexContracts(fixture.symbols.data).map((one) => [one.marketId, one]))
const auth: OrderAuth = {
  agentKey: JSON.stringify({
    key: "11111111-2222-3333-4444-555555555555",
    secret: "made-up-secret",
    passphrase: "made-up-passphrase",
    omniKey: signatures.omniKey,
  }),
  accountAddress: "0x1111111111111111111111111111111111111111",
  allocateNonce: async () => 1,
}
const base: PlaceOrderParams = {
  marketId: "BTCUSDT",
  side: "buy",
  kind: "limit",
  px: 84000.04,
  sz: 0.0019,
  reduceOnly: false,
  leverage: null,
  tpPx: null,
  slPx: null,
}

type Posted = { path: string; body: Record<string, string | number | boolean | undefined> }
let posted: Posted[]
let openOrders: unknown[]
let orderReads: Record<string, unknown>

beforeEach(() => {
  setApexSettleDelaysForTests([0, 0])
  posted = []
  openOrders = []
  orderReads = {}
  realMoney.mockReset()
  realMoney.mockResolvedValue()
  contract.mockImplementation(async (_network, marketId) => {
    const found = contracts.get(marketId)
    if (!found) throw new Error("APEX_MARKET_UNKNOWN")
    return found
  })
  account.mockResolvedValue({
    read: {
      facts: {
        accountId: signatures.accountId,
        zkAccountId: "123456",
        l2Key: signatures.cases[0].output.pubKey,
        ethereumAddress: auth.accountAddress!,
        makerFeeRate: "0.0002",
        takerFeeRate: "0.0005",
        profitPrice: "index",
      },
      positions: [],
    },
    balance: { equity: 250, free: 180, inTrades: 0, oracle: new Map() },
  })
  prices.mockResolvedValue(new Map([["BTCUSDT", 84000]]))
  let next = 900
  privateCall.mockReset()
  privateCall.mockImplementation(async (_network, _credential, method, path, params) => {
    if (method === "POST") {
      posted.push({ path, body: params as Posted["body"] })
      if (path === "/order") {
        next += 1
        const id = String(next)
        orderReads[id] ??= { id, status: "OPEN", cumSuccessFillSize: "0", cumSuccessFillValue: "0" }
        openOrders.push({ id, symbol: params?.symbol, type: params?.type, reduceOnly: params?.reduceOnly })
        return { id, status: "PENDING" }
      }
      return { data: "ok" }
    }
    if (path === "/open-orders") return openOrders
    if (path === "/order") return orderReads[String(params?.id)]
    throw new Error(`unexpected ${method} ${path}`)
  })
})

afterEach(() => {
  setApexSettleDelaysForTests([250, 500, 1_000, 1_500])
})

describe("an ApeX Omni order", () => {
  it("is a signed LIMIT on the dashed symbol, snapped to the step and tick", async () => {
    const outcome = await placeApexOrder("mainnet", auth, base)
    expect(outcome).toMatchObject({ status: "resting", orderId: "901" })
    const { body } = posted[0]
    expect(body).toMatchObject({
      symbol: "BTC-USDT",
      side: "BUY",
      type: "LIMIT",
      // 0.0019 snaps down to BTC's 0.001 step; 84000.04 to its 0.1 tick.
      size: "0.001",
      price: "84000",
      timeInForce: "GOOD_TIL_CANCEL",
      reduceOnly: false,
      limitFee: apexLimitFee("84000", "0.001", "0.0005"),
    })
    expect(body.limitFee).toBe("0.042000")
    expect(String(body.clientOrderId)).toMatch(/^trade-[0-9a-f]{24}$/)
    expect(body.clientId).toBe(body.clientOrderId)
    // The signature is the one the connector's own code would make.
    const expected = await signApexContract(signatures.omniKey, {
      accountId: signatures.accountId,
      clientOrderId: String(body.clientOrderId),
      l2PairId: 50001,
      size: "0.001",
      price: "84000",
      side: "BUY",
      makerFeeRate: "0.0002",
      takerFeeRate: "0.0005",
    })
    expect(body.signature).toBe(expected.signature)
  })

  it("lives 28 days, on the hour, as ApeX recommends", () => {
    const now = Date.UTC(2026, 8, 24, 12, 34, 56)
    expect(apexExpiration(now)).toBe(Date.UTC(2026, 9, 22, 12))
  })

  it("never sends ApeX's own MARKET type: a market order is an IOC limit 3% through", async () => {
    orderReads["901"] = { id: "901", status: "FILLED", cumSuccessFillSize: "0.002", cumSuccessFillValue: "168.1" }
    const outcome = await placeApexOrder("mainnet", auth, { ...base, kind: "market", sz: 0.002, px: 84000 })
    const { body } = posted[0]
    expect(body.type).toBe("LIMIT")
    expect(body.timeInForce).toBe("IMMEDIATE_OR_CANCEL")
    // $84,000 x 1.03 = $86,520, the cap rounded down to the tick.
    expect(body.price).toBe("86520")
    expect(outcome).toMatchObject({ status: "filled", avgPx: 84050, filledSz: 0.002 })
  })

  it("says so when an IOC order found nothing to fill", async () => {
    orderReads["901"] = { id: "901", status: "CANCELED", cumSuccessFillSize: "0" }
    await expect(
      placeApexOrder("mainnet", auth, { ...base, kind: "market", sz: 0.002 })
    ).rejects.toThrow(/^LIVE_EXCHANGE:ApeX Omni had nothing to fill within 3% of the price/)
  })

  it("reports a resting order as resting when its read-back fails, never as failed", async () => {
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (method === "GET" && path === "/order") throw new Error("EXCHANGE_BUSY:ApeX Omni — did not answer in time")
      return real(network, credential, method, path, params, options)
    })
    await expect(placeApexOrder("mainnet", auth, base)).resolves.toMatchObject({ status: "resting", orderId: "901" })
  })

  it("says an IOC order's result is unknown, not refused, when it cannot be read back", async () => {
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (method === "GET" && path === "/order") throw new Error("EXCHANGE_BUSY:ApeX Omni — did not answer in time")
      return real(network, credential, method, path, params, options)
    })
    await expect(placeApexOrder("mainnet", auth, { ...base, kind: "market", sz: 0.002 })).rejects.toThrow(
      /^LIVE_NO_ANSWER:ApeX Omni took the order \(901\) but its result could not be read/
    )
  })

  it("refuses an order below the smallest size in dollars, before sending anything", async () => {
    await expect(placeApexOrder("mainnet", auth, { ...base, sz: 0.0004 })).rejects.toThrow(
      /^LIVE_ORDER_TOO_SMALL:ApeX Omni's smallest BTC order is 0.001 BTC, about \$84.00 at this price/
    )
    expect(posted).toEqual([])
  })

  it("refuses a stock contract, which ApeX trades from a separate account", async () => {
    await expect(placeApexOrder("mainnet", auth, { ...base, marketId: "SPCXUSDT", px: 150, sz: 1 })).rejects.toThrow(
      /^LIVE_EXCHANGE:ApeX Omni trades stocks, indices and commodities from a separate RWA account/
    )
    expect(posted).toEqual([])
  })

  it("refuses at the 200 open-order cap", async () => {
    openOrders = Array.from({ length: 200 }, (_, at) => ({ id: String(at), symbol: "ETH-USDT", type: "LIMIT" }))
    await expect(placeApexOrder("mainnet", auth, base)).rejects.toThrow(/200 open orders/)
    expect(posted).toEqual([])
  })

  it("sends nothing while a real-money switch is off", async () => {
    realMoney.mockRejectedValue(new Error("LIVE_MAINNET_OFF"))
    await expect(placeApexOrder("mainnet", auth, base)).rejects.toThrow("LIVE_MAINNET_OFF")
    expect(posted).toEqual([])
  })

  it("carries its own stop and target as two separately signed legs", async () => {
    await placeApexOrder("mainnet", auth, { ...base, sz: 0.001, slPx: 80000, tpPx: 90000 })
    const { body } = posted[0]
    expect(body).toMatchObject({
      isOpenTpslOrder: true,
      isSetOpenSl: true,
      slSide: "SELL",
      slSize: "0.001",
      slTriggerPrice: "80000",
      // A sell stop's worst price is 3% under its trigger.
      slPrice: "77600",
      isSetOpenTp: true,
      tpSide: "SELL",
      tpTriggerPrice: "90000",
      tpPrice: "87300",
    })
    for (const leg of ["sl", "tp"] as const) {
      const expected = await signApexContract(signatures.omniKey, {
        accountId: signatures.accountId,
        clientOrderId: String(body[`${leg}ClientOrderId`]),
        l2PairId: 50001,
        size: "0.001",
        price: String(body[`${leg}Price`]),
        side: "SELL",
        makerFeeRate: "0.0002",
        takerFeeRate: "0.0005",
      })
      expect(body[`${leg}Signature`]).toBe(expected.signature)
    }
    expect(new Set([body.signature, body.slSignature, body.tpSignature]).size).toBe(3)
  })

  it("turns the app's 0x client id into one ApeX's hash reads as text", () => {
    expect(apexClientOrderId("0x0123456789abcdef0123456789abcdef")).toBe("trade-0123456789abcdef0123456789abcdef")
    expect(apexClientOrderId("0x0123456789abcdef0123456789abcdef")).toBe(
      apexClientOrderId("0x0123456789abcdef0123456789abcdef")
    )
  })
})

describe("moving, cancelling and closing", () => {
  it("cancels by ApeX's id", async () => {
    await cancelApexOrder("mainnet", auth, { marketId: "BTCUSDT", orderId: "777" })
    expect(posted).toEqual([{ path: "/delete-order", body: { id: "777" } }])
  })

  it("moves an order by cancelling first, then placing", async () => {
    await modifyApexOrder("mainnet", auth, {
      marketId: "BTCUSDT",
      orderId: "777",
      side: "buy",
      px: 83000,
      sz: 0.001,
      reduceOnly: false,
    })
    expect(posted.map((one) => one.path)).toEqual(["/delete-order", "/order"])
    expect(posted[1].body.price).toBe("83000")
  })

  it("says the old order came off when the new one is refused", async () => {
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (method === "POST" && path === "/order") {
        throw new Error("LIVE_ORDER_REFUSED:ApeX Omni says there is not enough free cash for this order.")
      }
      return real(network, credential, method, path, params, options)
    })
    await expect(
      modifyApexOrder("mainnet", auth, { marketId: "BTCUSDT", orderId: "777", side: "buy", px: 83000, sz: 0.001, reduceOnly: false })
    ).rejects.toThrow(/^LIVE_MOVE_HALF_DONE:The old order came off, but ApeX Omni refused the new one \(ApeX Omni says there is not enough free cash/)
  })

  it("closes the whole position with a reduce-only IOC at the 3% cap", async () => {
    orderReads["901"] = { id: "901", status: "FILLED", cumSuccessFillSize: "0.003", cumSuccessFillValue: "251.7" }
    const closed = await closeApexPosition("mainnet", auth, { marketId: "BTCUSDT", szi: 0.003 })
    expect(posted[0].body).toMatchObject({
      side: "SELL",
      reduceOnly: true,
      timeInForce: "IMMEDIATE_OR_CANCEL",
      size: "0.003",
      // $84,000 x 0.97 = $81,480, rounded up so it never sells below the cap.
      price: "81480",
    })
    expect(closed).toEqual({ avgPx: 83900, filledSz: 0.003 })
  })
})

describe("stops and targets", () => {
  it("refuses a trigger on the wrong side of the price in one sentence", async () => {
    expect(apexWrongSide(0.003, 84000, 85000, [])).toBe(
      "A long position's stop has to sit below the price, which is 84000 now. Move the stop to the other side."
    )
    expect(apexWrongSide(-0.003, 84000, null, [{ px: 85000 }])).toMatch(/short position's target has to sit below/)
    await expect(
      setApexBrackets("mainnet", auth, {
        marketId: "BTCUSDT",
        position: { szi: 0.003, protectionOrderIds: [] },
        targets: [],
        slPx: 85000,
        slSz: null,
      })
    ).rejects.toThrow(/^LIVE_EXCHANGE:A long position's stop has to sit below the price/)
    expect(posted).toEqual([])
  })

  it("places the new stop, sees it waiting, and only then cancels the old one", async () => {
    openOrders = [{ id: "500", symbol: "BTC-USDT", type: "STOP_MARKET", reduceOnly: true, isPositionTpsl: true }]
    const { slOrderId } = await setApexBrackets("mainnet", auth, {
      marketId: "BTCUSDT",
      position: { szi: 0.003, protectionOrderIds: ["500"] },
      targets: [],
      slPx: 82000,
      slSz: null,
    })
    expect(slOrderId).toBe("901")
    expect(posted.map((one) => [one.path, one.body.id ?? one.body.type])).toEqual([
      ["/order", "STOP_MARKET"],
      ["/delete-order", "500"],
    ])
    expect(posted[0].body).toMatchObject({
      side: "SELL",
      triggerPrice: "82000",
      price: "79540",
      triggerPriceType: "MARKET",
      reduceOnly: true,
      isPositionTpsl: true,
      size: "0.003",
    })
  })

  it("keeps the old stop when the new one is refused, and says so", async () => {
    openOrders = [{ id: "500", symbol: "BTC-USDT", type: "STOP_MARKET", reduceOnly: true }]
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (method === "POST" && path === "/order") throw new Error("LIVE_ORDER_REFUSED:ApeX Omni refused it (code 1).")
      return real(network, credential, method, path, params, options)
    })
    await expect(
      setApexBrackets("mainnet", auth, {
        marketId: "BTCUSDT",
        position: { szi: 0.003, protectionOrderIds: ["500"] },
        targets: [],
        slPx: 82000,
        slSz: null,
      })
    ).rejects.toThrow(/The old stop and target still stand\./)
    expect(posted.filter((one) => one.path === "/delete-order")).toEqual([])
  })

  it("leaves the old stop on and says so when the new one cannot be confirmed", async () => {
    openOrders = [{ id: "500", symbol: "BTC-USDT", type: "STOP_MARKET", reduceOnly: true }]
    const real = privateCall.getMockImplementation()!
    let reads = 0
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (method === "GET" && path === "/open-orders" && (reads += 1) > 1) {
        throw new Error("EXCHANGE_BUSY:ApeX Omni — did not answer in time")
      }
      return real(network, credential, method, path, params, options)
    })
    await expect(
      setApexBrackets("mainnet", auth, {
        marketId: "BTCUSDT",
        position: { szi: 0.003, protectionOrderIds: ["500"] },
        targets: [],
        slPx: 82000,
        slSz: null,
      })
    ).rejects.toThrow(/^LIVE_BRACKET_REPLACE_PARTIAL:The new stop was sent, but .* the old stop was left on as well/)
    expect(posted.filter((one) => one.path === "/delete-order")).toEqual([])
  })

  it("names the old stop that would not cancel, and cancels any leftover it finds", async () => {
    openOrders = [
      { id: "500", symbol: "BTC-USDT", type: "STOP_MARKET", reduceOnly: true },
      { id: "501", symbol: "BTC-USDT", type: "TAKE_PROFIT_MARKET", reduceOnly: true },
    ]
    const real = privateCall.getMockImplementation()!
    privateCall.mockImplementation(async (network, credential, method, path, params, options) => {
      if (path === "/delete-order" && params?.id === "500") throw new Error("LIVE_ORDER_REFUSED:ApeX Omni refused it (code 1).")
      return real(network, credential, method, path, params, options)
    })
    await expect(
      setApexBrackets("mainnet", auth, {
        marketId: "BTCUSDT",
        position: { szi: 0.003, protectionOrderIds: ["500"] },
        targets: [],
        slPx: 82000,
        slSz: null,
      })
    ).rejects.toThrow(/^LIVE_BRACKET_REPLACE_DOUBLED:The new stop is on, but ApeX Omni would not cancel the old one \(order 500\)/)
    // Both were asked to cancel: 500, which refused, and 501, a leftover the
    // caller did not name, which went.
    const cancels = privateCall.mock.calls
      .filter(([, , method, path]) => method === "POST" && path === "/delete-order")
      .map(([, , , , params]) => params?.id)
    expect(cancels).toEqual(["500", "501"])
    expect(posted.filter((one) => one.path === "/delete-order").map((one) => one.body.id)).toEqual(["501"])
  })

  it("gives a grid's own stop a fixed size instead of the whole position", async () => {
    await setApexBrackets("mainnet", auth, {
      marketId: "BTCUSDT",
      position: { szi: 0.01, protectionOrderIds: [] },
      targets: [],
      slPx: 82000,
      slSz: 0.004,
    })
    expect(posted[0].body).toMatchObject({ size: "0.004", isPositionTpsl: false, reduceOnly: true })
  })
})

describe("reading a position's guards", () => {
  it("counts a position stop ApeX marks only as position TPSL", async () => {
    const { withApexProtection } = await import("@/server/protocols/apex/orders")
    const [row] = withApexProtection(
      [
        {
          marketId: "BTCUSDT",
          szi: 0.003,
          entryPx: 84000,
          leverage: 5,
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
      [
        { id: "7", marketId: "BTCUSDT", type: "STOP_MARKET", triggerPrice: "80000", reduceOnly: false, isPositionTpsl: true },
        { id: "8", marketId: "BTCUSDT", type: "TAKE_PROFIT_MARKET", triggerPrice: "90000", size: "0.001", reduceOnly: true },
        { id: "9", marketId: "BTCUSDT", type: "LIMIT", price: "83000" },
      ]
    )
    expect(row).toMatchObject({
      slPx: 80000,
      slOrderId: "7",
      targets: [{ px: 90000, sz: 0.001, orderId: "8" }],
      protectionOrderIds: ["7", "8"],
    })
    expect(row.slSz).toBeUndefined()
  })
})

describe("leverage", () => {
  it("sends the reciprocal as the margin rate and reads it back", async () => {
    expect(apexMarginRateFor(5)).toBe("0.2")
    expect(apexMarginRateFor(3)).toBe("0.33333333")
    await setApexLeverage("mainnet", auth, { marketId: "BTCUSDT", leverage: 5, szi: 0 })
    expect(posted).toEqual([
      { path: "/set-initial-margin-rate", body: { symbol: "BTC-USDT", initialMarginRate: "0.2" } },
    ])
  })

  it("refuses leverage past the market's ceiling", async () => {
    await expect(
      setApexLeverage("mainnet", auth, { marketId: "ETHUSDT", leverage: 500, szi: 0 })
    ).rejects.toThrow(/^LIVE_LEVERAGE:ApeX Omni allows 1x to/)
    expect(posted).toEqual([])
  })

  it("says so when ApeX still holds the old leverage after the change", async () => {
    account.mockResolvedValue({
      read: {
        facts: { accountId: signatures.accountId, zkAccountId: "1", l2Key: null, ethereumAddress: null, makerFeeRate: "0.0002", takerFeeRate: "0.0005", profitPrice: "index" },
        positions: [{ symbol: "BTC-USDT", szi: 0.003, entryPx: 84000, customMarginRate: 0.1 }],
      },
      balance: { equity: 0, free: 0, inTrades: 0, oracle: new Map() },
    })
    await expect(
      setApexLeverage("mainnet", auth, { marketId: "BTCUSDT", leverage: 5, szi: 0.003 })
    ).rejects.toThrow(/^LIVE_LEVERAGE:ApeX Omni answered the leverage change but still holds 10x on BTC/)
  })

  it("sets the leverage before the first order on a market", async () => {
    await placeApexOrder("mainnet", auth, { ...base, leverage: 5 })
    expect(posted.map((one) => one.path)).toEqual(["/set-initial-margin-rate", "/order"])
  })
})
