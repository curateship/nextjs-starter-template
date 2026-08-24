import { eq, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { readCardFolds, type CardFolds } from "@/lib/trade/card-folds"
import {
  readChartOptions,
  type ChartOptions,
} from "@/lib/trade/chart-options"
import { readChartView, type ChartView } from "@/lib/trade/chart-view"
import { dcaParamsSchema, type DcaParams } from "@/lib/trade/dca"
import { gridParamsSchema, type GridParams } from "@/lib/trade/grid"
import {
  normalizeTradingDashboardWidgets,
  type TradingDashboardWidgetLayout,
} from "@/lib/trade/dashboard/widgets"
import {
  readQuickOrderPrefs,
  type QuickOrderPrefs,
} from "@/lib/trade/quick-order"
import {
  readIndicatorSettings,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import {
  readOrderStyle,
  type OrderStyle,
} from "@/lib/trade/order-style"
import {
  minimumMarketVolumeSchema,
  readMinimumMarketVolume,
} from "@/lib/trade/market-volume"
import {
  readMarketPanelRows,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import {
  liquidationWarningSchema,
  readLiquidationWarning,
  type LiquidationWarning,
} from "@/lib/trade/liquidation-warning"
import { db, type CustomShellDb } from "@/server/db"
import { tradePrefs } from "@/server/trade/schema"

/** Everything a dashboard needs from the preference row, read in one query. */
export type DashboardPrefs = {
  lastMarketKey: string | null
  minimumMarketVolumeUsd: number
  chartView: ChartView | null
  chartOptions: ChartOptions
  indicators: IndicatorSettings
  cardFolds: CardFolds
  quickOrder: QuickOrderPrefs
  marketPanelRows: MarketPanelRows
  /**
   * The two smart-order windows' saved settings ride along too, so the first
   * right-click after a page load opens on them with nothing left to fetch.
   */
  smartDca: DcaParams | null
  smartGrid: GridParams | null
}

/** One exchange and network — the scope a panel layout belongs to. */
export type MarketPanelScope = { protocol: ProtocolId; network: NetworkId }

function panelScopeKey(scope: MarketPanelScope) {
  return `${scope.protocol}:${scope.network}`
}

/**
 * The dashboard's eight preferences in ONE round trip.
 *
 * Opening a dashboard used to make seven separate reads of this same row, one
 * column each, and each read paid a full session lookup first. Against a
 * database 120 ms away that was most of the wait before the first paint. Each
 * column still goes through the same reader as its single-column loader, so a
 * value this build cannot read falls back exactly as before.
 */
export async function loadDashboardPrefs(
  userId: string,
  scope: MarketPanelScope
): Promise<DashboardPrefs> {
  const row = await db
    .select({
      lastMarketKeys: tradePrefs.lastMarketKeys,
      minimumMarketVolumeUsd: tradePrefs.minimumMarketVolumeUsd,
      chartView: tradePrefs.chartView,
      chartOptions: tradePrefs.chartOptions,
      indicators: tradePrefs.indicators,
      cardFolds: tradePrefs.cardFolds,
      quickOrder: tradePrefs.quickOrder,
      marketPanelRows: tradePrefs.marketPanelRows,
      smartDca: tradePrefs.smartDca,
      smartGrid: tradePrefs.smartGrid,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const found = row[0]
  return {
    lastMarketKey: lastMarketKeyFor(found?.lastMarketKeys, scope.protocol),
    marketPanelRows: readMarketPanelRows(
      found?.marketPanelRows?.[panelScopeKey(scope)]
    ),
    minimumMarketVolumeUsd: readMinimumMarketVolume(
      found?.minimumMarketVolumeUsd
    ),
    chartView: readChartView(found?.chartView ?? null),
    chartOptions: readChartOptions(found?.chartOptions ?? null),
    indicators: readIndicatorSettings(found?.indicators ?? null),
    cardFolds: readCardFolds(found?.cardFolds ?? null),
    quickOrder: readQuickOrderPrefs(found?.quickOrder ?? null),
    smartDca: readSmartParams(dcaParamsSchema, found?.smartDca),
    smartGrid: readSmartParams(gridParamsSchema, found?.smartGrid),
  }
}

/** A stored value through its own schema; junk reads as "nothing saved". */
function readSmartParams<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown
): T | null {
  const parsed = schema.safeParse(value ?? null)
  return parsed.success ? (parsed.data as T) : null
}

function lastMarketKeyFor(
  keys: Record<string, unknown> | null | undefined,
  protocol: ProtocolId
): string | null {
  const key = keys?.[protocol]
  // A saved key that no longer parses, or that was filed under the wrong
  // exchange by a bad hand-edit, resolves to "nothing remembered" rather
  // than to some other exchange's market.
  if (typeof key !== "string") return null
  return parseMarketKey(key)?.protocol === protocol ? key : null
}

/**
 * The market this person was last looking at ON THIS EXCHANGE, or null on a
 * first visit to it.
 *
 * Per exchange, because each one has its own dashboard: a single memory
 * shared by all of them meant only the most recently used dashboard reopened
 * on a chart, and every other one opened blank as though it were broken.
 */
export async function loadLastMarketKey(
  userId: string,
  protocol: ProtocolId
): Promise<string | null> {
  const row = await db
    .select({ lastMarketKeys: tradePrefs.lastMarketKeys })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return lastMarketKeyFor(row[0]?.lastMarketKeys, protocol)
}

/**
 * Remember it under its own exchange — whole-row upsert, the same shape the
 * favourites save uses. The key names the exchange itself, so nothing has to
 * be passed alongside it and the two can never disagree.
 */
export async function saveLastMarketKey(
  userId: string,
  lastMarketKey: string
): Promise<void> {
  const ref = parseMarketKey(lastMarketKey)
  if (!ref) return

  const row = await db
    .select({ lastMarketKeys: tradePrefs.lastMarketKeys })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const lastMarketKeys = {
    ...(row[0]?.lastMarketKeys ?? {}),
    [ref.protocol]: lastMarketKey,
  }

  await db
    .insert(tradePrefs)
    .values({ userId, lastMarketKeys, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { lastMarketKeys, updatedAt: new Date() },
    })
}

/** The account-wide daily dollar volume below which markets disappear. */
export async function loadMinimumMarketVolume(userId: string): Promise<number> {
  const row = await db
    .select({ value: tradePrefs.minimumMarketVolumeUsd })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readMinimumMarketVolume(row[0]?.value)
}

/** Remember one cutoff for every protocol this account visits. */
export async function saveMinimumMarketVolume(
  userId: string,
  value: number
): Promise<number> {
  const minimumMarketVolumeUsd = minimumMarketVolumeSchema.parse(value)
  await db
    .insert(tradePrefs)
    .values({ userId, minimumMarketVolumeUsd, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { minimumMarketVolumeUsd, updatedAt: new Date() },
    })
  return minimumMarketVolumeUsd
}

/** The account-wide distance that asks the engine to warn before liquidation. */
export async function loadLiquidationWarning(
  userId: string,
  database: CustomShellDb = db
): Promise<LiquidationWarning> {
  const [row] = await database
    .select({
      usd: tradePrefs.liquidationWarnUsd,
      pct: tradePrefs.liquidationWarnPct,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readLiquidationWarning(row ?? {})
}

/** Blank values are null, which switches that half of the warning off. */
export async function saveLiquidationWarning(
  userId: string,
  value: LiquidationWarning
): Promise<LiquidationWarning> {
  const warning = liquidationWarningSchema.parse(value)
  await db
    .insert(tradePrefs)
    .values({
      userId,
      liquidationWarnUsd: warning.usd,
      liquidationWarnPct: warning.pct,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        liquidationWarnUsd: warning.usd,
        liquidationWarnPct: warning.pct,
        updatedAt: new Date(),
      },
    })
  return warning
}

/**
 * The wallet the account panel last had active on each exchange, keyed by
 * protocol id. Empty before any choice has been made anywhere.
 *
 * Handed over whole rather than one exchange at a time: the browser already
 * knows which dashboard is drawing, and one read serves all of them.
 */
export async function loadLastWalletIds(
  userId: string
): Promise<Record<string, string>> {
  const row = await db
    .select({ lastWalletIds: tradePrefs.lastWalletIds })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row[0]?.lastWalletIds ?? {}
}

/**
 * Remember it under its own exchange. The wallet row names its exchange, so
 * the caller passes what it already looked up and the two can never disagree.
 */
export async function saveLastWalletId(
  userId: string,
  protocol: ProtocolId,
  walletId: string
): Promise<void> {
  const row = await db
    .select({ lastWalletIds: tradePrefs.lastWalletIds })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const lastWalletIds = {
    ...(row[0]?.lastWalletIds ?? {}),
    [protocol]: walletId,
  }

  await db
    .insert(tradePrefs)
    .values({ userId, lastWalletIds, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { lastWalletIds, updatedAt: new Date() },
    })
}

/** The trading dashboard arrangement, separate from the platform Overview. */
export async function loadTradingDashboardWidgets(
  userId: string
): Promise<TradingDashboardWidgetLayout> {
  const row = await db
    .select({ dashboardWidgets: tradePrefs.dashboardWidgets })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return normalizeTradingDashboardWidgets(row[0]?.dashboardWidgets)
}

/** Remember the complete arrangement against this account. */
export async function saveTradingDashboardWidgets(
  userId: string,
  value: unknown
): Promise<TradingDashboardWidgetLayout> {
  const dashboardWidgets = normalizeTradingDashboardWidgets(value)
  await db
    .insert(tradePrefs)
    .values({ userId, dashboardWidgets, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { dashboardWidgets, updatedAt: new Date() },
    })
  return dashboardWidgets
}

/**
 * How far the chart was zoomed and scrolled, or null on a first visit.
 *
 * Read back through the same validator it went in through: a value written by
 * a build that meant something else by it is dropped, and the chart frames its
 * own history instead — never applied as a view it is not.
 */
export async function loadChartView(userId: string): Promise<ChartView | null> {
  const row = await db
    .select({ chartView: tradePrefs.chartView })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readChartView(row[0]?.chartView ?? null)
}

/** Remember it. */
export async function saveChartView(
  userId: string,
  chartView: ChartView
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, chartView, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { chartView, updatedAt: new Date() },
    })
}

/** Which supporting chart parts this person chose to show. */
export async function loadChartOptions(userId: string): Promise<ChartOptions> {
  const row = await db
    .select({ chartOptions: tradePrefs.chartOptions })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readChartOptions(row[0]?.chartOptions ?? null)
}

/** Remember the complete choice so the three switches can never drift apart. */
export async function saveChartOptions(
  userId: string,
  chartOptions: ChartOptions
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, chartOptions, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { chartOptions, updatedAt: new Date() },
    })
}

/**
 * The DCA window's last-used settings, or null on a first use. Read back
 * through the same validator they went in through, so a value an older build
 * wrote falls back to the defaults instead of half-filling the window.
 */
export async function loadSmartDca(userId: string): Promise<DcaParams | null> {
  const row = await db
    .select({ smartDca: tradePrefs.smartDca })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const parsed = dcaParamsSchema.safeParse(row[0]?.smartDca ?? null)
  return parsed.success ? parsed.data : null
}

/** Remember them — saved after a successful place, never on every keystroke. */
export async function saveSmartDca(
  userId: string,
  smartDca: DcaParams
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, smartDca, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { smartDca, updatedAt: new Date() },
    })
}

