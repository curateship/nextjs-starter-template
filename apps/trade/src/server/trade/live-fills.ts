import { and, desc, eq, gt, inArray, like, lt, sql } from "drizzle-orm"

import {
  marketChartHref,
  marketKey,
  parseMarketKey,
  type WalletOrderFill,
  type WalletPortfolio,
} from "@/lib/protocols/contracts"
import {
  buildLiveTrades,
  fillsOutsideTrades,
  journalPageCursor,
  journalTradePageCursor,
  type LiveFill,
  type LiveTrade,
  type LiveTriggerKind,
  type LiveTriggerRecord,
} from "@/lib/trade/live-trades"
import { liveRefusalKey, type LiveRefusal } from "@/lib/trade/live"
import type { TradeSide } from "@/lib/trade/paper"
import {
  fillNoticeWords,
  triggerNoticeWords,
} from "@/lib/trade/trade-notice-words"
import type { TradeWallet } from "@/lib/trade/wallets"
import { writeTradeNotice } from "@/server/trade/notices"
import { scrubSecrets } from "@/server/protocols/scrub"
import { OVERRODE_PREFIX, overrodeNames } from "@/lib/trade/trading-rules"
import { db } from "@/server/db"
import {
  getProtocol,
  ordersOf,
  pricesEverySale,
} from "@/server/protocols/registry"
import { stampGridFills } from "@/server/trade/grid-fills"
import {
  bumpTradeHistory,
  tradeHistoryStamp,
} from "@/server/trade/history-version"
import {
  tradeLiveFills,
  tradeLiveJournal,
  tradeLiveTriggers,
} from "@/server/trade/schema"
import { recordEngineError } from "@/server/trade/engine-errors"

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
 * The same sweep when nobody has the Journal on screen.
 *
 * **Not "never".** The Journal is only DRAWN when it is open, but the record
 * behind it is what sends the bell notice — a stop that fires at three in the
 * morning has to be written down whether or not a tab is showing, or the
 * notice never arrives and the row appears whenever somebody next looks. The
 * engine covers this for wallets running ladders and only those, so a plain
 * wallet holding one position has nothing else keeping its record.
 *
 * Two minutes rather than thirty seconds: four times less traffic, which is
 * the point on a venue allowing sixty requests a minute, while a fill is
 * still written down and announced within a couple of minutes of happening.
 */
const UNWATCHED_SWEEP_EVERY_MS = 120_000

/**
 * How long this wallet waits between reads of its trade history.
 *
 * Its own function so the rule can be pinned by a test: **unwatched means
 * slower, never off.** Turning it off is the tempting simplification and it
 * silently breaks the bell notice for a stop that fires overnight on a wallet
 * with no ladder — the engine only keeps the record for wallets running
 * orders.
 */
export function sweepWaitMs(watched: boolean): number {
  return watched ? SWEEP_EVERY_MS : UNWATCHED_SWEEP_EVERY_MS
}

/**
 * Let the next read sweep straight away, whatever the clock says.
 *
 * **The wait above is for idle polling, not for something just done.** After
 * a close, the Journal row is built from the fill the close made — so with
 * the ordinary wait in the way, the trade appeared up to half a minute later
 * and looked like it had not been recorded at all. Anything that has just
 * made a fill says so here, and the read that follows it picks the fill up.
 */
export function sweepSoon(userId: string, walletId: string): void {
  const key = `${userId}:${walletId}`
  sweptAt.delete(key)
  waitedFor.add(key)
}

/** Wallets whose next read should WAIT for the sweep rather than pass it by. */
const waitedFor = new Set<string>()

/**
 * Whether this read should wait for the sweep before answering.
 *
 * True exactly once, for a wallet that has just made a fill. Every other read
 * carries on past the sweep as it always has — waiting on all of them is what
 * made the whole panel sit on a spinner while an exchange was asked about
 * months of old trades nobody was looking at.
 */
