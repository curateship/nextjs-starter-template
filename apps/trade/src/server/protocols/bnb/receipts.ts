import {
  decodeEventLog,
  erc20Abi,
  formatUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem"
import type { WalletOrderFill } from "@/lib/protocols/contracts"
import { BNB_USDT } from "./client"
import { bnbNodeRefusalCode, bnbRefusalSentence } from "./refusals"

/** Net wallet transfers include refunds and token taxes. Pool-to-pool hops do not count. */
export function bnbTransfers(
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
export function bnbReceiptFill(
  receipt: TransactionReceipt,
  wallet: Address,
  at: number,
  decimals: ReadonlyMap<string, number>,
  bnbPrice: number,
  expectedToken?: string
): WalletOrderFill | null {
  if (receipt.status !== "success") return null
  const moved = bnbTransfers(receipt, wallet)
  const usdt = moved.get(BNB_USDT)
  if (!usdt) return null
  moved.delete(BNB_USDT)
  // A liquidity operation or a multi-coin bundle is not one unambiguous swap.
  if (moved.size !== 1) return null
  const [marketId, change] = [...moved][0]
  if (expectedToken && marketId !== expectedToken.toLowerCase()) return null
  if (usdt < 0n === change < 0n) return null
  const places = decimals.get(marketId)
  if (places === undefined) return null
  const sz = Number(formatUnits(change < 0n ? -change : change, places))
  const usd = Number(formatUnits(usdt < 0n ? -usdt : usdt, 18))
  if (!(sz > 0 && usd > 0) || !Number.isFinite(usd / sz)) return null
  const feeBnb =
    receipt.from.toLowerCase() === wallet.toLowerCase()
      ? Number(formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18))
      : 0
  return {
    fillId: receipt.transactionHash,
    orderId: receipt.transactionHash,
    marketId,
    side: usdt < 0n ? "buy" : "sell",
    px: usd / sz,
    sz,
    at,
    closedPnl: 0,
    fee: feeBnb * bnbPrice,
    dir: usdt < 0n ? "Open Long" : "Close Long",
    liquidation: false,
    executionNote: `Network fee ${feeBnb.toLocaleString("en-US", { maximumFractionDigits: 12 })} BNB. Transaction ${receipt.transactionHash}.`,
  }
}
export function bnbReceiptFailure(
  hash: Hash,
  kind: "approval" | "swap",
  receipt: TransactionReceipt,
  detail: {
    reason?: unknown
    unsellable?: boolean
    approvalFeeWei?: bigint
  } = {}
): string {
  const reason = bnbNodeRefusalCode(detail.reason)
  const sentence = bnbRefusalSentence(
    kind === "swap" && detail.unsellable
      ? "unsellable"
      : reason === "slippage"
        ? "slippage"
        : "unknown",
    {
      hash,
      feeWei: receipt.gasUsed * receipt.effectiveGasPrice,
      approvalFeeWei: detail.approvalFeeWei,
    }
  )
  return reason === "slippage" && !detail.unsellable
    ? sentence.replace(
        "The price moved",
        "A replay of the failed swap suggests the price moved"
      )
    : sentence
}
