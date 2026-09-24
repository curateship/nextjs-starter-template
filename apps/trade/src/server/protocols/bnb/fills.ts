import { parseAbiItem, type Address, type Hash } from "viem"
import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import { BNB_USDT, BNB_WRAPPED_NATIVE } from "./client"
import { bnbLogsClient, bnbTokenDecimals } from "./rpc"
import { evmTransfers } from "@/server/protocols/evm-chain/receipts"
import { bnbReceiptFailure, bnbReceiptFill } from "./receipts"
import { bnbAccountMarkets } from "./markets"
import {
  finishBnbSend,
  pendingBnbSends,
  recordBnbFill,
  rememberBnbSend,
  noteBnbTransaction,
  type BnbOwner,
} from "@/server/protocols/bnb-ledger"
import { clearBnbAccountState } from "./account"
import { bnbHistoryRefusalError, bnbRefusalError } from "./refusals"
import { logsBeyondNode } from "@/server/protocols/evm-chain/refusals"
import { evmUnits } from "@/server/protocols/evm-chain/kyber"

// Measured on 20 Sep 2026: PublicNode serves 1,000 wallet-filtered blocks per
// request and answers about 9,000 blocks back from the head, roughly two
// hours, before calling the rest archive. Page by 1,000 blocks and bound the
// initial recovery window to 10,000; the pages past what the node keeps are
// skipped below rather than failing the read.
export const BNB_LOG_PAGE = 1_000n
export const BNB_RECENT_BLOCKS = 10_000n
const transfer = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
)
const scanned = new Map<string, bigint>()
export async function fetchBnbOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  _credential: () => string | null,
  _priority?: "background" | "order",
  owner?: BnbOwner
): Promise<WalletOrderFill[]> {
  if (network !== "mainnet") throw new Error("BNB_NETWORK_UNSUPPORTED")
  if (!/^0x[\da-f]{40}$/i.test(address)) throw new Error("LIVE_WALLET_ADDRESS")
  if (!owner) throw new Error("LIVE_WALLET_NOT_FOUND")
  try {
    return await readBnbOrderFills(address, since, owner)
  } catch (error) {
    // History reads may concern a successful swap. Never reuse a pre-signing
    // decimals refusal that claims no coins moved, and never report a node
    // that would not answer as a transaction nobody confirmed.
    throw bnbHistoryRefusalError(error)
  }
}
async function readBnbOrderFills(
  address: string,
  since: number,
  owner: BnbOwner
): Promise<WalletOrderFill[]> {
  const wallet = address.toLowerCase() as Address
  const client = bnbLogsClient()
  const head = await client.getBlockNumber()
  if (head < 2n) return []
  const toBlock = head - 2n
  const floor =
    toBlock > BNB_RECENT_BLOCKS ? toBlock - BNB_RECENT_BLOCKS + 1n : 0n
  const scanKey = `${owner.userId}:${owner.walletId}:${wallet}`
  const previous = scanned.get(scanKey)
  const start =
    previous === undefined
      ? floor
      : previous > floor + 2n
        ? previous - 2n
        : floor
  const pending = await pendingBnbSends(owner)
  const hashes = new Set<Hash>(pending.map((row) => row.hash as Hash))
  // **A page the node will not serve is skipped, not thrown.** A free node
  // keeps only the most recent blocks, so the oldest page of a first scan is
  // refused while every newer page is there. The newer ones are the point,
  // since the sweep runs every couple of minutes, and losing them all to
  // the oldest page is how a wallet's swaps never reach the Journal at all.
  let asked = 0
  let served = 0
  for (let fromBlock = start; fromBlock <= toBlock; fromBlock += BNB_LOG_PAGE) {
    const end =
      fromBlock + BNB_LOG_PAGE - 1n < toBlock
        ? fromBlock + BNB_LOG_PAGE - 1n
        : toBlock
    asked += 1
    let pages
    try {
      pages = await Promise.all([
        client.getLogs({
          address: BNB_USDT,
          event: transfer,
          args: { from: wallet },
          fromBlock,
          toBlock: end,
        }),
        client.getLogs({
          address: BNB_USDT,
          event: transfer,
          args: { to: wallet },
          fromBlock,
          toBlock: end,
        }),
      ])
    } catch (error) {
      if (!logsBeyondNode(error)) throw error
      continue
    }
    served += 1
    for (const logs of pages)
      for (const log of logs)
        if (log.transactionHash) hashes.add(log.transactionHash)
  }
  // Every page refused is a node that does not serve history at all, which is
  // worth saying out loud rather than answering "no new swaps" forever.
  if (asked > 0 && served === 0) throw bnbRefusalError("history")
  const price = (await bnbAccountMarkets()).prices.get(BNB_WRAPPED_NATIVE)
  if (!(price && price > 0)) throw bnbRefusalError("pending")
  const fills: WalletOrderFill[] = []
  for (const hash of hashes) {
    const known = pending.find((row) => row.hash === hash)
    let receipt
    try {
      receipt = await client.getTransactionReceipt({ hash })
    } catch (error) {
      // A signed hash can precede mining. Provider failures must leave the cursor unchanged.
      if (
        known &&
        error instanceof Error &&
        error.name === "TransactionReceiptNotFoundError"
      )
        continue
      throw error
    }
    if (receipt.blockNumber > toBlock) continue
    if (known && receipt.status === "reverted") {
      const note = bnbReceiptFailure(hash, known.kind, receipt, {
        approvalFeeWei: (known.approvals ?? []).reduce(
          (total, approval) => total + evmUnits(approval.feeBnb, 18),
          0n
        ),
      })
      await noteBnbTransaction(owner, known.marketId, note, "refused")
      await finishBnbSend(owner, hash, "failed", note)
      continue
    }
    if (known?.kind === "approval") {
      await finishBnbSend(
        owner,
        hash,
        "confirmed",
        `Approval confirmed: ${hash}.`
      )
      continue
    }
    const block = await client.getBlock({ blockNumber: receipt.blockNumber })
    const at = Number(block.timestamp) * 1000
    if (!known && at < since) continue
    const tokens = [...evmTransfers(receipt, wallet).keys()].filter(
      (token) => token !== BNB_USDT
    )
    if (tokens.length !== 1) continue
    const token = tokens[0] as Address
    const decimals = await bnbTokenDecimals(token)
    const fill = bnbReceiptFill(
      receipt,
      wallet,
      at,
      new Map([[token, decimals]]),
      price,
      known?.marketId
    )
    if (!fill) continue
    for (const approval of known?.approvals ?? []) {
      fill.fee += approval.feeBnb * price
      fill.executionNote += ` Unlimited approval confirmed, transaction ${approval.hash}, fee ${approval.feeBnb} BNB.`
    }
    await rememberBnbSend(owner, {
      hash,
      address: wallet,
      marketId: token,
      kind: "swap",
    })
    await recordBnbFill(owner, fill)

    fills.push(fill)
  }
  scanned.set(scanKey, toBlock)
  if (scanned.size > 500) scanned.delete(scanned.keys().next().value!)
  if (fills.length) clearBnbAccountState()
  return fills
}
