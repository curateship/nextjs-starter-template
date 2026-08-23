import { and, desc, eq, inArray } from "drizzle-orm"

import {
  describeFlowWait,
  flowHeadline,
  flowWaitIsRetired,
  STRIKES_BEFORE_HOLD,
  type FlowWaiting,
} from "@/lib/trade/flow-waiting"
import type { TradeFlowRunSpec, TradeFlowRunStatus } from "@/lib/trade/flow-run"
import {
  openPositionIsRunning,
  splitRunTrades,
  tradesByRun,
  type FlowRunOrderOwners,
} from "@/lib/trade/flow-run/attribution"
import {
  openFillMarks,
  tradeFillMarks,
  type LiveFill,
  type LiveFillMark,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"
import { venueLabel, type TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { customShellAutomations } from "@/server/schema"
import { loadLiveHistory } from "@/server/trade/live-fills"
import { loadLivePortfolio } from "@/server/trade/live-orders"
import { loadPaperHistory, loadPaperPortfolio, marksForKeys } from "@/server/trade/paper"
import {
  tradeFlowRunOrders,
  tradeFlowRuns,
  tradeSmartLadders,
} from "@/server/trade/schema"
import { listActiveSmartOrders } from "@/server/trade/smart-orders"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import { listWallets } from "@/server/trade/wallets"

/**
 * Everything the live-run dashboard draws, worked out in one place.
 *
 * **One place on purpose.** The list, the run page and anything that comes
 * later all ask the same three questions — what did this run place, what did
 * those trades make, and what is it still holding — and three copies of that
 * arithmetic would be three chances to disagree about somebody's money.
 *
 * Nothing here is stored. Every figure is read back from fills that are kept
 * forever, so the page and the wallet can never drift apart.
 */

/**
 * How many runs the list draws.
 *
 * Newest first, so what falls off the end is the oldest history. Nothing here
 * pages yet — two hundred switch-ons is years of them — and the count in the
 * toolbar is the count of what is shown, never a promise about what exists.
 */
const MAX_RUNS = 200

/** One coin the run is watching, and where it has got to. */
export type FlowRunCoin = {
  marketKey: string
  coin: string
  /** True when this coin has a ladder or a signal trade working right now. */
  working: boolean
  /** Why it has nothing yet, in a few words. Null when it is working. */
  words: string | null
  /** True when a person has to do something about it. */
  problem: boolean
  /** Money this run has banked on this coin. */
  netUsd: number
  /** Finished trades this run has had on it. */
  trades: number
}

/** A position this run opened and still holds. */
export type FlowRunPosition = {
  marketKey: string
  coin: string
  direction: "long" | "short"
  sz: number
  entryPx: number
  /** Today's price, or null when the exchange would not say. */
  markPx: number | null
  amountUsd: number
  /** Made or lost on paper at today's price. Null without a price. */
  unrealisedUsd: number | null
  stopPx: number | null
  targetPx: number | null
  openedAt: number
}

/** One finished trade of this run. */
export type FlowRunTrade = {
  id: string
  marketKey: string
  coin: string
  direction: "long" | "short"
  openedAt: number
  closedAt: number
  heldMs: number
  entryPx: number
  exitPx: number
  amountUsd: number
  pnl: number
  returnPct: number
  ending: LiveTrade["ending"]
  /** What the venue charged on this trade, both ways. */
  feesUsd: number
}

export type FlowRunHead = {
  id: string
  automationId: string
  /** The flow's name now, or what it was called if the flow has been deleted. */
  automationName: string
  walletId: string
  walletLabel: string
  /** True for real money. */
  real: boolean
  venue: string
  status: TradeFlowRunStatus
  paused: boolean
  /** True while it has given up asking and is waiting to try again. */
  holding: boolean
  capUsd: number
  coins: number
  working: number
  startedAt: number
  stoppedAt: number | null
  stoppedReason: string | null
}

export type FlowRunListRow = FlowRunHead & {
  /** Money banked, this run's own trades only. */
  netUsd: number
  tradesClosed: number
  /** Coins this run is still holding a position on. */
  holdingCoins: number
}

export type FlowRunReport = {
  /**
   * The moment this answer was worked out.
   *
   * Sent rather than read off the browser's clock, because the head of the
   * money line is drawn at exactly this moment and the two clocks are not the
   * same one. A page that used its own would draw the last point somewhere the
   * figures beside it do not agree with.
   */
  readAt: number
  head: FlowRunHead
  spec: TradeFlowRunSpec
  coins: FlowRunCoin[]
  waiting: FlowWaiting[]
  /** The one line at the top: what is wrong and on how many coins. */
  headline: { words: string; problem: boolean } | null
  positions: FlowRunPosition[]
  trades: FlowRunTrade[]
  /**
   * Finished trades on this wallet that were not this run's.
   *
   * Shown rather than hidden. Every figure on the page leaves them out, and a
   * page that quietly left them out without saying so would read as the whole
   * wallet.
   */
  notMine: number
  /** True when the exchange would not answer, so the prices are missing. */
  unreachable: boolean
}

/** Which run each of a wallet's orders belongs to. */
async function orderOwners(
  userId: string,
  walletIds: readonly string[]
): Promise<FlowRunOrderOwners> {
  if (walletIds.length === 0) return new Map()
  const rows = await db
    .select({
      orderId: tradeFlowRunOrders.orderId,
      flowRunId: tradeFlowRunOrders.flowRunId,
    })
    .from(tradeFlowRunOrders)
    .where(
      and(
        eq(tradeFlowRunOrders.userId, userId),
        inArray(tradeFlowRunOrders.walletId, [...walletIds])
      )
    )
  return new Map(rows.map((row) => [row.orderId, row.flowRunId]))
}

/**
 * Which of a run's coins have a smart order working on them right now.
 *
 * **Asked of the wallet and the coin list, not of the run's stamp.** This is
 * the same question `countWorkingLadders` answers for the canvas chip and the
 * Automation panel on the trading screen answers for its list, and it has to
 * be answered the same way in all three or the same flow reads as busy on one
 * screen and idle on another.
 *
 * The stamp is for money — whose trade was that, months later, when the order
 * behind it is long gone. What is working right now needs no stamp: there is
 * one smart order per coin per wallet, and a coin on this run's list with one
 * on it is this run's coin being worked.
 */
async function workingMarkets(
  userId: string,
  walletId: string,
  marketKeys: readonly string[]
): Promise<Set<string>> {
  if (marketKeys.length === 0) return new Set()
  const rows = await db
    .select({ marketKey: tradeSmartLadders.marketKey })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.marketKey, [...marketKeys])
      )
    )
  return new Set(rows.map((row) => row.marketKey))
}

