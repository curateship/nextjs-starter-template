import { and, desc, eq, inArray, sql } from "drizzle-orm"

import {
  marketKey,
  type WalletPortfolio,
} from "@/lib/protocols/contracts"
import {
  buildLiveTrades,
  fillsOutsideTrades,
  type LiveFill,
  type LiveTrade,
  type LiveTriggerKind,
  type LiveTriggerRecord,
} from "@/lib/trade/live-trades"
import type { PaperSide } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import { tradeLiveFills, tradeLiveTriggers } from "@/server/trade/schema"

/**
 * The real trading history, kept.
 *
 * The exchange is the only thing that knows what a trade actually made, and it
 * only knows for as long as it feels like keeping the fill. So the fills are
 * copied here as they appear, and the Journal is built from the copy — which
 * also means a trade placed from the exchange's own site, or a stop that fired
 * at three in the morning, is in the record exactly like one this app placed.
 *
 * The sweep rides along with the poll that already asks every live wallet what
 * it holds. That is deliberate: it needs no worker of its own, and it means
 * the history catches up the moment the app is opened rather than only while
 * somebody is watching. Nothing here can take the poll down — a wallet the
 * exchange will not answer for simply keeps yesterday's history.
 */

/** No point asking the exchange for new fills more often than this. */
const SWEEP_EVERY_MS = 30_000

/**
 * A minute of overlap on every sweep after the first. A fill that lands
 * between two passes must not fall down the gap, and re-reading one is free:
 * the fill's own id is part of the primary key.
 */
const OVERLAP_MS = 60_000

/** How many finished trades the tab reads back. */
const MAX_TRADES = 500

/**
 * How many fills are read to build them.
 *
 * Bounded because this runs on the poll, every few seconds, against a database
 * that is a long way off — an account two years old must not make the panel
 * slower every week. The newest are kept, which is the end of the list the tab
 * shows anyway, and a trade cut in half by the limit is dropped rather than
 * half-drawn: its closing fill says "Close" and `buildLiveTrades` leaves those
 * alone when nothing is held.
 */
const MAX_FILLS = 4_000

/**
 * The trigger memo is a cache, not a record — the row in the database is the
 * record. Emptied when it gets silly so a server that has been up for months
 * does not hold every stop anybody ever set.
 */
const MAX_REMEMBERED_TRIGGERS = 5_000

/** How many old closing orders are looked up per sweep. See `resolveClosingOrders`. */
const MAX_LOOKUPS = 8

/** When each wallet was last asked, so a four-second poll does not. */
const sweptAt = new Map<string, number>()

/**
 * Trigger orders already written this run. The poll sees the same waiting stop
 * every few seconds for as long as the position is open; without this it would
 * write a row that conflicts and does nothing, several times a minute, forever.
 */
const writtenTriggers = new Set<string>()

/**
 * One live wallet's new fills, and whatever protection is sitting on its
 * positions right now.
 *
 * Never throws. This is bookkeeping hung off a read that has to keep working:
 * a failed sweep means the Journal is a few minutes behind, and a failed poll
 * means the screen goes blank.
 */
export async function sweepLiveFills(
  userId: string,
  wallet: TradeWallet,
  portfolio: WalletPortfolio
): Promise<void> {
  try {
    await recordTriggers(userId, wallet, portfolio)
    if (!wallet.address) return

    const walletKey = `${userId}:${wallet.id}`
    const now = Date.now()
    const last = sweptAt.get(walletKey) ?? 0
    if (now - last < SWEEP_EVERY_MS) return
    sweptAt.set(walletKey, now)

    await resolveClosingOrders(userId, wallet)

    const seen = await db
      .select({ at: sql<number>`coalesce(max(${tradeLiveFills.at}), 0)` })
      .from(tradeLiveFills)
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          eq(tradeLiveFills.walletId, wallet.id)
        )
      )
    // From scratch the first time — the exchange caps how far back it will go
    // on its own, and everything it still has is worth having.
    const since = Number(seen[0]?.at ?? 0)

    const fills = await ordersOf(getProtocol(wallet.protocol)).fills(
      wallet.network,
      wallet.address,
      since > 0 ? Math.max(0, since - OVERLAP_MS) : 0
    )
    if (fills.length === 0) return

    await db
      .insert(tradeLiveFills)
      .values(
        fills.map((fill) => ({
          userId,
          walletId: wallet.id,
          fillId: fill.fillId,
          orderId: fill.orderId,
          marketKey: marketKey({
            protocol: wallet.protocol,
            network: wallet.network,
            marketId: fill.marketId,
          }),
          side: fill.side as PaperSide,
          px: fill.px,
          sz: fill.sz,
          at: fill.at,
          closedPnl: fill.closedPnl,
          fee: fill.fee,
          dir: fill.dir.slice(0, 24),
          liquidation: fill.liquidation,
        }))
      )
      .onConflictDoNothing()
  } catch (error) {
    // Loud, because a silent gap here is a Journal that quietly stops growing.
    console.error("trade_live_fills sweep failed", error)
  }
}