/** The same question without spending the answer — see `loadLivePortfolio`. */
export function sweepWouldBeWaitedFor(
  userId: string,
  walletId: string
): boolean {
  return waitedFor.has(`${userId}:${walletId}`)
}

export function sweepIsWaitedFor(userId: string, walletId: string): boolean {
  const key = `${userId}:${walletId}`
  if (!waitedFor.has(key)) return false
  waitedFor.delete(key)
  return true
}

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

/**
 * How old a fill may be and still get a bell notice. Anything older is
 * catch-up — a first sweep, a long reconnect — and belongs in the Journal, not
 * in the bell. Comfortably wider than the sweep's own pacing, so a fill made
 * while nobody was reading is still announced by the read that finds it.
 */
const ANNOUNCED_IF_NEWER_MS = 15 * 60_000

/** Keeps a catch-up batch below the database's parameter limit. */
const NOTICE_LOOKUP_CHUNK = 500

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
  portfolio: WalletPortfolio,
  /** Decrypts on demand, for venues whose history needs the key. */
  credential: () => string | null,
  /** Whether the Journal is on screen. False only slows this down. */
  watched = true,
  /** A fill just happened in Trade, so idle history limits must not hide it. */
  force = false
): Promise<void> {
  try {
    await recordTriggers(userId, wallet, portfolio)
    if (!wallet.address) return

    const orders = ordersOf(getProtocol(wallet.protocol))
    orders.watchFills?.(
      wallet.network,
      wallet.address,
      `${userId}:${wallet.id}`,
      credential,
      (fill) => {
        void recordLiveFills(userId, wallet, [fill])
      }
    )

    const walletKey = `${userId}:${wallet.id}`
    const now = Date.now()
    const last = sweptAt.get(walletKey) ?? 0
    const pushedRecovery = force
      ? true
      : orders.fillsNeedRecovery?.(wallet.network, wallet.address, credential)
    /**
     * How long this wallet waits between reads. Nobody looking at the Journal
     * makes it four times longer, never infinite — see
     * `UNWATCHED_SWEEP_EVERY_MS` for why the record still has to be kept.
     */
    const every = sweepWaitMs(watched)
    // A healthy pushed venue skips this read until its recovery flag asks for
    // one. The ordinary clock still limits that recovery read, so a dead
    // socket cannot turn the engine's one-second pass into a one-second poll.
    if (!force && orders.watchFills && !pushedRecovery) return
    // A dead pushed feed falls back to the same polling clock the venue used
    // before it had a feed. Without this check a socket outage turns the
    // engine's one-second pass into a one-second history poll, precisely when
    // the exchange is already unhealthy.
    if (!force && now - last < every) return
    sweptAt.set(walletKey, now)

    await resolveClosingOrders(userId, wallet, credential)

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

    const fills = await orders.fills(
      wallet.network,
      wallet.address,
      since > 0 ? Math.max(0, since - OVERLAP_MS) : 0,
      credential,
      force ? "order" : "background"
    )
    await recordLiveFills(userId, wallet, fills)
  } catch (error) {
    // Loud, because a silent gap here is a Journal that quietly stops growing.
    recordEngineError("live-fills", "trade_live_fills sweep failed", error)
  }
}