/** The coin out of a market key — `ETH` out of `hyperliquid:mainnet:ETH`. */
function coinOf(marketKey: string): string {
  const colon = marketKey.lastIndexOf(":")
  return colon === -1 ? marketKey : marketKey.slice(colon + 1)
}

function headOf(
  row: typeof tradeFlowRuns.$inferSelect,
  wallet: TradeWallet | null,
  automationName: string,
  working: number,
  now: number
): FlowRunHead {
  return {
    id: row.id,
    automationId: row.automationId,
    automationName,
    walletId: row.walletId,
    walletLabel: wallet?.label ?? row.spec.walletLabel,
    real: row.spec.real,
    venue: venueLabel(row.spec.protocol, row.spec.network),
    status: row.status,
    paused: row.pausedAt !== null,
    holding:
      row.pausedAt === null &&
      row.hold !== null &&
      row.hold.strikes >= STRIKES_BEFORE_HOLD &&
      row.hold.until > now,
    capUsd: row.spec.capUsd,
    coins: row.spec.marketKeys.length,
    working,
    startedAt: row.startedAt.getTime(),
    stoppedAt: row.stoppedAt?.getTime() ?? null,
    stoppedReason: row.stoppedReason,
  }
}

/** One wallet's finished trades and open fills, from rows already written. */
async function historyOf(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<{ fills: LiveFill[]; trades: LiveTrade[] }> {
  const live = wallets.filter((wallet) => wallet.kind === "live")
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  const [fromLive, fromPaper] = await Promise.all([
    loadLiveHistory(
      userId,
      live.map((wallet) => wallet.id)
    ),
    loadPaperHistory(
      userId,
      paper.map((wallet) => wallet.id)
    ),
  ])
  return {
    fills: [...fromLive.fills, ...fromPaper.fills],
    trades: [...fromLive.trades, ...fromPaper.trades],
  }
}

/** Every run this person has ever switched on, newest first. */
export async function listFlowRuns(
  userId: string,
  now: number = Date.now()
): Promise<FlowRunListRow[]> {
  const rows = await db
    .select()
    .from(tradeFlowRuns)
    .where(eq(tradeFlowRuns.userId, userId))
    .orderBy(desc(tradeFlowRuns.startedAt))
    .limit(MAX_RUNS)
  if (rows.length === 0) return []

  const wallets = await listWallets(userId)
  const walletIds = [...new Set(rows.map((row) => row.walletId))]
  const involved = wallets.filter((wallet) => walletIds.includes(wallet.id))

  const [names, ladders, owners, history] = await Promise.all([
    db
      .select({
        id: customShellAutomations.id,
        name: customShellAutomations.name,
      })
      .from(customShellAutomations)
      .where(
        inArray(
          customShellAutomations.id,
          rows.map((row) => row.automationId)
        )
      ),
    // Every smart order working on any of these wallets right now. Which run
    // each one belongs to is decided below, by the coin list — the same rule
    // the canvas chip uses.
    db
      .select({
        walletId: tradeSmartLadders.walletId,
        marketKey: tradeSmartLadders.marketKey,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, walletIds),
          eq(tradeSmartLadders.status, "active")
        )
      ),
    orderOwners(userId, walletIds),
    historyOf(userId, involved),
  ])

  const nameOf = new Map(names.map((one) => [one.id, one.name]))
  // A finished run works nothing, whatever is still on its wallet: what is
  // left there is either somebody else's or a position it deliberately left
  // holding, and neither is this run looking for coins.
  const workingCount = (run: (typeof rows)[number]) =>
    run.status !== "running"
      ? 0
      : ladders.filter(
          (one) =>
            one.walletId === run.walletId &&
            run.spec.marketKeys.includes(one.marketKey)
        ).length

  // One pass over the wallet's trades for every run on the page, rather than
  // one pass per run: this reads every five seconds while anything is running,
  // against a database a long way off.
  const { byRun } = tradesByRun(history.trades, owners)
  const heldByRun = new Map<string, Set<string>>()
  for (const fill of history.fills) {
    const runId = owners.get(fill.orderId)
    if (!runId) continue
    const coins = heldByRun.get(runId) ?? new Set<string>()
    coins.add(fill.marketKey)
    heldByRun.set(runId, coins)
  }

  return rows.map((row) => {
    const wallet = wallets.find((one) => one.id === row.walletId) ?? null
    const mine = byRun.get(row.id) ?? []
    return {
      ...headOf(
        row,
        wallet,
        nameOf.get(row.automationId) ?? row.spec.walletLabel,
        workingCount(row),
        now
      ),
      netUsd: mine.reduce((sum, trade) => sum + trade.pnl, 0),
      tradesClosed: mine.length,
      holdingCoins: heldByRun.get(row.id)?.size ?? 0,
    }
  })
}

