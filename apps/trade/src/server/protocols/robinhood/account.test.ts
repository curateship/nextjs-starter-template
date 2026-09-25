import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
} from "viem"
import fixture from "./account.fixture.json"

const { request, explorer, known, prices } = vi.hoisted(() => ({
  request: vi.fn(),
  explorer: vi.fn(),
  known: vi.fn(),
  prices: vi.fn(),
}))
vi.mock("viem", async (original) => ({
  ...(await original<object>()),
  createPublicClient: () => ({ request }),
}))
vi.mock("./client", async (original) => ({
  ...(await original<object>()),
  robinhoodServiceGet: explorer,
}))
vi.mock("./markets", () => ({
  robinhoodAccountMarkets: known,
  fetchRobinhoodPrices: prices,
}))

// Saved on 24 Sep 2026: NVDA's USDG pool, read as if it were a wallet.
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
const NVDA = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"
// A token nobody lists, which the pool was sent.
const HOODIE = "0xac6aa69489dc51fb002a8ae4096b35cbd9f405ac"
const WALLET = fixture.wallet
const NVDA_PRICE = 225.21

async function multicall() {
  const { multicallAbi } = await import("@/server/protocols/evm-chain/balances")
  return multicallAbi
}
/** The tokens an eth_call asked about, in order. */
async function askedAbout(call: number): Promise<string[]> {
  const data = request.mock.calls[call][0].params[0].data as Hex
  const decoded = decodeFunctionData({ abi: await multicall(), data })
  const calls = decoded.args[0] as readonly { target: string }[]
  return [...new Set(calls.slice(1).map((one) => one.target.toLowerCase()))]
}
/** An answer for these tokens: each holds `amounts[token]` at 18 decimals, or fails. */
async function answerFor(
  tokens: readonly string[],
  amounts: Record<string, bigint | "fails">,
  eth = 0n
): Promise<Hex> {
  const scalar = (functionName: "balanceOf" | "decimals", value: bigint | number) =>
    encodeFunctionResult({ abi: erc20Abi, functionName, result: value as never })
  return encodeFunctionResult({
    abi: await multicall(),
    functionName: "aggregate3",
    result: [
      {
        success: true,
        returnData: encodeFunctionResult({
          abi: await multicall(),
          functionName: "getEthBalance",
          result: eth,
        }),
      },
      ...tokens.flatMap((token) => {
        const amount = amounts[token] ?? 0n
        return amount === "fails"
          ? [
              { success: false, returnData: "0x" as Hex },
              { success: false, returnData: "0x" as Hex },
            ]
          : [
              { success: true, returnData: scalar("balanceOf", amount) },
              { success: true, returnData: scalar("decimals", 18) },
            ]
      }),
    ],
  })
}

beforeEach(() => {
  vi.resetModules()
  request.mockReset().mockResolvedValue(fixture.multicall)
  explorer.mockReset().mockResolvedValue(fixture.explorer)
  known.mockReset().mockResolvedValue({
    ids: [NVDA],
    prices: new Map([[NVDA, NVDA_PRICE]]),
  })
  prices.mockReset().mockResolvedValue(new Map())
})
afterEach(() => vi.useRealTimers())

it("counts USDG as free money and values each holding from the chain's own amounts", async () => {
  const { fetchRobinhoodAccount, fetchRobinhoodPortfolio } = await import(
    "./account"
  )
  const figures = await fetchRobinhoodAccount("mainnet", WALLET)
  // The chain said $3,092,558.50. The explorer's list, a step behind, said
  // $3,122,214.87; amounts never come from it.
  expect(figures.free).toBeCloseTo(3_092_558.502211, 6)
  expect(figures.inTrades).toBeCloseTo(11_370.370188195446 * NVDA_PRICE, 4)
  expect(figures.equity).toBeCloseTo(figures.free + figures.inTrades, 6)
  const { positions } = await fetchRobinhoodPortfolio("mainnet", WALLET)
  expect(positions.find((one) => one.marketId === NVDA)).toMatchObject({
    szi: 11_370.370188195446,
    entryPx: NVDA_PRICE,
    owned: { entryKnown: false, priced: true },
  })
  // DexScreener has no price for it, so it is shown and marked unpriced.
  expect(positions.find((one) => one.marketId === HOODIE)).toMatchObject({
    szi: 1.5,
    owned: { priced: false },
  })
  expect(prices).toHaveBeenCalledWith("mainnet", [HOODIE])
})