/** The one idempotent storage path used by pushed fills and recovery reads. */
export async function recordLiveFills(
  userId: string,
  wallet: TradeWallet,
  fills: readonly WalletOrderFill[]
): Promise<void> {
  if (fills.length === 0) return
  try {
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
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
            side: fill.side as TradeSide,
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
        // Which rows were actually NEW — the whole answer to "who gets told".
        // A recovery read re-inserting a month of history conflicts on every
        // row, returns nothing here, and announces nothing. And when the web
        // container and the engine both receive the same pushed fill, only the
        // one whose insert went in tells the person.
        .returning({ fillId: tradeLiveFills.fillId })
      const insertedIds = new Set(rows.map((row) => row.fillId))
      let enriched = false
      // KuCoin can publish the execution before its closed-position history
      // has the final money. Find only the earlier rows that still say $0, so
      // a recovery batch does not issue one update for every old close it
      // contains.
      const enrichable = new Map(
        fills
          .filter(
            (fill) => !insertedIds.has(fill.fillId) && fill.closedPnl !== 0
          )
          .map((fill) => [fill.fillId, fill])
      )
      const zeroIds = new Set<string>()
      const enrichableIds = [...enrichable.keys()]
      for (
        let offset = 0;
        offset < enrichableIds.length;
        offset += NOTICE_LOOKUP_CHUNK
      ) {
        const chunk = enrichableIds.slice(offset, offset + NOTICE_LOOKUP_CHUNK)
        const found = await tx
          .select({ fillId: tradeLiveFills.fillId })
          .from(tradeLiveFills)
          .where(
            and(
              eq(tradeLiveFills.userId, userId),
              eq(tradeLiveFills.walletId, wallet.id),
              inArray(tradeLiveFills.fillId, chunk),
              eq(tradeLiveFills.closedPnl, 0)
            )
          )
        for (const row of found) zeroIds.add(row.fillId)
      }
      for (const fillId of zeroIds) {
        const fill = enrichable.get(fillId)
        if (!fill) continue
        // The first row already sent the immediate notice. Recovery updates
        // only the money, so an ordinary duplicate remains unchanged.
        const changed = await tx
          .update(tradeLiveFills)
          .set({ closedPnl: fill.closedPnl })
          .where(
            and(
              eq(tradeLiveFills.userId, userId),
              eq(tradeLiveFills.walletId, wallet.id),
              eq(tradeLiveFills.fillId, fillId),
              eq(tradeLiveFills.closedPnl, 0)
            )
          )
          .returning({ fillId: tradeLiveFills.fillId })
        if (changed.length > 0) enriched = true
      }
      if (rows.length > 0 || enriched) {
        await bumpTradeHistory(tx, userId, [wallet.id])
      }
      return rows
    })
    const insertedIds = new Set(inserted.map((row) => row.fillId))
    await announceFills(
      userId,
      wallet,
      fills.filter((fill) => insertedIds.has(fill.fillId))
    )
  } catch (error) {
    recordEngineError("live-fills", "trade_live_fills write failed", error)
  }
}

/**
 * One bell notice per fresh order execution, and a second one straight away
 * when the execution came from a stop or a target this app already knew about.
 *
 * The known-trigger case is the common one — `recordTriggers` writes a stop
 * down while it rests on the position, long before it fires. A stop this app
 * never saw resting is learnt later by `resolveClosingOrders`, which sends the
 * same second notice then.
 *
 * Never throws. A notice that cannot be written is a log line, not a reason
 * for the fill sweep — or the trading pass driving it — to stop.
 */