/**
 * Asks the exchange what the orders that CLOSED things actually were.
 *
 * Watching for stops as they sit on a position only works from the day the
 * watching started, and it never sees a stop that moved up behind a winning
 * trade and fired before anybody looked. The exchange, though, still remembers
 * every order — so for any closing fill whose order is a mystery, it is simply
 * asked, and the answer is written down for good. That is what lets a trade
 * from months ago say "Stopped out" rather than a shrug.
 *
 * "It was not a trigger" is recorded too. Otherwise every ordinary close would
 * be asked about again on every sweep, forever.
 *
 * A handful per pass, oldest first. The exchange rations requests and this is
 * catching up on history — being finished in ten minutes rather than one is
 * not worth spending the ration on.
 */
async function resolveClosingOrders(
  userId: string,
  wallet: TradeWallet
): Promise<void> {
  if (!wallet.address) return

  const unknown = await db
    .select({
      orderId: tradeLiveFills.orderId,
      marketKey: tradeLiveFills.marketKey,
    })
    .from(tradeLiveFills)
    .where(
      and(
        eq(tradeLiveFills.userId, userId),
        eq(tradeLiveFills.walletId, wallet.id),
        // Only fills that closed something. Asking about entries would double
        // the requests to answer a question nobody has about them.
        sql`${tradeLiveFills.closedPnl} <> 0`,
        sql`not exists (
          select 1 from ${tradeLiveTriggers} t
          where t.user_id = ${tradeLiveFills.userId}
            and t.wallet_id = ${tradeLiveFills.walletId}
            and t.order_id = ${tradeLiveFills.orderId}
        )`
      )
    )
    .groupBy(tradeLiveFills.orderId, tradeLiveFills.marketKey)
    .orderBy(tradeLiveFills.orderId)
    .limit(MAX_LOOKUPS)

  if (unknown.length === 0) return

  const ask = ordersOf(getProtocol(wallet.protocol)).orderInfo
  const rows: Array<{
    userId: string
    walletId: string
    orderId: string
    marketKey: string
    kind: LiveTriggerRecord
    px: number
  }> = []

  for (const one of unknown) {
    const info = await ask(wallet.network, wallet.address, one.orderId)
    rows.push({
      userId,
      walletId: wallet.id,
      orderId: one.orderId,
      marketKey: one.marketKey,
      kind: info.kind,
      // Zero means "it was one, but the price is no longer knowable" — the
      // exchange clears a trigger price once it has fired. The chart draws no
      // line for it rather than a line at nothing.
      px: info.triggerPx ?? 0,
    })
  }

  await db.insert(tradeLiveTriggers).values(rows).onConflictDoNothing()
}

/**
 * The stop and target orders currently riding on this wallet's positions.
 *
 * Written once each and never updated: the row is a record of an order that
 * existed at a price, and a stop moved to a new price is a NEW order with a
 * new id, which gets its own row. That is what makes a fill months later still
 * matchable to the thing that caused it.
 */
