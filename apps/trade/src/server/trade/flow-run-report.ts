import { and, desc, eq, inArray } from "drizzle-orm"

import {
  isWorkingFlowOrder,
  type TradeFlowRunSpec,
  type TradeFlowRunStatus,
} from "@/lib/trade/flow-run"
import {
  describeFlowWait,
  flowHeadline,
  flowWaitIsRetired,
  STRIKES_BEFORE_HOLD,
  type FlowWaiting,
} from "@/lib/trade/flow-waiting"
import {
  openPositionIsRunning,
  splitRunTrades,
  tradeRunId,
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
import { flowStopCounts } from "@/server/trade/flow-run"
import { hasWaitingDcaRungSql } from "@/server/trade/flow-order-working"
import {
  loadPaperHistory,
  loadPaperPortfolio,
  marksForKeys,
} from "@/server/trade/paper"
import {
  tradeFlowRunOrders,
  tradeFlowRuns,
  tradeSmartLadders,
} from "@/server/trade/schema"
import type { LadderPlan } from "@/lib/trade/dca"
import {
  readSmartPlan,
  type SmartLadder,
  type SmartOrder,
} from "@/lib/trade/smart-plan"
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
  /** The same short explanation shown at the top of the run dashboard. */
  headline: { words: string; problem: boolean } | null
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
  walletIds: readonly string[],
  marketKeys?: readonly string[]
): Promise<FlowRunOrderOwners> {
  if (walletIds.length === 0 || marketKeys?.length === 0) return new Map()
  const rows = await db
    .select({
      orderId: tradeFlowRunOrders.orderId,
      flowRunId: tradeFlowRunOrders.flowRunId,
    })
    .from(tradeFlowRunOrders)
    .where(
      and(
        eq(tradeFlowRunOrders.userId, userId),
        inArray(tradeFlowRunOrders.walletId, [...walletIds]),
        marketKeys
          ? inArray(tradeFlowRunOrders.marketKey, [...marketKeys])
          : undefined
      )
    )
  return new Map(rows.map((row) => [row.orderId, row.flowRunId]))
}

/** The exact ladders this run still has waiting, ready for the chart. */
async function waitingRunLadders(
  userId: string,
  runId: string,
  marketKeys: readonly string[]
): Promise<SmartLadder[]> {
  if (marketKeys.length === 0) return []
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.flowRunId, runId),
        eq(tradeSmartLadders.kind, "dca"),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.marketKey, [...marketKeys])
      )
    )

  return rows.flatMap((row) => {
    const plan = readSmartPlan("dca", row.plan) as LadderPlan | null
    if (!plan?.rungs.some((rung) => rung.status === "waiting")) return []
    return [
      {
        id: row.id,
        walletId: row.walletId,
        marketKey: row.marketKey,
        kind: "dca" as const,
        status: "active" as const,
        flowRunId: row.flowRunId,
        plan,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
      },
    ]
  })
}

/** Which coins have waiting rungs that this run itself placed. */
async function workingMarkets(
  userId: string,
  runId: string,
  marketKeys: readonly string[]
): Promise<Set<string>> {
  if (marketKeys.length === 0) return new Set()
  const rows = await db
    .select({
      marketKey: tradeSmartLadders.marketKey,
      kind: tradeSmartLadders.kind,
      hasWaitingDcaRung: hasWaitingDcaRungSql,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.flowRunId, runId),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.marketKey, [...marketKeys])
      )
    )
  return new Set(
    rows
      .filter((row) => isWorkingFlowOrder(row.kind, row.hasWaitingDcaRung))
      .map((row) => row.marketKey)
  )
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

function runWaiting(row: typeof tradeFlowRuns.$inferSelect): FlowWaiting[] {
  return Object.entries(row.waiting)
    .filter(
      ([marketKey, reason]) =>
        row.spec.marketKeys.includes(marketKey) &&
        !flowWaitIsRetired(reason.code)
    )
    .map(([marketKey, reason]) => describeFlowWait(marketKey, reason))
}

