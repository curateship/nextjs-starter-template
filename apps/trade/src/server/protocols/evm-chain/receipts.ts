import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import type { EvmRefusals } from "./refusals"

/** Net wallet transfers include refunds and token taxes. Pool-to-pool hops do not count. */
export function evmTransfers(
  receipt: Pick<TransactionReceipt, "logs">,
  wallet: string
): Map<string, bigint> {
  const address = wallet.toLowerCase()
  const moved = new Map<string, bigint>()
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== "Transfer") continue
      const { from, to, value } = decoded.args
      const change =
        (to.toLowerCase() === address ? value : 0n) -
        (from.toLowerCase() === address ? value : 0n)
      if (change)
        moved.set(
          log.address.toLowerCase(),
          (moved.get(log.address.toLowerCase()) ?? 0n) + change
        )
    } catch {
      /* Approval and router events are not token transfers. */
    }
  }
  for (const [token, change] of moved) if (change === 0n) moved.delete(token)
  return moved
}

/**
 * The note for a confirmed swap whose coin movements do not read as one buy
 * or sell, such as a bundle of several coins. It is closed as confirmed with
 * no fill, because a pending one blocks every later swap from the wallet.
 */
export function unreadableSwapNote(hash: string): string {
  return `Swap confirmed as ${hash}, but its coin movements do not read as one buy or sell, so the Journal has no fill for it.`
}

/** What one chain's receipts are read against. */
type ReceiptChain = {
  /** The dollar coin every swap buys with or sells into, lowercase. */
  dollarCoin: string
  dollarDecimals: number
  /** The coin that pays network fees, 18 decimals. */
  feeCoin: string
  refusals: EvmRefusals
}

/** One chain's swap receipts, read from the wallet's net coin movements. */
export function evmReceipts(chain: ReceiptChain) {
  function fill(
    receipt: TransactionReceipt,
    wallet: Address,
    at: number,
    decimals: ReadonlyMap<string, number>,
    feeCoinPrice: number,
    expectedToken?: string
  ): WalletOrderFill | null {
    if (receipt.status !== "success") return null
    const moved = evmTransfers(receipt, wallet)
    const dollars = moved.get(chain.dollarCoin)
    if (!dollars) return null
    moved.delete(chain.dollarCoin)
    // A liquidity operation or a multi-coin bundle is not one unambiguous swap.
    if (moved.size !== 1) return null
    const [marketId, change] = [...moved][0]
    if (expectedToken && marketId !== expectedToken.toLowerCase()) return null
    if (dollars < 0n === change < 0n) return null
    const places = decimals.get(marketId)
    if (places === undefined) return null
    const sz = Number(formatUnits(change < 0n ? -change : change, places))
    const usd = Number(
      formatUnits(dollars < 0n ? -dollars : dollars, chain.dollarDecimals)
    )
    if (!(sz > 0 && usd > 0) || !Number.isFinite(usd / sz)) return null
    const feeCoins =
      receipt.from.toLowerCase() === wallet.toLowerCase()
        ? Number(formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18))
        : 0
    return {
      fillId: receipt.transactionHash,
      orderId: receipt.transactionHash,
      marketId,
      side: dollars < 0n ? "buy" : "sell",
      px: usd / sz,
      sz,
      at,
      closedPnl: 0,
      fee: feeCoins * feeCoinPrice,
      dir: dollars < 0n ? "Open Long" : "Close Long",
      liquidation: false,
      executionNote: `Network fee ${feeCoins.toLocaleString("en-US", { maximumFractionDigits: 12 })} ${chain.feeCoin}. Transaction ${receipt.transactionHash}.`,
    }
  }

  function failure(
    hash: Hash,
    kind: "approval" | "swap",
    receipt: TransactionReceipt,
    detail: {
      reason?: unknown
      unsellable?: boolean
      approvalFeeWei?: bigint
      /** The symbol of the coin whose own contract refused, when one did. */
      coin?: string
    } = {}
  ): string {
    const reason = chain.refusals.classify(detail.reason)
    const sentence = chain.refusals.sentence(
      kind === "swap" && detail.unsellable
        ? "unsellable"
        : reason === "slippage" ||
            reason === "coin-blocked" ||
            reason === "coin-paused"
          ? reason
          : "unknown",
      {
        hash,
        feeWei: receipt.gasUsed * receipt.effectiveGasPrice,
        approvalFeeWei: detail.approvalFeeWei,
        coin: detail.coin,
      }
    )
    return reason === "slippage" && !detail.unsellable
      ? sentence.replace(
          "The price moved",
          "A replay of the failed swap suggests the price moved"
        )
      : sentence
  }

  return { fill, failure }
}
