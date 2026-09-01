import { randomUUID } from "node:crypto"

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type NetworkId,
  type ProtocolId,
  type WalletAccountFigures,
} from "@/lib/protocols/contracts"
import {
  capReduceOnly,
  defaultPaperCosts,
  isMarketable,
  paperAccountFigures,
  positionMargin,
  type PaperFillReason,
  type TradeOrder,
  type TradePosition,
  type TradeSide,
} from "@/lib/trade/paper"
import {
  buildLiveTrades,
  fillsOutsideTrades,
  journalPageCursor,
  type LiveFill,
  type LiveTrade,
  type LiveTradeEnding,
  type LiveTriggerKind,
} from "@/lib/trade/live-trades"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { stampGridFills } from "@/server/trade/grid-fills"
import {
  bumpTradeHistory,
  tradeHistoryStamp,
} from "@/server/trade/history-version"
import { marketRules } from "@/server/trade/market-rules"
import {
  tradePaperJournal,
  tradePaperOrders,
  tradePaperPositions,
  tradePaperState,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import {
  advanceLadders,
  ladderBarsKey,
  ladderCandleNeeds,
  type LadderBars,
} from "./smart-ladders"
import {
  closeAt,
  dropOrder,
  fill,
  fillOrder,
  freeCash,
  markSaved,
  MAX_OPEN_ORDERS,
  settleMarket,
  type WalletBook,
} from "./paper-replay"

export {
  bumpOrders,
  closeBar,
  exitOrderIdOf,
  fill,
  freeCash,
  liveOrderIds,
  MAX_OPEN_ORDERS,
  openBar,
  settleMarket,
  type WalletBook,
} from "./paper-replay"

/**
 * The practice trading engine: what a paper wallet does when price moves.
 *
 * Nothing runs in the background. Reading an account settles it first — the
 * price that happened since the last look is replayed, in order, and anything
 * it should have triggered is triggered before a single figure is reported.
 * That is what lets a wallet nobody watched for a day still tell the truth the
 * moment somebody opens it, and it is why there is no worker to keep alive.
 *
 * Settling is in two halves, and they cover different gaps:
 *
 * - **The candles**, for time that has properly passed. Each bar is walked as
 *   a path — see `candleLegs` — and everything the path runs into happens in
 *   the order it was reached. Only fetched when a bar could have completed.
 * - **The price right now**, every single time. Any level already on the wrong
 *   side of it has plainly been passed, so it fires. This needs no history at
 *   all, which is what makes a four-second poll cheap and still exact.
 *
 * Both halves are safe to run twice. A bar only applies to a position or order
 * that already existed when the bar opened, and a level checked against today's
 * price either fires now or was never reached — so a settle that runs again
 * changes nothing, which matters because two browser tabs will do exactly that.
 *
 * Failures are thrown as bare codes ("PAPER_MARGIN"); the API layer owns the
 * sentences, the same split the rest of this app uses.
 */

/** Below this the engine will not open anything — a dust order is a mistake. */
const MIN_ORDER_VALUE_USD = 0.01

/**
 * How stale the watermark has to be before candles are worth fetching. Below
 * one minute not even the finest bar has closed, so the price-right-now half
 * has already covered every moment of it.
 */
const CATCH_UP_AFTER_MS = 60_000

/** How many bars the exchange hands over in one read. */
const CANDLE_LIMIT = 500

const CATCH_UP_STEPS: { interval: CandleInterval; ms: number }[] = [
  { interval: "1m", ms: 60_000 },
  { interval: "5m", ms: 300_000 },
  { interval: "15m", ms: 900_000 },
  { interval: "1h", ms: 3_600_000 },
  { interval: "4h", ms: 14_400_000 },
  { interval: "1d", ms: 86_400_000 },
]

/** The finest timeframe that can cover this much time in one read. */
function catchUpStep(gapMs: number): { interval: CandleInterval; ms: number } {
  return (
    CATCH_UP_STEPS.find((step) => gapMs <= step.ms * CANDLE_LIMIT) ??
    CATCH_UP_STEPS[CATCH_UP_STEPS.length - 1]
  )
}

// ----- Rows in, shapes out ----------------------------------------------

type PositionRow = typeof tradePaperPositions.$inferSelect
type OrderRow = typeof tradePaperOrders.$inferSelect
type JournalRow = typeof tradePaperJournal.$inferSelect

function toPosition(row: PositionRow): TradePosition {
  const targets = (
    row.targets.length > 0
      ? row.targets
      : row.tpPx !== null
        ? [{ px: row.tpPx, sz: row.tpSz, orderId: null }]
        : []
  ).sort((left, right) => left.px - right.px)
  const first = targets[0] ?? null
  return {
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    szi: row.szi,
    entryPx: row.entryPx,
    leverage: row.leverage,
    maxLeverage: row.maxLeverage,
    targets,
    tpPx: first?.px ?? null,
    tpSz: first?.sz ?? null,
    slPx: row.slPx,
    feesPaid: row.feesPaid,
    updatedAt: row.updatedAt.getTime(),
  }
}

function toOrder(row: OrderRow): TradeOrder {
  return {
    id: row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    leverage: row.leverage,
    maxLeverage: row.maxLeverage,
    reduceOnly: row.reduceOnly,
    tpPx: row.tpPx,
    slPx: row.slPx,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

/** Practice fills need no order lookup, so the map they are built with is empty. */
const NO_TRIGGERS = new Map<
  string,
  { kind: LiveTriggerKind; px: number | null }
>()

// ----- Loading, settling, saving ----------------------------------------

/**
 * Everything this wallet has banked: profit less fees. Writers maintain this
 * one number on the wallet, so every poll avoids summing the whole Journal.
 */
async function realizedTotal(
  database: CustomShellDb,
  userId: string,
  walletId: string
): Promise<number> {
  const rows = await database
    .select({ total: tradeWallets.paperRealized })
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId)))
    .limit(1)
  return Number(rows[0]?.total ?? 0)
}

