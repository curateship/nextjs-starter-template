import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "@/server/protocols/solana/account.fixture.json"
import {
  clearSolanaAccountState,
  DUST_USD,
  fetchSolanaAccount,
  fetchSolanaPortfolio,
  SOL_FEE_RESERVE,
  SOL_MINT,
  solanaHoldings,
  toSolanaSnapshot,
} from "@/server/protocols/solana/account"
import { clearSolanaClientState } from "@/server/protocols/solana/client"
import {
  clearSolanaMarketState,
  fetchSolanaMarkets,
  USDC_MINT,
} from "@/server/protocols/solana/markets"
import jupiter from "@/server/protocols/solana/jupiter.fixture.json"

/**
 * A real mainnet wallet's answers, saved 4 Sep 2026 and trimmed to the
 * accounts that matter: three USDC accounts (one empty), SOL held both
 * natively and wrapped, JUP, BONK, a coin worth a fraction of a cent, a
 * coin with a zero balance, and a Token-2022 coin Jupiter has no price
 * for. `price` is Jupiter's real answer for those mints the same minute.
 */
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
const DUST = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E"
const EMPTY = "2wNtMigJE1L9Tk2gM83gZP1Gw2ZN25DZSQeCCSLXkiKp"
const UNPRICED = "124L55JoFbitT9aAEYwfencH1Puqa1UnKuGZWU2cRiZZ"

const chain = {
  balance: fixture.balance.result,
  tokenAccounts: fixture.tokenAccounts.result,
  token2022Accounts: fixture.token2022Accounts.result,
}

const prices = new Map(
  Object.entries(fixture.price).map(([mint, row]) => [mint, row.usdPrice])
)

describe("what the chain says a wallet holds", () => {
  it("adds up every account of a coin and folds wrapped SOL into SOL", () => {
    const holdings = solanaHoldings(chain)
    // 1,972,010.475425346 SOL native plus 1,125.365266728 wrapped.
    expect(holdings.sol).toBeCloseTo(1_972_010.475425346, 6)
    expect(holdings.coins.get(SOL_MINT)).toBeCloseTo(
      1_972_010.475425346 + 1_125.365266728,
      6
    )
    // Three USDC accounts: 14.773253 + 3,573.507947 + 0.
    expect(holdings.usdc).toBeCloseTo(3_588.2812, 6)
    expect(holdings.coins.has(USDC_MINT)).toBe(false)
    expect(holdings.coins.get(JUP)).toBeCloseTo(19_408_733.445741, 6)
    expect(holdings.coins.get(UNPRICED)).toBe(100_000_000)
    // An empty token account is not a holding.
    expect(holdings.coins.has(EMPTY)).toBe(false)
  })

  it("refuses an answer it cannot read rather than guessing", () => {
    expect(() =>
      solanaHoldings({ ...chain, balance: { value: "lots" } })
    ).toThrow("SOLANA_ACCOUNT_UNREADABLE")
    expect(() =>
      solanaHoldings({ ...chain, tokenAccounts: { value: [{}] } })
    ).toThrow("SOLANA_ACCOUNT_UNREADABLE")
  })
})