function runHeadline(
  row: typeof tradeFlowRuns.$inferSelect,
  waiting: FlowWaiting[],
  working: number,
  now: number
): { words: string; problem: boolean } | null {
  const holding =
    row.pausedAt === null &&
    row.hold !== null &&
    row.hold.strikes >= STRIKES_BEFORE_HOLD
  const headline = flowHeadline(
    waiting,
    working,
    holding ? row.hold : null,
    now
  )
  return headline ? { words: headline.words, problem: headline.problem } : null
}

/** One wallet's finished trades and open fills, from rows already written. */
async function historyOf(
  userId: string,
  wallets: readonly TradeWallet[],
  marketKeys?: readonly string[]
): Promise<{ fills: LiveFill[]; trades: LiveTrade[] }> {
  const live = wallets.filter((wallet) => wallet.kind === "live")
  const paper = wallets.filter((wallet) => wallet.kind === "paper")
  const [fromLive, fromPaper] = await Promise.all([
    loadLiveHistory(
      userId,
      live.map((wallet) => wallet.id),
      undefined,
      marketKeys
    ),
    loadPaperHistory(
      userId,
      paper.map((wallet) => wallet.id),
      undefined,
      marketKeys
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
  now: number = Date.now(),
  onlyRunIds?: readonly string[]
): Promise<FlowRunListRow[]> {
  if (onlyRunIds?.length === 0) return []
  const rows = await db
    .select()
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        onlyRunIds ? inArray(tradeFlowRuns.id, [...onlyRunIds]) : undefined
      )
    )
    .orderBy(desc(tradeFlowRuns.startedAt))
    .limit(onlyRunIds?.length ?? MAX_RUNS)
  if (rows.length === 0) return []

  const wallets = await listWallets(userId)
  const runIds = rows.map((row) => row.id)
  const walletIds = [...new Set(rows.map((row) => row.walletId))]
  const involved = wallets.filter((wallet) => walletIds.includes(wallet.id))
  const marketKeys = [
    ...new Set(
      rows.flatMap((row) => [...row.spec.marketKeys, ...row.placed])
    ),
  ]

  const [names, ladders, owners, history] = await Promise.all([
    db
      .select({
        id: customShellAutomations.id,
        name: customShellAutomations.name,
      })
      .from(customShellAutomations)
      .where(
        and(
          eq(customShellAutomations.userId, userId),
          inArray(
            customShellAutomations.id,
            rows.map((row) => row.automationId)
          )
        )
      ),
    // Only active rows placed by the runs on this page are read. PostgreSQL
    // sends one small fact about the plan rather than the plan itself.
    db
      .select({
        marketKey: tradeSmartLadders.marketKey,
        flowRunId: tradeSmartLadders.flowRunId,
        kind: tradeSmartLadders.kind,
        hasWaitingDcaRung: hasWaitingDcaRungSql,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.flowRunId, runIds),
          eq(tradeSmartLadders.status, "active")
        )
      ),
    // Owners from other runs on the same wallet and coin stay in the answer.
    // A position can outlive its run, and its earliest owner must still win.
    orderOwners(userId, walletIds, marketKeys),
    historyOf(userId, involved, marketKeys),
  ])

  const nameOf = new Map(names.map((one) => [one.id, one.name]))
  // A finished run works nothing, whatever is still on its wallet: what is
  // left there is either somebody else's or a position it deliberately left
  // holding, and neither is this run looking for coins.
  const workingCount = (run: (typeof rows)[number]) =>
    run.status === "stopped"
      ? 0
      : ladders.filter(
          (one) =>
            one.flowRunId === run.id &&
            run.spec.marketKeys.includes(one.marketKey) &&
            isWorkingFlowOrder(one.kind, one.hasWaitingDcaRung)
        ).length

  const stoppingCounts = new Map(
    await Promise.all(
      rows
        .filter((row) => row.status === "stopping")
        .map(
          async (row) =>
            [
              row.id,
              (await flowStopCounts(userId, row.automationId, db)).remaining,
            ] as const
        )
    )
  )

  // One pass over the wallet's trades for every run on the page, rather than
  // one pass per run: this reads every five seconds while anything is running,
  // against a database a long way off.
  const { byRun } = tradesByRun(history.trades, owners)
  const openFillsByPosition = new Map<string, LiveFill[]>()
  for (const fill of history.fills) {
    const key = JSON.stringify([fill.walletId, fill.marketKey])
    const fills = openFillsByPosition.get(key)
    if (fills) fills.push(fill)
    else openFillsByPosition.set(key, [fill])
  }
  const heldByRun = new Map<string, Set<string>>()
  for (const fills of openFillsByPosition.values()) {
    fills.sort((left, right) => left.at - right.at)
    const runId = tradeRunId({ fills }, owners)
    if (!runId) continue
    const coins = heldByRun.get(runId) ?? new Set<string>()
    coins.add(fills[0].marketKey)
    heldByRun.set(runId, coins)
  }

  return rows.map((row) => {
    const wallet = wallets.find((one) => one.id === row.walletId) ?? null
    const mine = byRun.get(row.id) ?? []
    const working = stoppingCounts.get(row.id) ?? workingCount(row)
    const waiting = runWaiting(row)
    return {
      ...headOf(
        row,
        wallet,
        nameOf.get(row.automationId) ?? "This flow has been deleted",
        working,
        now
      ),
      netUsd: mine.reduce((sum, trade) => sum + trade.pnl, 0),
      tradesClosed: mine.length,
      holdingCoins: heldByRun.get(row.id)?.size ?? 0,
      headline: runHeadline(row, waiting, working, now),
    }
  })
}