async function readBook(
  database: CustomShellDb,
  userId: string,
  wallet: TradeWallet
): Promise<WalletBook> {
  const [positions, orders, banked] = await Promise.all([
    database
      .select()
      .from(tradePaperPositions)
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          eq(tradePaperPositions.walletId, wallet.id)
        )
      ),
    database
      .select()
      .from(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          eq(tradePaperOrders.walletId, wallet.id)
        )
      ),
    realizedTotal(database, userId, wallet.id),
  ])

  return {
    wallet,
    costs: defaultPaperCosts(),
    cash: wallet.startingBalance + banked,
    // Empty until the settle walks a market and says what it is worth. A
    // position with no price counts as neither up nor down, which is the only
    // honest thing to do with silence.
    marks: new Map(),
    positions: new Map(
      positions.map((row) => [row.marketKey, toPosition(row)])
    ),
    orders: orders.map(toOrder),
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    entryLimit: null,
    // The moments the coins still open were opened, so the entry limit means
    // the same thing across settles — this book is rebuilt on every poll, and
    // an empty list here made "5 coins an hour" into "5 coins per poll".
    // Coins opened AND closed inside the window are not in this seed, so the
    // cap can run slightly loose, never slightly tight.
    openedAt: positions
      .map((row) => row.createdAt.getTime())
      .sort((left, right) => left - right),
    liquidatedThisPass: new Set(),
    crashEntry: { cascading: false, leastLeverage: null },
    ordersVersion: 0,
    addedOrders: [],
  }
}

/**
 * Writes back only what moved. `settledTo` is left null on a poll that changed
 * nothing and had no catching up to do — the watermark is only there to say
 * how far back the candles must be read from, and rewriting it every four
 * seconds would be a write per poll for no gain.
 */
export async function saveBook(
  database: CustomShellDb,
  userId: string,
  book: WalletBook,
  settledTo: Date | null
): Promise<void> {
  // Written before the deletes: an exit that filled in the same pass is in
  // both lists, and it has to exist before it can be removed.
  if (book.addedOrders.length > 0) {
    await database
      .insert(tradePaperOrders)
      .values(
        book.addedOrders.map((order) => ({
          userId,
          id: order.id,
          walletId: book.wallet.id,
          marketKey: order.marketKey,
          side: order.side,
          px: order.px,
          sz: order.sz,
          leverage: order.leverage,
          maxLeverage: order.maxLeverage,
          reduceOnly: order.reduceOnly,
          tpPx: order.tpPx,
          slPx: order.slPx,
          createdAt: new Date(order.createdAt),
          updatedAt: new Date(order.updatedAt),
        }))
      )
      .onConflictDoNothing()
  }

  if (book.goneOrderIds.size > 0) {
    await database
      .delete(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          inArray(tradePaperOrders.id, [...book.goneOrderIds])
        )
      )
  }

  // One delete and one upsert for every market the pass touched, where it
  // used to be one write per market, each awaited before the next inside
  // the transaction.
  const gonePositions: string[] = []
  const keptPositions: (typeof tradePaperPositions.$inferInsert)[] = []
  for (const marketKey of book.touchedMarkets) {
    const position = book.positions.get(marketKey)
    if (!position) {
      gonePositions.push(marketKey)
      continue
    }
    keptPositions.push({
      userId,
      id: position.id,
      walletId: book.wallet.id,
      marketKey,
      szi: position.szi,
      entryPx: position.entryPx,
      leverage: position.leverage,
      maxLeverage: position.maxLeverage,
      targets: position.targets,
      tpPx: position.tpPx,
      tpSz: position.tpSz ?? null,
      slPx: position.slPx,
      feesPaid: position.feesPaid,
      updatedAt: new Date(position.updatedAt),
    })
  }
  if (gonePositions.length > 0) {
    await database
      .delete(tradePaperPositions)
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          eq(tradePaperPositions.walletId, book.wallet.id),
          inArray(tradePaperPositions.marketKey, gonePositions)
        )
      )
  }
  if (keptPositions.length > 0) {
    await database
      .insert(tradePaperPositions)
      .values(keptPositions)
      .onConflictDoUpdate({
        target: [
          tradePaperPositions.userId,
          tradePaperPositions.walletId,
          tradePaperPositions.marketKey,
        ],
        set: {
          szi: sql`excluded.szi`,
          entryPx: sql`excluded.entry_px`,
          leverage: sql`excluded.leverage`,
          maxLeverage: sql`excluded.max_leverage`,
          targets: sql`excluded.targets`,
          tpPx: sql`excluded.tp_px`,
          tpSz: sql`excluded.tp_sz`,
          slPx: sql`excluded.sl_px`,
          feesPaid: sql`excluded.fees_paid`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  if (book.fills.length > 0) {
    await database.insert(tradePaperJournal).values(
      book.fills.map((entry) => ({
        userId,
        id: entry.id,
        walletId: book.wallet.id,
        marketKey: entry.marketKey,
        side: entry.side,
        px: entry.px,
        sz: entry.sz,
        fee: entry.fee,
        closedPnl: entry.closedPnl,
        reason: entry.reason,
        fillTime: new Date(entry.fillTime),
        orderId: entry.orderId,
      }))
    )
    const realized = book.fills.reduce(
      (total, entry) => total + entry.closedPnl - entry.fee,
      0
    )
    await database
      .update(tradeWallets)
      .set({
        historyVersion: sql`${tradeWallets.historyVersion} + 1`,
        paperRealized: sql`${tradeWallets.paperRealized} + ${realized}`,
      })
      .where(
        and(
          eq(tradeWallets.userId, userId),
          eq(tradeWallets.id, book.wallet.id)
        )
      )
  }

  if (settledTo) {
    await database
      .insert(tradePaperState)
      .values({ userId, walletId: book.wallet.id, settledTo })
      .onConflictDoUpdate({
        target: [tradePaperState.userId, tradePaperState.walletId],
        set: { settledTo },
      })
  }
  markSaved(book)
}

/**
 * The markets these wallets have anything riding on. Three small reads rather
 * than loading every position and order, because this runs before the exchange
 * is asked anything and only needs the names.
 *
 * Smart orders are counted even when they are holding nothing and resting
 * nothing, which is not a corner case: a grid below its range has sold
 * everything and taken its buys off the book, and a ladder whose every rung sits
 * under the stop is in the same state. Left to positions and orders alone their
 * market drops off the price list, so the engine stops looking at the coin — and
 * a smart order that cannot see price come back is one that never wakes up.
 */
export async function exposedMarketKeys(
  userId: string,
  walletIds: readonly string[]
): Promise<string[]> {
  const byWallet = await exposedMarketKeysByWallet(userId, walletIds)
  return [...new Set([...byWallet.values()].flat())]
}

/**
 * The same, kept apart by wallet — three queries for every wallet together,
 * where asking per wallet inside a poll cost three per wallet.
 */
export async function exposedMarketKeysByWallet(
  userId: string,
  walletIds: readonly string[]
): Promise<Map<string, string[]>> {
  const byWallet = new Map<string, string[]>()
  if (walletIds.length === 0) return byWallet
  const [positions, orders, smart] = await Promise.all([
    db
      .selectDistinct({
        walletId: tradePaperPositions.walletId,
        marketKey: tradePaperPositions.marketKey,
      })
      .from(tradePaperPositions)
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          inArray(tradePaperPositions.walletId, [...walletIds])
        )
      ),
    db
      .selectDistinct({
        walletId: tradePaperOrders.walletId,
        marketKey: tradePaperOrders.marketKey,
      })
      .from(tradePaperOrders)
      .where(
        and(
          eq(tradePaperOrders.userId, userId),
          inArray(tradePaperOrders.walletId, [...walletIds])
        )
      ),
    db
      .selectDistinct({
        walletId: tradeSmartLadders.walletId,
        marketKey: tradeSmartLadders.marketKey,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          eq(tradeSmartLadders.status, "active")
        )
      ),
  ])
  for (const walletId of walletIds) byWallet.set(walletId, [])
  for (const row of [...positions, ...orders, ...smart]) {
    const keys = byWallet.get(row.walletId)
    if (keys && !keys.includes(row.marketKey)) keys.push(row.marketKey)
  }
  return byWallet
}

/**
 * Today's price for a mixed list of markets, whichever exchange each belongs
 * to. The key carries its own protocol and network, so the venues to ask fall
 * out of the keys themselves and each is asked exactly once.
 */
export async function marksForKeys(
  marketKeys: readonly string[]
): Promise<Map<string, number>> {
  const venues = new Map<
    string,
    { protocol: ProtocolId; network: NetworkId; keys: string[] }
  >()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (!ref) continue
    const venueKey = `${ref.protocol}:${ref.network}`
    const venue = venues.get(venueKey) ?? {
      protocol: ref.protocol,
      network: ref.network,
      keys: [],
    }
    venue.keys.push(key)
    venues.set(venueKey, venue)
  }

  const marks = new Map<string, number>()
  await Promise.all(
    [...venues.values()].map(async (venue) => {
      const answered = await marksFor(venue.protocol, venue.network, venue.keys)
      for (const [key, price] of answered) marks.set(key, price)
    })
  )
  return marks
}

