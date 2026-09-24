import { and, eq } from "drizzle-orm"
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
import { db } from "@/server/trade/db"
import { tradeLiveFills } from "@/server/trade/schema"
import { bnbRpcUrl, BNB_USDT, BNB_WRAPPED_NATIVE } from "./client"
import {
  bnbAccountMarkets,
  fetchBnbPrices,
  BNB_PRICE_PAGE_SIZE,
} from "./markets"
import { BNB_FEE_RESERVE } from "./refusals"

export { BNB_FEE_RESERVE } from "./refusals"
export const BNB_USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
type Owner = { userId: string; walletId: string }
type BnbHoldings = {
  bnb: number
  usdt: number
  coins: Map<string, number>
}

const balances = evmBalances({
  chain: "BNB Chain",
  unreadable: "BNB_ACCOUNT_UNREADABLE",
  dollarCoin: BNB_USDT,
  wrappedNative: BNB_WRAPPED_NATIVE,
  feeCoin: "BNB",
  feeReserve: BNB_FEE_RESERVE,
  feeWarning:
    "Send this wallet a little BNB for network fees. Keep at least 0.005 BNB for about twenty transactions. Wrapped BNB cannot pay these fees.",
})

const snapshots = new Map<
  string,
  { until: number; answer: Promise<EvmSnapshot>; pending: boolean }
>()
const pricesCache = new Map<
  string,
  { until: number; answer: Promise<Map<string, number>>; pending: boolean }
>()

/** Decode the whole answer before reporting any money. No guessed decimals. */
export function bnbHoldings(tokens: readonly string[], raw: Hex): BnbHoldings {
  const { fee, dollars, coins } = balances.holdings(tokens, raw)
  return { bnb: fee, usdt: dollars, coins }
}

export function toBnbSnapshot(
  holdings: BnbHoldings,
  prices: ReadonlyMap<string, number>
): EvmSnapshot {
  return balances.snapshot(
    { fee: holdings.bnb, dollars: holdings.usdt, coins: holdings.coins },
    prices
  )
}

async function read(
  network: NetworkId,
  address: string,
  owner?: Owner
): Promise<EvmSnapshot> {
  if (network !== "mainnet") throw new Error("PROTOCOL_NETWORK:bnb")
  if (!isAddress(address, { strict: false }))
    throw new Error("BNB_WALLET_ADDRESS")
  const wallet = address.toLowerCase() as Hex
  return held(
    snapshots,
    JSON.stringify([wallet, owner?.userId, owner?.walletId]),
    2_000,
    async () => {
      const known = await bnbAccountMarkets()
      const bought = owner
        ? await db
            .selectDistinct({ marketKey: tradeLiveFills.marketKey })
            .from(tradeLiveFills)
            .where(
              and(
                eq(tradeLiveFills.userId, owner.userId),
                eq(tradeLiveFills.walletId, owner.walletId),
                eq(tradeLiveFills.side, "buy")
              )
            )
        : []
      const previous = bought.flatMap(({ marketKey }) =>
        /^bnb:mainnet:0x[\da-f]{40}$/i.test(marketKey)
          ? [marketKey.split(":")[2].toLowerCase()]
          : []
      )
      const tokens = [
        ...new Set([
          BNB_USDT,
          BNB_USDC,
          BNB_WRAPPED_NATIVE,
          ...known.ids,
          ...previous,
        ]),
      ].sort() as Hex[]
      const raw = await balances.read(bnbRpcUrl(), wallet, tokens)
      const holdings = bnbHoldings(tokens, raw)
      const unlisted = [...holdings.coins.keys()]
        .filter((id) => !known.prices.has(id))
        .sort()
      const prices = new Map(known.prices)
      for (
        let start = 0;
        start < unlisted.length;
        start += BNB_PRICE_PAGE_SIZE
      ) {
        const page = unlisted.slice(start, start + BNB_PRICE_PAGE_SIZE)
        const fresh = await held(pricesCache, page.join(","), 10_000, () =>
          fetchBnbPrices(network, page)
        )
        for (const [id, price] of fresh) prices.set(id, price)
      }
      return toBnbSnapshot(holdings, prices)
    }
  )
}

export async function fetchBnbAccount(
  network: NetworkId,
  address: string,
  _credential?: () => string | null,
  owner?: Owner
): Promise<WalletAccountFigures> {
  return (await read(network, address, owner)).figures
}
export async function fetchBnbPortfolio(
  network: NetworkId,
  address: string,
  _credential?: () => string | null,
  _priority?: "background" | "order",
  owner?: Owner
): Promise<WalletPortfolio> {
  return (await read(network, address, owner)).portfolio
}
export function clearBnbAccountState(): void {
  snapshots.clear()
  pricesCache.clear()
}
