import { and, eq, isNull, ne, or, sql } from "drizzle-orm"

import {
  buildWalletReport,
  readWalletAddress,
  WALLET_CHECK_KEEP_MS,
  WALLET_CHECK_PER_MINUTE,
  WALLET_CHECK_PER_VISITOR,
  type WalletCheckReport,
} from "@/lib/free-tools/wallet-checker"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { db, type CustomShellDb } from "@/server/db"
import { readPublicWalletActivity } from "@/server/protocols/hyperliquid/public-wallet"
import { pricesEverySale } from "@/server/protocols/registry"
import { tradePublicProfiles, tradeRecordWallets } from "@/server/trade/schema"

/**
 * The server half of the wallet checker (`/tools/wallet-checker`): asking
 * Hyperliquid about one address, keeping the answer, and staying inside the
 * exchange's request budget. The counting itself lives in
 * `@/lib/free-tools/wallet-checker`, which has no database and no clock.
 */

/** Hyperliquid's real network is the only place this tool reads. */
const NETWORK = "mainnet" as const
const PROTOCOL = "hyperliquid" as const

/**
 * One answer per address, for ten minutes. The same address inside that
 * window is handed the kept copy and costs the exchange nothing, which is
 * most of the protection against a post that goes viral.
 */
const kept = new Map<string, { at: number; report: WalletCheckReport }>()

/** Enough for a busy hour, and small enough that the map is never a leak. */
const KEEP_MAX = 500

function readKept(address: string, now: number): WalletCheckReport | null {
  const hit = kept.get(address)
  if (hit && now - hit.at < WALLET_CHECK_KEEP_MS) return hit.report
  if (hit) kept.delete(address)
  return null
}

function keep(address: string, report: WalletCheckReport, now: number): void {
  for (const [address_, entry] of kept) {
    if (now - entry.at >= WALLET_CHECK_KEEP_MS) kept.delete(address_)
  }
  // Oldest out first when the sweep left the map full. A Map hands its keys
  // back in insertion order, and every entry is inserted when it is read.
  while (kept.size >= KEEP_MAX) {
    const oldest = kept.keys().next()
    if (oldest.done) break
    kept.delete(oldest.value)
  }
  kept.set(address, { at: now, report })
}

/**
 * One read per address at a time.
 *
 * The kept copy only helps once an answer exists. The case this is for is the
 * one the task names: a post goes viral and a thousand visitors paste the
 * same address inside the same three seconds, every one of them missing an
 * empty cache. They now wait on the first read instead of each starting one,
 * so that moment costs the exchange a single request.
 */
const reading = new Map<string, Promise<WalletCheckReport>>()

/** Drops every kept answer. The tests use it; nothing else does. */
export function forgetWalletChecks(): void {
  kept.clear()
}

/**
 * The handle of the public Trade profile this address belongs to, or null.
 *
 * A wallet counts only while its member has not deleted it, its last
 * ownership check did not fail, and the profile is switched on and not hidden
 * by an admin — the same conditions that decide whether `/t/<handle>` answers
 * at all.
 */
async function profileHandleFor(
  address: string,
  database: CustomShellDb
): Promise<string | null> {
  const [row] = await database
    .select({ handle: tradePublicProfiles.handle })
    .from(tradeRecordWallets)
    .innerJoin(
      tradePublicProfiles,
      eq(tradePublicProfiles.userId, tradeRecordWallets.userId)
    )
    .where(
      and(
        eq(tradeRecordWallets.protocol, PROTOCOL),
        sql`lower(${tradeRecordWallets.address}) = ${address}`,
        isNull(tradeRecordWallets.removedAt),
        or(
          isNull(tradeRecordWallets.proof),
          ne(tradeRecordWallets.proof, "failed")
        ),
        eq(tradePublicProfiles.enabled, true),
        isNull(tradePublicProfiles.hiddenAt)
      )
    )
    .limit(1)
  return row?.handle ?? null
}

/**
 * What one address made and lost, from Hyperliquid's own history.
 *
 * `requestAddress` is the visitor's IP, which is what the per-visitor limit
 * counts. The shared limit is counted under one key, so every visitor
 * together stays inside the slice of the exchange's budget this page may
 * spend and the trading engine is never starved. A kept answer passes both
 * limits untouched, because it asks the exchange nothing.
 */
export async function checkWallet(
  typed: string,
  requestAddress: string,
  now: number = Date.now(),
  database: CustomShellDb = db
): Promise<WalletCheckReport> {
  const address = readWalletAddress(typed)
  // Refused before anything is asked, spent or counted.
  if (!address) throw new Error("WALLET_ADDRESS_INVALID")

  const already = readKept(address, now)
  if (already) return already

  await enforceRateLimit(
    `trade-wallet-check:${requestAddress}`,
    { maxAttempts: WALLET_CHECK_PER_VISITOR, windowSeconds: 60 },
    database
  )

  // Joining a read already in flight spends none of the shared budget,
  // because it is the same single request to the exchange. Nothing may be
  // awaited between looking and putting one there: an await is where the
  // next visitor slips through and starts a second read of their own.
  const inFlight = reading.get(address)
  if (inFlight) return await inFlight
  const read = loadReport(address, now, database)
  reading.set(address, read)

  try {
    const report = await read
    keep(address, report, now)
    return report
  } finally {
    reading.delete(address)
  }
}

/**
 * The shared limit, the exchange read and the counting: everything the
 * visitors waiting on one address share. The shared limit belongs in here
 * rather than beside the per-visitor one, so it is counted once per read
 * rather than once per visitor waiting on that read.
 */
async function loadReport(
  address: string,
  now: number,
  database: CustomShellDb
): Promise<WalletCheckReport> {
  try {
    await enforceRateLimit(
      "trade-wallet-check:everyone",
      { maxAttempts: WALLET_CHECK_PER_MINUTE, windowSeconds: 60 },
      database
    )
  } catch (error) {
    // Only the limit itself becomes "busy". A database that would not answer
    // is not a busy page, and saying so would send the visitor away to wait
    // for something that is never going to clear on its own.
    if (!(error instanceof RateLimitError)) throw error
    // The page's whole share of the exchange budget is spent for this minute.
    // Said differently from one visitor's own limit, because it is not their
    // doing and waiting is the entire answer.
    throw new Error("WALLET_CHECK_BUSY")
  }

  const activity = await readPublicWalletActivity(NETWORK, address).catch(
    (error: unknown) => {
      console.error("[wallet-checker] Hyperliquid did not answer", error)
      throw new Error("WALLET_CHECK_UNAVAILABLE")
    }
  )
  return buildWalletReport({
    address,
    fills: activity.fills,
    capped: activity.capped,
    openPositions: activity.openPositions,
    profileHandle: await profileHandleFor(address, database),
    profitPerSale: pricesEverySale(PROTOCOL),
    now,
  })
}