describe("the figures and rows", () => {
  it("prices the wallet: worth is USDC plus every priced coin", () => {
    const holdings = solanaHoldings(chain)
    const { figures, portfolio } = toSolanaSnapshot(holdings, prices)
    const sol = holdings.coins.get(SOL_MINT)! * prices.get(SOL_MINT)!
    const jup = holdings.coins.get(JUP)! * prices.get(JUP)!
    const bonk = holdings.coins.get(BONK)! * prices.get(BONK)!
    expect(figures.free).toBeCloseTo(3_588.2812, 6)
    expect(figures.inTrades).toBeCloseTo(sol + jup + bonk, 2)
    expect(figures.equity).toBeCloseTo(figures.free + figures.inTrades, 2)
    // No entry price exists yet, so nothing is up or down.
    expect(figures.openProfit).toBe(0)
    expect(portfolio.orders).toEqual([])
    const jupRow = portfolio.positions.find((row) => row.marketId === JUP)
    expect(jupRow).toEqual(
      expect.objectContaining({
        szi: holdings.coins.get(JUP),
        entryPx: prices.get(JUP),
        leverage: 1,
        marginUsed: 0,
        liquidationPx: null,
        owned: { entryKnown: false, priced: true },
      })
    )
  })

  it("keeps an unpriced coin as a row that says so", () => {
    const { figures, portfolio } = toSolanaSnapshot(
      solanaHoldings(chain),
      prices
    )
    const row = portfolio.positions.find((one) => one.marketId === UNPRICED)
    expect(row).toEqual(
      expect.objectContaining({
        szi: 100_000_000,
        entryPx: 0,
        owned: { entryKnown: false, priced: false },
      })
    )
    // And it adds nothing to the worth, because nobody knows what it is.
    expect(figures.inTrades).toBeCloseTo(
      portfolio.positions
        .filter((one) => one.owned?.priced)
        .reduce((sum, one) => sum + one.szi * one.entryPx, 0),
      2
    )
  })

  it("drops a priced coin worth under a cent as dust", () => {
    const holdings = solanaHoldings(chain)
    // 0.000005 coins at $37.30 is $0.0002.
    expect(holdings.coins.get(DUST)! * prices.get(DUST)!).toBeLessThan(DUST_USD)
    const { portfolio } = toSolanaSnapshot(holdings, prices)
    expect(portfolio.positions.map((one) => one.marketId)).not.toContain(DUST)
  })

  it("shows the SOL kept for fees and warns once it is short", () => {
    const rich = toSolanaSnapshot(solanaHoldings(chain), prices)
    expect(rich.figures.feeCoin?.symbol).toBe("SOL")
    expect(rich.figures.feeCoin?.amount).toBeCloseTo(1_972_010.475425346, 6)
    expect(rich.figures.feeCoin?.warning).toBeNull()

    const nearlyEmpty = toSolanaSnapshot(
      { sol: 0.0042, usdc: 500, coins: new Map() },
      prices
    )
    expect(nearlyEmpty.figures).toMatchObject({
      equity: 500,
      free: 500,
      inTrades: 0,
    })
    expect(nearlyEmpty.figures.feeCoin?.warning).toBe(
      `This wallet holds 0.0042 SOL, under the ${SOL_FEE_RESERVE} SOL that pays for about 20 transactions. Send it a little SOL so a buy or sell never fails for want of a few cents.`
    )
  })

  it("prices SOL through wrapped SOL, the mint Jupiter lists it under", () => {
    const { portfolio } = toSolanaSnapshot(
      { sol: 2, usdc: 0, coins: new Map([[SOL_MINT, 2]]) },
      prices
    )
    expect(portfolio.positions).toHaveLength(1)
    expect(portfolio.positions[0].entryPx).toBe(prices.get(SOL_MINT))
    expect(portfolio.positions[0].owned?.priced).toBe(true)
  })
})

