import { and, count, desc, eq, gt, inArray, lt, max, sql } from "drizzle-orm"

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
import type { LiveRefusal } from "@/lib/trade/live"
import type { TradeSide } from "@/lib/trade/paper"
import {
  fillNoticeWords,
  triggerNoticeWords,
} from "@/lib/trade/trade-notice-words"
import type { TradeWallet } from "@/lib/trade/wallets"
import { writeTradeNotice } from "@/server/trade/notices"
import { scrubSecrets } from "@/server/protocols/scrub"
import { db } from "@/server/db"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import { stampGridFills } from "@/server/trade/grid-fills"
import {
  tradeLiveFills,
  tradeLiveJournal,
  tradeLiveTriggers,
} from "@/server/trade/schema"

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
export function sweepWouldBeWaitedFor(userId: string, walletId: string): boolean {
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
  credential: () => string | null
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
    const pushedRecovery = orders.fillsNeedRecovery?.(
      wallet.network,
      wallet.address
    )
    if (orders.watchFills && !pushedRecovery) return
    if (!pushedRecovery && now - last < SWEEP_EVERY_MS) return
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
      credential
    )
    await recordLiveFills(userId, wallet, fills)
    orders.fillsRecovered?.(wallet.network, wallet.address)
  } catch (error) {
    // Loud, because a silent gap here is a Journal that quietly stops growing.
    console.error("trade_live_fills sweep failed", error)
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
    const inserted = await db
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
    await announceFills(
      userId,
      wallet,
      fills.filter((fill) =>
        inserted.some((row) => row.fillId === fill.fillId)
      )
    )
  } catch (error) {
    console.error("trade_live_fills write failed", error)
  }
}

/**
 * One bell notice per fresh fill, and a second one straight away when the fill
 * came from a stop or a target this app already knew about.
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
  for (const fill of fresh) {
    // News, not history. A wallet's FIRST sweep writes months of old fills as
    // brand-new rows, and every one of them would pass the "was it inserted"
    // test — a bell with three hundred notices about last spring. Only a fill
    // made just now is worth a notice.
    if (fill.at < cutoff) continue
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
        ...fillNoticeWords({
          marketKey: key,
          side: fill.side,
          px: fill.px,
          sz: fill.sz,
          closedPnl: fill.closedPnl,
          liquidation: fill.liquidation,
          walletLabel: wallet.label,
          practice,
        }),
      })
      if (fill.closedPnl === 0 || fill.liquidation) continue
      const [known] = await db
        .select({ kind: tradeLiveTriggers.kind, px: tradeLiveTriggers.px })
        .from(tradeLiveTriggers)
        .where(
          and(
            eq(tradeLiveTriggers.userId, userId),
            eq(tradeLiveTriggers.walletId, wallet.id),
            eq(tradeLiveTriggers.orderId, fill.orderId)
          )
        )
        .limit(1)
      if (!known || (known.kind !== "stop" && known.kind !== "target")) continue
      await writeTradeNotice({
        userId,
        href: marketChartHref(key),
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
      console.error("trade fill notice failed", error)
    }
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

  const learnt = await db
    .insert(tradeLiveTriggers)
    .values(rows)
    .onConflictDoNothing()
    .returning({
      orderId: tradeLiveTriggers.orderId,
      kind: tradeLiveTriggers.kind,
    })

  // The fills these orders made were announced without the stop fact, because
  // it was not known yet. Now it is, the second notice goes out — only from
  // the process whose insert actually went in, so two processes learning the
  // same order cannot both say it.
  for (const one of learnt) {
    if (one.kind !== "stop" && one.kind !== "target") continue
    try {
      const made = await db
        .select({
          marketKey: tradeLiveFills.marketKey,
          side: tradeLiveFills.side,
          px: tradeLiveFills.px,
          closedPnl: tradeLiveFills.closedPnl,
        })
        .from(tradeLiveFills)
        .where(
          and(
            eq(tradeLiveFills.userId, userId),
            eq(tradeLiveFills.walletId, wallet.id),
            eq(tradeLiveFills.orderId, one.orderId),
            // News, not history — this path also catches up on stops from
            // months ago, and those belong in the Journal, not the bell.
            gt(tradeLiveFills.at, Date.now() - ANNOUNCED_IF_NEWER_MS)
          )
        )
      if (made.length === 0) continue
      await writeTradeNotice({
        userId,
        href: marketChartHref(made[0].marketKey),
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
      console.error("trade trigger notice failed", error)
    }
  }
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
/**
 * How far back a refusal is still worth showing. A market refused this morning
 * and quietly working since is not news; the question this answers is "why is
 * nothing happening RIGHT NOW".
 */
const REFUSAL_SHOWN_FOR_MS = 6 * 60 * 60_000

/** Read cheaply: the newest few, then thinned to one per market in memory. */
const MAX_REFUSAL_ROWS = 200

/**
 * The last refusal on each market, newest first.
 *
 * **One per market, not all of them.** A full market refuses every retry, so
 * the honest reading of twenty identical rows is one fact — "this market is
 * refusing" — and twenty lines on screen would bury the other markets. The
 * newest carries the reason, and the count of how often is not something a
 * person can act on.
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
    // Rows arrive newest first, so the first one seen for a market is the one
    // to keep.
    if (newest.has(row.marketKey)) continue
    // A refusal with nothing written on it explains nothing, and an empty
    // line under a level reads as a fault of its own.
    if (!row.note) continue
    newest.set(row.marketKey, {
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
 * (which changes how a trade says it ended). One round trip, two small
 * aggregates, so the poll can ask "did anything happen?" instead of
 * carrying thousands of rows every four seconds.
 */
export async function liveHistoryStamp(
  userId: string,
  walletIds: readonly string[]
): Promise<string> {
  if (walletIds.length === 0) return "0"
  const [fills, triggers] = await Promise.all([
    db
      .select({ count: count(), newest: max(tradeLiveFills.at) })
      .from(tradeLiveFills)
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          inArray(tradeLiveFills.walletId, [...walletIds]),
          eq(tradeLiveFills.hidden, false)
        )
      ),
    db
      .select({ count: count() })
      .from(tradeLiveTriggers)
      .where(
        and(
          eq(tradeLiveTriggers.userId, userId),
          inArray(tradeLiveTriggers.walletId, [...walletIds])
        )
      ),
  ])
  return [
    fills[0]?.count ?? 0,
    fills[0]?.newest ?? 0,
    triggers[0]?.count ?? 0,
  ].join(":")
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
  before?: number
): Promise<{
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
}> {
  if (walletIds.length === 0) return { fills: [], trades: [], nextBefore: null }

  const [fillRows, triggerRows] = await Promise.all([
    db
      .select()
      .from(tradeLiveFills)
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          inArray(tradeLiveFills.walletId, [...walletIds]),
          eq(tradeLiveFills.hidden, false),
          before === undefined ? undefined : lt(tradeLiveFills.at, before)
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
