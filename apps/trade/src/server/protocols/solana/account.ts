import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { loadHeldPromise } from "@/lib/protocols/promise-cache"
import { solanaRpc } from "@/server/protocols/solana/client"
import {
  fetchSolanaPrices,
  lastKnownSolanaPrices,
  PRICE_PAGE_SIZE,
  USDC_MINT,
} from "@/server/protocols/solana/markets"

/**
 * What a Solana wallet holds, read off the chain.
 *
 * A wallet's holdings are public: its SOL, and one token account per coin it
 * has ever held. The node answers both by address alone, so `credential` is
 * never called here — the secret key never even exists on this path, the
 * same rule Hyperliquid's reader keeps.
 *
 * **A position here is a coin you own.** No leverage, no margin, no
 * liquidation, no funding. `owned` on each row says so, and says which of
 * the two numbers every other venue supplies are missing: the price, when
 * Jupiter has none, and the entry, which the chain does not remember. The
 * entry will come from the app's own record of what it paid, once the swap
 * task writes one; today every coin reads as sent in.
 */

/** Wrapped SOL, which is how Jupiter lists and prices SOL. */
export const SOL_MINT = "So11111111111111111111111111111111111111112"

/**
 * The two programs a token account can belong to. The older one holds
 * nearly every coin; the newer one (Token-2022) holds a growing minority,
 * and a wallet is asked about both because either kind can be sent in.
 */
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * SOL kept back for fees, and where the number comes from.
 *
 * A swap costs the network fee (0.000005 SOL a signature) plus whatever
 * priority fee Jupiter attaches, and buying a coin the wallet has never
 * held also pays about 0.002 SOL to open its token account. One thousandth
 * of a SOL a transaction is a working figure that covers the ordinary case
 * with room; twenty of them is the floor the card warns under.
 */
export const SOL_PER_TRANSACTION = 0.001
export const SOL_FEE_RESERVE_TRANSACTIONS = 20
export const SOL_FEE_RESERVE =
  SOL_PER_TRANSACTION * SOL_FEE_RESERVE_TRANSACTIONS

/**
 * A priced holding worth less than this is dust and is not a row: its
 * value cannot even be printed. An unpriced holding is kept whatever its
 * size, because nobody can say what it is worth.
 */
export const DUST_USD = 0.01

/** Chain answers shared for this long, so a poll and a settle ask once. */
const ACCOUNT_GOOD_FOR_MS = 2_000

/**
 * How a held coin gets its price, and why it is not one call for the lot.
 *
 * The first real read of this file was against an exchange's hot wallet,
 * which holds 4,280 different coins. Priced fifty a page that is 86
 * requests, and the minute allows forty for every read the app makes. So
 * a coin already in the market list takes the list's own price, at most a
 * minute old and free; only coins outside the list are asked about, one
 * page of fifty at a time, and that page is held for ten seconds. The
 * budget then reads: the list's two a minute, the Solana page's 24, and
 * at most six here. A coin past the fiftieth unlisted one is unpriced
 * until the next read, which is the truth of a wallet full of airdrops.
 */
const UNLISTED_PRICES_GOOD_FOR_MS = 10_000
const unlistedPrices = new Map<
  string,
  { at: number; answer: Promise<Map<string, number>> }
>()

function priceHeldCoins(
  network: NetworkId,
  mints: readonly string[]
): Promise<ReadonlyMap<string, number>> {
  const listed = lastKnownSolanaPrices()
  const unlisted = mints.filter((mint) => !listed.has(mint))
  // Jupiter prices mainnet coins only. A devnet rehearsal reads its faucet
  // coins as unpriced, which is the truth of them.
  if (network !== "mainnet" || unlisted.length === 0) {
    return Promise.resolve(listed)
  }
  const page = unlisted.slice(0, PRICE_PAGE_SIZE)
  const asked = loadHeldPromise(
    unlistedPrices,
    [...page].sort().join(","),
    (at) => Date.now() - at < UNLISTED_PRICES_GOOD_FOR_MS,
    () => fetchSolanaPrices(network, page)
  )
  return asked.then((fresh) => new Map([...listed, ...fresh]))
}

const balanceSchema = z.object({ value: z.number() })

const tokenAccountsSchema = z.object({
  value: z.array(
    z.object({
      account: z.object({
        data: z.object({
          parsed: z.object({
            info: z.object({
              mint: z.string(),
              tokenAmount: z.object({
                amount: z.string(),
                decimals: z.number(),
              }),
            }),
          }),
        }),
      }),
    })
  ),
})

export type SolanaHoldings = {
  /** Native SOL, the coin fees are paid in. */
  sol: number
  /** Free money: every USDC account added up. */
  usdc: number
  /** Coins by mint, wrapped SOL folded into SOL. Zero balances left out. */
  coins: Map<string, number>
}

/**
 * The chain's three answers as plain holdings. A wallet can hold several
 * accounts of one coin (the saved answer has three of USDC), so amounts
 * are added by mint. Nothing is priced yet.
 */
