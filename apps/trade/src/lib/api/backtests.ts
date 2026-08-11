import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { CANDLE_INTERVALS, parseMarketKey } from "@/lib/protocols/contracts"
import type {
  BacktestListRow,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import { fillMarksFromStored } from "@/lib/trade/backtest/result"
import { userGet, userPost } from "@/server/guards"
import { db } from "@/server/db"
import { loadStoredCandles } from "@/server/trade/candle-store"
import {
  listBacktests,
  readBacktestGroup,
} from "@/server/trade/backtest/store"
import { getProtocol, listProtocols } from "@/server/protocols/registry"
import {
  tradeBacktestGroups,
  tradeBacktests,
} from "@/server/trade/schema"

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
 * The run's long history still comes from Binance. Binance itself can therefore
 * offer its full catalogue, while another exchange is limited to coins that
 * Binance can price. Doing that before selection prevents a run from accepting
 * coins it will later have to skip.
 */
const testableMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      network: z.enum(["mainnet", "testnet"]),
      protocol: z.string().min(1).max(30),
    })
  )
  .handler(async ({ data }) => {
    const entry = listProtocols().find(
      (one) => one.id === data.protocol && one.capabilities.markets
    )
    // Refused by name rather than falling back to a default. A step that
    // quietly listed a different exchange's coins than the one it says would
    // produce a run nobody could explain.
    if (!entry) throw new Error("MARKETS_PROTOCOL")
    const catalog = await entry.markets.fetch(data.network)
    const historyCatalog =
      entry.id === "binance"
        ? catalog
        : await getProtocol("binance").markets.fetch(data.network)
    const historyIds = new Set(historyCatalog.rows.map((row) => row.marketId))
    const rows = catalog.rows.filter((row) => historyIds.has(row.marketId))
    return {
      rows,
      hidden: catalog.rows.length - rows.length,
      /** Whether coins from here can be traded, or only charted and tested. */
      tradeable: entry.capabilities.orders,
    }
  })

export function loadTestableMarkets(
  network: "mainnet" | "testnet",
  protocol: string
) {
  return testableMarketsFn({ data: { network, protocol } })
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
