import { afterEach, expect, it, vi } from "vitest"
import type { Address } from "viem"
import { kyberSwap } from "./kyber"
import { evmRefusals } from "./refusals"

const dollarCoin = "0x1111111111111111111111111111111111111111"
const token = "0x2222222222222222222222222222222222222222" as Address
const reserve = vi.fn()
const kyber = kyberSwap({
  api: "https://kyber.example/test/api/v1/",
  reserve,
  dollarCoin,
  dollarDecimals: 6,
  refusals: evmRefusals({
    chain: "Test Chain",
    feeCoin: "TST",
    feeReserve: 0.25,
    explorer: "explorer.example",
    historyHelp: "",
    unsupportedNetwork: "TEST_NETWORK_UNSUPPORTED",
  }),
})
afterEach(() => vi.unstubAllGlobals())

it("asks the chain's own address and counts against the chain's allowance", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ code: 0 }))
  vi.stubGlobal("fetch", fetch)
  await kyber.request("routes", { amountIn: "5" }, "order")
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://kyber.example/test/api/v1/routes?amountIn=5"
  )
  expect(reserve).toHaveBeenCalledWith("order")
})

it("reads the dollar coin at the chain's own decimals", () => {
  // $10 of a six-decimal dollar coin buys 4 coins of an 18-decimal token.
  const route = kyber.parseRoute(
    {
      code: 0,
      data: {
        routerAddress: "0x3333333333333333333333333333333333333333",
        routeSummary: {
          tokenIn: dollarCoin,
          tokenOut: token,
          amountIn: "10000000",
          amountOut: String(4n * 10n ** 18n),
          amountInUsd: "10",
          amountOutUsd: "10",
          route: [[{ exchange: "pool" }]],
        },
      },
    },
    {
      token,
      side: "buy",
      amount: 10_000_000n,
      decimals: 18,
      px: 2.5,
      slippage: 0.005,
    }
  )
  expect(route.quote).toMatchObject({ usd: 10, sz: 4, price: 2.5 })
})