async function marksFor(
  protocol: ProtocolId,
  network: NetworkId,
  marketKeys: readonly string[]
): Promise<Map<string, number>> {
  const ids = new Map<string, string>()
  for (const key of marketKeys) {
    const ref = parseMarketKey(key)
    if (ref) ids.set(ref.marketId, key)
  }
  if (ids.size === 0) return new Map()

  const prices = await getProtocol(protocol)
    .markets.prices(network, [...ids.keys()])
    .catch(() => new Map<string, number>())

  const marks = new Map<string, number>()
  for (const [marketId, price] of prices) {
    const key = ids.get(marketId)
    if (key) marks.set(key, price)
  }
  return marks
}

async function loadBars(
  wallet: TradeWallet,
  marketKey: string,
  interval: CandleInterval,
  since: number
): Promise<CandleBar[]> {
  const ref = parseMarketKey(marketKey)
  if (!ref) return []
  return await getProtocol(wallet.protocol)
    .markets.candles(wallet.network, ref.marketId, interval, since)
    .then((candles) => candles.filter((bar) => bar.openTime >= since))
    .catch(() => [])
}

/**
 * How many wallets settle at once. Each settle holds one pooled connection
 * for its transaction, the app's pool has ten, and the positions poll and the
 * wallet poll can both be settling the same wallets at the same moment. Three
 * at a time leaves room for everything else in the same tick.
 */
const SETTLES_AT_ONCE = 3

async function settleTogether<T>(
  wallets: readonly TradeWallet[],
  settle: (wallet: TradeWallet) => Promise<T>
): Promise<T[]> {
  const books: T[] = new Array(wallets.length)
  let next = 0
  const worker = async () => {
    while (next < wallets.length) {
      const index = next++
      books[index] = await settle(wallets[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SETTLES_AT_ONCE, wallets.length) }, worker)
  )
  return books
}

/**
 * Brings one wallet up to date and hands back its book, already saved.
 *
 * The exchange is asked before the transaction opens, never inside it: holding
 * a row locked across a network call would leave every other tab waiting on
 * Hyperliquid. The rows are then read again inside, so nothing is decided from
 * a copy that went stale while the prices were on their way.
 */