async function announceFills(
  userId: string,
  wallet: TradeWallet,
  fresh: readonly WalletOrderFill[]
): Promise<void> {
  const cutoff = Date.now() - ANNOUNCED_IF_NEWER_MS
  // News, not history. A wallet's FIRST sweep writes months of old fills as
  // brand-new rows, and every one of them would pass the "was it inserted"
  // test — a bell with three hundred notices about last spring. Only a fill
  // made just now is worth a notice.
  const recent = groupFillNoticePieces(
    fresh.filter((fill) => fill.at >= cutoff)
  )
  const knownByOrder = await triggerRowsByOrder(
    userId,
    wallet.id,
    recent.flatMap((fill) =>
      fill.closedPnl !== 0 && !fill.liquidation ? [fill.orderId] : []
    )
  )

  for (const fill of recent) {
    const key = marketKey({
      protocol: wallet.protocol,
      network: wallet.network,
      marketId: fill.marketId,
    })
    const practice = wallet.network !== "mainnet"
    try {
      await writeTradeNotice({
        userId,
        href: marketChartHref(key),
        soundKind: "fill",
        ...fillNoticeWords({
          marketKey: key,
          side: fill.side,
          px: fill.px,
          sz: fill.sz,
          closedPnl: fill.closedPnl,
          dir: fill.dir,
          entryPx: averageEntryOf(wallet.protocol, fill),
          liquidation: fill.liquidation,
          walletLabel: wallet.label,
          practice,
        }),
      })
      if (fill.closedPnl === 0 || fill.liquidation) continue
      const known = knownByOrder.get(fill.orderId)
      if (!known || (known.kind !== "stop" && known.kind !== "target")) continue
      await writeTradeNotice({
        userId,
        href: marketChartHref(key),
        soundKind: "stop",
        ...triggerNoticeWords({
          kind: known.kind,
          marketKey: key,
          side: fill.side,
          px: fill.px,
          closedPnl: fill.closedPnl,
          walletLabel: wallet.label,
          practice,
        }),
      })
    } catch (error) {
      recordEngineError("live-fills", "trade fill notice failed", error)
    }
  }
}

/**
 * Add the pieces of one immediate order execution before the bell speaks.
 *
 * Exchanges record one trade for every price level an order meets. KuCoin in
 * particular can return several rows for one click, a few milliseconds apart.
 * Those rows stay separate in the Journal, but the bell describes the order
 * once at its size-weighted average price. A resting order that fills again
 * later still gets another notice, because that is new money moving later.
 */
function groupFillNoticePieces(
  fills: readonly WalletOrderFill[]
): WalletOrderFill[] {
  const grouped: WalletOrderFill[] = []
  const openByOrder = new Map<string, number>()

  for (const fill of [...fills].sort(
    (left, right) =>
      left.at - right.at || left.fillId.localeCompare(right.fillId)
  )) {
    const key = fill.orderId
      ? `${fill.marketId}\u0000${fill.side}\u0000${fill.orderId}`
      : null
    const index = key === null ? undefined : openByOrder.get(key)
    const open = index === undefined ? undefined : grouped[index]

    if (open && index !== undefined && fill.at - open.at <= 1_000) {
      const sz = open.sz + fill.sz
      grouped[index] = {
        ...open,
        px: sz > 0 ? (open.px * open.sz + fill.px * fill.sz) / sz : open.px,
        sz,
        closedPnl: open.closedPnl + fill.closedPnl,
        fee: open.fee + fill.fee,
        liquidation: open.liquidation || fill.liquidation,
      }
      continue
    }

    grouped.push({ ...fill })
    if (key !== null) openByOrder.set(key, grouped.length - 1)
  }

  return grouped
}

/**
 * The average entry the exchange measured a close against, worked back from
 * its own two numbers: a long banks (sale price − entry) × size, a short banks
 * (entry − buy-back price) × size, so the entry is the price less or plus the
 * money per coin.
 *
 * **Null on an exchange that does not price every sale.** The arithmetic only
 * holds when the money belongs to the very fill it sits on. KuCoin and
 * Lighter pay out the whole position's figure and land it on one fill, so an
 * entry worked back from it would be a number nobody can check.
 *
 * Asked of the exchange's own entry rather than by name. Which venues those
 * are is the exchange's fact, written once beside it, and
 * `fence.test.ts` fails any shared file that asks which exchange it holds.
 */
function averageEntryOf(
  protocol: TradeWallet["protocol"],
  fill: Pick<WalletOrderFill, "side" | "px" | "sz" | "closedPnl">
): number | null {
  if (!pricesEverySale(protocol) || fill.sz <= 0 || fill.closedPnl === 0) {
    return null
  }
  const perCoin = fill.closedPnl / fill.sz
  const entry = fill.side === "sell" ? fill.px - perCoin : fill.px + perCoin
  return Number.isFinite(entry) && entry > 0 ? entry : null
}

