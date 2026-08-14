import { randomUUID } from "node:crypto"

import { and, asc, eq } from "drizzle-orm"

import type {
  NetworkId,
  ProtocolId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import {
  MAX_WALLETS,
  summarizeWallet,
  type TradeWallet,
  type WalletAccountSummary,
  type WalletKind,
} from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { encryptSecret } from "@/server/auth/encryption"
import {
  accountOf,
  agentOf,
  getProtocol,
} from "@/server/protocols/registry"
import { paperWalletFigures } from "@/server/trade/paper"
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
  | "status"
  | "protocol"
  | "network"
  | "startingBalance"
  | "address"
  | "agentKeyEncrypted"
  | "agentValidUntil"
>

function toWallet(row: WalletFields): TradeWallet {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    status: row.status,
    protocol: row.protocol,
    network: row.network,
    startingBalance: row.startingBalance,
    address: row.address,
    hasKey: row.agentKeyEncrypted !== null,
    keyValidUntil: row.agentValidUntil?.getTime() ?? null,
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

/**
 * One of this person's wallets, or null. The pair (person, wallet) is the
 * whole lookup, so a request carrying somebody else's wallet id can only ever
 * miss — which is what every trading function leans on before it does anything.
 */
export async function findWallet(
  userId: string,
  id: string
): Promise<TradeWallet | null> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, id)))
    .limit(1)
  return rows[0] ? toWallet(rows[0]) : null
}

/** A wallet that may receive a new order. Inactive wallets remain readable. */
export async function findTradingWallet(
  userId: string,
  id: string
): Promise<TradeWallet | null> {
  const wallet = await findWallet(userId, id)
  if (wallet?.status === "inactive") throw new Error("WALLET_INACTIVE")
  return wallet
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
  let agentValidUntil: Date | null = null

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
    // The key is proved before it is kept: the exchange must list it as
    // approved to trade for this account, and the account's own key is
    // refused outright. Codes travel up as they are — each has its own
    // sentence in the dialog.
    const verified = await agentOf(getProtocol(input.protocol)).verify(
      input.network,
      input.address,
      input.agentKey
    )
    agentValidUntil = verified.validUntil !== null ? new Date(verified.validUntil) : null
    // Reading the account is both the reachability check and the baseline:
    // "Since it started" measures from the value the account had right now.
    // An address Hyperliquid cannot answer for is refused, not saved broken.
    const figures = await accountOf(getProtocol(input.protocol))
      .fetch(input.network, input.address)
      .catch(() => null)
    if (!figures) throw new Error("WALLET_UNREACHABLE")
    startingBalance = figures.equity
  }

  const row = {
    userId,
    id: randomUUID(),
    label: input.label,
    kind: input.kind,
    status: "active" as const,
    protocol: input.protocol,
    network: input.network,
    startingBalance,
    address,
    agentKeyEncrypted,
    agentValidUntil,
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
    status?: TradeWallet["status"]
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
  if (input.status !== undefined) set.status = input.status
  if (input.startingBalance !== undefined) {
    set.startingBalance = input.startingBalance
  }
  if (input.agentKey !== undefined) {
    // A replacement key is proved exactly like a first one — against the
    // wallet's own stored address and network, so a key for some other
    // account can never slide in through the edit window.
    const verified = await agentOf(getProtocol(row.protocol)).verify(
      row.network,
      row.address ?? "",
      input.agentKey
    )
    set.agentKeyEncrypted = encryptSecret(input.agentKey)
    set.agentValidUntil =
      verified.validUntil !== null ? new Date(verified.validUntil) : null
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
 *
 * Practice wallets are settled and folded together by the engine rather than
 * one at a time, so the exchange is asked once for every market they are all
 * in — see `paperWalletFigures`.
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
  const paper = await paperWalletFigures(
    userId,
    wallets.filter((wallet) => wallet.kind === "paper")
  ).catch((error) => {
    console.error("Paper wallets could not be settled", error)
    return new Map<string, WalletAccountFigures>()
  })

  const summaries = await Promise.all(
    wallets.map(async (wallet): Promise<WalletAccountSummary> => {
      if (wallet.kind === "paper") {
        const figures = paper.get(wallet.id)
        // The engine could not be run — the exchange would not answer, or the
        // settle itself failed. Saying so beats reporting a balance worked out
        // from prices nobody could read.
        if (!figures) return { walletId: wallet.id, state: "unreachable" }
        return summarizeWallet(wallet, figures)
      }
      const figures = await accountOf(getProtocol(wallet.protocol))
        .fetch(wallet.network, wallet.address ?? "")
        .catch((error: unknown) => {
          console.error(
            `Wallet "${wallet.label}" (${wallet.protocol} ${wallet.network}) could not be read`,
            error
          )
          return null
        })
      if (!figures) return { walletId: wallet.id, state: "unreachable" }
      return summarizeWallet(wallet, figures)
    })
  )
  return { wallets, summaries }
}