/** One run in full — what the dashboard draws. */
export async function readFlowRun(
  userId: string,
  runId: string,
  now: number = Date.now()
): Promise<FlowRunReport | null> {
  const [row] = await db
    .select()
    .from(tradeFlowRuns)
    .where(and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.id, runId)))
    .limit(1)
  if (!row) return null

  const wallets = await listWallets(userId)
  const wallet = wallets.find((one) => one.id === row.walletId) ?? null

  const [named] = await db
    .select({ name: customShellAutomations.name })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, row.automationId))
    .limit(1)

  const workingCoins = await workingMarkets(
    userId,
    row.walletId,
    row.spec.marketKeys
  )

  const owners = await orderOwners(userId, [row.walletId])

  // A run that has finished is history: its trades cannot change and there is
  // nothing open to price, so the exchange is not asked at all.
  // What is written down first, because it decides whether the exchange is
  // worth asking at all.
  let history: { fills: LiveFill[]; trades: LiveTrade[] } = await historyOf(
    userId,
    wallet ? [wallet] : []
  )

  // **A stopped run can still be holding coins.** Stopping calls off the
  // waiting rungs and deliberately leaves open positions alone, stops and
  // targets untouched — so a finished run with something still in the market
  // has to be priced like a running one. What is skipped is the run that
  // stopped with nothing held: its figures cannot change, and asking the
  // exchange to be told so again spends a request nobody is waiting on.
  const stillHolding = history.fills.some(
    (fill) => owners.get(fill.orderId) === runId
  )
  let positionRows: TradePosition[] = []
  let unreachable = false
  if (wallet && (row.status === "running" || stillHolding)) {
    if (wallet.kind === "live") {
      const portfolio = await loadLivePortfolio(userId, [wallet])
      positionRows = portfolio.positions
      unreachable = portfolio.unreachable.length > 0
      history = portfolio
    } else {
      const portfolio = await loadPaperPortfolio(userId, [wallet])
      positionRows = portfolio.positions
      history = portfolio
    }
  }

  const { mine, notMine } = splitRunTrades(history.trades, runId, owners)

  const held = positionRows.filter((position) =>
    openPositionIsRunning(history.fills, position.marketKey, runId, owners)
  )
  const marks = held.length
    ? await marksForKeys(held.map((position) => position.marketKey))
    : new Map<string, number>()

  const positions: FlowRunPosition[] = held.map((position) => {
    const markPx = marks.get(position.marketKey) ?? null
    const sz = Math.abs(position.szi)
    const amountUsd = position.entryPx * sz
    return {
      marketKey: position.marketKey,
      coin: coinOf(position.marketKey),
      direction: position.szi > 0 ? "long" : "short",
      sz,
      entryPx: position.entryPx,
      markPx,
      amountUsd,
      unrealisedUsd:
        markPx === null
          ? null
          : (markPx - position.entryPx) * position.szi - position.feesPaid,
      stopPx: position.slPx,
      targetPx: position.tpPx,
      openedAt: openedAtOf(history.fills, position.marketKey, row.startedAt.getTime()),
    }
  })

  const trades: FlowRunTrade[] = mine.map((trade) => ({
    id: trade.id,
    marketKey: trade.marketKey,
    coin: coinOf(trade.marketKey),
    direction: trade.direction,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    heldMs: trade.heldMs,
    entryPx: trade.entryPx,
    exitPx: trade.exitPx,
    amountUsd: trade.amountUsd,
    pnl: trade.pnl,
    returnPct: trade.returnPct,
    ending: trade.ending,
    feesUsd: trade.fills.reduce((sum, fill) => sum + fill.fee, 0),
  }))

  const waiting = Object.entries(row.waiting)
    .filter(
      ([marketKey, reason]) =>
        row.spec.marketKeys.includes(marketKey) &&
        // An answer to a rule that no longer exists is not a reason to wait.
        !flowWaitIsRetired(reason.code)
    )
    .map(([marketKey, reason]) => describeFlowWait(marketKey, reason))
  const holding =
    row.pausedAt === null &&
    row.hold !== null &&
    row.hold.strikes >= STRIKES_BEFORE_HOLD
  const headline = flowHeadline(
    waiting,
    workingCoins.size,
    holding ? row.hold : null,
    now
  )

  const netByCoin = new Map<string, { net: number; trades: number }>()
  for (const trade of trades) {
    const seen = netByCoin.get(trade.marketKey) ?? { net: 0, trades: 0 }
    netByCoin.set(trade.marketKey, {
      net: seen.net + trade.pnl,
      trades: seen.trades + 1,
    })
  }
  const wordsFor = new Map(waiting.map((one) => [one.marketKey, one]))

  const coins: FlowRunCoin[] = row.spec.marketKeys.map((marketKey) => {
    const wait = wordsFor.get(marketKey) ?? null
    const money = netByCoin.get(marketKey) ?? { net: 0, trades: 0 }
    const working = workingCoins.has(marketKey)
    return {
      marketKey,
      coin: coinOf(marketKey),
      working,
      words: working ? null : (wait?.words ?? null),
      problem: !working && (wait?.problem ?? false),
      netUsd: money.net,
      trades: money.trades,
    }
  })

  return {
    readAt: now,
    head: headOf(
      row,
      wallet,
      named?.name ?? "This flow has been deleted",
      workingCoins.size,
      now
    ),
    spec: row.spec,
    coins,
    waiting,
    headline: headline
      ? { words: headline.words, problem: headline.problem }
      : null,
    positions,
    trades,
    notMine,
    unreachable,
  }
}