type TriggerNoticeRow = {
  orderId: string
  kind: LiveTriggerRecord
}

async function triggerRowsByOrder(
  userId: string,
  walletId: string,
  orderIds: readonly string[]
): Promise<Map<string, TriggerNoticeRow>> {
  const unique = [...new Set(orderIds)]
  const found = new Map<string, TriggerNoticeRow>()
  for (let index = 0; index < unique.length; index += NOTICE_LOOKUP_CHUNK) {
    const chunk = unique.slice(index, index + NOTICE_LOOKUP_CHUNK)
    try {
      const rows = await db
        .select({
          orderId: tradeLiveTriggers.orderId,
          kind: tradeLiveTriggers.kind,
        })
        .from(tradeLiveTriggers)
        .where(
          and(
            eq(tradeLiveTriggers.userId, userId),
            eq(tradeLiveTriggers.walletId, walletId),
            inArray(tradeLiveTriggers.orderId, chunk)
          )
        )
      for (const row of rows) found.set(row.orderId, row)
    } catch (error) {
      recordEngineError("live-fills", "trade fill trigger read failed", error)
    }
  }
  return found
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
  wallet: TradeWallet,
  credential: () => string | null
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
    const marketId = parseMarketKey(one.marketKey)?.marketId ?? ""
    const info = await ask(
      wallet.network,
      wallet.address,
      one.orderId,
      marketId,
      credential
    )
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

  const learnt = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tradeLiveTriggers)
      .values(rows)
      .onConflictDoNothing()
      .returning({
        orderId: tradeLiveTriggers.orderId,
        kind: tradeLiveTriggers.kind,
      })
    if (inserted.length > 0) {
      await bumpTradeHistory(tx, userId, [wallet.id])
    }
    return inserted
  })

  const learntNotices = learnt.filter(
    (
      one
    ): one is typeof one & {
      kind: "stop" | "target"
    } => one.kind === "stop" || one.kind === "target"
  )
  const madeByOrder = await recentFillsByOrder(
    userId,
    wallet.id,
    learntNotices.map((one) => one.orderId)
  )

  // The fills these orders made were announced without the stop fact, because
  // it was not known yet. Now it is, the second notice goes out — only from
  // the process whose insert actually went in, so two processes learning the
  // same order cannot both say it.
  for (const one of learntNotices) {
    try {
      const made = madeByOrder.get(one.orderId) ?? []
      if (made.length === 0) continue
      await writeTradeNotice({
        userId,
        href: marketChartHref(made[0].marketKey),
        soundKind: "stop",
        ...triggerNoticeWords({
          kind: one.kind,
          marketKey: made[0].marketKey,
          side: made[0].side,
          px: made[0].px,
          // One order can close in several fills; the person cares what the
          // whole order banked, not each slice.
          closedPnl: made.reduce((sum, fill) => sum + fill.closedPnl, 0),
          walletLabel: wallet.label,
          practice: wallet.network !== "mainnet",
        }),
      })
    } catch (error) {
      recordEngineError("live-fills", "trade trigger notice failed", error)
    }
  }
}

type RecentFillNoticeRow = {
  orderId: string
  marketKey: string
  side: TradeSide
  px: number
  closedPnl: number
}