export function solanaHoldings(input: {
  balance: unknown
  tokenAccounts: unknown
  token2022Accounts: unknown
}): SolanaHoldings {
  const balance = balanceSchema.safeParse(input.balance)
  const classic = tokenAccountsSchema.safeParse(input.tokenAccounts)
  const newer = tokenAccountsSchema.safeParse(input.token2022Accounts)
  if (!balance.success || !classic.success || !newer.success) {
    throw new Error("SOLANA_ACCOUNT_UNREADABLE")
  }
  const sol = balance.data.value / LAMPORTS_PER_SOL
  let usdc = 0
  const coins = new Map<string, number>()
  // SOL goes in first so it is the first coin priced: a wallet full of
  // airdrops must never push the one coin everybody holds past the page.
  if (sol > 0) coins.set(SOL_MINT, sol)
  for (const row of [...classic.data.value, ...newer.data.value]) {
    const { mint, tokenAmount } = row.account.data.parsed.info
    const amount = Number(tokenAmount.amount) / 10 ** tokenAmount.decimals
    if (!(amount > 0)) continue
    if (mint === USDC_MINT) {
      usdc += amount
      continue
    }
    coins.set(mint, (coins.get(mint) ?? 0) + amount)
  }
  return { sol, usdc, coins }
}

type Snapshot = {
  figures: WalletAccountFigures
  portfolio: WalletPortfolio
}

function trimmed(amount: number): string {
  return amount.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

/**
 * Holdings plus today's prices as the figures and rows every wallet
 * screen draws.
 *
 * Worth is USDC plus every priced coin. Free is the USDC. In trades is the
 * coins. Open profit is zero until an entry price exists to measure from.
 * A coin Jupiter has no price for is a row that says so rather than a coin
 * that vanished; a coin worth under a cent is left out as dust.
 */
export function toSolanaSnapshot(
  holdings: SolanaHoldings,
  prices: ReadonlyMap<string, number>
): Snapshot {
  const positions: WalletPosition[] = []
  let inTrades = 0
  for (const [mint, amount] of holdings.coins) {
    const price = prices.get(mint) ?? null
    const value = price === null ? 0 : amount * price
    if (price !== null && value < DUST_USD) continue
    inTrades += value
    positions.push({
      marketId: mint,
      szi: amount,
      // A stand-in the row's arithmetic needs, never a claim: `owned` below
      // says the entry is unknown and the screens print a dash for profit.
      entryPx: price ?? 0,
      leverage: 1,
      // Nothing is held as margin on a coin that is owned outright.
      marginUsed: 0,
      liquidationPx: null,
      targets: [],
      tpPx: null,
      tpSz: null,
      slPx: null,
      tpOrderId: null,
      slOrderId: null,
      protectionOrderIds: [],
      owned: { entryKnown: false, priced: price !== null },
    })
  }
  const short = holdings.sol < SOL_FEE_RESERVE
  return {
    figures: {
      equity: holdings.usdc + inTrades,
      free: holdings.usdc,
      inTrades,
      openProfit: 0,
      feeCoin: {
        symbol: "SOL",
        amount: holdings.sol,
        warning: short
          ? `This wallet holds ${trimmed(holdings.sol)} SOL, under the ${trimmed(SOL_FEE_RESERVE)} SOL that pays for about ${SOL_FEE_RESERVE_TRANSACTIONS} transactions. Send it a little SOL so a buy or sell never fails for want of a few cents.`
          : null,
      },
    },
    portfolio: { positions, orders: [] },
  }
}

const cache = new Map<string, { at: number; answer: Promise<Snapshot> }>()

async function load(network: NetworkId, address: string): Promise<Snapshot> {
  const [balance, tokenAccounts, token2022Accounts] = await Promise.all([
    solanaRpc(network, "getBalance", [address]),
    solanaRpc(network, "getTokenAccountsByOwner", [
      address,
      { programId: TOKEN_PROGRAM },
      { encoding: "jsonParsed" },
    ]),
    solanaRpc(network, "getTokenAccountsByOwner", [
      address,
      { programId: TOKEN_2022_PROGRAM },
      { encoding: "jsonParsed" },
    ]),
  ])
  const holdings = solanaHoldings({ balance, tokenAccounts, token2022Accounts })
  const prices = await priceHeldCoins(network, [...holdings.coins.keys()])
  return toSolanaSnapshot(holdings, prices)
}

function read(network: NetworkId, address: string): Promise<Snapshot> {
  return loadHeldPromise(
    cache,
    `${network}:${address}`,
    (at) => Date.now() - at < ACCOUNT_GOOD_FOR_MS,
    () => load(network, address)
  )
}

export async function fetchSolanaAccount(
  network: NetworkId,
  address: string
): Promise<WalletAccountFigures> {
  return (await read(network, address)).figures
}

export async function fetchSolanaPortfolio(
  network: NetworkId,
  address: string
): Promise<WalletPortfolio> {
  return (await read(network, address)).portfolio
}

/** Tests must not answer from another case's read. */
export function clearSolanaAccountState(): void {
  cache.clear()
  unlistedPrices.clear()
}
