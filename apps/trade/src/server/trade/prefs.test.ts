import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_TRADING_WIDGET_LAYOUT } from "@/lib/trade/dashboard/widgets"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { ChartView } from "@/lib/trade/chart-view"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadTradingOverviewWidgets,
  loadTradeDashboardStart,
  saveHiddenProtocols,
  saveHideEmptyBlocks,
  saveTradeDashboardView,
  loadChartView,
  loadChartOptions,
  loadLastMarketKey,
  loadLastWalletIds,
  loadMinimumMarketVolume,
  loadLiquidationWarning,
  loadQuickOrder,
  loadLineAlertsPaused,
  saveLineAlertsPaused,
  loadTradeSoundPreferences,
  saveQuickOrder,
  saveTradeSoundPreferences,
  saveChartView,
  saveChartOptions,
  saveChartToolbarPosition,
  saveHiddenTradeColumns,
  saveHeaderProfitVisibility,
  saveLastMarketKey,
  saveLastWalletId,
  saveMinimumMarketVolume,
  saveLiquidationWarning,
  saveTradingOverviewWidgets,
  loadTradePanelLayouts,
  saveOpenMarketRow,
} from "@/server/trade/prefs"
import { tradePrefs } from "@/server/trade/schema"

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

describe("the remembered chart options", () => {
  it("shows every chart part on a first visit", async () => {
    const { id } = await insertUser(database)
    expect(await loadChartOptions(id)).toEqual(DEFAULT_CHART_OPTIONS)
  })

  it("comes back as the account left it", async () => {
    const { id } = await insertUser(database)
    const options = {
      chartType: "heikin-ashi" as const,
      grid: false,
      volume: true,
      crosshair: false,
      invert: true,
      orderArrows: false,
      orderArrowTrades: 7,
      drawings: false,
      extendTrendlines: false,
      lineAlertsOn: false,
      lineAlertBuffer: 2.5,
      zone: "America/New_York" as const,
    }
    await saveChartOptions(id, options)
    expect(await loadChartOptions(id)).toEqual(options)
  })

  it("keeps each account's choice separate", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveChartOptions(theirs.id, {
      chartType: "line",
      grid: false,
      volume: false,
      crosshair: false,
      invert: false,
      orderArrows: false,
      orderArrowTrades: 43,
      drawings: false,
      extendTrendlines: true,
      lineAlertsOn: false,
      lineAlertBuffer: null,
      zone: "Europe/London" as const,
    })
    expect(await loadChartOptions(mine.id)).toEqual(DEFAULT_CHART_OPTIONS)
  })
})

describe("the market volume cutoff", () => {
  it("starts at zero and follows the account across protocols", async () => {
    const { id } = await insertUser(database)
    expect(await loadMinimumMarketVolume(id)).toBe(0)

    await saveMinimumMarketVolume(id, 10_000_000)
    expect(await loadMinimumMarketVolume(id)).toBe(10_000_000)
  })

  it("keeps each account's cutoff separate", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveMinimumMarketVolume(theirs.id, 25_000_000)

    expect(await loadMinimumMarketVolume(mine.id)).toBe(0)
    expect(await loadMinimumMarketVolume(theirs.id)).toBe(25_000_000)
  })

  it("shares the preference row without wiping another choice", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "hyperliquid:mainnet:BTC")
    await saveMinimumMarketVolume(id, 5_000_000)

    expect(await loadLastMarketKey(id, "hyperliquid")).toBe(
      "hyperliquid:mainnet:BTC"
    )
    expect(await loadMinimumMarketVolume(id)).toBe(5_000_000)
  })
})

describe("trade sounds", () => {
  it("starts off and remembers the account's choice", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)

    expect(await loadTradeSoundPreferences(mine.id, database)).toEqual({
      fillsAndStops: false,
      alerts: false,
    })
    await saveTradeSoundPreferences(
      mine.id,
      { fillsAndStops: true, alerts: false },
      database
    )

    expect(await loadTradeSoundPreferences(mine.id, database)).toEqual({
      fillsAndStops: true,
      alerts: false,
    })
    expect(await loadTradeSoundPreferences(theirs.id, database)).toEqual({
      fillsAndStops: false,
      alerts: false,
    })
  })
})

