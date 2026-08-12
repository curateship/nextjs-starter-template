import { randomUUID } from "node:crypto"

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import type { BacktestSpec } from "@/lib/trade/backtest/flow"
import type {
  BacktestCoinSummary,
  BacktestResult,
  BacktestSpecSnapshot,
  BacktestListRow,
  BacktestFill,
  BacktestSummary,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import { walletCostRates } from "@/lib/automations/nodes/trade-wallet"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import {
  tradeBacktestGroups,
  tradeBacktests,
} from "@/server/trade/schema"

/**
 * Where backtest runs are kept, and how one is claimed to be worked on.
 *
 * The rules that matter here are all about a run surviving things going wrong.
 * A claim is held by whichever pass is working on the group, so two overlapping
 * ticks never both run it. A claim older than {@link ORPHAN_AFTER_MS} was left
 * behind by a restart and is taken back. Three failed attempts and the run says
 * so out loud rather than being retried forever.
 */

/** A claim older than this was abandoned by a restart, not by somebody working. */
const ORPHAN_AFTER_MS = 5 * 60_000

/**
 * How many times in a row a group may fail before it gives up honestly.
 *
 * **Failures, not claims.** A run is claimed over and over on purpose — once
 * per handful of coins, letting go between them so a long run never sits inside
 * one tick — so counting claims would abandon any run with more coins than this
 * number times {@link COINS_PER_TICK}, silently, in the middle. It did.
 *
 * The count still goes up on every claim, because a pass that takes the process
 * down with it never reaches a catch. `releaseBacktestGroup` puts it back to
 * zero, so only a pass that never got to the end of its slice leaves a mark.
 */
const MAX_ATTEMPTS = 3

const DAY_MS = 86_400_000

/**
 * The window a run walks: whole bars only, ending at the last bar that has
 * finished.
 *
 * Snapped to the bar grid so two runs started a minute apart cover exactly the
 * same ground. `now` is passed in rather than read here, so nothing about a
 * run's shape depends on when this function happened to be called.
 */
export function backtestWindow(
  now: number,
  days: number,
  intervalMs: number
): { from: number; to: number } {
  const to = Math.floor(now / intervalMs) * intervalMs
  const from = Math.floor((to - days * DAY_MS) / intervalMs) * intervalMs
  return { from, to }
}

function snapshotOf(
  spec: BacktestSpec,
  window: { from: number; to: number }
): BacktestSpecSnapshot {
  return {
    startingUsd: spec.wallet.startingUsd,
    takerFeePct: spec.wallet.takerFeePct,
    makerFeePct: spec.wallet.makerFeePct,
    slippagePct: spec.wallet.slippagePct,
    days: spec.markets.days,
    interval: spec.dca.interval,
    marketKeys: [...spec.markets.marketKeys],
    params: spec.dca.params,
    from: window.from,
    to: window.to,
  }
}

/** The costs a run charges, as the fractions the engine works in. */
export function backtestCosts(snapshot: BacktestSpecSnapshot) {
  return walletCostRates({
    startingUsd: snapshot.startingUsd,
    takerFeePct: snapshot.takerFeePct,
    makerFeePct: snapshot.makerFeePct,
    slippagePct: snapshot.slippagePct,
  })
}

/**
 * Writes one backtest down, waiting to be picked up: the group plus one row per
 * coin.
 *
 * Nothing is run here. The step that reaches this returns straight away and the
 * background worker does the work, which is what keeps a flow's Run press quick
 * however many coins it names.
 */
export async function createBacktest(
  userId: string,
  input: {
    automationId: string
    automationName: string
    spec: BacktestSpec
    now: number
  },
  database: CustomShellDb = db
): Promise<{ groupId: string; coins: number }> {
  const keys = [...new Set(input.spec.markets.marketKeys)].sort()
  const refs = keys.map(parseMarketKey)
  const first = refs[0]
  if (
    !first ||
    refs.some(
      (ref) =>
        !ref ||
        ref.protocol !== first.protocol ||
        ref.network !== first.network ||
        ref.protocol !== input.spec.markets.protocol ||
        ref.network !== "mainnet"
    )
  ) {
    throw new Error("BACKTEST_MARKET")
  }

  const intervalMs = getProtocol(first.protocol).markets.intervalMs(
    input.spec.dca.interval
  )
  const window = backtestWindow(
    input.now,
    input.spec.markets.days,
    intervalMs
  )

  const groupId = randomUUID()
  await database.insert(tradeBacktestGroups).values({
    userId,
    id: groupId,
    automationId: input.automationId,
    automationName: input.automationName,
    spec: snapshotOf(input.spec, window),
    createdAt: new Date(input.now),
  })

  // Alphabetical here as well as inside the engine, so the list on screen is
  // the order the run works in.
  await database.insert(tradeBacktests).values(
    keys.map((marketKey) => ({
      userId,
      id: randomUUID(),
      groupId,
      marketKey,
      symbol: parseMarketKey(marketKey)?.marketId ?? marketKey,
      createdAt: new Date(input.now),
    }))
  )

  return { groupId, coins: keys.length }
}

export type ClaimedGroup = {
  userId: string
  groupId: string
  spec: BacktestSpecSnapshot
  automationId: string
  attempts: number
}

/**
 * Takes hold of one unfinished run, or answers null when there is nothing to
 * do.
 *
 * The claim is written in the same statement that chooses the row, so two
 * passes racing can never both come away with it. A run whose claim has gone
 * stale is fair game — that is how a run orphaned by a restart carries on
 * rather than sitting at "running" forever.
 */
export async function claimBacktestGroup(
  now: number,
  database: CustomShellDb = db
): Promise<ClaimedGroup | null> {
  const stale = new Date(now - ORPHAN_AFTER_MS)
  const free = and(
    isNull(tradeBacktestGroups.finishedAt),
    lt(tradeBacktestGroups.attempts, MAX_ATTEMPTS),
    or(
      isNull(tradeBacktestGroups.claimedAt),
      lt(tradeBacktestGroups.claimedAt, stale)
    )
  )

  const [candidate] = await database
    .select({
      userId: tradeBacktestGroups.userId,
      id: tradeBacktestGroups.id,
    })
    .from(tradeBacktestGroups)
    .where(free)
    // Oldest first, so a queue is a queue.
    .orderBy(asc(tradeBacktestGroups.createdAt))
    .limit(1)
  if (!candidate) return null

  // The same conditions again on the write. Two passes that both picked this
  // row race here and only one comes away with it — the loser gets no row back
  // and simply finds something else on its next tick.
  const rows = await database
    .update(tradeBacktestGroups)
    .set({
      claimedAt: new Date(now),
      attempts: sql`${tradeBacktestGroups.attempts} + 1`,
    })
    .where(
      and(
        eq(tradeBacktestGroups.userId, candidate.userId),
        eq(tradeBacktestGroups.id, candidate.id),
        free
      )
    )
    .returning({
      userId: tradeBacktestGroups.userId,
      groupId: tradeBacktestGroups.id,
      spec: tradeBacktestGroups.spec,
      automationId: tradeBacktestGroups.automationId,
      attempts: tradeBacktestGroups.attempts,
    })

  const claimed = rows[0]
  if (!claimed) return null
  return { ...claimed, attempts: Number(claimed.attempts) }
}

/** Keep a long-running pass from being mistaken for one abandoned by a restart. */
export async function heartbeatBacktestGroup(
  userId: string,
  groupId: string,
  attempt: number,
  now: number = Date.now(),
  database: CustomShellDb = db
): Promise<void> {
  const rows = await database
    .update(tradeBacktestGroups)
    .set({ claimedAt: new Date(now) })
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId),
        eq(tradeBacktestGroups.attempts, attempt),
        isNotNull(tradeBacktestGroups.claimedAt),
        isNull(tradeBacktestGroups.finishedAt)
      )
    )
    .returning({ id: tradeBacktestGroups.id })
  if (rows.length > 0) return

  const [group] = await database
    .select({
      finishedAt: tradeBacktestGroups.finishedAt,
    })
    .from(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId)
      )
    )
  if (group?.finishedAt) return
  throw new Error("BACKTEST_CLAIM_LOST")
}

