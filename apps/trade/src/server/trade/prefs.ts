import { eq, sql } from "drizzle-orm"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  hasDashboard,
  parseMarketKey,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  isDashboardView,
  OVERVIEW_VIEW,
  readHiddenProtocols,
  type DashboardView,
} from "@/lib/trade/dashboard-view"
import { readCardFolds, type CardFolds } from "@/lib/trade/card-folds"
import { readChartOptions, type ChartOptions } from "@/lib/trade/chart-options"
import {
  readTradingRules,
  type TradingRules,
} from "@/lib/trade/trading-rules"
import { readChartView, type ChartView } from "@/lib/trade/chart-view"
import { readGoal, type Goal } from "@/lib/trade/goal"
import { dcaParamsSchema, type DcaParams } from "@/lib/trade/dca"
import { gridParamsSchema, type GridParams } from "@/lib/trade/grid"
import {
  readTradingWidgetLayout,
} from "@/lib/trade/dashboard/widgets"
import {
  readQuickOrderPrefs,
  type QuickOrderPrefs,
} from "@/lib/trade/quick-order"
import {
  readIndicatorSettings,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import { readOrderStyle, type OrderStyle } from "@/lib/trade/order-style"
import type { TradeSoundSettings } from "@/lib/trade/trade-sounds"
import {
  emptyTradePanelLayouts,
  marketPanelScopeKey,
  matchingPanelLayout,
  readOpenMarketRows,
  readChartToolbarPosition,
  readTradePanelLayouts,
  type MarketPanelScope,
  type TradePanelLayouts,
} from "@/lib/trade/panel-layout"
import {
  type TradePanelLayoutKey,
  tradePanelIds,
} from "@/lib/trade/panel-keys"
import {
  minimumMarketVolumeSchema,
  readMinimumMarketVolume,
} from "@/lib/trade/market-volume"
import {
  DEFAULT_MARKET_PANEL_ROWS,
  readMarketPanelRows,
  type MarketPanelRows,
} from "@/lib/trade/market-folders"
import {
  liquidationWarningSchema,
  readLiquidationWarning,
  type LiquidationWarning,
} from "@/lib/trade/liquidation-warning"
import { db, type CustomShellDb } from "@/server/trade/db"
import { tradePrefs } from "@/server/trade/schema"

/** Everything a dashboard needs from the preference row, read in one query. */
export type DashboardPrefs = {
  lastMarketKey: string | null
  minimumMarketVolumeUsd: number
  tradeSoundsEnabled: boolean
  tradeAlertSoundsEnabled: boolean
  chartView: ChartView | null
  chartOptions: ChartOptions
  tradingRules: TradingRules
  indicators: IndicatorSettings
  cardFolds: CardFolds
  quickOrder: QuickOrderPrefs
  marketPanelRows: MarketPanelRows
  panelLayouts: TradePanelLayouts
  /**
   * The two smart-order windows' saved settings ride along too, so the first
   * right-click after a page load opens on them with nothing left to fetch.
   */
  smartDca: DcaParams | null
  smartGrid: GridParams | null
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
      tradeSoundsEnabled: tradePrefs.tradeSoundsEnabled,
      tradeAlertSoundsEnabled: tradePrefs.tradeAlertSoundsEnabled,
      chartView: tradePrefs.chartView,
      chartOptions: tradePrefs.chartOptions,
      tradingRules: tradePrefs.tradingRules,
      indicators: tradePrefs.indicators,
      cardFolds: tradePrefs.cardFolds,
      quickOrder: tradePrefs.quickOrder,
      marketPanelRows: tradePrefs.marketPanelRows,
      panelLayouts: tradePrefs.panelLayouts,
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
      found?.marketPanelRows?.[marketPanelScopeKey(scope)]
    ),
    panelLayouts: readTradePanelLayouts(found?.panelLayouts),
    minimumMarketVolumeUsd: readMinimumMarketVolume(
      found?.minimumMarketVolumeUsd
    ),
    tradeSoundsEnabled: found?.tradeSoundsEnabled ?? false,
    tradeAlertSoundsEnabled: found?.tradeAlertSoundsEnabled ?? false,
    chartView: readChartView(found?.chartView ?? null),
    chartOptions: readChartOptions(found?.chartOptions ?? null),
    tradingRules: readTradingRules(found?.tradingRules ?? null),
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

/** Which account-owned events make a sound on an open trading screen. */
export async function loadTradeSoundPreferences(
  userId: string,
  database: CustomShellDb = db
): Promise<TradeSoundSettings> {
  const [row] = await database
    .select({
      fillsAndStops: tradePrefs.tradeSoundsEnabled,
      alerts: tradePrefs.tradeAlertSoundsEnabled,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row ?? { fillsAndStops: false, alerts: false }
}

/**
 * Whether the account's line alerts are paused by the master switch in
 * Settings. Off until chosen, and a missing row means not paused.
 */
export async function loadLineAlertsPaused(
  userId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ paused: tradePrefs.lineAlertsPaused })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row?.paused ?? false
}

export async function saveLineAlertsPaused(
  userId: string,
  paused: boolean,
  database: CustomShellDb = db
): Promise<boolean> {
  await database
    .insert(tradePrefs)
    .values({ userId, lineAlertsPaused: paused, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { lineAlertsPaused: paused, updatedAt: new Date() },
    })
  return paused
}

/**
 * Whether Social reads stocks, metals and currencies out of a post's words as
 * well as coins. Off until chosen, and a missing row means off.
 */
export async function loadSocialMatchStocks(
  userId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ stocks: tradePrefs.socialMatchStocks })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return row?.stocks ?? false
}