async function recentFillsByOrder(
  userId: string,
  walletId: string,
  orderIds: readonly string[]
): Promise<Map<string, RecentFillNoticeRow[]>> {
  const unique = [...new Set(orderIds)]
  const found = new Map<string, RecentFillNoticeRow[]>()
  for (let index = 0; index < unique.length; index += NOTICE_LOOKUP_CHUNK) {
    const chunk = unique.slice(index, index + NOTICE_LOOKUP_CHUNK)
    try {
      const rows = await db
        .select({
          orderId: tradeLiveFills.orderId,
          marketKey: tradeLiveFills.marketKey,
          side: tradeLiveFills.side,
          px: tradeLiveFills.px,
          closedPnl: tradeLiveFills.closedPnl,
        })
        .from(tradeLiveFills)
        .where(
          and(
            eq(tradeLiveFills.userId, userId),
            eq(tradeLiveFills.walletId, walletId),
            inArray(tradeLiveFills.orderId, chunk),
            // News, not history — this path also catches up on stops from
            // months ago, and those belong in the Journal, not the bell.
            gt(tradeLiveFills.at, Date.now() - ANNOUNCED_IF_NEWER_MS)
          )
        )
      for (const row of rows) {
        const orderFills = found.get(row.orderId)
        if (orderFills) orderFills.push(row)
        else found.set(row.orderId, [row])
      }
    } catch (error) {
      recordEngineError("live-fills", "trade trigger fill read failed", error)
    }
  }
  return found
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
      ...position.targets.map(
        (target): [string | null, number | null, LiveTriggerKind] => [
          target.orderId,
          target.px,
          "target",
        ]
      ),
    ]
    for (const [orderId, px, kind] of legs) {
      if (!orderId || px === null) continue
      const memo = `${userId}:${wallet.id}:${orderId}`
      if (writtenTriggers.has(memo)) continue
      if (writtenTriggers.size >= MAX_REMEMBERED_TRIGGERS)
        writtenTriggers.clear()
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
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tradeLiveTriggers)
      .values(rows)
      .onConflictDoNothing()
      .returning({ orderId: tradeLiveTriggers.orderId })
    if (inserted.length > 0) {
      await bumpTradeHistory(tx, userId, [wallet.id])
    }
  })
}

/**
 * Every finished real trade this person has, newest first.
 *
 * Read whole and paired in memory rather than in SQL: "flat to flat" is a walk
 * along a wallet's fills in order, which is a loop, not a query — and the loop
 * is `buildLiveTrades`, which is tested on its own and knows nothing about a
 * database.
 */
/**
 * How far back a refusal is still worth showing. A market refused this morning
 * and quietly working since is not news; the question this answers is "why is
 * nothing happening RIGHT NOW".
 */
const REFUSAL_SHOWN_FOR_MS = 6 * 60 * 60_000

/** Read cheaply: the newest few, then thinned to one per market in memory. */
const MAX_REFUSAL_ROWS = 200

/**
 * The last refusal in each wallet and market, newest first.
 *
 * **One per wallet and market, not all of them.** A full market refuses every
 * retry, so the honest reading of twenty identical rows is one fact — "this
 * market is refusing" — and twenty lines on screen would bury the other
 * markets. The newest carries the reason, and the count of how often is not
 * something a person can act on.
 *
 * Latest-per-market is done in memory rather than in SQL on purpose: it is a
 * handful of rows either way, and `distinct on` here would be a raw fragment
 * with unqualified column names, which this codebase has been bitten by.
 */
