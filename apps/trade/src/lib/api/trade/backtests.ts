import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  CANDLE_INTERVALS,
  parseMarketKey,
  type MarketCategory,
  type MarketRow,
} from "@/lib/protocols/contracts"
import type {
  BacktestListRow,
  BacktestTrade,
} from "@/lib/trade/backtest/result"
import { emptyTradePanelLayouts } from "@/lib/trade/panel-layout"
import {
  fillMarksFromStored,
  pairTradesFromStored,
} from "@/lib/trade/backtest/result"
import type { BacktestRunTrade } from "@/lib/trade/backtest/graph"
import { userGet, userPost } from "@/server/guards"
import { db } from "@/server/db"
import { loadStoredCandles } from "@/server/trade/candle-store"
import { loadTradePanelLayouts } from "@/server/trade/prefs"
import {
  deleteBacktestGroups,
  setBacktestFlag,
} from "@/server/trade/backtest/actions"
import { listBacktests, readBacktestGroup } from "@/server/trade/backtest/store"
import { getProtocol, listProtocols } from "@/server/protocols/registry"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { resolveHistorySource } from "@/server/trade/history-source"
import { tradeBacktestGroups, tradeBacktests } from "@/server/trade/schema"

import { createErrorMessage } from "../error-message"

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
 * One exchange's markets, for a flow that trades with a named wallet.
 *
 * A wallet can only trade its own exchange, so the list follows the Wallet
 * step. Every coin in that exchange's catalogue can be chosen; missing or
 * shallow history is the backtest's concern, not this list's.
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

    // Every coin, no funding filter. This list used to hide — then mark —
    // coins on markets the wallet held no money on, built on the rule that
    // Hyperliquid kept each market's money separate. The exchange has since
    // unified the account: orders on any market margin against the one USDC
    // pool, holds moving on their own as orders need them. Measured on
    // 18 Aug 2026 — a wallet's five resting xyz buys held $10.01 straight
    // from its spot balance. There is nothing left to warn about.
    return {
      rows: catalog.rows,
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

/** One row of the one backtest catalogue. */
export type BacktestMarket = {
  /** The history source's key, or the venue's own when no source covers it. */
  key: string
  symbol: string
  category: MarketCategory
  /** The exchanges that list it, by printed name. */
  listedOn: string[]
  /** The highest 24-hour dollar volume any of those exchanges reported. */
  volume24hUsd: number
  /** The source's first bar for this market, or null when the source does not say. */
  firstBar: number | null
  /** True when no source covers it: the run reads the venue's own history. */
  historyFromExchangeOnly: boolean
}

/**
 * One catalogue for every backtest: every trading venue's markets, each
 * mapped to its history source, one row per source.
 *
 * BTC on five venues is one row keyed by Binance's BTC. TSLA on three is one
 * row keyed by Dukascopy's. A market no source covers is still listed, under
 * its own key, marked so. The venue catalogues are already cached for a
 * minute, so the union costs no new exchange calls.
 *
 * Only venues that can trade are walked. Binance and Dukascopy are where the
 * history comes from, not somewhere to pick coins nobody could trade.
 */
const backtestMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<{ rows: BacktestMarket[] }> => {
    const venues = listProtocols().filter(
      (one) =>
        one.capabilities.markets &&
        one.capabilities.orders &&
        one.networks.includes("mainnet")
    )
    const catalogs = await Promise.all(
      venues.map((venue) =>
        loadRawMarketCatalog(venue.id, "mainnet").then(
          (catalog) => catalog,
          // A dead exchange leaves its coins out rather than taking the
          // whole list down; the picker says which exchanges answered.
          () => null
        )
      )
    )

    const bySource = new Map<string, BacktestMarket>()
    for (const catalog of catalogs) {
      if (!catalog) continue
      for (const row of catalog.rows) {
        const source = await resolveHistorySource(row.key)
        const key = source ?? row.key
        const sourceRow = source ? await catalogRow(source) : null
        const found = bySource.get(key)
        if (found) {
          if (!found.listedOn.includes(catalog.protocolLabel)) {
            found.listedOn.push(catalog.protocolLabel)
          }
          found.volume24hUsd = Math.max(found.volume24hUsd, row.volume24hUsd)
          continue
        }
        bySource.set(key, {
          key,
          symbol: sourceRow?.symbol ?? row.symbol,
          // The venue's own word for what it is, unless it has none, in which
          // case the source's word: a Dukascopy instrument's kind is in its
          // id, and everything Binance holds is a coin.
          category:
            row.category !== "other"
              ? row.category
              : (sourceRow?.category ?? "other"),
          listedOn: [catalog.protocolLabel],
          volume24hUsd: row.volume24hUsd,
          firstBar: sourceRow ? await sourceFirstBar(sourceRow.key) : null,
          historyFromExchangeOnly: source === null,
        })
      }
    }

    return {
      rows: [...bySource.values()].sort(
        (left, right) =>
          right.volume24hUsd - left.volume24hUsd ||
          left.symbol.localeCompare(right.symbol)
      ),
    }
  })

