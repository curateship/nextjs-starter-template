import { and, eq } from "drizzle-orm"
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  type Hex,
} from "viem"
import type {
  NetworkId,
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { db } from "@/server/trade/db"
import { tradeLiveFills } from "@/server/trade/schema"
import { bnbRpcUrl, BNB_USDT, BNB_WRAPPED_NATIVE } from "./client"
import {
  bnbAccountMarkets,
  fetchBnbPrices,
  BNB_PRICE_PAGE_SIZE,
} from "./markets"

export const BNB_USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
export const BNB_MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11"
import { BNB_FEE_RESERVE } from "./refusals"
export { BNB_FEE_RESERVE } from "./refusals"
export const bnbMulticallAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
])
type Owner = { userId: string; walletId: string }
export type BnbHoldings = {
  bnb: number
  usdt: number
  coins: Map<string, number>
}
type Snapshot = { figures: WalletAccountFigures; portfolio: WalletPortfolio }

// Retain rejected reads for the same interval too: rapid polls must not retry
// a failing node. Pending requests remain shared even when a node is slow.
function held<T>(
  cache: Map<string, { until: number; answer: Promise<T>; pending: boolean }>,
  key: string,
  ms: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  for (const [id, entry] of cache)
    if (!entry.pending && entry.until <= now) cache.delete(id)
  const existing = cache.get(key)
  if (existing) return existing.answer
  const entry = { until: now + ms, answer: load(), pending: true }
  cache.set(key, entry)
  void entry.answer.then(
    () => {
      entry.pending = false
    },
    () => {
      entry.pending = false
    }
  )
  return entry.answer
}
const snapshots = new Map<
  string,
  { until: number; answer: Promise<Snapshot>; pending: boolean }
>()
const pricesCache = new Map<
  string,
  { until: number; answer: Promise<Map<string, number>>; pending: boolean }
>()

function bnbBalanceCalls(address: Hex, tokens: readonly Hex[]) {
  return [
    {
      target: BNB_MULTICALL,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: bnbMulticallAbi,
        functionName: "getEthBalance",
        args: [address],
      }),
    },
    ...tokens.flatMap((target) => [
      {
        target,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      },
      {
        target,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: erc20Abi,
          functionName: "decimals",
        }),
      },
    ]),
  ] as const
}

/** Decode the whole answer before reporting any money. No guessed decimals. */
export function bnbHoldings(tokens: readonly string[], raw: Hex): BnbHoldings {
  try {
    const answer = decodeFunctionResult({
      abi: bnbMulticallAbi,
      functionName: "aggregate3",
      data: raw,
    })
    if (answer.length !== 1 + tokens.length * 2 || !answer[0].success)
      throw new Error()
    const bnb = Number(
      formatUnits(
        decodeFunctionResult({
          abi: bnbMulticallAbi,
          functionName: "getEthBalance",
          data: answer[0].returnData,
        }),
        18
      )
    )
    const coins = new Map<string, number>()
    if (bnb > 0) coins.set(BNB_WRAPPED_NATIVE, bnb)
    let usdt = 0
    tokens.forEach((token, index) => {
      const balance = answer[1 + index * 2]
      const decimals = answer[2 + index * 2]
      if (!balance.success) throw new Error()
      const integer = decodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        data: balance.returnData,
      })
      if (integer === 0n) return
      if (!decimals.success) throw new Error()
      const places = decodeFunctionResult({
        abi: erc20Abi,
        functionName: "decimals",
        data: decimals.returnData,
      })
      const amount = Number(formatUnits(integer, places))
      if (!Number.isFinite(amount) || amount <= 0) throw new Error()
      if (token === BNB_USDT) usdt = amount
      else coins.set(token, (coins.get(token) ?? 0) + amount)
    })
    return { bnb, usdt, coins }
  } catch {
    throw new Error("BNB_ACCOUNT_UNREADABLE")
  }
}

export function toBnbSnapshot(
  holdings: BnbHoldings,
  prices: ReadonlyMap<string, number>
): Snapshot {
  let inTrades = 0
  const positions: WalletPosition[] = []
  for (const [marketId, amount] of holdings.coins) {
    const candidate = prices.get(marketId)
    const price =
      candidate !== undefined && Number.isFinite(candidate) && candidate > 0
        ? candidate
        : null
    const value = price === null ? 0 : amount * price
    inTrades += value
    if (price !== null && value < 0.01) continue
    positions.push({
      marketId,
      szi: amount,
      entryPx: price ?? 0,
      leverage: 1,
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
  return {
    figures: {
      equity: holdings.usdt + inTrades,
      free: holdings.usdt,
      inTrades,
      openProfit: 0,
      feeCoin: {
        symbol: "BNB",
        amount: holdings.bnb,
        warning:
          holdings.bnb < BNB_FEE_RESERVE
            ? "Send this wallet a little BNB for network fees. Keep at least 0.005 BNB for about twenty transactions. Wrapped BNB cannot pay these fees."
            : null,
      },
    },
    portfolio: { positions, orders: [] },
  }
}

async function read(
  network: NetworkId,
  address: string,
  owner?: Owner
): Promise<Snapshot> {
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
      let raw: Hex
      try {
        // A single explicitly encoded eth_call, never viem's automatic batch splitter.
        const client = createPublicClient({
          transport: http(bnbRpcUrl(), { retryCount: 0, timeout: 10_000 }),
        })
        raw = await client.request({
          method: "eth_call",
          params: [
            {
              to: BNB_MULTICALL,
              data: encodeFunctionData({
                abi: bnbMulticallAbi,
                functionName: "aggregate3",
                args: [bnbBalanceCalls(wallet, tokens)],
              }),
            },
            "latest",
          ],
        })
      } catch {
        throw new Error(
          "EXCHANGE_BUSY:BNB Chain — the node could not read this wallet. Try again shortly."
        )
      }
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