/**
 * Lets go of a claim after a slice that worked, so the next pass carries on.
 *
 * **This is what clears the failure count.** A run gets through its coins a few
 * at a time, and every one of those passes is a success — only a pass that
 * threw, or one that never came back at all, should count against it.
 */
export async function releaseBacktestGroup(
  userId: string,
  groupId: string,
  attempt: number,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeBacktestGroups)
    .set({ claimedAt: null, attempts: 0 })
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId),
        eq(tradeBacktestGroups.attempts, attempt)
      )
    )
}

/**
 * Lets go of a claim after a pass that threw, **leaving the count alone**.
 *
 * The other release clears it, because a slice that finished is not a failure.
 * Using that one here would zero the count on every failure and the run would
 * retry for ever — which is the same silent limbo the count exists to end,
 * wearing the opposite mistake.
 */
export async function releaseFailedBacktestGroup(
  userId: string,
  groupId: string,
  attempt: number,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeBacktestGroups)
    .set({ claimedAt: null })
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId),
        eq(tradeBacktestGroups.attempts, attempt)
      )
    )
}

/**
 * Gives up on a run out loud.
 *
 * Three tries is enough: something that has failed three times is broken rather
 * than unlucky, and a run that retried forever would keep the worker busy and
 * never say why. Every coin still waiting is marked with the same reason, so
 * the page shows a run that failed rather than one still thinking.
 */
