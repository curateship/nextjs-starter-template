import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { encodeFunctionData, decodeFunctionData, parseAbi, type Address, type Hex } from "viem"
import { veloraRouter } from "@/server/protocols/evm-chain/velora"
import fixture from "./velora.fixture.json"
import { robinhoodRefusals } from "./refusals"

// Saved on 24 Sep 2026: 10 USDG for NVDA, quoted and built with our partner
// name, and built again with Velora's default partner, which takes a fee.
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Address
const WALLET = fixture.wallet as Address
const reserve = vi.fn()
/** True while the chain's Velora allowance is spent. */
let allowanceFull = false
const router = veloraRouter({
  api: "https://velora.example",
  network: 4663,
  partner: "nodabot-trade",
  reserve: (priority) => {
    reserve(priority)
    if (allowanceFull)
      throw new Error("EXCHANGE_BUSY:Velora spent 40 of 40 requests in 60 seconds.")
  },
  dollarCoin: USDG,
  dollarDecimals: 6,
  refusals: robinhoodRefusals,
})
const input = {
  token: NVDA,
  side: "buy" as const,
  amount: 10_000_000n,
  decimals: 18,
  px: null,
  slippage: 0.005,
}
const augustus = parseAbi([
  "struct GenericData { address srcToken; address destToken; uint256 fromAmount; uint256 toAmount; uint256 quotedAmount; bytes32 metadata; address beneficiary; }",
  "function swapExactAmountIn(address executor, GenericData swapData, uint256 partnerAndFee, bytes permit, bytes executorData) payable returns (uint256 receivedAmount, uint256 paraswapShare, uint256 partnerShare)",
])
/** The real built transaction with one field of its swap changed. */
function tampered(change: (swap: Record<string, unknown>) => void) {
  const call = decodeFunctionData({ abi: augustus, data: fixture.build.data as Hex })
  const args = structuredClone(call.args) as unknown as [
    Address,
    Record<string, unknown>,
    bigint,
    Hex,
    Hex,
  ]
  change(args[1])
  return {
    ...fixture.build,
    data: encodeFunctionData({ abi: augustus, functionName: "swapExactAmountIn", args: args as never }),
  }
}
function answer(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  reserve.mockReset()
  allowanceFull = false
})
afterEach(() => vi.unstubAllGlobals())

describe("Velora on Robinhood Chain", () => {
  it("turns the real quote into the order window's words", async () => {
    const fetch = vi.fn().mockResolvedValue(answer(fixture.prices))
    vi.stubGlobal("fetch", fetch)
    const route = await router(input, "read")
    expect(route.amountOut).toBe(BigInt(fixture.prices.priceRoute.destAmount))
    expect(route.quote).toMatchObject({ provider: "Velora", usd: 10, refusal: null })
    expect(route.quote.sz).toBeCloseTo(0.0449124, 6)
    const asked = new URL(String(fetch.mock.calls[0][0]))
    expect(asked.pathname).toBe("/prices")
    expect(Object.fromEntries(asked.searchParams)).toMatchObject({
      srcToken: USDG,
      srcDecimals: "6",
      destToken: NVDA,
      amount: "10000000",
      network: "4663",
      includeContractMethods: "swapExactAmountIn",
      partner: "nodabot-trade",
    })
    expect(reserve).toHaveBeenCalledWith("read")
  })

  it("accepts the real build with no partner fee and sends the wallet as receiver", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(answer(fixture.prices))
      .mockResolvedValueOnce(answer(fixture.build))
    vi.stubGlobal("fetch", fetch)
    const route = await router(input, "order")
    const built = await route.build({ wallet: WALLET, bps: 50, deadline: 1 })
    expect(built.to).toBe("0x6a000f20005980200259b80c5102003040001068")
    expect(built.data).toBe(fixture.build.data)
    const sent = JSON.parse(fetch.mock.calls[1][1].body)
    expect(sent).toMatchObject({
      userAddress: WALLET,
      receiver: WALLET,
      slippage: 50,
      partner: "nodabot-trade",
      deadline: 1,
    })
  })

  it.each([
    ["Velora's default partner fee", () => fixture.withFee],
    [
      "a different receiver",
      () => tampered((swap) => (swap.beneficiary = `0x${"9".repeat(40)}`)),
    ],
    ["a lower minimum", () => tampered((swap) => (swap.toAmount = 1n))],
    ["a different amount", () => tampered((swap) => (swap.fromAmount = 1n))],
    ["another contract", () => ({ ...fixture.build, to: `0x${"9".repeat(40)}` })],
    ["ETH sent along", () => ({ ...fixture.build, value: "1" })],
  ])("refuses a build with %s before anything is signed", async (_, build) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(answer(fixture.prices))
        .mockResolvedValueOnce(answer(build()))
    )
    const route = await router(input, "order")
    await expect(
      route.build({ wallet: WALLET, bps: 50, deadline: 1 })
    ).rejects.toThrow("does not match")
  })

  it("names Velora when a size is too big, and says so when it is busy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(fixture.refusal, 400)))
    await expect(router(input, "read")).rejects.toThrow(
      "This size is above Velora's maximum."
    )
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => new Response("", { status: 429 }))
      )
      const busy = expect(router(input, "read")).rejects.toThrow(
        "EXCHANGE_BUSY:Velora is limiting requests."
      )
      await vi.advanceTimersByTimeAsync(1000)
      await busy
    } finally {
      vi.useRealTimers()
    }
  })

  it("says Velora is busy when its own allowance is full, before asking it", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    allowanceFull = true
    await expect(router(input, "read")).rejects.toThrow(
      "EXCHANGE_BUSY:Velora is limiting requests."
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it("refuses a route naming another contract or other coins", async () => {
    const other = structuredClone(fixture.prices)
    other.priceRoute.contractAddress = `0x${"9".repeat(40)}`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(other)))
    await expect(router(input, "read")).rejects.toThrow("different coins, amounts or contract")
  })
})
