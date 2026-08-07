import { randomUUID } from "node:crypto"

import { and, asc, eq } from "drizzle-orm"

import type { NetworkId, ProtocolId } from "@/lib/protocols/contracts"
import {
  MAX_WALLETS,
  paperFigures,
  summarizeWallet,
  type TradeWallet,
  type WalletAccountSummary,
  type WalletKind,
} from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { encryptSecret } from "@/server/encryption"
import { getProtocol } from "@/server/protocols/registry"
import { tradeWallets } from "@/server/trade/schema"

/**
 * The wallet store. Two rules run through every function here:
 *
 * - Every read and write is scoped by (userId, id) — the table's key — so a
 *   request carrying somebody else's wallet id can only ever miss.
 * - The trading key exists in three forms: the plaintext that arrives once at
 *   create/replace time, the ciphertext in the row, and `hasKey: true` in
 *   every answer. The plaintext is encrypted immediately and never logged,
 *   stored raw, or sent back.
 *
 * Failures are thrown as bare codes ("WALLET_LIMIT"); the API layer owns the
 * sentences, the same split every other feature here uses.
 */

type WalletRow = typeof tradeWallets.$inferSelect

/**
 * Everything a wallet is described by — the timestamps are stored but nothing
 * reads them, so a row on its way in describes a wallet just as well as one
 * read back out.
 */
type WalletFields = Pick<
  WalletRow,
  | "id"
  | "label"
  | "kind"
  | "protocol"
  | "network"
  | "startingBalance"
  | "address"
  | "agentKeyEncrypted"
>

function toWallet(row: WalletFields): TradeWallet {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    protocol: row.protocol,
    network: row.network,
    startingBalance: row.startingBalance,
    address: row.address,
    hasKey: row.agentKeyEncrypted !== null,
  }
}

/** This person's wallets, oldest first — the order the All tab lists them. */
export async function listWallets(userId: string): Promise<TradeWallet[]> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(eq(tradeWallets.userId, userId))
    .orderBy(asc(tradeWallets.createdAt), asc(tradeWallets.id))
  return rows.map(toWallet)
}

export async function createWallet(
  userId: string,
  input: {
    label: string
    kind: WalletKind
    protocol: ProtocolId
    network: NetworkId
    /** Paper only: the pretend cash it starts with. */
    startingBalance?: number
    /** Live only. */
    address?: string
    agentKey?: string
  }
): Promise<TradeWallet> {
  const existing = await listWallets(userId)
  if (existing.length >= MAX_WALLETS) throw new Error("WALLET_LIMIT")

  let startingBalance: number
  let address: string | null = null
  let agentKeyEncrypted: string | null = null

  if (input.kind === "paper") {
    if (!input.startingBalance) throw new Error("WALLET_BALANCE_REQUIRED")
    startingBalance = input.startingBalance
  } else {
    if (!input.address || !input.agentKey) {
      throw new Error("WALLET_CREDENTIALS_REQUIRED")
    }
    // Encrypt before anything can fail after it: a wallet is only ever
    // inserted with ciphertext, and a missing encryption key stops the whole
    // add rather than quietly storing nothing.
    agentKeyEncrypted = encryptSecret(input.agentKey)
    address = input.address
    // Reading the account is both the reachability check and the baseline:
    // "Since it started" measures from the value the account had right now.
    // An address Hyperliquid cannot answer for is refused, not saved broken.
    const figures = await getProtocol(input.protocol)
      .account.fetch(input.network, input.address)
      .catch(() => null)
    if (!figures) throw new Error("WALLET_UNREACHABLE")
    startingBalance = figures.equity
  }

  const row = {
    userId,
    id: randomUUID(),
    label: input.label,
    kind: input.kind,
    protocol: input.protocol,
    network: input.network,
    startingBalance,
    address,
    agentKeyEncrypted,
  }
  await db.insert(tradeWallets).values(row)
  return toWallet(row)
}

export async function updateWallet(
  userId: string,
  input: {
    id: string
    label?: string
    /** Paper only — rewriting a live wallet's baseline would rewrite its history. */
    startingBalance?: number
    /** Live only: a replacement trading key. */
    agentKey?: string
  }
): Promise<TradeWallet> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, input.id)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new Error("WALLET_NOT_FOUND")

  if (input.startingBalance !== undefined && row.kind !== "paper") {
    throw new Error("WALLET_BALANCE_KIND")
  }
  if (input.agentKey !== undefined && row.kind !== "live") {
    throw new Error("WALLET_KEY_KIND")
  }

  const set: Partial<typeof tradeWallets.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (input.label !== undefined) set.label = input.label
  if (input.startingBalance !== undefined) {
    set.startingBalance = input.startingBalance
  }
  if (input.agentKey !== undefined) {
    set.agentKeyEncrypted = encryptSecret(input.agentKey)
  }

  await db
    .update(tradeWallets)
    .set(set)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, input.id)))
  return toWallet({ ...row, ...set } as WalletRow)
}

export async function deleteWallet(userId: string, id: string): Promise<void> {
  await db
    .delete(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, id)))
}

/**
 * Every wallet's figures in one sweep — what the panel polls.
 *
 * Live wallets are asked in parallel and each failure stays its own: one dead
 * address answers "unreachable" while the rest answer normally. Nothing here
 * throws for a wallet the exchange would not price; throwing is for the read
 * of the list itself.
 */
export async function loadWalletSummaries(
  userId: string
): Promise<{ wallets: TradeWallet[]; summaries: WalletAccountSummary[] }> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(eq(tradeWallets.userId, userId))
    .orderBy(asc(tradeWallets.createdAt), asc(tradeWallets.id))

  const wallets = rows.map(toWallet)
  const summaries = await Promise.all(
    wallets.map(async (wallet): Promise<WalletAccountSummary> => {
      if (wallet.kind === "paper") {
        return summarizeWallet(wallet, paperFigures(wallet))
      }
      const figures = await getProtocol(wallet.protocol)
        .account.fetch(wallet.network, wallet.address ?? "")
        .catch(() => null)
      if (!figures) return { walletId: wallet.id, state: "unreachable" }
      return summarizeWallet(wallet, figures)
    })
  )
  return { wallets, summaries }
}