export async function settleWallet(
  userId: string,
  wallet: TradeWallet,
  shared?: {
    marks: ReadonlyMap<string, number>
    /** This wallet's exposed markets, when the caller already looked. */
    markets?: readonly string[]
  }
): Promise<WalletBook> {
  const markets =
    shared?.markets ?? (await exposedMarketKeys(userId, [wallet.id]))
  const now = Date.now()

  // A wallet holding nothing — no position, no waiting order, no ladder
  // watching — has nothing to settle and nothing to write. Its book is read
  // plain, with no lock and no transaction: five round trips fewer, on every
  // poll, for every empty practice wallet on the account.
  if (markets.length === 0) {
    return await readBook(db, userId, wallet)
  }

  // The candles the ladders are watching — a two-green ladder's own timeframe,
  // and the 4h a base stop reads its level off. Asked out here, before the
  // transaction, for the same reason the marks are: a network call must never
  // sit inside the lock. Costs nothing when no ladder is watching.
  const ladderBars = new Map<string, { bars: CandleBar[]; barMs: number }>()
  // The three reads before the transaction do not depend on one another, so
  // they leave together: this runs every four seconds, and each round trip
  // in a row is a tenth of a second the screen waits.
  const [ladderNeeds, stateRows, marks] = await Promise.all([
    ladderCandleNeeds(userId, wallet.id, now),
    db
      .select()
      .from(tradePaperState)
      .where(
        and(
          eq(tradePaperState.userId, userId),
          eq(tradePaperState.walletId, wallet.id)
        )
      )
      .limit(1),
    shared ? shared.marks : marksFor(wallet.protocol, wallet.network, markets),
  ])
  // One feed per settle, for the same reason the live pass paces itself: a
  // wallet with a hundred ladders asking for a hundred 4h histories at once
  // is a burst the exchange refuses wholesale. The rest keep their old
  // `seenTo`, so the next settle simply picks up where this one stopped.
  for (const need of ladderNeeds.slice(0, 1)) {
    ladderBars.set(ladderBarsKey(need.use, need.marketKey), {
      bars: await loadBars(wallet, need.marketKey, need.interval, need.since),
      barMs: need.barMs,
    })
  }

  const settledTo = stateRows[0]?.settledTo.getTime() ?? now
  const gap = now - settledTo
  const catchingUp = gap >= CATCH_UP_AFTER_MS

  // Candles only when a bar could actually have closed since the last look.
  // Below that the price-right-now half has covered every moment already, and
  // asking would be one call per market per poll for nothing.
  const step = catchUpStep(gap)
  const bars = new Map<string, CandleBar[]>()
  if (catchingUp) {
    await Promise.all(
      markets.map(async (key) => {
        bars.set(key, await loadBars(wallet, key, step.interval, settledTo))
      })
    )
  }

  return await db.transaction(async (tx) => {
    // Two tabs polling at once would otherwise both replay the same candle and
    // fill the same order twice. Whoever arrives second waits here, re-reads,
    // and finds the work already done.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    const book = await readBook(tx, userId, wallet)
    for (const key of new Set([
      ...book.positions.keys(),
      ...book.orders.map((order) => order.marketKey),
    ])) {
      settleMarket(book, key, {
        bars: bars.get(key) ?? [],
        barMs: step.ms,
        mark: marks.get(key) ?? null,
        now,
      })
    }
    // The smart-order ladders react to what the replay just did — a rung that
    // bought gets its sell, a stop that fired ends its ladder — before the
    // book is saved, so their changes ride the same write.
    await advanceLadders(
      { tx, userId, book, marks, ladderBars: ladderBars as LadderBars, now },
      { fill, dropOrder, freeCash }
    )
    const moved = book.fills.length > 0 || book.goneOrderIds.size > 0
    await saveBook(tx, userId, book, catchingUp || moved ? new Date(now) : null)
    return book
  })
}

// ----- What the screens ask for -----------------------------------------

export type PaperAccount = {
  positions: TradePosition[]
  orders: TradeOrder[]
  /** Every visible fill, including the entries of positions still open. */
  fills: LiveFill[]
  /** Finished practice round trips — the Journal, alongside the real ones. */
  trades: LiveTrade[]
  nextBefore: number | null
  /** True when the Journal is the caller's own, unchanged (see `journalStamp`). */
  journalUnchanged: boolean
  journalStamp: string
}

/**
 * How many fills the Journal is built from. Bounded because this runs on every
 * poll: a year of practice must not make the panel slower every week.
 */
const JOURNAL_PAGE = 2_000

/**
 * How a practice fill's own reason reads as the end of a trade.
 *
 * The practice engine fires its own stops and writes down which level was hit,
 * so unlike a real fill there is nothing to look up afterwards. The four
 * remaining reasons belong to live rows and never appear in this table.
 */
const PAPER_ENDINGS: Partial<Record<PaperFillReason, LiveTradeEnding>> = {
  take_profit: "target",
  stop_loss: "stop",
  liquidated: "liquidated",
  manual: "closed",
  order: "closed",
}

/** One practice fill in the shape the trade builder reads. */
function toTradeFill(row: JournalRow): LiveFill {
  return {
    fillId: row.id,
    // The order that placed it, where one did. It falls back to the fill's own
    // id so that a stop or a liquidation — which nothing placed — still groups
    // as one arrow, and so rows written before the column existed still read.
    orderId: row.orderId ?? row.id,
    walletId: row.walletId,
    marketKey: row.marketKey,
    side: row.side,
    px: row.px,
    sz: row.sz,
    at: row.fillTime.getTime(),
    closedPnl: row.closedPnl,
    fee: row.fee,
    // Stands in for the exchange's own word, and does the one job that word
    // does here: a fill that closed something while nothing is held belongs to
    // a trade older than the slice read, and is left out rather than drawn
    // backwards.
    dir: row.closedPnl !== 0 ? "Close" : "",
    liquidation: row.reason === "liquidated",
    ending: PAPER_ENDINGS[row.reason] ?? "closed",
    live: false,
  }
}