it("asks the chain about every token the explorer found, and the listed ones", async () => {
  const { fetchRobinhoodAccount } = await import("./account")
  await fetchRobinhoodAccount("mainnet", WALLET)
  expect(await askedAbout(0)).toEqual([...fixture.tokens])
  expect(explorer).toHaveBeenCalledWith(
    "explorer",
    `/api/v2/addresses/${WALLET}/token-balances`
  )
})

it("reads the listed tokens when the explorer refuses", async () => {
  const listed = [USDG, WETH, NVDA].sort()
  explorer.mockRejectedValue(new Error("ROBINHOOD_SERVICE_REFUSED:Blockscout:524"))
  request.mockResolvedValue(await answerFor(listed, { [NVDA]: 2n * 10n ** 18n }))
  const { fetchRobinhoodPortfolio } = await import("./account")
  const { positions } = await fetchRobinhoodPortfolio("mainnet", WALLET)
  expect(await askedAbout(0)).toEqual(listed)
  expect(positions.map((one) => one.marketId)).toEqual([NVDA])
})

it("waits three seconds for a slow explorer, then reads what it knows", async () => {
  vi.useFakeTimers()
  const listed = [USDG, WETH, NVDA].sort()
  explorer.mockReturnValue(new Promise(() => {}))
  request.mockResolvedValue(await answerFor(listed, {}))
  const { fetchRobinhoodAccount } = await import("./account")
  const read = fetchRobinhoodAccount("mainnet", WALLET)
  await vi.advanceTimersByTimeAsync(2_999)
  expect(request).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await expect(read).resolves.toMatchObject({ free: 0 })
  expect(await askedAbout(0)).toEqual(listed)
})

it("leaves out a found token that will not answer, but not a listed one", async () => {
  const tokens = [...fixture.tokens]
  request.mockResolvedValue(
    await answerFor(tokens, { [HOODIE]: "fails", [NVDA]: 10n ** 18n })
  )
  const { fetchRobinhoodPortfolio, clearRobinhoodAccountState } = await import(
    "./account"
  )
  const { positions } = await fetchRobinhoodPortfolio("mainnet", WALLET)
  expect(positions.map((one) => one.marketId)).toEqual([NVDA])
  clearRobinhoodAccountState()
  request.mockResolvedValue(await answerFor(tokens, { [NVDA]: "fails" }))
  await expect(fetchRobinhoodPortfolio("mainnet", WALLET)).rejects.toThrow(
    "ROBINHOOD_ACCOUNT_UNREADABLE"
  )
})

it("warns below 0.001 ETH and counts the ETH it holds", async () => {
  const tokens = [...fixture.tokens]
  const { fetchRobinhoodAccount, clearRobinhoodAccountState } = await import(
    "./account"
  )
  request.mockResolvedValue(await answerFor(tokens, {}, 999_999_999_999_999n))
  expect((await fetchRobinhoodAccount("mainnet", WALLET)).feeCoin).toMatchObject({
    symbol: "ETH",
    warning:
      "Send this wallet a little ETH for network fees. Keep at least 0.001 ETH, about eight swaps. Wrapped ETH cannot pay these fees.",
  })
  clearRobinhoodAccountState()
  request.mockResolvedValue(await answerFor(tokens, {}, 10n ** 15n))
  expect((await fetchRobinhoodAccount("mainnet", WALLET)).feeCoin).toMatchObject({
    amount: 0.001,
    warning: null,
  })
})

it("refuses a practice network or a malformed address before asking anyone", async () => {
  const { fetchRobinhoodAccount } = await import("./account")
  await expect(fetchRobinhoodAccount("testnet", WALLET)).rejects.toThrow(
    "PROTOCOL_NETWORK:robinhood"
  )
  await expect(fetchRobinhoodAccount("mainnet", "0x1234")).rejects.toThrow(
    "ROBINHOOD_WALLET_ADDRESS"
  )
  expect(request).not.toHaveBeenCalled()
})
