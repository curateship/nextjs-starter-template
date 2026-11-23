import { z } from "zod"
import { BaseError, type Address, type Hash } from "viem"
import type { NetworkId, WalletOrderFill } from "@/lib/protocols/contracts"
import {
  evmTransfers,
  unreadableSwapNote,
} from "@/server/protocols/evm-chain/receipts"
import { evmRefused } from "@/server/protocols/evm-chain/refusals"
import { evmUnits } from "@/server/protocols/evm-chain/kyber"
import {
  finishRobinhoodSend,
  noteRobinhoodTransaction,
  pendingRobinhoodSends,
  recordRobinhoodFill,
  rememberRobinhoodSend,
  type RobinhoodOwner,
} from "@/server/protocols/robinhood-ledger"
import { clearRobinhoodAccountState } from "./account"
import { ROBINHOOD_USDG, robinhoodServiceGet } from "./client"
import { robinhoodEthPrice } from "./markets"
import { robinhoodReceipts } from "./receipts"
import { robinhoodRefusals } from "./refusals"
import { robinhoodReadClient, robinhoodTokenDecimals } from "./rpc"

/** 50 transfers a page; five pages is the most one sweep reads back. */
const MOST_TRANSFER_PAGES = 5
/**
 * How far back a sweep looks for swaps made elsewhere. A new wallet's first
 * sweep starts from nothing, and every transfer it finds costs two node reads.
 */
const LOOK_BACK_MS = 7 * 86_400_000
/**
 * Transactions already settled, per wallet, so a later sweep never reads
 * their receipts again. Bounded; forgetting one only costs a re-read.
 */
const settled = new Map<string, Set<string>>()
const BOTH_SILENT =
  "Neither Robinhood Chain's explorer nor its node answered a trade history request. The Journal catches up on the next read."

const transfersSchema = z.object({
  items: z.array(
    z.object({
      transaction_hash: z.string().regex(/^0x[\da-f]{64}$/i),
      timestamp: z.string(),
    })
  ),
  next_page_params: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .nullable(),
})

/**
 * Every swap this wallet made since `since`, anywhere, found through the
 * explorer's list of the wallet's USDG transfers, newest first. A swap on
 * this chain always moves USDG, because every pool is paired with it.
 */
async function robinhoodSwapHashes(
  wallet: string,
  since: number
): Promise<Hash[]> {
  const hashes = new Set<Hash>()
  let params: Record<string, string> = { type: "ERC-20", token: ROBINHOOD_USDG }
  for (let page = 0; page < MOST_TRANSFER_PAGES; page++) {
    const answer = transfersSchema.parse(
      await robinhoodServiceGet(
        "explorer",
        `/api/v2/addresses/${wallet}/token-transfers`,
        params
      )
    )
    let older = false
    for (const item of answer.items) {
      if (Date.parse(item.timestamp) < since) older = true
      else hashes.add(item.transaction_hash.toLowerCase() as Hash)
    }
    if (older || !answer.next_page_params) break
    params = {
      type: "ERC-20",
      token: ROBINHOOD_USDG,
      ...Object.fromEntries(
        Object.entries(answer.next_page_params).map(([key, value]) => [
          key,
          value === null ? "null" : String(value),
        ])
      ),
    }
  }
  return [...hashes]
}

/**
 * The wallet's fills: the swaps this app sent, read from their own receipts,
 * and swaps made anywhere else, found through the explorer.
 *
 * The app's own sends never depend on the explorer. When it refuses, they
 * are still settled from the node, and swaps made elsewhere reach the
 * Journal on a later pass.
 */
export async function fetchRobinhoodOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  _credential: () => string | null,
  _priority?: "background" | "order",
  owner?: RobinhoodOwner
): Promise<WalletOrderFill[]> {
  if (network !== "mainnet") throw new Error("ROBINHOOD_NETWORK_UNSUPPORTED")
  if (!/^0x[\da-f]{40}$/i.test(address)) throw new Error("LIVE_WALLET_ADDRESS")
  if (!owner) throw new Error("LIVE_WALLET_NOT_FOUND")
  try {
    return await readFills(address.toLowerCase() as Address, since, owner)
  } catch (error) {
    throw robinhoodRefusals.historyError(error)
  }
}