/**
 * One or more practice wallets' finished trades, read from what is already
 * written down.
 *
 * **No settle and no exchange.** `loadPaperPortfolio` above replays the candles
 * first, because it is answering "what am I holding right now". This one is
 * answering "what did these wallets do", which is a question about rows that
 * are already there — and it is asked by a list page that must not cost a
 * round of exchange calls per wallet to draw.
 */
export async function loadPaperHistory(
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
  const rows = await db
    .select()
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        inArray(tradePaperJournal.walletId, [...walletIds]),
        marketKeys
          ? inArray(tradePaperJournal.marketKey, [...marketKeys])
          : undefined,
        eq(tradePaperJournal.hidden, false),
        before === undefined
          ? undefined
          : lt(tradePaperJournal.fillTime, new Date(before))
      )
    )
    .orderBy(desc(tradePaperJournal.fillTime))
    .limit(JOURNAL_PAGE)

  // Stamped before anything reads them, so a practice grid's sells say what
  // their own level made, exactly as a real one's do. See `stampGridFills`.
  const fills = await stampGridFills(userId, walletIds, rows.map(toTradeFill))
  const trades = buildLiveTrades(fills, NO_TRIGGERS)
  return {
    fills: fillsOutsideTrades(fills, trades),
    trades,
    nextBefore:
      before !== undefined && rows.length < JOURNAL_PAGE
        ? null
        : journalPageCursor(fills, trades),
  }
}

export function loadPaperHistoryBefore(
  userId: string,
  walletIds: readonly string[],
  before: number
) {
  return loadPaperHistory(userId, walletIds, before)
}

/**
 * Everything the trading screens draw, across every practice wallet at once —
 * settled first, so the answer is current rather than merely stored.
 *
 * Deliberately not scoped to whichever wallet is active. Which wallet an order
 * goes to is a choice you make when you place it; what you are holding
 * afterwards is something you need to see all of, whichever wallet it is in.
 * Every row carries its own wallet, and every action takes that wallet with it.
 *
 * The exchange is asked once for every market all the wallets are in together,
 * rather than once per wallet.
 */
export async function loadPaperPortfolio(
  userId: string,
  wallets: readonly TradeWallet[],
  options: {
    /**
     * The stamp of the Journal the caller already holds. When no fill has
     * landed or been binned since, the Journal comes back empty with
     * `journalUnchanged: true` and the caller keeps what it has, instead of
     * carrying up to two thousand rows every four seconds.
     */
    journalStamp?: string
  } = {}
): Promise<PaperAccount> {
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  if (paper.length === 0) {
    return {
      positions: [],
      orders: [],
      fills: [],
      trades: [],
      nextBefore: null,
      journalUnchanged: false,
      journalStamp: "0",
    }
  }

  const keysByWallet = await exposedMarketKeysByWallet(
    userId,
    paper.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys([...keysByWallet.values()].flat())

  // Wallets together, not one after the other — that was most of the time
  // this poll took. Each settle locks only its own wallet row, so they
  // cannot wait on each other; the cap is for the connection pool.
  const books = await settleTogether(paper, (wallet) =>
    settleWallet(userId, wallet, {
      marks,
      markets: keysByWallet.get(wallet.id) ?? [],
    })
  )
  const positions: TradePosition[] = []
  const orders: TradeOrder[] = []
  for (const book of books) {
    positions.push(...book.positions.values())
    orders.push(...book.orders)
  }

  // After the settle, so a fill it just wrote is in the stamp.
  const journalStamp = await paperJournalStamp(
    userId,
    paper.map((wallet) => wallet.id)
  )
  if (
    options.journalStamp !== undefined &&
    options.journalStamp === journalStamp
  ) {
    return {
      positions: positions.sort((a, b) =>
        a.marketKey.localeCompare(b.marketKey)
      ),
      orders: orders.sort((a, b) => a.createdAt - b.createdAt),
      fills: [],
      trades: [],
      nextBefore: null,
      journalUnchanged: true,
      journalStamp,
    }
  }

  const fills = await db
    .select()
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        inArray(
          tradePaperJournal.walletId,
          paper.map((wallet) => wallet.id)
        ),
        // Binned rows are still rows — they still count towards the wallet's
        // cash, which is why they are hidden rather than removed. They just
        // stop being shown.
        eq(tradePaperJournal.hidden, false)
      )
    )
    .orderBy(desc(tradePaperJournal.fillTime))
    .limit(JOURNAL_PAGE)

  const tradeFills = await stampGridFills(
    userId,
    paper.map((wallet) => wallet.id),
    fills.map(toTradeFill)
  )
  const trades = buildLiveTrades(tradeFills, NO_TRIGGERS)
  return {
    positions: positions.sort((a, b) => a.marketKey.localeCompare(b.marketKey)),
    orders: orders.sort((a, b) => a.createdAt - b.createdAt),
    fills: fillsOutsideTrades(tradeFills, trades),
    // No triggers to look up: a practice fill carries its own reason.
    trades,
    nextBefore: journalPageCursor(tradeFills, trades),
    journalUnchanged: false,
    journalStamp,
  }
}

/**
 * A short string that changes when the practice Journal would read
 * differently: a fill written, or one binned. Writers maintain the version,
 * so this reads only the selected wallet rows.
 */
async function paperJournalStamp(
  userId: string,
  walletIds: readonly string[]
): Promise<string> {
  return tradeHistoryStamp(userId, walletIds)
}

