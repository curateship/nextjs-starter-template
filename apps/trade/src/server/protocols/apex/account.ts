import { createHash } from "node:crypto"

import { z } from "zod"

import type {
  NetworkId,
  WalletAccountFigures,
  WalletPosition,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/apex/translate"
import type { ApexPriority } from "@/server/protocols/apex/budget"
import { apexContract, apexMarketIdOf } from "@/server/protocols/apex/catalogue"
import {
  apexPrivate,
  apexPublic,
  parseApexCredential,
  type ApexCredential,
} from "@/server/protocols/apex/client"
import {
  readApexIndexPrices,
  readApexLivePrices,
} from "@/server/protocols/apex/live-prices"
import { apexQuietSince } from "@/server/protocols/apex/private-feed"

const numeric = z.union([z.string(), z.number()])

/**
 * `GET /v3/account`, as ApeX's docs and its Node connector describe it: the
 * account and zk account ids every order names, the public key its orders
 * are signed with (`l2Key`), the fee rates, the wallet balance and the
 * positions. Fields ApeX may leave out are optional, and nothing below
 * fills one in with a guess.
 */
const accountSchema = z.object({
  id: numeric,
  ethereumAddress: z.string().optional(),
  l2Key: z.string().optional(),
  spotAccount: z
    .object({
      zkAccountId: numeric.optional(),
      subAccounts: z.array(z.object({ l2Key: z.string().optional() }).passthrough()).optional(),
    })
    .passthrough()
    .optional(),
  contractAccount: z
    .object({
      takerFeeRate: numeric.optional(),
      makerFeeRate: numeric.optional(),
      unrealizePnlPriceType: z.string().optional(),
    })
    .passthrough()
    .optional(),
  positions: z.array(z.unknown()).optional(),
})

const positionSchema = z.object({
  symbol: z.string(),
  side: z.string(),
  size: numeric,
  entryPrice: numeric,
  customInitialMarginRate: numeric.optional(),
  isPrelaunch: z.boolean().optional(),
})

const balanceSchema = z.object({
  totalEquityValue: numeric,
  availableBalance: numeric,
  initialMargin: numeric.optional(),
  symbolToOraclePrice: z
    .record(z.string(), z.object({ oraclePrice: numeric.optional() }).passthrough())
    .optional(),
})

/** What every order and the sign-in check need to know about the account. */
export type ApexAccountFacts = {
  /** ApeX's long account id: the zkLink signature folds it into 32 bits. */
  accountId: string
  zkAccountId: string | null
  /** The public key ApeX holds for this account's order signatures. */
  l2Key: string | null
  ethereumAddress: string | null
  makerFeeRate: string
  takerFeeRate: string
  /**
   * Which price ApeX values this account's open profit at. Its docs'
   * example says INDEX_PRICE and another of its examples says MARKET_PRICE,
   * so it is read rather than assumed.
   */
  profitPrice: "index" | "mark"
}

export type ApexAccountRead = {
  facts: ApexAccountFacts
  positions: Array<{
    symbol: string
    szi: number
    entryPx: number
    /** The account's own rate for this market, or null when it set none. */
    customMarginRate: number | null
  }>
}

/** ApeX's two answers read into the facts, wallet and positions. */
export function toApexAccountRead(answer: unknown): ApexAccountRead {
  const parsed = accountSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  const account = parsed.data
  const text = (value: unknown) =>
    value === undefined || value === null || value === "" ? null : String(value)
  const makerFeeRate = text(account.contractAccount?.makerFeeRate)
  const takerFeeRate = text(account.contractAccount?.takerFeeRate)
  // An order signs its fee rates, so an account that did not state them
  // cannot be traded; it can still be read.
  const facts: ApexAccountFacts = {
    accountId: String(account.id),
    zkAccountId: text(account.spotAccount?.zkAccountId),
    l2Key:
      text(account.l2Key)?.toLowerCase() ??
      text(account.spotAccount?.subAccounts?.[0]?.l2Key)?.toLowerCase() ??
      null,
    ethereumAddress: text(account.ethereumAddress)?.toLowerCase() ?? null,
    makerFeeRate: makerFeeRate ?? "",
    takerFeeRate: takerFeeRate ?? "",
    profitPrice:
      account.contractAccount?.unrealizePnlPriceType === "MARKET_PRICE"
        ? "mark"
        : "index",
  }
  const positions: ApexAccountRead["positions"] = []
  for (const raw of account.positions ?? []) {
    const row = positionSchema.safeParse(raw)
    if (!row.success) continue
    const size = num(row.data.size)
    const entryPx = num(row.data.entryPrice)
    // ApeX lists a market the account has touched with a size of zero.
    if (size === null || size === 0 || entryPx === null) continue
    const side = row.data.side.toUpperCase()
    if (side !== "LONG" && side !== "SHORT") continue
    const custom = num(row.data.customInitialMarginRate)
    positions.push({
      symbol: row.data.symbol,
      szi: side === "LONG" ? Math.abs(size) : -Math.abs(size),
      entryPx,
      customMarginRate: custom !== null && custom > 0 ? custom : null,
    })
  }
  return { facts, positions }
}

type Balance = {
  equity: number
  free: number
  inTrades: number | null
  /** ApeX's oracle price per dashed symbol, which its margin is priced at. */
  oracle: Map<string, number>
}

export function toApexBalance(answer: unknown): Balance {
  const parsed = balanceSchema.safeParse(answer)
  if (!parsed.success) throw new Error("LIVE_UNREADABLE")
  const equity = num(parsed.data.totalEquityValue)
  const free = num(parsed.data.availableBalance)
  if (equity === null || free === null) throw new Error("LIVE_UNREADABLE")
  const oracle = new Map<string, number>()
  for (const [symbol, row] of Object.entries(parsed.data.symbolToOraclePrice ?? {})) {
    const price = num(row.oraclePrice)
    if (price !== null && price > 0) oracle.set(symbol, price)
  }
  return { equity, free, inTrades: num(parsed.data.initialMargin), oracle }
}

/**
 * **One shared read every two seconds per account, longer while the private
 * socket vouches for it.** Every panel that asks inside two seconds gets the
 * same answer. After that, the answer still stands while ApeX's private
 * socket has been signed in and silent since it was read, which is what
 * replaces the two-second poll; two minutes is the ceiling whatever the
 * socket says. Anything this app sends drops the held read at once.
 */
const HELD_MS = 2_000
const QUIET_CEILING_MS = 2 * 60_000

type Held = { at: number; load: Promise<{ read: ApexAccountRead; balance: Balance }> }
const held = new Map<string, Held>()

/**
 * A key for one credential that never contains any part of it.
 *
 * All three request values go into it, not the API key alone: the sign-in
 * check reads through the same held answer, and a wrong passphrase typed
 * straight after a right one must be asked about, not handed the earlier
 * success.
 */
export function apexCredentialFingerprint(credential: ApexCredential): string {
  return createHash("sha256")
    .update(`${credential.key}\n${credential.secret}\n${credential.passphrase}`)
    .digest("hex")
    .slice(0, 16)
}

export function apexCredentialFrom(credential: () => string | null): ApexCredential {
  return parseApexCredential(credential())
}

export async function readApexAccount(
  network: NetworkId,
  credential: ApexCredential,
  priority: ApexPriority = "background",
  /** The wallet's address, which names its private socket. */
  address?: string
): Promise<{ read: ApexAccountRead; balance: Balance }> {
  const key = `${network}:${apexCredentialFingerprint(credential)}`
  const found = held.get(key)
  if (found) {
    const age = Date.now() - found.at
    if (age < HELD_MS) return found.load
    if (
      address &&
      priority === "background" &&
      age < QUIET_CEILING_MS &&
      apexQuietSince(network, address.toLowerCase(), () => JSON.stringify(credential), found.at)
    ) {
      return found.load
    }
  }
  const load = Promise.all([
    apexPrivate(network, credential, "GET", "/account", {}, { priority }),
    apexPrivate(network, credential, "GET", "/account-balance", {}, { priority }),
  ]).then(([account, balance]) => ({
    read: toApexAccountRead(account),
    balance: toApexBalance(balance),
  }))
  held.set(key, { at: Date.now(), load })
  load.catch(() => {
    if (held.get(key)?.load === load) held.delete(key)
  })
  return load
}

/** Drops the held read, after anything that changed the account. */
export function forgetApexAccountRead(network: NetworkId, credential: ApexCredential): void {
  held.delete(`${network}:${apexCredentialFingerprint(credential)}`)
}

/**
 * The price ApeX values open profit at for each market: the index or the
 * mark, from the feed, or one ticker each when the feed has nothing.
 */
async function profitPrices(
  network: NetworkId,
  marketIds: readonly string[],
  kind: ApexAccountFacts["profitPrice"]
): Promise<Map<string, number>> {
  const pushed =
    kind === "index"
      ? readApexIndexPrices(network)
      : readApexLivePrices(network).prices
  const prices = new Map<string, number>()
  for (const marketId of marketIds) {
    const price = pushed.get(marketId)
    if (price !== undefined) {
      prices.set(marketId, price)
      continue
    }
    const answer = (await apexPublic(network, "/ticker", { symbol: marketId })) as unknown[]
    const row = answer?.[0] as { indexPrice?: unknown; markPrice?: unknown } | undefined
    const read = num(kind === "index" ? row?.indexPrice : row?.markPrice)
    if (read !== null && read > 0) prices.set(marketId, read)
  }
  return prices
}

/**
 * The positions as the app's rows, with market ids in the undashed spelling
 * every other part of the app uses.
 *
 * - **Leverage is read, never assumed.** A market the account set its own
 *   rate for uses that; one it never set uses the market's default rate,
 *   which is ApeX's own rule.
 * - **Liquidation price is null.** ApeX liquidates the whole account when
 *   its equity falls below the maintenance margin, per its docs, and states
 *   no price per position. A made-up one would be a number ApeX never
 *   agreed to.
 * - **Margin held is ApeX's own formula**: size times oracle price times the
 *   margin rate, per its docs. The oracle price comes off the balance
 *   answer; the entry price stands in only for a market it left out.
 */
export async function toApexWalletPositions(
  network: NetworkId,
  read: ApexAccountRead,
  oracle: ReadonlyMap<string, number> = new Map()
): Promise<WalletPosition[]> {
  const rows: WalletPosition[] = []
  for (const position of read.positions) {
    const marketId = await apexMarketIdOf(network, position.symbol)
    if (marketId === null) continue
    const contract = await apexContract(network, marketId)
    const rate = position.customMarginRate ?? contract.defaultInitialMarginRate
    rows.push({
      marketId,
      szi: position.szi,
      entryPx: position.entryPx,
      leverage: Math.round((1 / rate) * 100) / 100,
      marginUsed:
        Math.abs(position.szi) *
        (oracle.get(position.symbol) ?? position.entryPx) *
        rate,
      liquidationPx: null,
      marginMode: "cross",
      targets: [],
      tpPx: null,
      tpSz: null,
      slPx: null,
      tpOrderId: null,
      slOrderId: null,
      protectionOrderIds: [],
    })
  }
  return rows
}

/** What the wallet card shows: worth, free, in trades and open profit. */
export async function fetchApexAccount(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<WalletAccountFigures> {
  const { read, balance } = await readApexAccount(
    network,
    apexCredentialFrom(credential),
    "background",
    address
  )
  const open: Array<{ marketId: string; szi: number; entryPx: number }> = []
  for (const position of read.positions) {
    const marketId = await apexMarketIdOf(network, position.symbol)
    if (marketId !== null) open.push({ ...position, marketId })
  }
  const index = await profitPrices(
    network,
    open.map((one) => one.marketId),
    read.facts.profitPrice
  )
  let openProfit = 0
  for (const position of open) {
    const price = index.get(position.marketId)
    if (price !== undefined) openProfit += (price - position.entryPx) * position.szi
  }
  return {
    equity: balance.equity,
    free: balance.free,
    // ApeX states the account's initial margin; the sum of the positions'
    // own figures stands in only if it ever leaves it out.
    inTrades:
      balance.inTrades ??
      (await toApexWalletPositions(network, read, balance.oracle)).reduce(
        (total, one) => total + one.marginUsed,
        0
      ),
    openProfit,
  }
}

/** Tests must not inherit a held read. */
export function clearApexAccountReads(): void {
  held.clear()
}