/** The newest run of every automation, without the history page's 200-row cap. */
export async function listLatestFlowRuns(
  userId: string,
  now: number = Date.now()
): Promise<FlowRunListRow[]> {
  const latest = await db
    .selectDistinctOn([tradeFlowRuns.automationId], {
      id: tradeFlowRuns.id,
    })
    .from(tradeFlowRuns)
    .where(eq(tradeFlowRuns.userId, userId))
    .orderBy(
      tradeFlowRuns.automationId,
      desc(tradeFlowRuns.startedAt),
      desc(tradeFlowRuns.id)
    )
  return listFlowRuns(
    userId,
    now,
    latest.map((run) => run.id)
  )
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

  // Everything below needs only the run row, not each other, so the five
  // reads go out in one wait — asked one after another they were most of
  // this page's load. The history still waits for the wallet list, because
  // it cannot be asked for without knowing which wallet the run trades.
  const [{ wallet, history: written }, [named], workingCoins, stops, owners] =
    await Promise.all([
      (async () => {
        const wallets = await listWallets(userId)
        const wallet = wallets.find((one) => one.id === row.walletId) ?? null
        // A run that has finished is history: its trades cannot change and
        // there is nothing open to price, so the exchange is not asked at
        // all. What is written down first, because it decides whether the
        // exchange is worth asking at all.
        return {
          wallet,
          history: await historyOf(userId, wallet ? [wallet] : []),
        }
      })(),
      db
        .select({ name: customShellAutomations.name })
        .from(customShellAutomations)
        .where(
          and(
            eq(customShellAutomations.userId, userId),
            eq(customShellAutomations.id, row.automationId)
          )
        )
        .limit(1),
      // A stopped flow cannot still be placing rungs. Active rows left behind
      // by its final cancel, or orders placed by hand on the same wallet and
      // coin, belong to the wallet's current state rather than this finished
      // run.
      row.status !== "stopped"
        ? workingMarkets(userId, row.id, row.spec.marketKeys)
        : new Set<string>(),
      row.status === "stopping"
        ? flowStopCounts(userId, row.automationId, db)
        : null,
      orderOwners(userId, [row.walletId]),
    ])
  const stoppingCount = stops ? stops.remaining : null
  let history: { fills: LiveFill[]; trades: LiveTrade[] } = written

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
  if (wallet && (row.status !== "stopped" || stillHolding)) {
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
      openedAt: openedAtOf(
        history.fills,
        position.marketKey,
        row.startedAt.getTime()
      ),
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

  const waiting = runWaiting(row)
  const headline = runHeadline(row, waiting, workingCoins.size, now)

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
      words: working
        ? null
        : (wait?.words ?? (row.status === "stopped" ? "Stopped" : null)),
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
      stoppingCount ?? workingCoins.size,
      now
    ),
    spec: row.spec,
    coins,
    waiting,
    headline,
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
    row.spec.marketKeys.includes(marketKey)
      ? waitingRunLadders(userId, runId, [marketKey])
      : Promise.resolve([]),
  ])
  const ladders = working

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