describe("the master switch for line alerts", () => {
  it("starts watching, pauses for one account only, and comes back on", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)

    expect(await loadLineAlertsPaused(mine.id, database)).toBe(false)

    await saveLineAlertsPaused(mine.id, true, database)
    expect(await loadLineAlertsPaused(mine.id, database)).toBe(true)
    expect(await loadLineAlertsPaused(theirs.id, database)).toBe(false)

    await saveLineAlertsPaused(mine.id, false, database)
    expect(await loadLineAlertsPaused(mine.id, database)).toBe(false)
  })

  it("leaves the sound choices alone when it writes the same row", async () => {
    const mine = await insertUser(database)
    await saveTradeSoundPreferences(
      mine.id,
      { fillsAndStops: true, alerts: true },
      database
    )
    await saveLineAlertsPaused(mine.id, true, database)

    expect(await loadTradeSoundPreferences(mine.id, database)).toEqual({
      fillsAndStops: true,
      alerts: true,
    })
    expect(await loadLineAlertsPaused(mine.id, database)).toBe(true)
  })
})

describe("the liquidation warning", () => {
  it("starts switched off and remembers either distance", async () => {
    const { id } = await insertUser(database)
    expect(await loadLiquidationWarning(id)).toEqual({ usd: null, pct: null })

    await saveLiquidationWarning(id, { usd: 5, pct: 10 })
    expect(await loadLiquidationWarning(id)).toEqual({ usd: 5, pct: 10 })
  })

  it("shares the preference row without wiping the market cutoff", async () => {
    const { id } = await insertUser(database)
    await saveMinimumMarketVolume(id, 5_000_000)
    await saveLiquidationWarning(id, { usd: null, pct: 8 })

    expect(await loadMinimumMarketVolume(id)).toBe(5_000_000)
    expect(await loadLiquidationWarning(id)).toEqual({ usd: null, pct: 8 })
  })
})

describe("the remembered order window", () => {
  it("opens on the plain defaults before anything is placed", async () => {
    const { id } = await insertUser(database)
    expect(await loadQuickOrder(id)).toEqual(DEFAULT_QUICK_ORDER)
  })

  it("comes back the way the last order was sized", async () => {
    const { id } = await insertUser(database)
    const prefs = {
      entryStyle: "rest" as const,
      sizeUnit: "pct" as const,
      size: "25",
      leverage: 3,
      bracketOn: true,
      stopOn: true,
      targetOn: true,
      stopUnit: "price" as const,
      stopPrice: "91",
      stopPct: "4",
      targetPct: "9",
      targetUnit: "price" as const,
      targetPrice: "112",
      slippagePct: "1",
    }
    await saveQuickOrder(id, prefs)
    expect(await loadQuickOrder(id)).toEqual(prefs)
  })

  it("loads the old combined switch as both protection lines", async () => {
    const { id } = await insertUser(database)
    await saveQuickOrder(id, DEFAULT_QUICK_ORDER)
    const oldPrefs = {
      sizeUnit: "pct" as const,
      size: "25",
      leverage: 3,
      bracketOn: true,
      stopPct: "4",
      targetPct: "9",
    }
    await database
      .update(tradePrefs)
      .set({ quickOrder: oldPrefs as never })
      .where(eq(tradePrefs.userId, id))

    expect(await loadQuickOrder(id)).toEqual({
      ...DEFAULT_QUICK_ORDER,
      ...oldPrefs,
    })
  })

  it("falls back to the defaults on a value it cannot read", async () => {
    const { id } = await insertUser(database)
    await saveQuickOrder(id, DEFAULT_QUICK_ORDER)
    await database
      .update(tradePrefs)
      .set({ quickOrder: { sizeUnit: "bananas" } as never })
      .where(eq(tradePrefs.userId, id))
    expect(await loadQuickOrder(id)).toEqual(DEFAULT_QUICK_ORDER)
  })
})