/**
 * The five account rows for every paper wallet at once — what the account
 * panel polls.
 *
 * Every wallet is settled, and the exchange is asked once for all of their
 * markets together rather than once per wallet.
 */
export async function paperWalletFigures(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<Map<string, WalletAccountFigures>> {
  const figures = new Map<string, WalletAccountFigures>()
  if (wallets.length === 0) return figures

  const keysByWallet = await exposedMarketKeysByWallet(
    userId,
    wallets.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys([...keysByWallet.values()].flat())

  const books = await settleTogether(wallets, (wallet) =>
    settleWallet(userId, wallet, {
      marks,
      markets: keysByWallet.get(wallet.id) ?? [],
    })
  )
  for (const [index, wallet] of wallets.entries()) {
    const book = books[index]
    figures.set(
      wallet.id,
      paperAccountFigures({
        startingBalance: wallet.startingBalance,
        realized: book.cash - wallet.startingBalance,
        positions: [...book.positions.values()],
        marks,
      })
    )
  }
  return figures
}

// ----- Doing something ---------------------------------------------------

/** The one price every action prices itself against. */
async function markOf(wallet: TradeWallet, marketKey: string): Promise<number> {
  const marks = await marksFor(wallet.protocol, wallet.network, [marketKey])
  const mark = marks.get(marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")
  return mark
}

/** Sizes go only as fine as the market allows, and never round up into more risk. */
function roundSize(sz: number, sizeDecimals: number | null): number {
  if (!Number.isFinite(sz) || sz <= 0) return 0
  const factor = 10 ** Math.max(0, sizeDecimals ?? 0)
  return Math.floor(sz * factor) / factor
}

export async function placePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    side: TradeSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
    /** A checked Market box fills now, whatever chart price opened the window. */
    marketOnly?: boolean
    /** An unchecked order may rest, but it may never take the market. */
    restingOnly?: boolean
  }
): Promise<void> {
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("PAPER_MARKET")
  }
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  const maxLeverage = rules.maxLeverage ?? 1
  if (input.leverage < 1 || input.leverage > maxLeverage) {
    throw new Error("PAPER_LEVERAGE")
  }

  const protocol = getProtocol(wallet.protocol)
  const px = protocol.markets.roundPx(
    input.px,
    rules.sizeDecimals,
    rules.priceTick
  )
  const sz = roundSize(input.sz, rules.sizeDecimals)
  if (!(px > 0)) throw new Error("PAPER_PRICE")
  if (!(sz > 0)) throw new Error("PAPER_SIZE")
  if (input.marketOnly && input.restingOnly) throw new Error("PAPER_ORDER_KIND")
  if (!input.marketOnly && px * sz < MIN_ORDER_VALUE_USD) {
    throw new Error("PAPER_SIZE")
  }

  const mark = await markOf(wallet, input.marketKey)
  const marketable = isMarketable(input.side, px, mark)
  if (input.restingOnly && marketable) {
    throw new Error("PAPER_ORDER_NOT_RESTING")
  }
  const book = await settleWallet(userId, wallet)

  if (book.orders.length >= MAX_OPEN_ORDERS)
    throw new Error("PAPER_ORDER_LIMIT")

  const taken = input.marketOnly === true || marketable
  // A price already through the market is not going to wait for anything, so
  // it is taken now — at the market's price, never at the worse one asked for.
  // Which means the price this order opens at is not always the price it asked
  // for. Everything below is judged against the price it will really get: a
  // sell placed under the market fills above the price asked for, so checking
  // the margin against that price would let a trade through that the account
  // cannot actually afford.
  const entryPx = taken ? mark : px
  if (input.marketOnly && entryPx * sz < MIN_ORDER_VALUE_USD) {
    throw new Error("PAPER_SIZE")
  }
  const long = input.side === "buy"

  const held = book.positions.get(input.marketKey) ?? null
  const reducible = input.reduceOnly
    ? capReduceOnly(held, input.side, sz)
    : null
  if (input.reduceOnly && (reducible === null || reducible <= 0)) {
    throw new Error("PAPER_REDUCE_ONLY")
  }
  if (!input.reduceOnly && (entryPx * sz) / input.leverage > freeCash(book)) {
    throw new Error("PAPER_MARGIN")
  }
  // Brackets belong to a position this order opens; one that only reduces
  // never opens anything, so they could not apply and are dropped at the door.
  const tpPx = input.reduceOnly
    ? null
    : input.tpPx === null
      ? null
      : protocol.markets.roundPx(
          input.tpPx,
          rules.sizeDecimals,
          rules.priceTick
        )
  const slPx = input.reduceOnly
    ? null
    : input.slPx === null
      ? null
      : protocol.markets.roundPx(
          input.slPx,
          rules.sizeDecimals,
          rules.priceTick
        )

  if (tpPx !== null && (long ? tpPx <= entryPx : tpPx >= entryPx)) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (slPx !== null && (long ? slPx >= entryPx : slPx <= entryPx)) {
    throw new Error("PAPER_STOP_SIDE")
  }

  const now = Date.now()
  if (taken) {
    fill(book, {
      marketKey: input.marketKey,
      side: input.side,
      px: mark,
      sz: reducible ?? sz,
      feeRate: book.costs.takerFeeRate,
      leverage: input.leverage,
      maxLeverage,
      reason: "order",
      at: now,
      brackets: { tpPx, slPx },
    })
    await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
    return
  }

  await db.insert(tradePaperOrders).values({
    userId,
    id: randomUUID(),
    walletId: wallet.id,
    marketKey: input.marketKey,
    side: input.side,
    px,
    sz,
    leverage: input.leverage,
    maxLeverage,
    reduceOnly: input.reduceOnly,
    tpPx,
    slPx,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
}

/**
 * Dragging a waiting order to a new price. Dragged through the market it stops
 * waiting and is taken there and then, which is exactly what the exchange
 * would do with it.
 */
export async function movePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: { orderId: string; px: number }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const order = book.orders.find((one) => one.id === input.orderId)
  if (!order) throw new Error("PAPER_ORDER_NOT_FOUND")

  const ref = parseMarketKey(order.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  const px = getProtocol(wallet.protocol).markets.roundPx(
    input.px,
    rules?.sizeDecimals ?? null,
    rules?.priceTick ?? null
  )
  if (!(px > 0)) throw new Error("PAPER_PRICE")

  const mark = await markOf(wallet, order.marketKey)
  const now = Date.now()

  if (isMarketable(order.side, px, mark)) {
    fillOrder(book, order, {
      px: mark,
      feeRate: book.costs.takerFeeRate,
      at: now,
    })
    await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
    return
  }

  await db
    .update(tradePaperOrders)
    .set({ px, updatedAt: new Date(now) })
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, wallet.id),
        eq(tradePaperOrders.id, input.orderId)
      )
    )
}

