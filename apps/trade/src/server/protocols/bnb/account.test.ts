import { beforeEach, describe, expect, it, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
} from "viem"
import fixture from "./account.fixture.json"
const { request, listed, prices, where } = vi.hoisted(() => ({
  request: vi.fn(),
  listed: vi.fn(),
  prices: vi.fn(),
  where: vi.fn(),
}))
vi.mock("viem", async (original) => ({
  ...(await original<object>()),
  createPublicClient: () => ({ request }),
}))
vi.mock("./markets", () => ({
  bnbAccountMarkets: listed,
  fetchBnbPrices: prices,
  BNB_PRICE_PAGE_SIZE: 30,
}))
vi.mock("@/server/trade/db", () => ({
  db: { selectDistinct: () => ({ from: () => ({ where }) }) },
}))
import {
  bnbHoldings,
  bnbMulticallAbi,
  toBnbSnapshot,
  fetchBnbAccount,
  fetchBnbPortfolio,
  clearBnbAccountState,
  BNB_FEE_RESERVE,
  BNB_USDC,
} from "./account"
import { BNB_USDT, BNB_WRAPPED_NATIVE } from "./client"
const cake = fixture.tokens[3]
const owner = { userId: "owner-one", walletId: "wallet-one" }
const real = decodeFunctionResult({
  abi: bnbMulticallAbi,
  functionName: "aggregate3",
  data: fixture.response.result as Hex,
})
const realHoldings = () =>
  bnbHoldings(fixture.tokens, fixture.response.result as Hex)
const scalar = (n: bigint) =>
  encodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", result: n })