/**
 * Which indicators are on and what each is set to.
 *
 * Never null: a first visit and a row this build cannot read both come back as
 * everything off at its own defaults, which is a working chart either way.
 */
export async function loadIndicators(
  userId: string
): Promise<IndicatorSettings> {
  const row = await db
    .select({ indicators: tradePrefs.indicators })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readIndicatorSettings(row[0]?.indicators ?? null)
}

/** Remember them — saved once the chart has been left alone for a moment. */
export async function saveIndicators(
  userId: string,
  indicators: IndicatorSettings
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, indicators, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { indicators, updatedAt: new Date() },
    })
}

/**
 * Which settings cards were left folded away. Empty for somebody who has never
 * folded one, which every card reads as "open me the way you always did".
 */
export async function loadCardFolds(userId: string): Promise<CardFolds> {
  const row = await db
    .select({ cardFolds: tradePrefs.cardFolds })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readCardFolds(row[0]?.cardFolds ?? null)
}

/** Remember them — saved once the window has been left alone for a moment. */
export async function saveCardFolds(
  userId: string,
  cardFolds: CardFolds
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, cardFolds, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { cardFolds, updatedAt: new Date() },
    })
}

/**
 * The grid window's last-used settings, or null on a first use. Its own column
 * beside `smart_dca` rather than folded into it: the two windows ask for
 * different things, and each is validated by its own schema on the way in and
 * out, so junk from an older build falls back to that window's defaults alone.
 */
