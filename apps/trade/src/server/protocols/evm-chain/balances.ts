import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseAbi,
  type Hex,
} from "viem"
import type {
  WalletAccountFigures,
  WalletPortfolio,
  WalletPosition,
} from "@/lib/protocols/contracts"

/** Multicall3 sits at this one address on every chain that has deployed it. */
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"
export const multicallAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
])

/** A wallet's coins in whole units: the fee coin, the dollar coin, the rest. */
type EvmHoldings = {
  fee: number
  dollars: number
  coins: Map<string, number>
}
export type EvmSnapshot = {
  figures: WalletAccountFigures
  portfolio: WalletPortfolio
}

/** What one chain's balance read is checked and worded against. */
type BalanceChain = {
  /** The chain's printed name, for the busy message. */
  chain: string
  /** The error code for an answer that does not decode in full. */
  unreadable: string
  /** Lowercase contract addresses. */
  dollarCoin: string
  wrappedNative: string
  feeCoin: string
  feeReserve: number
  /** Shown on the wallet card below the reserve. */
  feeWarning: string
}

// Retain rejected reads for the same interval too: rapid polls must not retry
// a failing node. Pending requests remain shared even when a node is slow.
export function held<T>(
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

function balanceCalls(address: Hex, tokens: readonly Hex[]) {
  return [
    {
      target: MULTICALL3,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: multicallAbi,
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

/** One chain's wallet balances, read in a single call and valued in dollars. */
export function evmBalances(chain: BalanceChain) {
  /** Decode the whole answer before reporting any money. No guessed decimals. */
  function holdings(tokens: readonly string[], raw: Hex): EvmHoldings {
    try {
      const answer = decodeFunctionResult({
        abi: multicallAbi,
        functionName: "aggregate3",
        data: raw,
      })
      if (answer.length !== 1 + tokens.length * 2 || !answer[0].success)
        throw new Error()
      const fee = Number(
        formatUnits(
          decodeFunctionResult({
            abi: multicallAbi,
            functionName: "getEthBalance",
            data: answer[0].returnData,
          }),
          18
        )
      )
      const coins = new Map<string, number>()
      if (fee > 0) coins.set(chain.wrappedNative, fee)
      let dollars = 0
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
        if (token === chain.dollarCoin) dollars = amount
        else coins.set(token, (coins.get(token) ?? 0) + amount)
      })
      return { fee, dollars, coins }
    } catch {
      throw new Error(chain.unreadable)
    }
  }

  function snapshot(
    wallet: EvmHoldings,
    prices: ReadonlyMap<string, number>
  ): EvmSnapshot {
    let inTrades = 0
    const positions: WalletPosition[] = []
    for (const [marketId, amount] of wallet.coins) {
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
        equity: wallet.dollars + inTrades,
        free: wallet.dollars,
        inTrades,
        openProfit: 0,
        feeCoin: {
          symbol: chain.feeCoin,
          amount: wallet.fee,
          warning: wallet.fee < chain.feeReserve ? chain.feeWarning : null,
        },
      },
      portfolio: { positions, orders: [] },
    }
  }

  /** The raw Multicall3 answer for these tokens, from one `eth_call`. */
  async function read(
    rpcUrl: string,
    wallet: Hex,
    tokens: readonly Hex[]
  ): Promise<Hex> {
    try {
      // A single explicitly encoded eth_call, never viem's automatic batch splitter.
      const client = createPublicClient({
        transport: http(rpcUrl, { retryCount: 0, timeout: 10_000 }),
      })
      return await client.request({
        method: "eth_call",
        params: [
          {
            to: MULTICALL3,
            data: encodeFunctionData({
              abi: multicallAbi,
              functionName: "aggregate3",
              args: [balanceCalls(wallet, tokens)],
            }),
          },
          "latest",
        ],
      })
    } catch {
      throw new Error(
        `EXCHANGE_BUSY:${chain.chain} — the node could not read this wallet. Try again shortly.`
      )
    }
  }

  return { holdings, snapshot, read }
}