export function loadBacktestMarkets() {
  return backtestMarketsFn()
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
    const [found, panelLayouts] = await Promise.all([
      readBacktestGroup(context.user.id, data.groupId),
      loadTradePanelLayouts(context.user.id).catch(emptyTradePanelLayouts),
    ])
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
      panelLayouts,
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
    const matching = spec.strategy.kind === "emaGrid" ? "grid" : "fifo"
    const storedFills = row?.fills ?? []
    return {
      trades: pairTradesFromStored(
        storedFills,
        (row?.trades ?? []) as BacktestTrade[],
        matching
      ),
      // The arrows on the chart: one per fill, at the price and moment it
      // happened. A round trip cannot stand in for these — a five-rung ladder
      // is five arrows, and blending them into one entry hides its shape.
      // Made HERE, when somebody looks — not when the run finished. A change
      // to the wording then shows up on runs that already exist, instead of
      // needing every one of them run again.
      fills: fillMarksFromStored(storedFills, matching),
      interval: spec.interval,
      // Under the coin's history source, which is where the run read them.
      bars: await loadStoredCandles(
        (await resolveHistorySource(data.marketKey)) ?? data.marketKey,
        spec.interval,
        spec.from,
        spec.to
      ),
    }
  })

/**
 * Every round trip the whole run made, stripped to the six things the Graph
 * needs to answer a question about a stretch of time.
 *
 * **One request, not one per coin.** The figures on the run page — win rate,
 * profit factor, how long it was in the market, which coins made money — are
 * all questions about trades, and the answer changes the moment you drag a box
 * across the graph. Asking coin by coin would be 154 requests to draw one row
 * of tiles.
 *
 * It is not the heavy column even so. A trade without its fills, its candles
 * and its prices is six numbers; a 353-trade run is a few tens of kilobytes,
 * against the megabytes of candles behind it. `readBacktestCoinFn` still owns
 * the heavy half, and still answers one coin at a time.
 *
 * Old runs answer too, which is the whole reason this reads the stored trades
 * rather than asking the engine to record something new: nothing has to be run
 * again.
 */
const readBacktestRunTradesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => {
    // Proves the run is this user's before a single trade is read — the same
    // first move as every other door in this file.
    const found = await readBacktestGroup(context.user.id, data.groupId)
    if (!found) throw new Error("BACKTEST_NOT_FOUND")

    const rows = await db
      .select({
        symbol: tradeBacktests.symbol,
        trades: tradeBacktests.trades,
      })
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.userId, context.user.id),
          eq(tradeBacktests.groupId, data.groupId)
        )
      )

    const trades: BacktestRunTrade[] = []
    for (const row of rows) {
      for (const trade of (row.trades ?? []) as BacktestTrade[]) {
        trades.push({
          coin: row.symbol,
          entryAt: trade.entryAt,
          exitAt: trade.exitAt,
          amountUsd: trade.amountUsd,
          pnl: trade.pnl,
          // The only place this fact exists per trade. The summary counts
          // liquidations; it cannot say which one, or when.
          liquidated: trade.exitReason === "liquidated",
        })
      }
    }
    // In the order they finished, so the page can sweep them once against the
    // pot's own line instead of sorting on every drag. Still-open trades have
    // no exit, and go last.
    //
    // The open ones are compared by hand rather than by standing in for their
    // exit with `Infinity`: two of those subtract to NaN, and a comparator that
    // answers NaN leaves the sort free to order them however it likes.
    trades.sort((one, two) => {
      if (one.exitAt === null) return two.exitAt === null ? 0 : 1
      if (two.exitAt === null) return -1
      return one.exitAt - two.exitAt
    })
    return { trades }
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

const pinBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(flagSchema)
  .handler(({ data, context }) =>
    setBacktestFlag(context.user.id, data.groupIds, "pinned", data.on)
  )

const archiveBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(flagSchema)
  .handler(({ data, context }) =>
    setBacktestFlag(context.user.id, data.groupIds, "archived", data.on)
  )

const deleteSchema = z.object({
  groupIds: z.array(z.string().max(36)).min(1).max(100),
})

const deleteBacktestsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteSchema)
  .handler(({ data, context }) =>
    deleteBacktestGroups(context.user.id, data.groupIds)
  )

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

export function loadBacktestRunTrades(groupId: string) {
  return readBacktestRunTradesFn({ data: { groupId } })
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

/** A source's own catalogue row for one of its keys. Cached with the catalogue. */
async function catalogRow(key: string): Promise<MarketRow | null> {
  const ref = parseMarketKey(key)
  if (!ref) return null
  const catalog = await loadRawMarketCatalog(ref.protocol, ref.network)
  return catalog.rows.find((row) => row.key === key) ?? null
}

/** The first hour bar a source could have for this market, when it says. */
async function sourceFirstBar(key: string): Promise<number | null> {
  const ref = parseMarketKey(key)
  if (!ref) return null
  return (
    getProtocol(ref.protocol).markets.historyFloor?.(ref.marketId, "1h") ??
    null
  )
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
