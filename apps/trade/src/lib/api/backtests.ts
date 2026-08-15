import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { CANDLE_INTERVALS, parseMarketKey } from "@/lib/protocols/contracts"
import type {
  BacktestListRow,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import { fillMarksFromStored } from "@/lib/trade/backtest/result"
import { userGet, userPost } from "@/server/guards"
import { db } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomationRunSteps,
} from "@/server/schema"
import { loadStoredCandles } from "@/server/trade/candle-store"
import {
  listBacktests,
  readBacktestGroup,
} from "@/server/trade/backtest/store"
import { listProtocols } from "@/server/protocols/registry"
import {
  tradeBacktestGroups,
  tradeBacktests,
} from "@/server/trade/schema"

import { marketsWalletHasMoneyOn } from "@/server/protocols/hyperliquid/user-markets"
import { findWallet } from "@/server/trade/wallets"

import { createErrorMessage } from "./error-message"

/**
 * The doors onto saved backtests: read the list, read one run, follow one that
 * is still going, and the four things you can do to a saved one — name it, pin
 * it, archive it, delete it — plus Stop.
 *
 * **Starting a run is deliberately not here.** The DCA step's executor starts
 * it on the server, from the saved flow, which is the only way to be sure the
 * run tested what the canvas actually holds. An endpoint taking a spec from the
 * browser would let a page ask for a test of settings nobody drew.
 */

/**
 * One exchange's markets, for the step that picks which coins to work on.
 *
 * History follows the selected protocol, so every market in that protocol's
 * catalogue can be selected. Missing or shallow history is recorded by the
 * candle store rather than guessed from another exchange's catalogue.
 */
const testableMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      network: z.enum(["mainnet", "testnet"]),
      protocol: z.string().min(1).max(30),
      /** The wallet this list is for, so it can leave out what it cannot pay for. */
      walletId: z.string().max(36).nullable().default(null),
    })
  )
  .handler(async ({ data, context }) => {
    const entry = listProtocols().find(
      (one) => one.id === data.protocol && one.capabilities.markets
    )
    // Refused by name rather than falling back to a default. A step that
    // quietly listed a different exchange's coins than the one it says would
    // produce a run nobody could explain.
    if (!entry) throw new Error("MARKETS_PROTOCOL")
    const catalog = await entry.markets.fetch(data.network)

    // Coins the wallet could not pay for are left out entirely.
    //
    // **Hyperliquid keeps each market's money separate.** It hosts a main
    // market plus however many others people have opened, and cash in the main
    // account does not back a trade on one of the others — the exchange
    // refuses those with "Insufficient margin" however healthy the balance
    // looks. Offering them is offering a coin that can never fill, and the
    // refusal arrives days later on a flow that looks perfectly healthy.
    //
    // Only ever narrowed for a live wallet with a funded-markets answer to
    // hand. Practice money is not on the exchange at all, and an answer that
    // has not arrived is never treated as "nothing" — a coin hidden because
    // the app had not heard yet is one nobody can find or explain.
    const funded = data.walletId
      ? await marketsWalletCanPayFor(context.user.id, data.walletId)
      : null
    const rows =
      funded === null
        ? catalog.rows
        : catalog.rows.filter((row) => funded.has(marketOf(row.marketId)))

    return {
      rows,
      /** Whether coins from here can be traded, or only charted and tested. */
      tradeable: entry.capabilities.orders,
    }
  })

/**
 * Which of the exchange's markets this wallet's money is actually on, or null
 * when that cannot be answered and nothing should be narrowed.
 */
async function marketsWalletCanPayFor(
  userId: string,
  walletId: string
): Promise<Set<string> | null> {
  const wallet = await findWallet(userId, walletId)
  // Practice money is not on the exchange, so nothing is out of reach.
  if (!wallet || wallet.kind !== "live" || !wallet.address) return null
  const funded = marketsWalletHasMoneyOn(wallet.network, wallet.address)
  if (funded === null) return null
  // The main market is always offered: it is where a wallet's cash sits, and a
  // brand new wallet with nothing in it should still be able to pick a coin.
  return new Set([...funded, ""])
}

