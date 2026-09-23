import { and, eq, inArray, isNotNull } from "drizzle-orm"

import type {
  MarketCatalog,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import { getProtocol } from "@/server/protocols/registry"
import { scrubSecrets } from "@/server/protocols/scrub"
import { db } from "@/server/trade/db"
import { marketRules, type MarketRules } from "@/server/trade/market-rules"
import { tradeLeverageCeilings, tradeWallets } from "@/server/trade/schema"
import { credentialFor } from "@/server/trade/wallet-auth"

/**
 * Leverage ceilings an exchange only tells a signed-in account.
 *
 * Aster's public market list labels its leverage fields "ignore", so the
 * catalogue leaves every Aster market's ceiling unknown and the order window
 * draws no leverage slider. A connected wallet's own keys can read the real
 * numbers. This file reads them, keeps them, and lays them over the market
 * rows for that person only.
 *
 * - **Keys-free stays keys-free.** Nothing here runs without a switched-on
 *   wallet holding a key on that exchange and network. Without one, the rows
 *   keep their unknown and the window stays at 1x. Nothing is guessed.
 * - **Once a day per wallet.** Ceilings barely change and every signed read
 *   spends the exchange's request allowance, so the answer is stored in
 *   `trade_leverage_ceilings` and survives a restart.
 * - **The public list wins.** Only a market the list left unknown is filled,
 *   so an exchange that states its ceilings publicly is never touched.
 */

const FRESH_FOR_MS = 24 * 60 * 60_000
/** A refused read is not repeated on every dashboard open. */
const FAILED_REST_MS = 10 * 60_000

type KeyedWallet = {
  userId: string
  id: string
  protocol: ProtocolId
  network: NetworkId
  address: string | null
  agentKeyEncrypted: string | null
}

type CeilingReader = NonNullable<
  NonNullable<ReturnType<typeof getProtocol>["account"]>["leverageCeilings"]
>

const reading = new Map<string, Promise<Map<string, number>>>()
const restingUntil = new Map<string, number>()

/** Tests drive the cache themselves; state across them would leak. */
export function clearLeverageCeilingState(): void {
  reading.clear()
  restingUntil.clear()
}

function walletKey(wallet: KeyedWallet): string {
  return `${wallet.userId}:${wallet.id}`
}

async function keyedWallets(
  userId: string,
  protocol: ProtocolId,
  network: NetworkId
): Promise<KeyedWallet[]> {
  return db
    .select({
      userId: tradeWallets.userId,
      id: tradeWallets.id,
      protocol: tradeWallets.protocol,
      network: tradeWallets.network,
      address: tradeWallets.address,
      agentKeyEncrypted: tradeWallets.agentKeyEncrypted,
    })
    .from(tradeWallets)
    .where(
      and(
        eq(tradeWallets.userId, userId),
        eq(tradeWallets.protocol, protocol),
        eq(tradeWallets.network, network),
        eq(tradeWallets.kind, "live"),
        eq(tradeWallets.status, "active"),
        isNotNull(tradeWallets.address),
        isNotNull(tradeWallets.agentKeyEncrypted)
      )
    )
    .orderBy(tradeWallets.createdAt)
}

function readCeilings(
  wallet: KeyedWallet,
  read: CeilingReader
): Promise<Map<string, number>> {
  const key = walletKey(wallet)
  const held = reading.get(key)
  if (held) return held
  const load = (async () => {
    const ceilings = await read(wallet.network, wallet.address ?? "", () =>
      credentialFor(wallet)
    )
    // An empty answer is an unreadable one. Stored, it would hide the slider
    // for a whole day.
    if (ceilings.size === 0) throw new Error("LEVERAGE_CEILINGS_EMPTY")
    const row = {
      userId: wallet.userId,
      walletId: wallet.id,
      ceilings: Object.fromEntries(ceilings),
      fetchedAt: new Date(),
    }
    await db
      .insert(tradeLeverageCeilings)
      .values(row)
      .onConflictDoUpdate({
        target: [tradeLeverageCeilings.userId, tradeLeverageCeilings.walletId],
        set: { ceilings: row.ceilings, fetchedAt: row.fetchedAt },
      })
    return ceilings
  })()
  reading.set(key, load)
  load.then(
    () => reading.delete(key),
    (error: unknown) => {
      reading.delete(key)
      restingUntil.set(key, Date.now() + FAILED_REST_MS)
      console.warn(
        `[leverage-ceilings] ${wallet.protocol} ${wallet.network} read failed, not asked again for ${FAILED_REST_MS / 60_000} minutes: ${scrubSecrets(
          error instanceof Error ? error.message : String(error)
        )}`
      )
    }
  )
  return load
}

/**
 * This person's ceilings on one exchange and network, or null when there are
 * none to give.
 *
 * `refresh` asks the exchange when the stored answer is missing or a day old.
 * Without it only the stored answer is used, whatever its age, which is what
 * an order path wants: placing an order never spends a signed read on this.
 */
export async function leverageCeilings(
  userId: string,
  protocol: ProtocolId,
  network: NetworkId,
  options: { refresh: boolean }
): Promise<Map<string, number> | null> {
  const read = getProtocol(protocol).account?.leverageCeilings
  if (!read) return null
  const wallets = await keyedWallets(userId, protocol, network)
  if (wallets.length === 0) return null

  const stored = await db
    .select({
      ceilings: tradeLeverageCeilings.ceilings,
      fetchedAt: tradeLeverageCeilings.fetchedAt,
    })
    .from(tradeLeverageCeilings)
    .where(
      and(
        eq(tradeLeverageCeilings.userId, userId),
        inArray(
          tradeLeverageCeilings.walletId,
          wallets.map((wallet) => wallet.id)
        )
      )
    )
  const newest = stored.reduce<(typeof stored)[number] | null>(
    (best, row) =>
      best === null || row.fetchedAt > best.fetchedAt ? row : best,
    null
  )
  const kept = newest ? new Map(Object.entries(newest.ceilings)) : null
  const keptIsFresh =
    newest !== null && Date.now() - newest.fetchedAt.getTime() < FRESH_FOR_MS
  if (!options.refresh || keptIsFresh) return kept

  const now = Date.now()
  for (const wallet of wallets) {
    if ((restingUntil.get(walletKey(wallet)) ?? 0) > now) continue
    const fresh = await readCeilings(wallet, read).catch(() => null)
    if (fresh) return fresh
  }
  // A day-old answer is still the exchange's own number; a failed refresh
  // does not throw it away.
  return kept
}

/**
 * The market list with this person's ceilings filled into every market the
 * exchange left unknown. The shared catalogue is never changed in place.
 *
 * A failed read leaves the list exactly as it came, because a missing slider
 * is the state the window already knows how to draw.
 */
export async function withLeverageCeilings(
  userId: string,
  catalog: MarketCatalog
): Promise<MarketCatalog> {
  if (!catalog.rows.some((row) => row.maxLeverage === null)) return catalog
  const ceilings = await leverageCeilings(
    userId,
    catalog.protocol,
    catalog.network,
    { refresh: true }
  ).catch(() => null)
  if (!ceilings) return catalog
  return {
    ...catalog,
    rows: catalog.rows.map((row) => {
      if (row.maxLeverage !== null) return row
      const ceiling = ceilings.get(row.marketId)
      return ceiling === undefined ? row : { ...row, maxLeverage: ceiling }
    }),
  }
}

/**
 * `marketRules` with this person's stored ceiling filled in, for an order the
 * leverage slider just chose. A practice or watched order checks its leverage
 * against the ceiling, so it has to see the same number the window did.
 */
export async function userMarketRules(
  userId: string,
  protocol: ProtocolId,
  network: NetworkId,
  marketId: string
): Promise<MarketRules | null> {
  const rules = await marketRules(protocol, network, marketId)
  if (!rules || rules.maxLeverage !== null) return rules
  const ceilings = await leverageCeilings(userId, protocol, network, {
    refresh: false,
  }).catch(() => null)
  const ceiling = ceilings?.get(marketId)
  return ceiling === undefined ? rules : { ...rules, maxLeverage: ceiling }
}