export async function loadLiveRefusals(
  userId: string,
  walletIds: readonly string[]
): Promise<LiveRefusal[]> {
  if (walletIds.length === 0) return []
  const rows = await db
    .select({
      walletId: tradeLiveJournal.walletId,
      marketKey: tradeLiveJournal.marketKey,
      note: tradeLiveJournal.note,
      createdAt: tradeLiveJournal.createdAt,
    })
    .from(tradeLiveJournal)
    .where(
      and(
        eq(tradeLiveJournal.userId, userId),
        inArray(tradeLiveJournal.walletId, [...walletIds]),
        eq(tradeLiveJournal.action, "refused"),
        gt(
          tradeLiveJournal.createdAt,
          new Date(Date.now() - REFUSAL_SHOWN_FOR_MS)
        )
      )
    )
    .orderBy(desc(tradeLiveJournal.createdAt))
    .limit(MAX_REFUSAL_ROWS)

  const newest = new Map<string, LiveRefusal>()
  for (const row of rows) {
    // Rows arrive newest first, so the first one seen for a wallet and market
    // is the one to keep.
    const key = liveRefusalKey(row.walletId, row.marketKey)
    if (newest.has(key)) continue
    // A refusal with nothing written on it explains nothing, and an empty
    // line under a level reads as a fault of its own.
    if (!row.note) continue
    newest.set(key, {
      walletId: row.walletId,
      marketKey: row.marketKey,
      // **Scrubbed again on the way out.** Everything written here has been
      // through the scrubber once, but `refuse()` journals whatever an error
      // happened to say, and an unexpected exception carries whatever was in
      // scope when it was thrown. That was tolerable while these rows only
      // ever sat in a table nobody read; now they are drawn on a page and
      // put in a tooltip, so they go through it a second time. It costs one
      // regex on a handful of rows.
      note: scrubSecrets(row.note),
      at: row.createdAt.getTime(),
    })
  }
  return [...newest.values()]
}

/**
 * A short string that changes when `loadLiveHistory` would answer
 * differently: a fill arriving, one being binned, or a trigger being learnt
 * (which changes how a trade says it ended). Writers maintain the wallet's
 * version, so the poll reads only the selected wallet rows.
 */
export async function liveHistoryStamp(
  userId: string,
  walletIds: readonly string[]
): Promise<string> {
  return tradeHistoryStamp(userId, walletIds)
}

/**
 * The history, or `null` when it is exactly what the caller holds — judged
 * by the stamp above, which comes back either way for next time.
 */
export async function loadLiveHistoryIfChanged(
  userId: string,
  walletIds: readonly string[],
  knownStamp: string | undefined
): Promise<{
  history: Awaited<ReturnType<typeof loadLiveHistory>> | null
  stamp: string
}> {
  const stamp = await liveHistoryStamp(userId, walletIds)
  if (knownStamp !== undefined && knownStamp === stamp) {
    return { history: null, stamp }
  }
  return { history: await loadLiveHistory(userId, walletIds), stamp }
}