/**
 * Changing a waiting order without moving it: how much it is for, its
 * leverage, and where it gets out once it fills.
 *
 * Its price is not touched here — that is the drag on the chart — which is what
 * makes this safe to check against `order.px`: an order that is still waiting
 * has not been reached, so the price it fills at is the price it is asking for.
 * Every rule the order had to pass when it was placed is applied again, because
 * the account it has to fit inside is not the one it was placed into.
 */
export async function updatePaperOrder(
  userId: string,
  wallet: TradeWallet,
  input: {
    orderId: string
    sz: number
    leverage: number
    tpPx: number | null
    slPx: number | null
  }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const order = book.orders.find((one) => one.id === input.orderId)
  if (!order) throw new Error("PAPER_ORDER_NOT_FOUND")

  const ref = parseMarketKey(order.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  // Placing one refuses a market with no rules, and so does this: without them
  // the size would round to whole coins and report itself as "too small",
  // which is a true sentence about the wrong problem.
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")
  const protocol = getProtocol(wallet.protocol)

  const sz = roundSize(input.sz, rules.sizeDecimals)
  if (!(sz > 0) || order.px * sz < MIN_ORDER_VALUE_USD) {
    throw new Error("PAPER_SIZE")
  }
  if (input.leverage < 1 || input.leverage > order.maxLeverage) {
    throw new Error("PAPER_LEVERAGE")
  }

  const held = book.positions.get(order.marketKey) ?? null
  if (order.reduceOnly) {
    const reducible = capReduceOnly(held, order.side, sz)
    if (reducible === null || reducible <= 0)
      throw new Error("PAPER_REDUCE_ONLY")
  } else if ((order.px * sz) / input.leverage > freeCash(book)) {
    // Waiting orders hold no margin aside, so what this one has to fit inside
    // is the cash free right now — not what was free when it was placed.
    throw new Error("PAPER_MARGIN")
  }

  // A reduce-only order never opens a position, so there is nothing for a stop
  // or a target to ride on. Dropped at the door, exactly as when placing one.
  const round = (px: number | null) =>
    px === null
      ? null
      : protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)
  const tpPx = order.reduceOnly ? null : round(input.tpPx)
  const slPx = order.reduceOnly ? null : round(input.slPx)
  const long = order.side === "buy"

  if (
    tpPx !== null &&
    (!(tpPx > 0) || (long ? tpPx <= order.px : tpPx >= order.px))
  ) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (
    slPx !== null &&
    (!(slPx > 0) || (long ? slPx >= order.px : slPx <= order.px))
  ) {
    throw new Error("PAPER_STOP_SIDE")
  }

  await db
    .update(tradePaperOrders)
    // The stamp matters: a bar that opened before this edit no longer applies
    // to the order, the same rule a drag obeys — see `settleMarket`.
    .set({ sz, leverage: input.leverage, tpPx, slPx, updatedAt: new Date() })
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, wallet.id),
        eq(tradePaperOrders.id, input.orderId)
      )
    )
}

export async function cancelPaperOrder(
  userId: string,
  walletId: string,
  orderId: string
): Promise<void> {
  const removed = await db
    .delete(tradePaperOrders)
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        eq(tradePaperOrders.walletId, walletId),
        eq(tradePaperOrders.id, orderId)
      )
    )
    .returning({ id: tradePaperOrders.id })
  if (removed.length === 0) throw new Error("PAPER_ORDER_NOT_FOUND")
}

/**
 * Setting or clearing a position's target and stop.
 *
 * A target stays on the winning side of the entry. A stop stays beyond the
 * current price so it cannot fire the instant it is set; after price moves in
 * the trade's favour, that lets the stop cross the entry and protect profit.
 */