/** When the position on a coin was opened, off its earliest unfinished fill. */
function openedAtOf(
  fills: readonly LiveFill[],
  marketKey: string,
  fallback: number
): number {
  const times = fills
    .filter((fill) => fill.marketKey === marketKey)
    .map((fill) => fill.at)
  return times.length > 0 ? Math.min(...times) : fallback
}

/**
 * One coin's orders as chart arrows — what this run did, and only what it did.
 *
 * The words are built here rather than in the browser because they are the same
 * words the Journal uses (`tradeFillMarks`), and a second copy of "sold, made
 * $19.50" would be a second chance to phrase it differently. Fills that belong
 * to somebody else's trade on the same coin are left out entirely.
 */
export async function readFlowRunCoin(
  userId: string,
  runId: string,
  marketKey: string
): Promise<{ marks: LiveFillMark[]; ladders: SmartOrder[] } | null> {
  const [row] = await db
    .select({ walletId: tradeFlowRuns.walletId, spec: tradeFlowRuns.spec })
    .from(tradeFlowRuns)
    .where(and(eq(tradeFlowRuns.userId, userId), eq(tradeFlowRuns.id, runId)))
    .limit(1)
  if (!row) return null

  const wallets = await listWallets(userId)
  const wallet = wallets.find((one) => one.id === row.walletId) ?? null
  if (!wallet) return { marks: [], ladders: [] }

  const [owners, history, working] = await Promise.all([
    orderOwners(userId, [row.walletId]),
    historyOf(userId, [wallet]),
    // The rungs still waiting to buy, drawn on the chart the same way the
    // trading screen draws them.
    //
    // Read off the wallet and this run's coin list — the rule every other
    // screen already uses for "what is this flow working on" — rather than off
    // the stamp. There is one smart order per coin per wallet, so a coin on
    // this run's list with a ladder on it is this run's coin being worked, and
    // demanding a stamp would leave the chart blank for every ladder placed
    // before the stamp existed.
    listActiveSmartOrders(userId, [row.walletId]),
  ])
  const ladders = row.spec.marketKeys.includes(marketKey)
    ? working.filter((one) => one.marketKey === marketKey)
    : []

  const { mine } = splitRunTrades(history.trades, runId, owners)
  const marks = mine
    .filter((trade) => trade.marketKey === marketKey)
    .flatMap((trade) => tradeFillMarks(trade))

  // The position still open has no finished trade to speak for it, so its
  // fills are drawn on their own — they are still orders this run sent.
  if (openPositionIsRunning(history.fills, marketKey, runId, owners)) {
    marks.push(
      ...openFillMarks(
        history.fills.filter((fill) => fill.marketKey === marketKey)
      )
    )
  }

  return { marks: marks.sort((left, right) => left.at - right.at), ladders }
}