export async function loadLiveHistory(
  userId: string,
  walletIds: readonly string[],
  before?: number,
  marketKeys?: readonly string[]
): Promise<{
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
}> {
  if (walletIds.length === 0 || marketKeys?.length === 0) {
    return { fills: [], trades: [], nextBefore: null }
  }

  const fillRows = await db
    .select()
    .from(tradeLiveFills)
    .where(
      and(
        eq(tradeLiveFills.userId, userId),
        inArray(tradeLiveFills.walletId, [...walletIds]),
        marketKeys
          ? inArray(tradeLiveFills.marketKey, [...marketKeys])
          : undefined,
        eq(tradeLiveFills.hidden, false),
        before === undefined ? undefined : lt(tradeLiveFills.at, before)
      )
    )
    .orderBy(desc(tradeLiveFills.at))
    .limit(MAX_FILLS)
  const orderIds = [...new Set(fillRows.map((row) => row.orderId))]
  const triggerRows =
    orderIds.length === 0
      ? []
      : await db
          .select()
          .from(tradeLiveTriggers)
          .where(
            and(
              eq(tradeLiveTriggers.userId, userId),
              inArray(tradeLiveTriggers.walletId, [...walletIds]),
              inArray(tradeLiveTriggers.orderId, orderIds)
            )
          )

  const raw: LiveFill[] = fillRows.map((row) => ({
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
  // Which of these a grid level made, before anything reads them. The arrows
  // and the Journal both ask, and a fill that arrived unstamped is read as a
  // ladder's. See `stampGridFills`.
  const fills = await stampGridFills(userId, walletIds, raw)

  // "none" rows are answers, not triggers: they are there so the exchange is
  // never asked twice, and a trade they belong to simply says "Closed".
  const triggers = new Map(
    triggerRows
      .filter(
        (row): row is typeof row & { kind: LiveTriggerKind } =>
          row.kind === "stop" || row.kind === "target"
      )
      .map((row) => [
        row.orderId,
        { kind: row.kind, px: row.px > 0 ? row.px : null },
      ])
  )

  const allTrades = buildLiveTrades(fills, triggers)
  await attachOverrides(userId, walletIds, allTrades)
  const trades = allTrades.slice(0, MAX_TRADES)
  const cappedBefore =
    allTrades.length > trades.length ? journalTradePageCursor(trades) : null
  return {
    fills: fillsOutsideTrades(fills, allTrades),
    trades,
    nextBefore:
      cappedBefore ??
      (before !== undefined && fillRows.length < MAX_FILLS
        ? null
        : journalPageCursor(fills, allTrades)),
  }
}

/** Override rows older than this are not looked for. */
const OVERRIDE_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000
const MAX_OVERRIDE_ROWS = 500

/**
 * Puts each "Overrode: …" Journal row on the trade its entry became part of.
 *
 * The row is written when the entry is confirmed, which is before its fill:
 * a resting order or a ladder's rung can wait a long while. So a row belongs
 * to the earliest trade on the same wallet and coin that had a fill at or
 * after the row was written — the trade that was open when the order filled,
 * or the one it opened. An entry that was confirmed and then cancelled
 * without filling leaves its row on the next trade of that coin instead;
 * saying it once too often is the safe side.
 */
async function attachOverrides(
  userId: string,
  walletIds: readonly string[],
  trades: LiveTrade[]
): Promise<void> {
  if (trades.length === 0) return
  const rows = await db
    .select({
      walletId: tradeLiveJournal.walletId,
      marketKey: tradeLiveJournal.marketKey,
      note: tradeLiveJournal.note,
      createdAt: tradeLiveJournal.createdAt,
    })
    .from(tradeLiveJournal)
    .where(
      and(
        eq(tradeLiveJournal.userId, userId),
        inArray(tradeLiveJournal.walletId, [...walletIds]),
        like(tradeLiveJournal.note, `${OVERRODE_PREFIX}%`),
        gt(
          tradeLiveJournal.createdAt,
          new Date(Date.now() - OVERRIDE_LOOKBACK_MS)
        )
      )
    )
    .orderBy(desc(tradeLiveJournal.createdAt))
    .limit(MAX_OVERRIDE_ROWS)
  if (rows.length === 0) return

  const byMarket = new Map<string, LiveTrade[]>()
  for (const trade of trades) {
    const key = `${trade.walletId} ${trade.marketKey}`
    const list = byMarket.get(key)
    if (list) list.push(trade)
    else byMarket.set(key, [trade])
  }
  for (const list of byMarket.values()) {
    list.sort((left, right) => left.openedAt - right.openedAt)
  }

  for (const row of rows) {
    const names = overrodeNames(row.note)
    if (!names || names.length === 0) continue
    const at = row.createdAt.getTime()
    const list = byMarket.get(`${row.walletId} ${row.marketKey}`)
    const trade = list?.find((one) => one.closedAt >= at)
    if (!trade) continue
    const held = new Set(trade.overrode ?? [])
    for (const name of names) held.add(name)
    trade.overrode = [...held]
  }
}

export function loadLiveHistoryBefore(
  userId: string,
  walletIds: readonly string[],
  before: number
) {
  return loadLiveHistory(userId, walletIds, before)
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
  await db.transaction(async (tx) => {
    const hidden = await tx
      .update(tradeLiveFills)
      .set({ hidden: true })
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          eq(tradeLiveFills.walletId, walletId),
          inArray(tradeLiveFills.fillId, [...fillIds]),
          eq(tradeLiveFills.hidden, false)
        )
      )
      .returning({ fillId: tradeLiveFills.fillId })
    if (hidden.length > 0) await bumpTradeHistory(tx, userId, [walletId])
  })
}
