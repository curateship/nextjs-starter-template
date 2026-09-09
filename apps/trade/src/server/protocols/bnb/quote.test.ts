import { describe, it, expect, vi, afterEach } from "vitest"
import {
  decodeFunctionData,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem"
import fixture from "./swap.fixture.json"
import refusals from "./refusals.fixture.json"
import {
  bnbUnits,
  bnbSlippage,
  parseBnbRoute,
  validateBnbBuild,
  kyberSwapAbi,
  kyberRequest,
} from "./quote"
const input = {
  token: fixture.route.data.routeSummary.tokenOut as Address,
  side: "buy" as const,
  amount: 10n ** 19n,
  decimals: 18,
  px: 2.31,
  slippage: 0.005,
}
const wallet = fixture.buildRequest.sender as Address
const route = () => parseBnbRoute(fixture.route, input)
afterEach(() => vi.unstubAllGlobals())
describe("KyberSwap quote and unsigned transaction", () => {
  it("decodes the real $10 CAKE route, amounts and pool names", () => {
    const r = route()
    expect(typeof r.summary.amountInUsd).toBe("string")
    expect(r.quote.usd).toBe(10)
    expect(r.quote.sz).toBeCloseTo(4.346284956561207, 12)
    expect(r.quote.price).toBeCloseTo(10 / r.quote.sz, 12)
    expect(r.quote.route).toContain("pancake")
    expect(r.quote.provider).toBe("KyberSwap")
    expect(r.quote.refusal).toBeNull()
    expect(validateBnbBuild(fixture.build, r, wallet, 0.005).router).toBe(
      r.router
    )
  })
  it("truncates base units without rounding up or losing exponent digits", () => {
    expect(bnbUnits(10, 18)).toBe(10000000000000000000n)
    expect(bnbUnits(0.000000000000000001, 18)).toBe(1n)
    expect(bnbUnits(1.23456789, 6)).toBe(1234567n)
    expect(bnbUnits(1e21, 18)).toBe(10n ** 39n)
    expect(bnbUnits(1e-20, 18)).toBe(0n)
    expect(() => bnbUnits(NaN, 18)).toThrow()
    expect(() => bnbSlippage(Infinity)).toThrow()
  })
  it("refuses excessive impact, a worse buy price and substituted tokens", () => {
    const raw = structuredClone(fixture.route)
    raw.data.routeSummary.amountOutUsd = "9"
    expect(parseBnbRoute(raw, input).quote.refusal).toContain("impact")
    expect(
      parseBnbRoute(fixture.route, { ...input, px: 2 }).quote.refusal
    ).toContain("order price")
    raw.data.routeSummary.tokenOut =
      "0x1111111111111111111111111111111111111111"
    expect(() => parseBnbRoute(raw, input)).toThrow("different coins")
  })
  it.each(["recipient", "amount", "minimum", "token", "router", "value"])(
    "refuses a changed %s before signing",
    (change) => {
      const raw = structuredClone(fixture.build)
      const call = decodeFunctionData({
        abi: kyberSwapAbi,
        data: raw.data.data as Hex,
      })
      if (call.functionName !== "swap") throw Error("unexpected fixture")
      const execution = structuredClone(call.args[0])
      const desc = execution.desc
      if (change === "recipient")
        desc.dstReceiver = "0x1111111111111111111111111111111111111111"
      if (change === "amount") desc.amount += 1n
      if (change === "minimum") desc.minReturnAmount = 1n
      if (change === "token") desc.dstToken = desc.srcToken
      if (change === "router")
        raw.data.routerAddress = "0x1111111111111111111111111111111111111111"
      if (change === "value") raw.data.transactionValue = "1"
      raw.data.data = encodeFunctionData({
        abi: kyberSwapAbi,
        functionName: "swap",
        args: [execution],
      })
      expect(() => validateBnbBuild(raw, route(), wallet, 0.005)).toThrow(
        "does not match"
      )
    }
  )
  it("sends a client id and retries a rate limit only once", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response("", { status: 429 }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      kyberRequest("routes", { tokenIn: input.token }, "read")
    ).rejects.toThrow("EXCHANGE_BUSY")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][1].headers["X-Client-Id"]).toBe("nodabot-trade")
  })
  it.each(refusals.live)(
    "maps HTTP $status for $name before discarding the provider body",
    async ({ status, body }) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify(body), { status }))
      )
      await expect(kyberRequest("routes", {}, "order")).rejects.toThrow(
        "LIVE_ORDER_REFUSED:"
      )
    }
  )
  it("discards secret-looking text on HTTP success with an unknown application error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 777, message: "FAKE_SECRET_KEY" })
          )
        )
    )
    await expect(kyberRequest("routes", {}, "order")).rejects.toThrow(
      "BNB Chain refused the trade, and no coins moved."
    )
  })
})
