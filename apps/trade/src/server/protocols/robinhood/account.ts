import { z } from "zod"
import { isAddress, type Hex } from "viem"
import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
} from "@/lib/protocols/contracts"
import {
  evmBalances,
  held,
  type EvmSnapshot,
} from "@/server/protocols/evm-chain/balances"
import { PRICE_PAGE_SIZE } from "@/server/protocols/evm-chain/markets"
import {
  robinhoodRpcUrl,
  robinhoodServiceGet,
  ROBINHOOD_USDG,
  ROBINHOOD_WETH,
} from "./client"
import { fetchRobinhoodPrices, robinhoodAccountMarkets } from "./markets"
import { ROBINHOOD_FEE_RESERVE } from "./refusals"

/** How long the explorer's list of a wallet's tokens is trusted. */
const DISCOVERY_MS = 60_000
/** How long a read waits for the explorer before using what it knows. */
const DISCOVERY_WAIT_MS = 3_000
/**
 * The most tokens the explorer may add to one read. A wallet anyone can send
 * junk to must not grow the chain read without end; 200 is what the explorer
 * listed for NVDA's busiest pool on 24 Sep 2026.
 */
const MOST_FOUND_TOKENS = 200

const balances = evmBalances({
  chain: "Robinhood Chain",
  unreadable: "ROBINHOOD_ACCOUNT_UNREADABLE",
  dollarCoin: ROBINHOOD_USDG,
  wrappedNative: ROBINHOOD_WETH,
  feeCoin: "ETH",
  feeReserve: ROBINHOOD_FEE_RESERVE,
  feeWarning:
    "Send this wallet a little ETH for network fees. Keep at least 0.001 ETH, about eight swaps. Wrapped ETH cannot pay these fees.",
})

const tokenBalancesSchema = z.array(
  z.object({
    token: z.object({
      address_hash: z.string().regex(/^0x[\da-f]{40}$/i),
      type: z.string(),
    }),
    value: z.string().nullable(),
  })
)

/** The tokens the explorer says this wallet holds, lowercase. */
function parseHeldTokens(raw: unknown): string[] {
  return tokenBalancesSchema
    .parse(raw)
    .filter(
      ({ token, value }) =>
        // ERC-8056 is an ERC-20 with a multiplier; Robinhood's stock tokens
        // use it. NFTs and anything else are not money this card counts.
        (token.type === "ERC-20" || token.type === "ERC-8056") &&
        /^\d+$/.test(value ?? "") &&
        BigInt(value!) > 0n
    )
    .map(({ token }) => token.address_hash.toLowerCase())
    .slice(0, MOST_FOUND_TOKENS)
}

const discovered = new Map<
  string,
  { at: number; tokens: string[]; pending: Promise<void> | null }
>()

/**
 * What the explorer says the wallet holds, asked at most once a minute.
 *
 * The explorer only says WHICH tokens to ask about; every amount comes from
 * the chain itself. It can be slow: on 24 Sep 2026 it took 100 seconds and
 * then failed for an address holding thousands of tokens. So a read waits at
 * most three seconds, then goes on with the last answer, or none, and the
 * slow answer is kept for the next read.
 */
async function heldTokens(wallet: string): Promise<string[]> {
  const entry = discovered.get(wallet) ?? {
    at: -Infinity,
    tokens: [],
    pending: null,
  }
  discovered.set(wallet, entry)
  if (!entry.pending && Date.now() - entry.at >= DISCOVERY_MS) {
    entry.at = Date.now()
    entry.pending = robinhoodServiceGet(
      "explorer",
      `/api/v2/addresses/${wallet}/token-balances`
    )
      .then((raw) => {
        entry.tokens = parseHeldTokens(raw)
      })
      .catch(() => {
        // Refused or unreadable: the known list still reads the card.
      })
      .finally(() => {
        entry.pending = null
      })
  }
  if (entry.pending) {
    const pending = entry.pending
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(resolve, DISCOVERY_WAIT_MS)
      }),
    ])
    clearTimeout(timer)
  }
  return entry.tokens
}

const snapshots = new Map<
  string,
  { until: number; answer: Promise<EvmSnapshot>; pending: boolean }
>()
const pricesCache = new Map<
  string,
  { until: number; answer: Promise<Map<string, number>>; pending: boolean }
>()

async function read(network: NetworkId, address: string): Promise<EvmSnapshot> {
  if (network !== "mainnet") throw new Error("PROTOCOL_NETWORK:robinhood")
  if (!isAddress(address, { strict: false }))
    throw new Error("ROBINHOOD_WALLET_ADDRESS")
  const wallet = address.toLowerCase() as Hex
  return held(snapshots, wallet, 2_000, async () => {
    const [known, found] = await Promise.all([
      robinhoodAccountMarkets(),
      heldTokens(wallet),
    ])
    const listed = new Set([ROBINHOOD_USDG, ROBINHOOD_WETH, ...known.ids])
    const tokens = [...new Set([...listed, ...found])].sort() as Hex[]
    const optional = new Set(found.filter((id) => !listed.has(id)))
    const raw = await balances.read(robinhoodRpcUrl(), wallet, tokens)
    const holdings = balances.holdings(tokens, raw, optional)
    const unlisted = [...holdings.coins.keys()]
      .filter((id) => !known.prices.has(id))
      .sort()
    const prices = new Map(known.prices)
    for (let start = 0; start < unlisted.length; start += PRICE_PAGE_SIZE) {
      const page = unlisted.slice(start, start + PRICE_PAGE_SIZE)
      const fresh = await held(pricesCache, page.join(","), 10_000, () =>
        fetchRobinhoodPrices(network, page)
      )
      for (const [id, price] of fresh) prices.set(id, price)
    }
    return balances.snapshot(holdings, prices)
  })
}

export async function fetchRobinhoodAccount(
  network: NetworkId,
  address: string
): Promise<WalletAccountFigures> {
  return (await read(network, address)).figures
}

export async function fetchRobinhoodPortfolio(
  network: NetworkId,
  address: string
): Promise<WalletPortfolio> {
  return (await read(network, address)).portfolio
}

/** Forget every read, so the next one asks the chain and the explorer again. */
export function clearRobinhoodAccountState(): void {
  snapshots.clear()
  pricesCache.clear()
  discovered.clear()
}