describe("the Trade dashboard's Overview layout", () => {
  it("opens on the fresh start before anything is saved", async () => {
    const { id } = await insertUser(database)
    expect(await loadTradingOverviewWidgets(id)).toEqual(DEFAULT_TRADING_WIDGET_LAYOUT)
  })

  it("keeps each account's layout its own, cleaned of widgets it does not know", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    const saved = await saveTradingOverviewWidgets(theirs.id, {
      top: { columns: 3, spots: ["trades", "views", "trades"] },
      bottom: { columns: 0, spots: [] },
    })
    // "views" is the shell's, not Trade's, and a widget shows once.
    expect(saved).toEqual({
      top: { columns: 3, spots: ["trades", null, null] },
      bottom: { columns: 0, spots: [] },
    })
    expect(await loadTradingOverviewWidgets(theirs.id)).toEqual(saved)
    expect(await loadTradingOverviewWidgets(mine.id)).toEqual(DEFAULT_TRADING_WIDGET_LAYOUT)
  })
})

describe("where a bare /trade opens", () => {
  it("has nothing saved on a first visit", async () => {
    const { id } = await insertUser(database)
    expect(await loadTradeDashboardStart(id)).toEqual({
      view: null,
      protocol: null,
      hiddenProtocols: [],
      hideEmptyBlocks: false,
    })
  })

  it("keeps Hide empty blocks on the account, off until switched on", async () => {
    const { id } = await insertUser(database)
    expect(await saveHideEmptyBlocks(id, true)).toBe(true)
    expect((await loadTradeDashboardStart(id)).hideEmptyBlocks).toBe(true)
    await saveHideEmptyBlocks(id, false)
    expect((await loadTradeDashboardStart(id)).hideEmptyBlocks).toBe(false)
  })

  it("remembers the row picked, and keeps the exchange while Overview is picked", async () => {
    const { id } = await insertUser(database)
    await saveTradeDashboardView(id, "phemex")
    expect(await loadTradeDashboardStart(id)).toMatchObject({ view: "phemex", protocol: "phemex" })
    await saveTradeDashboardView(id, "overview")
    expect(await loadTradeDashboardStart(id)).toMatchObject({ view: "overview", protocol: "phemex" })
  })

  it("keeps the hidden exchanges in the block's order, dropping ones it does not know", async () => {
    const { id } = await insertUser(database)
    expect(await saveHiddenProtocols(id, ["kucoin", "nowhere", "phemex", "kucoin"])).toEqual([
      "phemex",
      "kucoin",
    ])
    expect((await loadTradeDashboardStart(id)).hiddenProtocols).toEqual(["phemex", "kucoin"])
  })
})

describe("the remembered trade panel choices", () => {
  it("starts with nothing chosen", async () => {
    const { id } = await insertUser(database)
    expect(await loadTradePanelLayouts(id, database)).toEqual({
      openMarketRows: {},
      headerProfitVisible: true,
      chartToolbarPosition: null,
      hiddenTradeColumns: {}, journalView: { hidePractice: false, makers: [] },
    })
  })

  it("keeps the trades popover's hidden columns per table, and refuses unknown ones", async () => {
    const { id } = await insertUser(database)
    await saveHiddenTradeColumns(id, "backtest", ["exit", "side"], database)
    await saveHiddenTradeColumns(id, "bot", ["market"], database)

    expect((await loadTradePanelLayouts(id, database)).hiddenTradeColumns).toEqual({
      backtest: ["side", "exit"],
      bot: ["market"],
    })
    await expect(saveHiddenTradeColumns(id, "bot", ["closed"], database)).rejects.toThrow(
      "PANEL_LAYOUT_INVALID"
    )
  })

  it("keeps the drawing rail and the open folder row on the account", async () => {
    const { id } = await insertUser(database)
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const
    await saveChartToolbarPosition(id, { x: 0.2, y: 0.4 }, database)
    await saveOpenMarketRow(id, scope, null, database)

    expect(await loadTradePanelLayouts(id, database)).toMatchObject({
      chartToolbarPosition: { x: 0.2, y: 0.4 },
      openMarketRows: { "hyperliquid:mainnet": null },
    })
  })

  it("keeps the eye choice when the folder row is saved after it", async () => {
    const { id } = await insertUser(database)
    await saveHeaderProfitVisibility(id, false, database)
    const scope = { protocol: "hyperliquid", network: "mainnet" } as const
    await saveOpenMarketRow(id, scope, null, database)

    expect((await loadTradePanelLayouts(id, database)).headerProfitVisible).toBe(false)
  })
})

afterEach(async () => {
  await client.close()
})

