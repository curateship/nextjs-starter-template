import { z } from "zod"

import type { TradeOrder } from "@/lib/trade/paper"

/**
 * The watched prices this browser saw last time, so the Watched tab has rows
 * to draw the moment it opens.
 *
 * **Why it exists.** The tab's rows come from the trading read, and that read
 * takes about three and a half seconds against the database — measured on
 * 21 Aug 2026, the same on a warm server, so it is not a dev-server
 * cold start. The panel opens on this tab, so those seconds were the first
 * thing on screen every single visit. Keeping the last answer in the browser
 * turns that into rows straight away.
 *
 * **It is a picture of the past and it is never trusted.** The rows drawn from
 * here say so on screen, and the first real read of the session replaces them
 * whether it agrees or not. Nothing is ever placed, cancelled or priced from
 * this — it only decides what is drawn for the two seconds before the truth
 * lands.
 *
 * **Scoped to the account AND the exchange.** The exchange, because the Trade
 * page is per exchange and Hyperliquid's levels must never flash up on the
 * Phemex page. The account, because localStorage belongs to the browser rather
 * than to whoever is signed in — without it, the next person to sign in on this
 * machine would see somebody else's levels for the second before the read
 * lands. Signing out does not have to clear anything; a different account
 * simply looks in a different place and finds nothing.
 */

const KEY = "trade-watched-prices"

/** Far more than anybody hand-places, and a cap the browser will not mind. */
const KEEP_AT_MOST = 60

/**
 * A price being waited at, as the Watched tab draws it — and exactly what the
 * cache stores, so the rows off a fresh read and the rows off the cache are
 * the same shape and there is one row component, not two.
 *
 * Deliberately narrower than the order it comes from. A stored blob is read
 * back by whatever build is running months later, so the less of the order's
 * shape it copies, the less there is to go stale.
 */
const levelSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  marketKey: z.string(),
  side: z.enum(["buy", "sell"]),
  triggerDirection: z.enum(["up", "down"]).optional(),
  px: z.number().positive(),
  sz: z.number().positive(),
  createdAt: z.number(),
})

const cacheSchema = z.object({
  rows: z.array(levelSchema).max(KEEP_AT_MOST),
})

export type WatchedCache = z.infer<typeof cacheSchema>
export type WatchedLevel = z.infer<typeof levelSchema>

/** One waiting order, cut down to what the tab draws and the cache keeps. */
export function toWatchedLevel(order: TradeOrder): WatchedLevel {
  return {
    id: order.id,
    walletId: order.walletId,
    marketKey: order.marketKey,
    side: order.side,
    triggerDirection: order.triggerDirection,
    px: order.px,
    sz: order.sz,
    createdAt: order.createdAt,
  }
}

function storageKey(scope: string): string {
  return `${KEY}-${scope}`
}

/**
 * What this browser last saw, or null when there is nothing to go on.
 *
 * Anything that will not parse is dropped rather than patched: a blob written
 * by an older build is not worth guessing at, and one bad row must not stop
 * the tab drawing. Every read is wrapped, because a browser with storage
 * switched off throws on the very first call rather than answering null.
 */
export function readWatchedCache(scope: string): WatchedCache | null {
  try {
    const stored = window.localStorage.getItem(storageKey(scope))
    if (stored === null) return null
    const parsed = cacheSchema.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Keeps the newest levels, newest first — unless the same thing is already
 * stored, in which case nothing is written.
 *
 * **The skip is the point.** The read lands every four seconds and hands back
 * a fresh array every time, almost always saying exactly what it said before.
 * Deciding here rather than in the caller means the caller can hand over its
 * rows whenever they arrive, without keeping a note of what it wrote last.
 *
 * Storage that is full or switched off is not a failure worth telling anybody
 * about: the tab simply opens on its spinner the way it did before any of this
 * existed.
 */
export function writeWatchedCache(
  scope: string,
  orders: readonly TradeOrder[]
): void {
  try {
    const rows = [...orders]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, KEEP_AT_MOST)
      .map(toWatchedLevel)
    const blob = JSON.stringify({ rows } satisfies WatchedCache)
    const key = storageKey(scope)
    if (window.localStorage.getItem(key) === blob) return
    window.localStorage.setItem(key, blob)
  } catch {
    // See above.
  }
}