describe("asking the node", () => {
  const fetchMock = vi.fn<typeof fetch>()
  const ADDRESS = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  }

  function answerLikeTheChain() {
    fetchMock.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string
        params?: unknown[]
      }
      if (String(url).includes("jup.ag")) return jsonResponse(fixture.price)
      if (body.method === "getBalance") return jsonResponse(fixture.balance)
      const program = (body.params?.[1] as { programId: string }).programId
      return jsonResponse(
        program.startsWith("Tokenz")
          ? fixture.token2022Accounts
          : fixture.tokenAccounts
      )
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    clearSolanaClientState()
    clearSolanaMarketState()
    clearSolanaAccountState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    clearSolanaClientState()
    clearSolanaMarketState()
    clearSolanaAccountState()
  })

  it("reads both token programs and the balance, then prices the coins once", async () => {
    answerLikeTheChain()
    const figures = fetchSolanaAccount("mainnet", ADDRESS)
    const portfolio = fetchSolanaPortfolio("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    expect((await figures).free).toBeCloseTo(3_588.2812, 6)
    expect((await portfolio).positions.length).toBeGreaterThan(0)
    // Three chain reads and one Jupiter price page, shared by both callers.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const nodeCalls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes("jup.ag")
    )
    expect(nodeCalls).toHaveLength(3)
    expect(String(nodeCalls[0]![0])).toBe("https://api.mainnet-beta.solana.com")
  })

  it("takes a listed coin's price from the list and never asks for it", async () => {
    // The market list has been read this minute, so SOL (in the saved list)
    // is priced already. Only the coins outside the list cost a request.
    fetchMock.mockImplementation(async () => jsonResponse(jupiter.verified))
    const list = fetchSolanaMarkets("mainnet")
    await vi.runAllTimersAsync()
    await list
    const listCalls = fetchMock.mock.calls.length
    answerLikeTheChain()
    const portfolio = fetchSolanaPortfolio("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    const priceCalls = fetchMock.mock.calls
      .slice(listCalls)
      .filter(([url]) => String(url).includes("/price/v3"))
    expect(priceCalls).toHaveLength(1)
    const asked = new URL(String(priceCalls[0]![0])).searchParams.get("ids")
    expect(asked).not.toContain(SOL_MINT)
    expect(asked).toContain(UNPRICED)
    const sol = (await portfolio).positions.find(
      (one) => one.marketId === SOL_MINT
    )
    expect(sol?.owned?.priced).toBe(true)
  })

  it("prices at most fifty unlisted coins a read, and holds that page ten seconds", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      `Coin${i}`.padEnd(44, "x")
    )
    fetchMock.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string
      }
      if (String(url).includes("jup.ag")) return jsonResponse({})
      if (body.method === "getBalance") return jsonResponse(fixture.balance)
      return jsonResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          context: fixture.tokenAccounts.result.context,
          value: many.map((mint) => ({
            account: {
              data: {
                parsed: {
                  info: { mint, tokenAmount: { amount: "1000", decimals: 0 } },
                },
              },
            },
          })),
        },
      })
    })
    const first = fetchSolanaPortfolio("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    // Two token-program answers of sixty each add up by mint to sixty coins,
    // and SOL makes sixty-one.
    expect((await first).positions).toHaveLength(61)
    const priceCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/price/v3"))
    expect(priceCalls()).toHaveLength(1)
    const ids = new URL(String(priceCalls()[0]![0])).searchParams
      .get("ids")!
      .split(",")
    expect(ids).toHaveLength(50)
    // Three seconds on: the chain is asked again, the price page is not.
    await vi.advanceTimersByTimeAsync(3_000)
    const second = fetchSolanaPortfolio("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    await second
    expect(priceCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(8_000)
    const third = fetchSolanaPortfolio("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    await third
    expect(priceCalls()).toHaveLength(2)
  })

  it("asks again only after two seconds", async () => {
    answerLikeTheChain()
    await fetchSolanaAccount("mainnet", ADDRESS)
    await vi.advanceTimersByTimeAsync(1_500)
    await fetchSolanaAccount("mainnet", ADDRESS)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(600)
    const again = fetchSolanaAccount("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    await again
    // Three more chain reads; the unlisted coin's price page is still held.
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it("answers busy when the public node rations, and forgets that answer", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, 429))
    const outcome = fetchSolanaAccount("mainnet", ADDRESS).then(
      () => "answered",
      (error: Error) => error.message
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe("EXCHANGE_BUSY")
    // The next poll asks afresh rather than re-serving the refusal.
    answerLikeTheChain()
    const figures = fetchSolanaAccount("mainnet", ADDRESS)
    await vi.runAllTimersAsync()
    expect((await figures).free).toBeGreaterThan(0)
  })

  it("passes on the node's own refusal in its words", async () => {
    // A fresh Response per call: three reads go out at once and a body can
    // only be read once.
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid param: WrongSize" },
      })
    )
    const outcome = fetchSolanaAccount("mainnet", "not-an-address").then(
      () => "answered",
      (error: Error) => error.message
    )
    await vi.runAllTimersAsync()
    expect(await outcome).toBe(
      "SOLANA_NODE_REFUSED:-32602:Invalid param: WrongSize"
    )
  })
})
