import { randomUUID } from "node:crypto"

import { and, asc, eq, gte, inArray } from "drizzle-orm"

import type {
  NetworkId,
  ProtocolId,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"
import {
  MAX_WALLETS,
  moneyForWalletFill,
  summarizeWallet,
  walletProfitWindowStart,
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
  credentialsOf,
  pricesEverySale,
} from "@/server/protocols/registry"
import { scrubbedMessage } from "@/server/protocols/scrub"
import { paperWalletFigures } from "@/server/trade/paper"
import { credentialFor } from "@/server/trade/wallet-auth"
import {
  tradeLiveFills,
  tradePaperJournal,
  tradeWallets,
} from "@/server/trade/schema"

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
  return (await listWalletsWithCredentials(userId)).wallets
}

/**
 * The same list, with each wallet's key kept beside it as a thunk that
 * decrypts on demand. The live poll needs both, and reading the row once for
 * the list and again for the keys was a round trip for nothing. The
 * plaintext still never leaves the server: `TradeWallet` carries only
 * `hasKey`, and the thunk is consumed by the exchange connector.
 */
export async function listWalletsWithCredentials(userId: string): Promise<{
  wallets: TradeWallet[]
  credentials: Map<string, () => string | null>
}> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(eq(tradeWallets.userId, userId))
    .orderBy(asc(tradeWallets.createdAt), asc(tradeWallets.id))
  const credentials = new Map<string, () => string | null>()
  for (const row of rows) credentials.set(row.id, () => credentialFor(row))
  return { wallets: rows.map(toWallet), credentials }
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
    /** Live only: the public identifier — a wallet address or an API key id. */
    address?: string
    /** Live only: the trading key, on an exchange whose credential is one. */
    agentKey?: string
    /** Live only: the API secret, on an API-key exchange. */
    secret?: string
    /** Live only: the passphrase, where the exchange demands a third value. */
    passphrase?: string
  }
): Promise<TradeWallet> {
  const existing = await listWallets(userId)
  if (existing.length >= MAX_WALLETS) throw new Error("WALLET_LIMIT")

  const entry = getProtocol(input.protocol)
  // A network the exchange does not run must be refused at the door — a
  // wallet saved on one would poll an endpoint that does not exist, forever.
  if (!entry.networks.includes(input.network)) {
    throw new Error("WALLET_NETWORK")
  }

  let startingBalance: number
  let address: string | null = null
  let agentKeyEncrypted: string | null = null
  let agentValidUntil: Date | null = null
  let positionMode: "one-way" | "two-sided" | null = null

  if (input.kind === "paper") {
    if (!input.startingBalance) throw new Error("WALLET_BALANCE_REQUIRED")
    startingBalance = input.startingBalance
  } else {
    // `credentialsOf` also refuses a live wallet on an exchange that cannot
    // hold accounts at all (Binance), with the exchange's name in the error.
    const creds = credentialsOf(entry)
    if (!input.address) throw new Error("WALLET_CREDENTIALS_REQUIRED")
    if (!new RegExp(creds.form.addressPattern).test(input.address.trim())) {
      throw new Error("WALLET_ADDRESS_SHAPE")
    }
    address = input.address.trim()
    // The protocol folds the pasted fields into its own blob — and refuses a
    // missing required field with a KEY_ code before anything is stored.
    const blob = creds.pack({
      address,
      agentKey: input.agentKey,
      secret: input.secret,
      passphrase: input.passphrase,
    })
    // Encrypt before anything can fail after it: a wallet is only ever
    // inserted with ciphertext, and a missing encryption key stops the whole
    // add rather than quietly storing nothing.
    agentKeyEncrypted = encryptSecret(blob)
    // The credential is proved before it is kept: the exchange must accept
    // it for this account, and an account's own master key is refused
    // outright where the venue can tell. Codes travel up as they are — each
    // has its own sentence in the dialog.
    const verified = await agentOf(entry).verify(input.network, address, blob)
    agentValidUntil =
      verified.validUntil !== null ? new Date(verified.validUntil) : null
    positionMode = verified.positionMode ?? null
    // Reading the account proves it is reachable and records the fixed sizing
    // baseline used when compounding is off.
    // An account the exchange cannot answer for is refused, not saved broken.
    const figures = await accountOf(entry)
      .fetch(input.network, address, () => blob)
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
    positionMode,
  }
  await db.insert(tradeWallets).values(row)
  return toWallet(row)
}