/**
 * Throws away the record of runs that are over.
 *
 * **A switched-on run is refused.** Its row is what holds the wallet and what
 * the canvas reads to know a flow is trading; deleting it would leave ladders
 * working in the market with nothing on any screen saying so. Switch it off
 * first — that is the act that ends a run, and it is deliberately not something
 * a Delete button should do quietly on the way past.
 *
 * The trades themselves are not touched. They are made of fills, which are
 * kept forever, and what goes here is the run's own description of itself: its
 * settings, what it was waiting on, and which orders it sent.
 */
export async function deleteFlowRuns(
  userId: string,
  runIds: readonly string[]
): Promise<{ deleted: string[] }> {
  if (runIds.length === 0) return { deleted: [] }

  // Two statements for the whole selection rather than two per run: this
  // database is a long way off, and a page of old runs would otherwise be
  // hundreds of round trips to do one thing.
  const rows = await db
    .delete(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        inArray(tradeFlowRuns.id, [...runIds]),
        // Anything still running is skipped rather than refused outright, so
        // deleting a page of old runs does not fail on the one at the top.
        eq(tradeFlowRuns.status, "stopped")
      )
    )
    .returning({ id: tradeFlowRuns.id })

  const deleted = rows.map((row) => row.id)
  if (deleted.length === 0) return { deleted }

  // The list of orders each sent goes with it. The ladders keep their stamp:
  // it is the record of who placed them, and a record does not become untrue
  // because the thing it points at was tidied away.
  await db
    .delete(tradeFlowRunOrders)
    .where(
      and(
        eq(tradeFlowRunOrders.userId, userId),
        inArray(tradeFlowRunOrders.flowRunId, deleted)
      )
    )
  return { deleted }
}