export async function failBacktestGroup(
  userId: string,
  groupId: string,
  message: string,
  now: number,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradeBacktests)
    .set({ status: "error", error: message, progressNote: "Stopped by an error" })
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId),
        inArray(tradeBacktests.status, ["waiting", "running"])
      )
    )

  await database
    .update(tradeBacktestGroups)
    .set({ claimedAt: null, finishedAt: new Date(now) })
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId)
      )
    )
}

/**
 * Marks anything that has run out of tries as failed.
 *
 * Without this a group at the limit is simply never claimed again: unfinished,
 * unclaimed, and still saying "running" on the page forever. A run that gave up
 * has to say so — an honest error beats a spinner that never stops.
 */
export async function failStuckBacktests(
  now: number,
  database: CustomShellDb = db
): Promise<number> {
  const stuck = await database
    .select({
      userId: tradeBacktestGroups.userId,
      id: tradeBacktestGroups.id,
    })
    .from(tradeBacktestGroups)
    .where(
      and(
        isNull(tradeBacktestGroups.finishedAt),
        gte(tradeBacktestGroups.attempts, MAX_ATTEMPTS),
        or(
          isNull(tradeBacktestGroups.claimedAt),
          lt(tradeBacktestGroups.claimedAt, new Date(now - ORPHAN_AFTER_MS))
        )
      )
    )

  for (const group of stuck) {
    await failBacktestGroup(
      group.userId,
      group.id,
      "This run stopped part way through and could not be picked back up. Press Run again to start a fresh one.",
      now,
      database
    )
  }
  return stuck.length
}

export async function backtestStopRequested(
  userId: string,
  groupId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ stop: tradeBacktestGroups.stopRequested })
    .from(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId)
      )
    )
  return row?.stop ?? false
}

/**
 * Finishes a run: the group's summary and heavy result, and every coin's own.
 *
 * One transaction, so a page reading mid-save never sees a finished run with
 * half its coins still waiting.
 */
export async function saveBacktestResult(
  userId: string,
  groupId: string,
  input: {
    attempt: number
    summary: BacktestSummary
    result: BacktestResult
    coins: Array<{
      marketKey: string
      status: "done" | "skipped" | "stopped"
      skipReason: string | null
      summary: BacktestCoinSummary | null
      trades: BacktestTrade[] | null
      fills: BacktestFill[] | null
    }>
    now: number
  },
  database: CustomShellDb = db
): Promise<void> {
  await database.transaction(async (tx) => {
    for (const coin of input.coins) {
      await tx
        .update(tradeBacktests)
        .set({
          status: coin.status,
          progress: 1,
          progressNote:
            coin.status === "done"
              ? "Done"
              : coin.status === "skipped"
                ? "Skipped"
                : "Stopped before this coin was reached",
          skipReason: coin.skipReason,
          summary: coin.summary,
          trades: coin.trades,
          fills: coin.fills,
        })
        .where(
          and(
            eq(tradeBacktests.userId, userId),
            eq(tradeBacktests.groupId, groupId),
            eq(tradeBacktests.marketKey, coin.marketKey)
          )
        )
    }

    const saved = await tx
      .update(tradeBacktestGroups)
      .set({
        summary: input.summary,
        result: input.result,
        claimedAt: null,
        finishedAt: new Date(input.now),
      })
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, groupId),
          eq(tradeBacktestGroups.attempts, input.attempt),
          isNotNull(tradeBacktestGroups.claimedAt),
          isNull(tradeBacktestGroups.finishedAt)
        )
      )
      .returning({ id: tradeBacktestGroups.id })
    if (saved.length === 0) throw new Error("BACKTEST_CLAIM_LOST")
  })
}

/**
 * Clears out the flow's previous unnamed run, now that a newer one has
 * finished.
 *
 * Pressing Run while tuning a strategy makes a run a minute, and a list of
 * forty near-identical ones is a list nobody reads. Naming one is how you say
 * "keep this", and pinning it says so too — so **a named or pinned run is never
 * touched**, and neither is anything belonging to another flow.
 */
