import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { createDefaultTradingDashboardWidgets } from "@/lib/trade/dashboard/widgets"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { ChartView } from "@/lib/trade/chart-view"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadTradingDashboardWidgets,
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
  saveHeaderProfitVisibility,
  saveLastMarketKey,
  saveLastWalletId,
  saveMinimumMarketVolume,
  saveLiquidationWarning,
  saveTradingDashboardWidgets,
  applyNamedTradePanelLayout,
  createNamedTradePanelLayout,
  deleteNamedTradePanelLayout,
  importLegacyTradePanelLayouts,
  loadTradePanelLayouts,
  saveOpenMarketRow,
  saveTradePanelLayout,
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
      orderArrows: false,
      orderArrowTrades: 7,
      drawings: false,
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
      orderArrows: false,
      orderArrowTrades: 43,
      drawings: false,
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

describe("the trading dashboard arrangement", () => {
  it("opens on the trading default before anything is saved", async () => {
    const { id } = await insertUser(database)
    // Read off the default itself rather than copied out of it. A copy is a
    // second place the layout lives, and it went stale the day a widget was
    // added to the real one — this test then failed for a feature working
    // exactly as intended.
    expect(await loadTradingDashboardWidgets(id)).toEqual(
      createDefaultTradingDashboardWidgets()
    )
  })

  it("keeps each account's trading dashboard separate", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    await saveTradingDashboardWidgets(theirs.id, {
      top: [],
      left: ["trades"],
      right: [],
    })
    expect(await loadTradingDashboardWidgets(mine.id)).toEqual(
      createDefaultTradingDashboardWidgets()
    )
    expect(await loadTradingDashboardWidgets(theirs.id)).toEqual({
      top: [],
      left: ["trades"],
      right: [],
    })
  })
})