async function readFills(
  wallet: Address,
  since: number,
  owner: RobinhoodOwner
): Promise<WalletOrderFill[]> {
  const client = robinhoodReadClient()
  const pending = await pendingRobinhoodSends(owner)
  const hashes = new Set<Hash>(pending.map((row) => row.hash as Hash))
  const from = Math.max(since, Date.now() - LOOK_BACK_MS)
  const done = settled.get(wallet) ?? new Set<string>()
  settled.set(wallet, done)
  if (settled.size > 500) settled.delete(settled.keys().next().value!)
  let explorerAnswered = true
  try {
    for (const hash of await robinhoodSwapHashes(wallet, from))
      if (!done.has(hash)) hashes.add(hash)
  } catch {
    // The explorer would not answer. This app's own sends are still settled
    // below from the node; swaps made elsewhere are found on the next pass.
    explorerAnswered = false
  }
  if (!hashes.size) return []
  try {
    return await settle(client, wallet, [...hashes], pending, from, done, owner)
  } catch (error) {
    // Said only when the node, the explorer's fallback, fails too. A viem
    // error is the node's; a database error is not, and keeps its own words.
    if (!explorerAnswered && error instanceof BaseError)
      throw evmRefused(BOTH_SILENT, true)
    throw error
  }
}

async function settle(
  client: ReturnType<typeof robinhoodReadClient>,
  wallet: Address,
  hashes: Hash[],
  pending: Awaited<ReturnType<typeof pendingRobinhoodSends>>,
  from: number,
  done: Set<string>,
  owner: RobinhoodOwner
): Promise<WalletOrderFill[]> {
  const price = await robinhoodEthPrice()
  const fills: WalletOrderFill[] = []
  for (const hash of hashes) {
    const known = pending.find((row) => row.hash === hash)
    let receipt
    try {
      receipt = await client.getTransactionReceipt({ hash })
    } catch (error) {
      // A signed hash can precede mining. Anything else is a real failure.
      if (
        known &&
        error instanceof Error &&
        error.name === "TransactionReceiptNotFoundError"
      )
        continue
      throw error
    }
    if (known && receipt.status === "reverted") {
      const note = robinhoodReceipts.failure(hash, known.kind, receipt, {
        approvalFeeWei: known.approvals.reduce(
          (total, approval) => total + evmUnits(approval.feeEth, 18),
          0n
        ),
      })
      await noteRobinhoodTransaction(owner, known.marketId, note, "refused")
      await finishRobinhoodSend(owner, hash, "failed", note)
      continue
    }
    if (known?.kind === "approval") {
      await finishRobinhoodSend(
        owner,
        hash,
        "confirmed",
        `Approval confirmed: ${hash}.`
      )
      continue
    }
    const block = await client.getBlock({ blockNumber: receipt.blockNumber })
    const at = Number(block.timestamp) * 1000
    if (!known && at < from) continue
    // From here the answer for this transaction will not change.
    if (done.size >= 2000) done.delete(done.values().next().value!)
    done.add(hash)
    const tokens = [...evmTransfers(receipt, wallet).keys()].filter(
      (token) => token !== ROBINHOOD_USDG
    )
    // The app's own swap that confirmed but reads as no one trade is closed,
    // so it stops blocking every later swap from the wallet.
    const unreadable = async () => {
      if (known)
        await finishRobinhoodSend(
          owner,
          hash,
          "confirmed",
          unreadableSwapNote(hash)
        )
    }
    if (tokens.length !== 1) {
      await unreadable()
      continue
    }
    const token = tokens[0] as Address
    const decimals = await robinhoodTokenDecimals(token)
    const fill = robinhoodReceipts.fill(
      receipt,
      wallet,
      at,
      new Map([[token, decimals]]),
      price,
      known?.marketId
    )
    if (!fill) {
      await unreadable()
      continue
    }
    for (const approval of known?.approvals ?? []) {
      fill.fee += approval.feeEth * price
      fill.executionNote += ` Approval confirmed, transaction ${approval.hash}, fee ${approval.feeEth} ETH.`
    }
    await rememberRobinhoodSend(owner, {
      hash,
      address: wallet,
      marketId: token,
      kind: "swap",
    })
    await recordRobinhoodFill(owner, fill)
    fills.push(fill)
  }
  if (fills.length) clearRobinhoodAccountState()
  return fills
}