export async function setPaperBrackets(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
  }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(input.marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")
  const mark = await markOf(wallet, input.marketKey)

  const ref = parseMarketKey(input.marketKey)
  const rules = ref
    ? await marketRules(wallet.protocol, wallet.network, ref.marketId)
    : null
  const round = (px: number | null) =>
    px === null
      ? null
      : getProtocol(wallet.protocol).markets.roundPx(
          px,
          rules?.sizeDecimals ?? null,
          rules?.priceTick ?? null
        )

  const slPx = round(input.slPx)
  const long = held.szi > 0
  if (input.targets.length > 3) throw new Error("PAPER_TAKE_PROFIT_COUNT")
  if (slPx !== null && (!(slPx > 0) || (long ? slPx >= mark : slPx <= mark))) {
    throw new Error("PAPER_STOP_SIDE")
  }

  // A size only means something on a target that exists, and it may not be
  // more than is held. The whole position is stored as null — the size a
  // target has always had — so only a genuinely partial one is written down.
  //
  // Floored to the market's own step first, exactly as an order's size is a
  // few lines below: practice is meant to model the exchange, and a size the
  // exchange would never accept is not a rehearsal of anything.
  const heldSz = Math.abs(held.szi)
  const targets = input.targets
    .map((target) => ({
      px: round(target.px),
      sz:
        target.sz === null
          ? null
          : roundSize(target.sz, rules?.sizeDecimals ?? null),
      orderId: null,
    }))
    .sort((left, right) => (left.px ?? 0) - (right.px ?? 0))
  if (
    targets.some(
      (target) =>
        target.px === null ||
        !(target.px > 0) ||
        (long ? target.px <= held.entryPx : target.px >= held.entryPx)
    )
  ) {
    throw new Error("PAPER_TAKE_PROFIT_SIDE")
  }
  if (targets.length > 1 && targets.some((target) => target.sz === null)) {
    throw new Error("PAPER_TAKE_PROFIT_LIST_SIZE")
  }
  const coveredSz = targets.reduce(
    (sum, target) => sum + (target.sz ?? heldSz),
    0
  )
  if (targets.some((target) => target.sz !== null && !(target.sz > 0))) {
    throw new Error("PAPER_TAKE_PROFIT_SIZE")
  }
  if (coveredSz > heldSz + 1e-9) {
    const targetsUsd = targets.reduce(
      (sum, target) => sum + (target.sz ?? heldSz) * (target.px ?? 0),
      0
    )
    throw new Error(
      `PAPER_TAKE_PROFIT_TOTAL:${targetsUsd}:${heldSz * held.entryPx}`
    )
  }

  const safeTargets = targets as Array<{
    px: number
    sz: number | null
    orderId: null
  }>
  const first = safeTargets[0] ?? null

  await db
    .update(tradePaperPositions)
    .set({
      targets: safeTargets,
      tpPx: first?.px ?? null,
      tpSz: first?.sz ?? null,
      slPx,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradePaperPositions.userId, userId),
        eq(tradePaperPositions.walletId, wallet.id),
        eq(tradePaperPositions.marketKey, input.marketKey)
      )
    )
}

export async function closePaperPosition(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<void> {
  const mark = await markOf(wallet, marketKey)
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")

  const now = Date.now()
  closeAt(book, held, {
    px: mark,
    feeRate: book.costs.takerFeeRate,
    reason: "manual",
    at: now,
  })
  await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
}

/**
 * Turning a position around: out of this one and into the same size the other
 * way, in one go. One fill of twice the size does exactly that — the
 * arithmetic banks the old trade and opens the new one at the same price.
 */
export async function flipPaperPosition(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<void> {
  const mark = await markOf(wallet, marketKey)
  const book = await settleWallet(userId, wallet)
  const held = book.positions.get(marketKey)
  if (!held) throw new Error("PAPER_POSITION_NOT_FOUND")

  const size = Math.abs(held.szi)
  // The new half needs its own margin, and the old half's is only given back
  // as it closes — so the test is against what the turn actually costs.
  if ((mark * size) / held.leverage > freeCash(book) + positionMargin(held)) {
    throw new Error("PAPER_MARGIN")
  }

  const now = Date.now()
  fill(book, {
    marketKey,
    side: held.szi > 0 ? "sell" : "buy",
    px: mark,
    sz: size * 2,
    feeRate: book.costs.takerFeeRate,
    leverage: held.leverage,
    maxLeverage: held.maxLeverage,
    reason: "manual",
    at: now,
  })
  await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
}

/**
 * Everything closed at once, at whatever each market costs right now — across
 * every practice wallet, because that is what the table it sits above shows.
 */
export async function closeAllPaperPositions(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<{ closed: number }> {
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  const keys = await exposedMarketKeys(
    userId,
    paper.map((wallet) => wallet.id)
  )
  const marks = await marksForKeys(keys)
  const now = Date.now()
  let closed = 0

  for (const wallet of paper) {
    const book = await settleWallet(userId, wallet, { marks })
    const held = [...book.positions.values()]
    if (held.length === 0) continue

    let touched = 0
    for (const position of held) {
      const mark = marks.get(position.marketKey)
      // A market the exchange would not price is left alone rather than closed
      // at a made-up number; the count says how many actually went.
      if (mark === undefined || !(mark > 0)) continue
      closeAt(book, position, {
        px: mark,
        feeRate: book.costs.takerFeeRate,
        reason: "manual",
        at: now,
      })
      touched += 1
    }
    if (touched > 0) {
      await db.transaction((tx) => saveBook(tx, userId, book, new Date(now)))
      closed += touched
    }
  }
  return { closed }
}

/**
 * Takes the fills behind one finished practice trade off the Journal.
 *
 * They are not removed. `realizedTotal` above adds these rows up to work out
 * what a practice wallet is worth, so deleting one would move the balance —
 * bin a loss and the wallet hands the money back. Nobody tidying a list has
 * asked for that. The rows stay, stop being shown, and the money does not move.
 *
 * Scoped by the person, so a request carrying somebody else's row id can only
 * ever miss.
 */
export async function hidePaperJournalEntries(
  userId: string,
  ids: readonly string[]
): Promise<void> {
  if (ids.length === 0) return
  await db.transaction(async (tx) => {
    const hidden = await tx
      .update(tradePaperJournal)
      .set({ hidden: true })
      .where(
        and(
          eq(tradePaperJournal.userId, userId),
          inArray(tradePaperJournal.id, [...ids]),
          eq(tradePaperJournal.hidden, false)
        )
      )
      .returning({ walletId: tradePaperJournal.walletId })
    if (hidden.length > 0) {
      await bumpTradeHistory(
        tx,
        userId,
        hidden.map((row) => row.walletId)
      )
    }
  })
}