describe("the remembered trade panel layouts", () => {
  const horizontal = { markets: 20, chart: 58, "smart-orders": 22 }
  const vertical = { workspace: 72, activity: 28 }
  const scope = { protocol: "hyperliquid", network: "mainnet" } as const

  it("starts empty and keeps each panel group in the account", async () => {
    const { id } = await insertUser(database)
    expect(await loadTradePanelLayouts(id, database)).toEqual({
      legacyImported: false,
      current: {},
      openMarketRows: {},
      headerProfitVisible: true,
      chartToolbarPosition: null,
      activeNamedId: null,
      named: [],
    })

    await saveTradePanelLayout(
      id,
      tradePanelLayoutKey.workspaceHorizontal,
      horizontal,
      database
    )
    await saveTradePanelLayout(
      id,
      tradePanelLayoutKey.workspaceVertical,
      vertical,
      database
    )

    expect(await loadTradePanelLayouts(id, database)).toMatchObject({
      legacyImported: true,
      current: {
        [tradePanelLayoutKey.workspaceHorizontal]: horizontal,
        [tradePanelLayoutKey.workspaceVertical]: vertical,
      },
    })
  })

  it("replaces a damaged current value when the next valid group is saved", async () => {
    const { id } = await insertUser(database)
    await database
      .update(tradePrefs)
      .set({
        panelLayouts: {
          legacyImported: true,
          current: [],
          named: [],
        } as never,
      })
      .where(eq(tradePrefs.userId, id))

    await saveTradePanelLayout(
      id,
      tradePanelLayoutKey.workspaceHorizontal,
      horizontal,
      database
    )

    expect(await loadTradePanelLayouts(id, database)).toMatchObject({
      current: {
        [tradePanelLayoutKey.workspaceHorizontal]: horizontal,
      },
    })
  })

  it("accepts the first old browser layout and refuses a later import", async () => {
    const { id } = await insertUser(database)
    await importLegacyTradePanelLayouts(
      id,
      { [tradePanelLayoutKey.workspaceHorizontal]: horizontal },
      database
    )
    const saved = await importLegacyTradePanelLayouts(
      id,
      {
        [tradePanelLayoutKey.workspaceHorizontal]: {
          markets: 10,
          chart: 80,
          "smart-orders": 10,
        },
      },
      database
    )

    expect(saved.current[tradePanelLayoutKey.workspaceHorizontal]).toEqual(
      horizontal
    )
  })

  it("keeps the eye choice when old browser panel sizes are imported", async () => {
    const { id } = await insertUser(database)
    await saveHeaderProfitVisibility(id, false, database)

    const saved = await importLegacyTradePanelLayouts(
      id,
      { [tradePanelLayoutKey.workspaceHorizontal]: horizontal },
      database
    )

    expect(saved.headerProfitVisible).toBe(false)
    expect(saved.current[tradePanelLayoutKey.workspaceHorizontal]).toEqual(
      horizontal
    )
  })

  it("creates, automatically updates, applies and deletes a named workspace layout", async () => {
    const { id } = await insertUser(database)
    const created = await createNamedTradePanelLayout(
      id,
      {
        name: "Reading",
        horizontal,
        vertical,
        scope,
        openMarketRowId: "watched",
        headerProfitVisible: false,
        chartToolbarPosition: { x: 0.25, y: 0.6 },
      },
      database
    )
    const named = created.named[0]
    expect(named?.name).toBe("Reading")
    expect(created.activeNamedId).toBe(named?.id)
    expect(named?.headerProfitVisible).toBe(false)
    expect(named?.chartToolbarPosition).toEqual({ x: 0.25, y: 0.6 })
    expect(named?.openMarketRows).toEqual({
      "hyperliquid:mainnet": "watched",
    })

    const overwrittenHorizontal = {
      markets: 10,
      chart: 80,
      "smart-orders": 10,
    }
    const overwrittenVertical = { workspace: 60, activity: 40 }
    await saveTradePanelLayout(
      id,
      tradePanelLayoutKey.workspaceHorizontal,
      overwrittenHorizontal,
      database
    )
    await saveTradePanelLayout(
      id,
      tradePanelLayoutKey.workspaceVertical,
      overwrittenVertical,
      database
    )
    await saveOpenMarketRow(id, scope, null, database)
    await saveHeaderProfitVisibility(id, true, database)
    await saveChartToolbarPosition(id, { x: 0.4, y: 0.7 }, database)

    const automaticallySaved = await loadTradePanelLayouts(id, database)
    expect(automaticallySaved.named[0]).toMatchObject({
      id: named!.id,
      horizontal: overwrittenHorizontal,
      vertical: overwrittenVertical,
      openMarketRows: { "hyperliquid:mainnet": null },
      headerProfitVisible: true,
      chartToolbarPosition: { x: 0.4, y: 0.7 },
    })

    const applied = await applyNamedTradePanelLayout(
      id,
      named!.id,
      scope,
      database
    )
    expect(applied.current[tradePanelLayoutKey.workspaceHorizontal]).toEqual(
      overwrittenHorizontal
    )
    expect(applied.current[tradePanelLayoutKey.workspaceVertical]).toEqual(
      overwrittenVertical
    )
    expect(applied.openMarketRows["hyperliquid:mainnet"]).toBeNull()
    expect(applied.headerProfitVisible).toBe(true)
    expect(applied.chartToolbarPosition).toEqual({ x: 0.4, y: 0.7 })

    const deleted = await deleteNamedTradePanelLayout(id, named!.id, database)
    expect(deleted.named).toEqual([])
    expect(deleted.activeNamedId).toBeNull()
  })

  it("keeps another account's named layouts out of reach", async () => {
    const mine = await insertUser(database)
    const theirs = await insertUser(database)
    const created = await createNamedTradePanelLayout(
      theirs.id,
      {
        name: "Reading",
        horizontal,
        vertical,
        scope,
        openMarketRowId: "watched",
        headerProfitVisible: true,
        chartToolbarPosition: null,
      },
      database
    )

    await expect(
      applyNamedTradePanelLayout(mine.id, created.named[0]!.id, scope, database)
    ).rejects.toThrow("PANEL_LAYOUT_NOT_FOUND")
    expect((await loadTradePanelLayouts(mine.id, database)).named).toEqual([])
    expect(
      (await loadTradePanelLayouts(theirs.id, database)).named
    ).toHaveLength(1)
  })

  it("refuses duplicate names and a sixth saved layout", async () => {
    const { id } = await insertUser(database)
    await createNamedTradePanelLayout(
      id,
      {
        name: "Reading",
        horizontal,
        vertical,
        scope,
        openMarketRowId: "watched",
        headerProfitVisible: true,
        chartToolbarPosition: null,
      },
      database
    )
    await expect(
      createNamedTradePanelLayout(
        id,
        {
          name: "reading",
          horizontal,
          vertical,
          scope,
          openMarketRowId: "watched",
          headerProfitVisible: true,
          chartToolbarPosition: null,
        },
        database
      )
    ).rejects.toThrow("PANEL_LAYOUT_NAME_TAKEN")

    for (const name of ["Two", "Three", "Four", "Five"]) {
      await createNamedTradePanelLayout(
        id,
        {
          name,
          horizontal,
          vertical,
          scope,
          openMarketRowId: "watched",
          headerProfitVisible: true,
          chartToolbarPosition: null,
        },
        database
      )
    }
    await expect(
      createNamedTradePanelLayout(
        id,
        {
          name: "Six",
          horizontal,
          vertical,
          scope,
          openMarketRowId: "watched",
          headerProfitVisible: true,
          chartToolbarPosition: null,
        },
        database
      )
    ).rejects.toThrow("PANEL_LAYOUT_LIMIT")
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