export async function saveSocialMatchStocks(
  userId: string,
  stocks: boolean,
  database: CustomShellDb = db
): Promise<boolean> {
  await database
    .insert(tradePrefs)
    .values({ userId, socialMatchStocks: stocks, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { socialMatchStocks: stocks, updatedAt: new Date() },
    })
  return stocks
}

/** Remember both independent account-wide sound choices. */
export async function saveTradeSoundPreferences(
  userId: string,
  settings: TradeSoundSettings,
  database: CustomShellDb = db
): Promise<TradeSoundSettings> {
  await database
    .insert(tradePrefs)
    .values({
      userId,
      tradeSoundsEnabled: settings.fillsAndStops,
      tradeAlertSoundsEnabled: settings.alerts,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        tradeSoundsEnabled: settings.fillsAndStops,
        tradeAlertSoundsEnabled: settings.alerts,
        updatedAt: new Date(),
      },
    })
  return settings
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
  const patch = { [protocol]: walletId }
  await db
    .insert(tradePrefs)
    .values({ userId, lastWalletIds: patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        // Patched in the database, not read-then-written — the same idiom as
        // `saveMarketPanelRows`. One round trip instead of two, and two
        // exchanges picked at the same moment each keep their own entry.
        lastWalletIds: sql`coalesce(${tradePrefs.lastWalletIds}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      },
    })
}

/**
 * The Trade dashboard's Overview widgets, one layout per person, kept apart
 * from the shell's Admin Overview. Nothing saved is the starting layout.
 */
export async function loadTradingOverviewWidgets(
  userId: string
): Promise<WidgetLayout> {
  const row = await db
    .select({ overviewWidgets: tradePrefs.overviewWidgets })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readTradingWidgetLayout(row[0]?.overviewWidgets)
}

/** Remember the whole layout against this account, cleaned, and answer with what was stored. */
export async function saveTradingOverviewWidgets(
  userId: string,
  value: unknown
): Promise<WidgetLayout> {
  const overviewWidgets = readTradingWidgetLayout(value)
  await db
    .insert(tradePrefs)
    .values({ userId, overviewWidgets, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { overviewWidgets, updatedAt: new Date() },
    })
  return overviewWidgets
}

/**
 * Where a bare `/trade` opens: the Protocols block's row picked last, the
 * exchange picked last (whose blocks Overview keeps showing), and the
 * exchanges hidden from the block. A value this build does not know reads
 * as nothing saved.
 */
export type TradeDashboardStart = {
  view: DashboardView | null
  protocol: ProtocolId | null
  hiddenProtocols: ProtocolId[]
  /** "Hide empty blocks", off until switched on. */
  hideEmptyBlocks: boolean
}

export async function loadTradeDashboardStart(
  userId: string
): Promise<TradeDashboardStart> {
  const [row] = await db
    .select({
      view: tradePrefs.dashboardView,
      protocol: tradePrefs.dashboardProtocol,
      hidden: tradePrefs.hiddenProtocols,
      hideEmptyBlocks: tradePrefs.hideEmptyBlocks,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return {
    view: isDashboardView(row?.view) ? row.view : null,
    protocol: row?.protocol && hasDashboard(row.protocol) ? row.protocol : null,
    hiddenProtocols: readHiddenProtocols(row?.hidden),
    hideEmptyBlocks: row?.hideEmptyBlocks ?? false,
  }
}

/** Switches "Hide empty blocks" on or off for this account. */
export async function saveHideEmptyBlocks(
  userId: string,
  hideEmptyBlocks: boolean
): Promise<boolean> {
  await db
    .insert(tradePrefs)
    .values({ userId, hideEmptyBlocks, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { hideEmptyBlocks, updatedAt: new Date() },
    })
  return hideEmptyBlocks
}

/**
 * The row just picked. Picking an exchange also makes it the one Overview
 * keeps showing; picking Overview leaves that exchange as it was.
 */
export async function saveTradeDashboardView(
  userId: string,
  view: DashboardView
): Promise<void> {
  const protocol = view === OVERVIEW_VIEW ? undefined : view
  await db
    .insert(tradePrefs)
    .values({
      userId,
      dashboardView: view,
      dashboardProtocol: protocol ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        dashboardView: view,
        ...(protocol ? { dashboardProtocol: protocol } : {}),
        updatedAt: new Date(),
      },
    })
}

/** The exchanges hidden from the Protocols block, cleaned, answered as stored. */
export async function saveHiddenProtocols(
  userId: string,
  value: unknown
): Promise<ProtocolId[]> {
  const hiddenProtocols = readHiddenProtocols(value)
  await db
    .insert(tradePrefs)
    .values({ userId, hiddenProtocols, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { hiddenProtocols, updatedAt: new Date() },
    })
  return hiddenProtocols
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

/** Which price shape and supporting chart parts this person chose. */
export async function loadChartOptions(userId: string): Promise<ChartOptions> {
  const row = await db
    .select({ chartOptions: tradePrefs.chartOptions })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readChartOptions(row[0]?.chartOptions ?? null)
}

/** Remember the complete choice in one account-scoped value. */
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
export async function loadTradingRules(userId: string): Promise<TradingRules> {
  const row = await db
    .select({ tradingRules: tradePrefs.tradingRules })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readTradingRules(row[0]?.tradingRules ?? null)
}

export async function saveTradingRules(
  userId: string,
  tradingRules: TradingRules
): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, tradingRules, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { tradingRules, updatedAt: new Date() },
    })
}

export async function loadGoal(userId: string): Promise<Goal> {
  const row = await db
    .select({ goal: tradePrefs.goal })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readGoal(row[0]?.goal ?? null)
}

export async function saveGoal(userId: string, goal: Goal): Promise<void> {
  await db
    .insert(tradePrefs)
    .values({ userId, goal, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { goal, updatedAt: new Date() },
    })
}

export async function loadSmartDca(userId: string): Promise<DcaParams | null> {
  const row = await db
    .select({ smartDca: tradePrefs.smartDca })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  const parsed = dcaParamsSchema.safeParse(row[0]?.smartDca ?? null)
  return parsed.success ? reusableDcaPrefs(parsed.data) : null
}

/** One-shot placement actions never become defaults for the next order. */
function reusableDcaPrefs(params: DcaParams): DcaParams {
  return { ...params, marketBuyFirst: false }
}

/** Remember them — saved after a successful place, never on every keystroke. */
export async function saveSmartDca(
  userId: string,
  smartDca: DcaParams
): Promise<void> {
  const reusable = reusableDcaPrefs(smartDca)
  await db
    .insert(tradePrefs)
    .values({ userId, smartDca: reusable, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: { smartDca: reusable, updatedAt: new Date() },
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
export async function loadSmartGrid(
  userId: string
): Promise<GridParams | null> {
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
export async function loadQuickOrder(userId: string): Promise<QuickOrderPrefs> {
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
 *
 * Only the fields handed in change. The exchange's entry is merged in the
 * database, so a drag keeps the markets hidden by hand and a hide keeps the
 * drag, and two saves landing together each keep the other's field.
 */
export async function saveMarketPanelRows(
  userId: string,
  scope: MarketPanelScope,
  rows: Partial<MarketPanelRows>,
  database: CustomShellDb = db
): Promise<MarketPanelRows> {
  const key = marketPanelScopeKey(scope)
  const patch = JSON.stringify(rows)
  const [saved] = await database
    .insert(tradePrefs)
    .values({
      userId,
      marketPanelRows: { [key]: { ...DEFAULT_MARKET_PANEL_ROWS, ...rows } },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        // Merged by the database, not read out and written back. Two exchanges
        // arranged at the same moment each keep their own entry; a read first
        // would have let the slower one drop the faster one's.
        marketPanelRows: sql`${tradePrefs.marketPanelRows} || jsonb_build_object(${key}::text, coalesce(${tradePrefs.marketPanelRows} -> ${key}, '{}'::jsonb) || ${patch}::jsonb)`,
        updatedAt: new Date(),
      },
    })
    .returning({ marketPanelRows: tradePrefs.marketPanelRows })
  return readMarketPanelRows(saved?.marketPanelRows?.[key])
}

/** Every trade workspace's divider positions, read from the preference row. */
export async function loadTradePanelLayouts(
  userId: string,
  database: CustomShellDb = db
): Promise<TradePanelLayouts> {
  const [row] = await database
    .select({ panelLayouts: tradePrefs.panelLayouts })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readTradePanelLayouts(row?.panelLayouts)
}

/** Remember the eye choice. */
export async function saveHeaderProfitVisibility(
  userId: string,
  visible: boolean,
  database: CustomShellDb = db
): Promise<void> {
  await updateTradePanelLayouts(userId, database, (layouts) => ({
    ...layouts,
    headerProfitVisible: visible,
  }))
}

/** Remember the drawing rail. */
export async function saveChartToolbarPosition(
  userId: string,
  value: unknown,
  database: CustomShellDb = db
): Promise<void> {
  const position = readChartToolbarPosition(value)
  if (position === undefined) throw new Error("PANEL_LAYOUT_INVALID")
  await updateTradePanelLayouts(userId, database, (layouts) => ({
    ...layouts,
    chartToolbarPosition: position,
  }))
}

/** The two account-owned answers the live-run route needs, in one row read. */
export async function loadChartWorkspacePrefs(
  userId: string,
  database: CustomShellDb = db
): Promise<{ chartView: ChartView | null; panelLayouts: TradePanelLayouts }> {
  const [row] = await database
    .select({
      chartView: tradePrefs.chartView,
      panelLayouts: tradePrefs.panelLayouts,
    })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return {
    chartView: readChartView(row?.chartView ?? null),
    panelLayouts: readTradePanelLayouts(row?.panelLayouts),
  }
}

/** Remember one panel group. */
export async function saveTradePanelLayout(
  userId: string,
  key: TradePanelLayoutKey,
  value: unknown,
  database: CustomShellDb = db
): Promise<void> {
  const layout = matchingPanelLayout(value, tradePanelIds[key])
  if (!layout) throw new Error("PANEL_LAYOUT_INVALID")
  await updateTradePanelLayouts(userId, database, (layouts) => ({
    ...layouts,
    legacyImported: true,
    current: { ...layouts.current, [key]: layout },
  }))
}

/** Remember the open folder row. */
export async function saveOpenMarketRow(
  userId: string,
  scope: MarketPanelScope,
  value: unknown,
  database: CustomShellDb = db
): Promise<void> {
  const { key, rowId } = validOpenMarketRow(scope, value)
  await updateTradePanelLayouts(userId, database, (layouts) => ({
    ...layouts,
    legacyImported: true,
    openMarketRows: { ...layouts.openMarketRows, [key]: rowId },
  }))
}

/**
 * Bring this browser's old layouts across only while the account has no newer
 * account-owned answer. The conflict update is one statement, so two browsers
 * cannot both win the first import.
 */
export async function importLegacyTradePanelLayouts(
  userId: string,
  value: TradePanelLayouts["current"],
  database: CustomShellDb = db
): Promise<TradePanelLayouts> {
  const imported = readTradePanelLayouts({
    legacyImported: true,
    current: value,
    named: [],
  })
  if (Object.keys(imported.current).length === 0) {
    return loadTradePanelLayouts(userId, database)
  }

  const base = validPanelLayoutsSql()
  const [row] = await database
    .insert(tradePrefs)
    .values({ userId, panelLayouts: imported, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        panelLayouts: sql`case
          when ${base}->>'legacyImported' = 'true' then ${base}
          else ${JSON.stringify(imported)}::jsonb || jsonb_build_object(
            'headerProfitVisible',
            coalesce(${base}->'headerProfitVisible', 'true'::jsonb)
          )
        end`,
        updatedAt: new Date(),
      },
    })
    .returning({ panelLayouts: tradePrefs.panelLayouts })
  return readTradePanelLayouts(row?.panelLayouts)
}

async function updateTradePanelLayouts(
  userId: string,
  database: CustomShellDb,
  change: (layouts: TradePanelLayouts) => TradePanelLayouts
) {
  return database.transaction(async (tx) => {
    await tx
      .insert(tradePrefs)
      .values({ userId, panelLayouts: emptyTradePanelLayouts() })
      .onConflictDoNothing()
    const [row] = await tx
      .select({ panelLayouts: tradePrefs.panelLayouts })
      .from(tradePrefs)
      .where(eq(tradePrefs.userId, userId))
      .for("update")
    if (!row) throw new Error("PANEL_LAYOUT_NOT_FOUND")
    const saved = change(readTradePanelLayouts(row.panelLayouts))
    await tx
      .update(tradePrefs)
      .set({ panelLayouts: saved, updatedAt: new Date() })
      .where(eq(tradePrefs.userId, userId))
    return saved
  })
}

/** Treat a hand-edited non-object value as an empty current-format answer. */
function validPanelLayoutsSql() {
  const empty = JSON.stringify(emptyTradePanelLayouts())
  return sql`case
    when jsonb_typeof(${tradePrefs.panelLayouts}) = 'object'
      then ${tradePrefs.panelLayouts}
    else ${empty}::jsonb
  end`
}

function validOpenMarketRow(scope: MarketPanelScope, value: unknown) {
  const key = marketPanelScopeKey(scope)
  const rows = readOpenMarketRows({ [key]: value })
  if (!Object.prototype.hasOwnProperty.call(rows, key)) {
    throw new Error("PANEL_LAYOUT_INVALID")
  }
  return { key, rowId: rows[key] ?? null }
}