function synthetic(
  tokens: readonly string[],
  amounts: Map<string, bigint>,
  native = 0n,
  decimals = 18
) {
  return encodeFunctionResult({
    abi: bnbMulticallAbi,
    functionName: "aggregate3",
    result: [
      { success: true, returnData: scalar(native) },
      ...tokens.flatMap((id) => [
        { success: true, returnData: scalar(amounts.get(id) ?? 0n) },
        { success: true, returnData: scalar(BigInt(decimals)) },
      ]),
    ],
  })
}
function calledTokens() {
  const call = request.mock.calls.at(-1)![0]
  const decoded = decodeFunctionData({
    abi: bnbMulticallAbi,
    data: call.params[0].data,
  })
  if (decoded.functionName !== "aggregate3") throw Error("wrong call")
  return decoded.args[0]
    .filter((_, index) => index % 2 === 1)
    .map((row) => row.target.toLowerCase())
}
beforeEach(() => {
  clearBnbAccountState()
  vi.useRealTimers()
  listed.mockReset().mockReturnValue({
    ids: fixture.tokens,
    prices: new Map([
      [cake, 2],
      [BNB_USDC, 1],
      [BNB_WRAPPED_NATIVE, 600],
    ]),
  })
  prices.mockReset().mockResolvedValue(new Map())
  where.mockReset().mockResolvedValue([])
  request.mockReset().mockImplementation(() => {
    const tokens = calledTokens()
    return Promise.resolve(
      encodeFunctionResult({
        abi: bnbMulticallAbi,
        functionName: "aggregate3",
        result: [
          real[0],
          ...tokens.flatMap((id) => {
            const index = fixture.tokens.indexOf(id)
            return index < 0
              ? [
                  { success: true, returnData: scalar(0n) },
                  { success: true, returnData: scalar(18n) },
                ]
              : [real[1 + index * 2], real[2 + index * 2]]
          }),
        ],
      })
    )
  })
})
describe("BNB wallet holdings", () => {
  it("reads the saved real Multicall3 answer using BSC's 18-decimal USDT", () => {
    const held = realHoldings()
    expect(held.usdt).toBeCloseTo(193202163.34129578, 6)
    expect(held.bnb).toBeCloseTo(87025.81426631346, 8)
    expect(held.coins.get(BNB_USDC)).toBeCloseTo(121837875.94343139, 6)
    expect(held.coins.get(cake)).toBeCloseTo(1829637.764234637, 6)
    expect(held.coins.get(BNB_WRAPPED_NATIVE)).toBeCloseTo(
      held.bnb + 1140.53640261,
      8
    )
    expect(held.coins.has(BNB_USDT)).toBe(false)
  })
  it("values every priced coin, keeps unpriced holdings and hides only priced dust rows", () => {
    const held = {
      bnb: 0,
      usdt: 12.5,
      coins: new Map([
        [cake, 2],
        [BNB_USDC, 0.004],
        [BNB_WRAPPED_NATIVE, 0.2],
      ]),
    }
    const { figures, portfolio } = toBnbSnapshot(
      held,
      new Map([
        [cake, 3],
        [BNB_USDC, 1],
      ])
    )
    expect(figures.equity).toBeCloseTo(18.504, 10)
    expect(figures).toMatchObject({
      free: 12.5,
      inTrades: 6.004,
      openProfit: 0,
      feeCoin: { amount: 0, symbol: "BNB" },
    })
    expect(portfolio.positions).toHaveLength(2)
    expect(portfolio.positions[0]).toMatchObject({
      szi: 2,
      leverage: 1,
      marginUsed: 0,
      liquidationPx: null,
      owned: { priced: true, entryKnown: false },
    })
    expect(portfolio.positions[1].owned).toEqual({
      priced: false,
      entryKnown: false,
    })
    expect(figures.feeCoin?.warning).toContain("0.005 BNB")
  })
  it("handles synthetic zero balances, non-18 decimals and the exact reserve boundary", () => {
    const held = bnbHoldings(
      [cake],
      synthetic([cake], new Map([[cake, 1234567n]]), 0n, 6)
    )
    expect(held.coins.get(cake)).toBe(1.234567)
    const empty = bnbHoldings(
      fixture.tokens,
      synthetic(fixture.tokens, new Map())
    )
    expect(toBnbSnapshot(empty, new Map()).portfolio.positions).toEqual([])
    expect(toBnbSnapshot(empty, new Map()).figures.equity).toBe(0)
    expect(
      toBnbSnapshot({ ...empty, bnb: BNB_FEE_RESERVE }, new Map()).figures
        .feeCoin?.warning
    ).toBeNull()
    expect(
      toBnbSnapshot({ ...empty, bnb: BNB_FEE_RESERVE - 1e-8 }, new Map())
        .figures.feeCoin?.warning
    ).not.toBeNull()
  })
  it("refuses truncated or partially failed chain answers instead of understating holdings", () => {
    expect(() => bnbHoldings(fixture.tokens, "0x")).toThrow(
      "BNB_ACCOUNT_UNREADABLE"
    )
    const failed = real.map((row) => ({ ...row }))
    failed[1].success = false
    expect(() =>
      bnbHoldings(
        fixture.tokens,
        encodeFunctionResult({
          abi: bnbMulticallAbi,
          functionName: "aggregate3",
          result: failed,
        })
      )
    ).toThrow("BNB_ACCOUNT_UNREADABLE")
  })
  it("shares figures and positions for two seconds without reading a private key", async () => {
    vi.useFakeTimers()
    const credential = vi.fn(() => {
      throw Error("secret accessed")
    })
    const [figures, portfolio] = await Promise.all([
      fetchBnbAccount("mainnet", fixture.wallet, credential, owner),
      fetchBnbPortfolio(
        "mainnet",
        fixture.wallet.toUpperCase().replace("0X", "0x"),
        credential,
        "background",
        owner
      ),
    ])
    expect(request).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledTimes(1)
    expect(credential).not.toHaveBeenCalled()
    expect(portfolio.positions).toHaveLength(3)
    expect(figures.free).toBe(realHoldings().usdt)
    await vi.advanceTimersByTimeAsync(1999)
    await fetchBnbAccount("mainnet", fixture.wallet, credential, owner)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await fetchBnbAccount("mainnet", fixture.wallet, credential, owner)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("discovers bought coins only within the supplied owner's wallet, including hidden historical fills", async () => {
    const previous = "0x1111111111111111111111111111111111111111"
    where.mockResolvedValue([
      { marketKey: `bnb:mainnet:${previous}` },
      { marketKey: "solana:mainnet:other" },
    ])
    await fetchBnbAccount("mainnet", fixture.wallet, undefined, owner)
    expect(calledTokens()).toContain(previous)
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0])
    expect(query.params).toEqual([owner.userId, owner.walletId, "buy"])
    expect(query.sql).toContain('"user_id"')
    expect(query.sql).toContain('"wallet_id"')
    expect(query.sql).not.toContain('"hidden"')
    await fetchBnbAccount("mainnet", fixture.wallet, undefined, {
      ...owner,
      userId: "owner-two",
    })
    expect(where).toHaveBeenCalledTimes(2)
  })
  it("prices unlisted coins thirty per page, holds answers ten seconds and uses no price request for listed coins", async () => {
    vi.useFakeTimers()
    await fetchBnbAccount("mainnet", fixture.wallet)
    expect(prices).not.toHaveBeenCalled()
    clearBnbAccountState()
    const ids = Array.from(
      { length: 31 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`
    )
    listed.mockReturnValue({ ids, prices: new Map() })
    request.mockImplementation(async () =>
      synthetic(calledTokens(), new Map(ids.map((id) => [id, 10n ** 18n])))
    )
    const first = await fetchBnbPortfolio("mainnet", fixture.wallet)
    expect(prices.mock.calls.map((call) => call[1].length)).toEqual([30, 1])
    expect(first.positions.every((row) => row.owned?.priced === false)).toBe(
      true
    )
    await vi.advanceTimersByTimeAsync(2000)
    await fetchBnbPortfolio("mainnet", fixture.wallet)
    expect(prices).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(8000)
    await fetchBnbPortfolio("mainnet", fixture.wallet)
    expect(prices).toHaveBeenCalledTimes(4)
  })
  it("shares slow and failed requests and refuses invalid inputs before any reads", async () => {
    vi.useFakeTimers()
    let finish!: (raw: Hex) => void
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const one = fetchBnbAccount("mainnet", fixture.wallet)
    await vi.advanceTimersByTimeAsync(3000)
    const two = fetchBnbAccount("mainnet", fixture.wallet)
    expect(request).toHaveBeenCalledTimes(1)
    finish(synthetic(calledTokens(), new Map()))
    await Promise.all([one, two])
    clearBnbAccountState()
    request.mockRejectedValue(Error("private provider URL"))
    await expect(fetchBnbAccount("mainnet", fixture.wallet)).rejects.toThrow(
      "EXCHANGE_BUSY:BNB Chain"
    )
    await expect(
      fetchBnbAccount("mainnet", fixture.wallet)
    ).rejects.not.toThrow("private provider URL")
    expect(request).toHaveBeenCalledTimes(2)
    await expect(fetchBnbAccount("testnet", fixture.wallet)).rejects.toThrow(
      "PROTOCOL_NETWORK"
    )
    await expect(fetchBnbAccount("mainnet", "bad")).rejects.toThrow(
      "BNB_WALLET_ADDRESS"
    )
    expect(request).toHaveBeenCalledTimes(2)
  })
})