/** The market a coin belongs to — "xyz" in `xyz:IBM`, "" on the main one. */
function marketOf(marketId: string): string {
  const colon = marketId.indexOf(":")
  return colon > 0 ? marketId.slice(0, colon) : ""
}

export function loadTestableMarkets(
  network: "mainnet" | "testnet",
  protocol: string,
  walletId: string | null = null
) {
  return testableMarketsFn({ data: { network, protocol, walletId } })
}

/** Every exchange that can list markets, for the step's exchange picker. */
const marketProtocolsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () =>
    listProtocols()
      .filter((one) => one.capabilities.markets)
      .map((one) => ({
        id: one.id,
        label: one.label,
        defaultNetwork: one.defaultNetwork,
        /** False means its coins can be tested but not traded — yet. */
        tradeable: one.capabilities.orders,
      }))
  )

export function loadMarketProtocols() {
  return marketProtocolsFn()
}

const groupIdSchema = z.object({ groupId: z.string().max(36) })

const listSchema = z.object({
  automationId: z.string().max(36).optional(),
  includeArchived: z.boolean().optional(),
})

const listBacktestsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<{ runs: BacktestListRow[] }> => {
    return {
      runs: await listBacktests(context.user.id, {
        automationId: data.automationId,
        includeArchived: data.includeArchived ?? false,
      }),
    }
  })

/**
 * The last time this flow was run, and whether it produced a backtest at all.
 *
 * **Why this exists.** Pressing Run on a flow whose settings the backtest
 * refuses — 406 coins when 384 is the most that fits in memory, say — finishes
 * the run in a few milliseconds, writes the reason on the step's row in the run
 * history, and creates no backtest. The canvas panel is watching the list of
 * backtests, so from where it sits absolutely nothing happened: it kept showing
 * the run from an hour ago, over a spinner that never stopped, and the sentence
 * explaining why was three screens away.
 *
 * So the panel asks this as well. A press that produced no run comes back with
 * the reason on it, in the same words the run history uses.
 */
const lastBacktestAttemptFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ automationId: z.string().max(36) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      /** Null when this flow has never been run. */
      attempt: {
        runId: string
        startedAt: number
        /** Null while it is still going. */
        finishedAt: number | null
        /**
         * Why nothing was tested, or null when a backtest did come out of it.
         *
         * Taken off the DCA ladder step, which is the step that starts the run
         * and therefore the step that refuses it.
         */
        problem: string | null
      } | null
    }> => {
      const [run] = await db
        .select({
          id: customShellAutomationRuns.id,
          startedAt: customShellAutomationRuns.startedAt,
          finishedAt: customShellAutomationRuns.finishedAt,
        })
        .from(customShellAutomationRuns)
        .where(
          and(
            eq(customShellAutomationRuns.automationId, data.automationId),
            eq(customShellAutomationRuns.userId, context.user.id)
          )
        )
        .orderBy(desc(customShellAutomationRuns.startedAt))
        .limit(1)
      if (!run) return { attempt: null }

      // A run still going has not refused anything yet, so there is nothing to
      // report and nothing to read.
      if (run.finishedAt === null) {
        return {
          attempt: {
            runId: run.id,
            startedAt: run.startedAt.getTime(),
            finishedAt: null,
            problem: null,
          },
        }
      }

      // A backtest carries the run that made it, so this is the whole test of
      // whether the press landed. It is one row either way.
      const [group] = await db
        .select({ id: tradeBacktestGroups.id })
        .from(tradeBacktestGroups)
        .where(eq(tradeBacktestGroups.automationRunId, run.id))
        .limit(1)

      if (group) {
        return {
          attempt: {
            runId: run.id,
            startedAt: run.startedAt.getTime(),
            finishedAt: run.finishedAt.getTime(),
            problem: null,
          },
        }
      }

      const [step] = await db
        .select({ summary: customShellAutomationRunSteps.summary })
        .from(customShellAutomationRunSteps)
        .where(
          and(
            eq(customShellAutomationRunSteps.runId, run.id),
            eq(customShellAutomationRunSteps.kind, "tradeDca")
          )
        )
        .limit(1)

      return {
        attempt: {
          runId: run.id,
          startedAt: run.startedAt.getTime(),
          finishedAt: run.finishedAt.getTime(),
          // The step's own words, or a plain fallback if the run never reached
          // it — a flow missing one of the three steps stops earlier than this.
          problem:
            step?.summary ??
            "That run did not reach the DCA ladder step, so nothing was tested.",
        },
      }
    }
  )