async function recordTriggers(
  userId: string,
  wallet: TradeWallet,
  portfolio: WalletPortfolio
): Promise<void> {
  const rows: Array<{
    userId: string
    walletId: string
    orderId: string
    marketKey: string
    kind: LiveTriggerKind
    px: number
  }> = []

  for (const position of portfolio.positions) {
    const key = marketKey({
      protocol: wallet.protocol,
      network: wallet.network,
      marketId: position.marketId,
    })
    const legs: Array<[string | null, number | null, LiveTriggerKind]> = [
      [position.slOrderId, position.slPx, "stop"],
      [position.tpOrderId, position.tpPx, "target"],
    ]
    for (const [orderId, px, kind] of legs) {
      if (!orderId || px === null) continue
      const memo = `${userId}:${wallet.id}:${orderId}`
      if (writtenTriggers.has(memo)) continue
      if (writtenTriggers.size >= MAX_REMEMBERED_TRIGGERS) writtenTriggers.clear()
      writtenTriggers.add(memo)
      rows.push({
        userId,
        walletId: wallet.id,
        orderId,
        marketKey: key,
        kind,
        px,
      })
    }
  }

  if (rows.length === 0) return
  await db.insert(tradeLiveTriggers).values(rows).onConflictDoNothing()
}

/**
 * Every finished real trade this person has, newest first.
 *
 * Read whole and paired in memory rather than in SQL: "flat to flat" is a walk
 * along a wallet's fills in order, which is a loop, not a query — and the loop
 * is `buildLiveTrades`, which is tested on its own and knows nothing about a
 * database.
 */
export async function loadLiveHistory(
  userId: string,
  walletIds: readonly string[]
): Promise<{ fills: LiveFill[]; trades: LiveTrade[] }> {
  if (walletIds.length === 0) return { fills: [], trades: [] }

  const [fillRows, triggerRows] = await Promise.all([
    db
      .select()
      .from(tradeLiveFills)
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          inArray(tradeLiveFills.walletId, [...walletIds]),
          eq(tradeLiveFills.hidden, false)
        )
      )
      .orderBy(desc(tradeLiveFills.at))
      .limit(MAX_FILLS),
    db
      .select()
      .from(tradeLiveTriggers)
      .where(
        and(
          eq(tradeLiveTriggers.userId, userId),
          inArray(tradeLiveTriggers.walletId, [...walletIds])
        )
      ),
  ])

  const fills: LiveFill[] = fillRows.map((row) => ({
    fillId: row.fillId,
    orderId: row.orderId,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    at: Number(row.at),
    closedPnl: row.closedPnl,
    fee: row.fee,
    dir: row.dir,
    liquidation: row.liquidation,
    live: true,
  }))

  // "none" rows are answers, not triggers: they are there so the exchange is
  // never asked twice, and a trade they belong to simply says "Closed".
  const triggers = new Map(
    triggerRows
      .filter((row): row is typeof row & { kind: LiveTriggerKind } =>
        row.kind === "stop" || row.kind === "target"
      )
      .map((row) => [
        row.orderId,
        { kind: row.kind, px: row.px > 0 ? row.px : null },
      ])
  )

  const allTrades = buildLiveTrades(fills, triggers)
  return {
    fills: fillsOutsideTrades(fills, allTrades),
    trades: allTrades.slice(0, MAX_TRADES),
  }
}

/**
 * Takes one finished trade off the Journal, by hiding the fills it was made of.
 *
 * Hidden rather than deleted, because a deleted fill would come straight back:
 * the sweep asks the exchange for everything since the newest fill it holds, so
 * removing the newest ones lowers that mark and the next pass writes them
 * again. Hiding leaves the mark where it is, and the row that comes back
 * conflicts with the one already there and changes nothing.
 *
 * The trade is not stored anywhere — it is worked out from its fills — so
 * hiding them is what makes it go. Scoped by the person, so a request carrying
 * somebody else's fill id can only ever miss.
 */
export async function hideLiveTrade(
  userId: string,
  walletId: string,
  fillIds: readonly string[]
): Promise<void> {
  if (fillIds.length === 0) return
  await db
    .update(tradeLiveFills)
    .set({ hidden: true })
    .where(
      and(
        eq(tradeLiveFills.userId, userId),
        eq(tradeLiveFills.walletId, walletId),
        inArray(tradeLiveFills.fillId, [...fillIds])
      )
    )
}