/** A whole view, so a test can name only the part it is about. */
function view(parts: Partial<ChartView>): ChartView {
  return { bars: 100, gap: 0, marginTop: 0.2, marginBottom: 0.1, ...parts }
}

describe("the remembered chart view", () => {
  it("is nothing at all on a first visit", async () => {
    const { id } = await insertUser(database)
    expect(await loadChartView(id)).toBeNull()
  })

  it("comes back as it went in", async () => {
    const { id } = await insertUser(database)
    await saveChartView(id, view({ bars: 120, gap: 4.5 }))
    expect(await loadChartView(id)).toEqual(view({ bars: 120, gap: 4.5 }))
  })

  it("is replaced rather than added to", async () => {
    const { id } = await insertUser(database)
    await saveChartView(id, view({ bars: 120 }))
    await saveChartView(id, view({ bars: 40, gap: 10 }))
    expect(await loadChartView(id)).toEqual(view({ bars: 40, gap: 10 }))
  })

  it("keeps each account's to itself", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveChartView(theirs.id, view({ bars: 120 }))
    expect(await loadChartView(mine.id)).toBeNull()
  })

  it("shares its row with the other remembered things", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "hyperliquid:mainnet:BTC")
    await saveChartView(id, view({ bars: 120 }))

    expect(await loadLastMarketKey(id, "hyperliquid")).toBe(
      "hyperliquid:mainnet:BTC"
    )
    expect(await loadChartView(id)).toEqual(view({ bars: 120 }))
  })

  it("remembers one market per exchange, not one for the app", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "hyperliquid:mainnet:BTC")
    await saveLastMarketKey(id, "kucoin:mainnet:ETHUSDTM")

    // Looking at a coin on one dashboard must not blank the others: every
    // exchange reopens on the coin it was left on.
    expect(await loadLastMarketKey(id, "hyperliquid")).toBe(
      "hyperliquid:mainnet:BTC"
    )
    expect(await loadLastMarketKey(id, "kucoin")).toBe(
      "kucoin:mainnet:ETHUSDTM"
    )
    // One never visited says so, rather than handing back somebody else's.
    expect(await loadLastMarketKey(id, "phemex")).toBeNull()
  })

  it("remembers one wallet per exchange, not one for the app", async () => {
    const { id } = await insertUser(database)
    await saveLastWalletId(id, "hyperliquid", "wallet-hl")
    await saveLastWalletId(id, "phemex", "wallet-px")

    // A dashboard only lists its own exchange's wallets. With one memory for
    // the app, every dashboard but the last-used one matched nothing and
    // asked which wallet to trade with — and answering wiped the last answer,
    // so the next dashboard asked in turn.
    const remembered = await loadLastWalletIds(id)
    expect(remembered.hyperliquid).toBe("wallet-hl")
    expect(remembered.phemex).toBe("wallet-px")
    // One never used says nothing rather than handing back another's wallet.
    expect(remembered.kucoin).toBeUndefined()
  })

  it("keeps the remembered wallet and market in one row", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "phemex:mainnet:BTCUSDT")
    await saveLastWalletId(id, "phemex", "wallet-px")
    // Neither save may wipe the other: they share a row, and an upsert that
    // wrote only its own column would blank everything beside it.
    expect(await loadLastMarketKey(id, "phemex")).toBe("phemex:mainnet:BTCUSDT")
    expect((await loadLastWalletIds(id)).phemex).toBe("wallet-px")
  })

  it("refuses a key that is not a market key at all", async () => {
    const { id } = await insertUser(database)
    await saveLastMarketKey(id, "not-a-key")
    expect(await loadLastMarketKey(id, "hyperliquid")).toBeNull()
  })

  it("is dropped rather than applied when it cannot be read", async () => {
    const { id } = await insertUser(database)
    // A view written by some other build, straight into the column.
    await database
      .insert(tradePrefs)
      .values({ userId: id, chartView: { zoom: 3 } as never })
      .onConflictDoUpdate({
        target: tradePrefs.userId,
        set: { chartView: { zoom: 3 } as never },
      })

    expect(await loadChartView(id)).toBeNull()
    // And it is left in the table rather than destroyed.
    const rows = await database
      .select()
      .from(tradePrefs)
      .where(eq(tradePrefs.userId, id))
    expect(rows[0].chartView).toEqual({ zoom: 3 })
  })
})