export function loadLastBacktestAttempt(automationId: string) {
  return lastBacktestAttemptFn({ data: { automationId } })
}

const readBacktestFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => {
    const found = await readBacktestGroup(context.user.id, data.groupId)
    if (!found) throw new Error("BACKTEST_NOT_FOUND")

    const { group, coins } = found
    return {
      run: {
        id: group.id,
        name: group.name,
        automationId: group.automationId,
        automationName: group.automationName,
        pinned: group.pinned,
        archived: group.archived,
        stopRequested: group.stopRequested,
        createdAt: group.createdAt.getTime(),
        finishedAt: group.finishedAt?.getTime() ?? null,
        spec: group.spec,
        summary: group.summary,
        result: group.result,
      },
      coins: coins.map((coin) => ({
        ...coin,
        // The trades are the heavy column and are asked for one coin at a
        // time, by the chart. A run page loading twenty coins' trades to draw
        // a table of twenty numbers would load months of them for nothing.
      })),
    }
  })

const coinSchema = z.object({
  groupId: z.string().max(36),
  marketKey: z
    .string()
    .max(120)
    .refine((key) => parseMarketKey(key) !== null, { message: "PAPER_MARKET" }),
})

/**
 * One coin's trades and the candles behind them — what the chart draws.
 *
 * The candles come from the store rather than the exchange, so what is drawn
 * is exactly what the run walked. Asking the exchange again could answer with
 * a revised bar and put a mark somewhere the trade never happened.
 */
const readBacktestCoinFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(coinSchema)
  .handler(async ({ data, context }) => {
    const found = await readBacktestGroup(context.user.id, data.groupId)
    if (!found) throw new Error("BACKTEST_NOT_FOUND")

    const [row] = await db
      .select({ trades: tradeBacktests.trades, fills: tradeBacktests.fills })
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.userId, context.user.id),
          eq(tradeBacktests.groupId, data.groupId),
          eq(tradeBacktests.marketKey, data.marketKey)
        )
      )

    const { spec } = found.group
    return {
      trades: (row?.trades ?? []) as BacktestTrade[],
      // The arrows on the chart: one per fill, at the price and moment it
      // happened. A round trip cannot stand in for these — a five-rung ladder
      // is five arrows, and blending them into one entry hides its shape.
      // Made HERE, when somebody looks — not when the run finished. A change
      // to the wording then shows up on runs that already exist, instead of
      // needing every one of them run again.
      fills: fillMarksFromStored(row?.fills ?? []),
      interval: spec.interval,
      bars: await loadStoredCandles(
        data.marketKey,
        spec.interval,
        spec.from,
        spec.to
      ),
    }
  })

const renameSchema = z.object({
  groupId: z.string().max(36),
  /** Empty clears the name, which also puts the run back in line to be replaced. */
  name: z.string().trim().max(120),
})

const renameBacktestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(renameSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await db
      .update(tradeBacktestGroups)
      .set({ name: data.name === "" ? null : data.name })
      .where(
        and(
          eq(tradeBacktestGroups.userId, context.user.id),
          eq(tradeBacktestGroups.id, data.groupId)
        )
      )
    return { saved: true }
  })

const flagSchema = z.object({
  groupIds: z.array(z.string().max(36)).min(1).max(100),
  on: z.boolean(),
})

/** One request for however many rows were selected — see the UI standards. */
async function setFlag(
  userId: string,
  groupIds: readonly string[],
  patch: { pinned?: boolean; archived?: boolean }
): Promise<{ changed: string[] }> {
  const changed: string[] = []
  for (const groupId of groupIds) {
    const rows = await db
      .update(tradeBacktestGroups)
      .set(patch)
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.id, groupId)
        )
      )
      .returning({ id: tradeBacktestGroups.id })
    if (rows[0]) changed.push(rows[0].id)
  }
  return { changed }
}

const pinBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(flagSchema)
  .handler(({ data, context }) =>
    setFlag(context.user.id, data.groupIds, { pinned: data.on })
  )

const archiveBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(flagSchema)
  .handler(({ data, context }) =>
    setFlag(context.user.id, data.groupIds, { archived: data.on })
  )

const deleteSchema = z.object({
  groupIds: z.array(z.string().max(36)).min(1).max(100),
})

const deleteBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteSchema)
  .handler(async ({ data, context }): Promise<{ deleted: string[] }> => {
    const deleted: string[] = []
    for (const groupId of data.groupIds) {
      const rows = await db
        .delete(tradeBacktestGroups)
        .where(
          and(
            eq(tradeBacktestGroups.userId, context.user.id),
            eq(tradeBacktestGroups.id, groupId)
          )
        )
        .returning({ id: tradeBacktestGroups.id })
      if (rows[0]) deleted.push(rows[0].id)
    }
    return { deleted }
  })

/**
 * Asks a run to stop. Safe to press twice: it sets a flag rather than doing
 * anything, and the flag is already true the second time.
 *
 * The run notices between chunks, keeps whatever coins already finished, and
 * marks the rest as stopped before they were reached.
 */
const stopBacktestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }): Promise<{ stopping: true }> => {
    await db
      .update(tradeBacktestGroups)
      .set({ stopRequested: true })
      .where(
        and(
          eq(tradeBacktestGroups.userId, context.user.id),
          eq(tradeBacktestGroups.id, data.groupId)
        )
      )
    return { stopping: true }
  })

export function loadBacktests(input: z.infer<typeof listSchema> = {}) {
  return listBacktestsFn({ data: input })
}

export function loadBacktest(groupId: string) {
  return readBacktestFn({ data: { groupId } })
}

export function loadBacktestCoin(groupId: string, marketKey: string) {
  return readBacktestCoinFn({ data: { groupId, marketKey } })
}

export function renameBacktest(groupId: string, name: string) {
  return renameBacktestFn({ data: { groupId, name } })
}

export function pinBacktests(groupIds: string[], on: boolean) {
  return pinBacktestsFn({ data: { groupIds, on } })
}

export function archiveBacktests(groupIds: string[], on: boolean) {
  return archiveBacktestsFn({ data: { groupIds, on } })
}

export function deleteBacktests(groupIds: string[]) {
  return deleteBacktestsFn({ data: { groupIds } })
}

export function stopBacktest(groupId: string) {
  return stopBacktestFn({ data: { groupId } })
}

export const getBacktestErrorMessage = createErrorMessage(
  {
    BACKTEST_NOT_FOUND:
      "That backtest is not here any more. It may have been deleted or replaced by a newer run of the same flow.",
    PAPER_MARKET: "That is not a market this app knows.",
  },
  "That did not work. Try it again in a moment."
)

/** Kept so the candle interval list has one home the browser can read. */
export const BACKTEST_INTERVALS = CANDLE_INTERVALS

export type { BacktestListRow }