export async function updateWallet(
  userId: string,
  input: {
    id: string
    label?: string
    /** Paper only — a live wallet keeps the fixed sizing baseline saved at add. */
    startingBalance?: number
    /** Live only: a replacement credential, in the wallet's own fields. */
    agentKey?: string
    secret?: string
    passphrase?: string
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
  const replacingKey =
    input.agentKey !== undefined ||
    input.secret !== undefined ||
    input.passphrase !== undefined
  if (replacingKey && row.kind !== "live") {
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
  if (replacingKey) {
    const entry = getProtocol(row.protocol)
    const blob = credentialsOf(entry).pack({
      address: row.address ?? undefined,
      agentKey: input.agentKey,
      secret: input.secret,
      passphrase: input.passphrase,
    })
    // A replacement credential is proved exactly like a first one — against
    // the wallet's own stored address and network, so a credential for some
    // other account can never slide in through the edit window.
    const verified = await agentOf(entry).verify(
      row.network,
      row.address ?? "",
      blob
    )
    set.agentKeyEncrypted = encryptSecret(blob)
    set.agentValidUntil =
      verified.validUntil !== null ? new Date(verified.validUntil) : null
    if (verified.positionMode !== undefined) {
      set.positionMode = verified.positionMode
    }
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
  userId: string,
  /**
   * Ask the exchange about this exchange's wallets only. Every dashboard
   * belongs to one exchange, and asking every other exchange about wallets
   * the page will never draw spent their request allowance for nothing. The
   * wallet LIST still comes back whole.
   */
  protocol?: ProtocolId
): Promise<{ wallets: TradeWallet[]; summaries: WalletAccountSummary[] }> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(eq(tradeWallets.userId, userId))
    .orderBy(asc(tradeWallets.createdAt), asc(tradeWallets.id))

  const wallets = rows.map(toWallet)
  // The ciphertext rides along from the same read, decrypted only if the
  // wallet's exchange needs a key to answer an account question at all.
  const cipherById = new Map(
    rows.map((row) => [row.id, row.agentKeyEncrypted ?? null])
  )
  // **Only the wallets in use are read.** Every live wallet costs three
  // requests to the exchange on every poll, and the exchange counts every
  // request from this machine together — so wallets switched off were
  // spending the same allowance as the one being traded with, and running out
  // is exactly what makes a wallet answer with nothing. A switched-off wallet
  // says so instead, which is the truth and costs nothing.
  const inUse = wallets.filter(
    (wallet) =>
      wallet.status === "active" &&
      (protocol === undefined || wallet.protocol === protocol)
  )
  const liveWallets = inUse.filter((wallet) => wallet.kind === "live")
  const paperWallets = inUse.filter((wallet) => wallet.kind === "paper")
  const since = walletProfitWindowStart(new Date())
  const [paper, liveMoney, paperMoney] = await Promise.all([
    paperWalletFigures(userId, paperWallets).catch((error) => {
      console.error("Paper wallets could not be settled", error)
      return new Map<string, WalletAccountFigures>()
    }),
    liveWallets.length
      ? db
          .select({
            walletId: tradeLiveFills.walletId,
            side: tradeLiveFills.side,
            closedPnl: tradeLiveFills.closedPnl,
            fee: tradeLiveFills.fee,
          })
          .from(tradeLiveFills)
          .where(
            and(
              eq(tradeLiveFills.userId, userId),
              inArray(
                tradeLiveFills.walletId,
                liveWallets.map((wallet) => wallet.id)
              ),
              eq(tradeLiveFills.hidden, false),
              gte(tradeLiveFills.at, since)
            )
          )
      : [],
    paperWallets.length
      ? db
          .select({
            walletId: tradePaperJournal.walletId,
            closedPnl: tradePaperJournal.closedPnl,
            fee: tradePaperJournal.fee,
          })
          .from(tradePaperJournal)
          .where(
            and(
              eq(tradePaperJournal.userId, userId),
              inArray(
                tradePaperJournal.walletId,
                paperWallets.map((wallet) => wallet.id)
              ),
              gte(tradePaperJournal.fillTime, new Date(since))
            )
          )
      : [],
  ])
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]))
  const settledByWallet = new Map<string, number>()
  const unpricedByWallet = new Map<string, number>()
  const addSettled = (walletId: string, money: number) =>
    settledByWallet.set(walletId, (settledByWallet.get(walletId) ?? 0) + money)
  for (const fill of liveMoney) {
    const wallet = walletById.get(fill.walletId)
    if (!wallet) continue
    const money = moneyForWalletFill({
      profitPerSale: pricesEverySale(wallet.protocol),
      ...fill,
    })
    if (money === null) {
      unpricedByWallet.set(
        fill.walletId,
        (unpricedByWallet.get(fill.walletId) ?? 0) + 1
      )
    } else {
      addSettled(fill.walletId, money)
    }
  }
  for (const fill of paperMoney) {
    addSettled(fill.walletId, fill.closedPnl - fill.fee)
  }

  const summaries = await Promise.all(
    wallets.map(async (wallet): Promise<WalletAccountSummary> => {
      if (wallet.status !== "active") {
        return { walletId: wallet.id, state: "inactive" }
      }
      if (wallet.kind === "paper") {
        const figures = paper.get(wallet.id)
        // The engine could not be run — the exchange would not answer, or the
        // settle itself failed. Saying so beats reporting a balance worked out
        // from prices nobody could read.
        if (!figures) return { walletId: wallet.id, state: "unreachable" }
        return summarizeWallet(wallet, figures, {
          settled: settledByWallet.get(wallet.id) ?? 0,
          unpricedFills: 0,
        })
      }
      let refusal: string | null = null
      const figures = await accountOf(getProtocol(wallet.protocol))
        .fetch(wallet.network, wallet.address ?? "", () =>
          credentialFor({
            agentKeyEncrypted: cipherById.get(wallet.id) ?? null,
          })
        )
        .catch((error: unknown) => {
          const message = scrubbedMessage(error)
          const mode = /^WALLET_POSITION_MODE:([^]+)/.exec(message)
          refusal = mode?.[1]?.trim() || null
          console.error(
            `Wallet "${wallet.label}" (${wallet.protocol} ${wallet.network}) could not be read`,
            message
          )
          return null
        })
      if (!figures) {
        return {
          walletId: wallet.id,
          state: "unreachable",
          ...(refusal ? { reason: refusal } : {}),
        }
      }
      return summarizeWallet(wallet, figures, {
        settled: settledByWallet.get(wallet.id) ?? 0,
        unpricedFills: unpricedByWallet.get(wallet.id) ?? 0,
      })
    })
  )
  return { wallets, summaries }
}
