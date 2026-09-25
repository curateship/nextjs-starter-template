import { afterEach, expect, it, vi } from "vitest"
import { encodeFunctionData, type Address } from "viem"
import { kyberSwap, kyberSwapAbi } from "./kyber"
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

it("refuses a built swap that carries any fee, and passes the same swap without one", () => {
  // Copying only takes real money on Hyperliquid, so no swap carries Trade's
  // fee yet and every fee KyberSwap adds is somebody else's. Until swaps can
  // be copied with real money, a fee of any size to anybody is refused.
  const wallet = "0x4444444444444444444444444444444444444444" as Address
  const router = "0x3333333333333333333333333333333333333333" as Address
  const route = kyber.parseRoute(
    {
      code: 0,
      data: {
        routerAddress: router,
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
  const build = (fee: { to: Address; amount: bigint } | null) => ({
    code: 0,
    data: {
      amountIn: "10000000",
      amountOut: String(4n * 10n ** 18n),
      routerAddress: router,
      transactionValue: "0",
      data: encodeFunctionData({
        abi: kyberSwapAbi,
        functionName: "swapSimpleMode",
        args: [
          router,
          {
            srcToken: dollarCoin,
            dstToken: token,
            srcReceivers: [router],
            srcAmounts: [10_000_000n],
            feeReceivers: fee ? [fee.to] : [],
            feeAmounts: fee ? [fee.amount] : [],
            dstReceiver: wallet,
            amount: 10_000_000n,
            minReturnAmount: (4n * 10n ** 18n * 9_950n) / 10_000n,
            flags: 0n,
            permit: "0x",
          },
          "0x",
          "0x",
        ],
      }),
    },
  })
  expect(
    kyber.validateBuild(build(null), route, wallet, 0.005).router
  ).toBe(router)
  expect(() =>
    kyber.validateBuild(
      build({ to: "0x5555555555555555555555555555555555555555", amount: 1n }),
      route,
      wallet,
      0.005
    )
  ).toThrow("does not match")
})