export async function loadSmartGrid(userId: string): Promise<GridParams | null> {
  const row = await db
    .select({ smartGrid: tradePrefs.smartGrid })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const parsed = gridParamsSchema.safeParse(row[0]?.smartGrid ?? null)
  return parsed.success ? parsed.data : null
}

/** Remember them — saved after a successful place, never on every keystroke. */
export async function saveSmartGrid(
  userId: string,
  smartGrid: GridParams
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, smartGrid, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { smartGrid, updatedAt: new Date() },
    })
}

/**
 * How the right-click order window was last set up. Never null: a first visit
 * and a row this build cannot read both come back as the plain defaults, which
 * is a working window either way.
 */
export async function loadQuickOrder(
  userId: string
): Promise<QuickOrderPrefs> {
  const row = await db
    .select({ quickOrder: tradePrefs.quickOrder })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readQuickOrderPrefs(row[0]?.quickOrder ?? null)
}

/** Remember it — saved after an order really went, never on every keystroke. */
export async function saveQuickOrder(
  userId: string,
  quickOrder: QuickOrderPrefs
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, quickOrder, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { quickOrder, updatedAt: new Date() },
    })
}

/** How this person's plain orders wait: on the exchange, or watched here. */
export async function loadOrderStyle(userId: string): Promise<OrderStyle> {
  const row = await db
    .select({ orderStyle: tradePrefs.orderStyle })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readOrderStyle(row[0]?.orderStyle)
}

export async function saveOrderStyle(
  userId: string,
  orderStyle: OrderStyle
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, orderStyle, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { orderStyle, updatedAt: new Date() },
    })
}

/**
 * Remember them under their own exchange and network, leaving every other
 * exchange's arrangement alone. Written inside the same transaction as the
 * folder places it was dragged with, so the panel can never come back with
 * half of one drag.
 */
export async function saveMarketPanelRows(
  userId: string,
  scope: MarketPanelScope,
  rows: MarketPanelRows,
  database: CustomShellDb = db
): Promise<MarketPanelRows> {
  const patch = { [panelScopeKey(scope)]: rows }
  await database
    .insert(tradePrefs)
    .values({ userId, marketPanelRows: patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        // Merged by the database, not read out and written back. Two exchanges
        // arranged at the same moment each keep their own entry; a read first
        // would have let the slower one drop the faster one's.
        marketPanelRows: sql`${tradePrefs.marketPanelRows} || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      },
    })
  return rows
}