export async function replaceUnnamedRuns(
  userId: string,
  automationId: string,
  keepGroupId: string,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .delete(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.automationId, automationId),
        ne(tradeBacktestGroups.id, keepGroupId),
        isNull(tradeBacktestGroups.name),
        eq(tradeBacktestGroups.pinned, false),
        sql`${tradeBacktestGroups.finishedAt} is not null`
      )
    )
}

/** The list page's rows, and the bottom panel's — never the heavy result. */
export async function listBacktests(
  userId: string,
  options: { automationId?: string; includeArchived?: boolean } = {},
  database: CustomShellDb = db
): Promise<BacktestListRow[]> {
  const groups = await database
    .select({
      id: tradeBacktestGroups.id,
      name: tradeBacktestGroups.name,
      automationId: tradeBacktestGroups.automationId,
      automationName: tradeBacktestGroups.automationName,
      pinned: tradeBacktestGroups.pinned,
      archived: tradeBacktestGroups.archived,
      createdAt: tradeBacktestGroups.createdAt,
      finishedAt: tradeBacktestGroups.finishedAt,
      stopRequested: tradeBacktestGroups.stopRequested,
      spec: tradeBacktestGroups.spec,
      summary: tradeBacktestGroups.summary,
    })
    .from(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        options.automationId
          ? eq(tradeBacktestGroups.automationId, options.automationId)
          : undefined,
        options.includeArchived
          ? undefined
          : eq(tradeBacktestGroups.archived, false)
      )
    )
    // Newest first, and nothing else.
    //
    // **Pinning must not reorder this list.** The canvas asks for one flow's
    // runs and takes the first row as "the result of this flow" — so a pinned
    // row sorted to the top became that flow's answer forever, and a run
    // started afterwards was never the one on screen. Pinning is a thing you
    // do to keep a run findable on the Backtests screen, and that screen
    // already floats pinned rows itself when it sorts; doing it here as well
    // was the same decision made twice, in the one place it was wrong.
    .orderBy(desc(tradeBacktestGroups.createdAt))

  if (groups.length === 0) return []

  const coins = await database
    .select({
      groupId: tradeBacktests.groupId,
      status: tradeBacktests.status,
      progress: tradeBacktests.progress,
      progressNote: tradeBacktests.progressNote,
    })
    .from(tradeBacktests)
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        inArray(
          tradeBacktests.groupId,
          groups.map((group) => group.id)
        )
      )
    )

  return groups.map((group) => {
    const own = coins.filter((coin) => coin.groupId === group.id)
    const done = own.filter((coin) => coin.status !== "waiting" && coin.status !== "running")
    // Show the earliest active step. During a large history load, hundreds of
    // coins may already be waiting while a few are still downloading. Picking
    // an arbitrary row said "Waiting for the strategy" and made a moving run
    // look frozen even though those last downloads were still advancing.
    const running = own
      .filter((coin) => coin.status === "running")
      .sort((left, right) => left.progress - right.progress)[0]
    return {
      ...group,
      createdAt: group.createdAt.getTime(),
      finishedAt: group.finishedAt?.getTime() ?? null,
      progress:
        own.length === 0
          ? 0
          : own.reduce((sum, coin) => sum + coin.progress, 0) / own.length,
      progressNote: group.finishedAt
        ? "Done"
        : (running?.progressNote ?? own[0]?.progressNote ?? "Waiting to start"),
      coinsDone: done.length,
      coinsTotal: own.length,
    }
  })
}

/** One run in full — the group, its heavy result, and every coin's row. */
export async function readBacktestGroup(
  userId: string,
  groupId: string,
  database: CustomShellDb = db
) {
  const [group] = await database
    .select()
    .from(tradeBacktestGroups)
    .where(
      and(
        eq(tradeBacktestGroups.userId, userId),
        eq(tradeBacktestGroups.id, groupId)
      )
    )
  if (!group) return null

  const coins = await database
    .select({
      id: tradeBacktests.id,
      marketKey: tradeBacktests.marketKey,
      symbol: tradeBacktests.symbol,
      status: tradeBacktests.status,
      progress: tradeBacktests.progress,
      progressNote: tradeBacktests.progressNote,
      skipReason: tradeBacktests.skipReason,
      error: tradeBacktests.error,
      summary: tradeBacktests.summary,
    })
    .from(tradeBacktests)
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId)
      )
    )
    .orderBy(asc(tradeBacktests.marketKey))

  return { group, coins }
}
