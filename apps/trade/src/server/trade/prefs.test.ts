import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { createDefaultTradingDashboardWidgets } from "@/lib/trade/dashboard/widgets"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { ChartView } from "@/lib/trade/chart-view"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadTradingDashboardWidgets,
  loadChartView,
  loadChartOptions,
  loadLastMarketKey,
  loadLastWalletIds,
  loadMinimumMarketVolume,
  loadQuickOrder,
  saveQuickOrder,
  saveChartView,
  saveChartOptions,
  saveLastMarketKey,
  saveLastWalletId,
  saveMinimumMarketVolume,
  saveTradingDashboardWidgets,
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
      grid: false,
      volume: true,
      crosshair: false,
      orderArrows: false,
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
      grid: false,
      volume: false,
      crosshair: false,
      orderArrows: false,
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
      stopPct: "4",
      targetPct: "9",
    }
    await saveQuickOrder(id, prefs)
    expect(await loadQuickOrder(id)).toEqual(prefs)
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
    expect(await loadLastMarketKey(id, "kucoin")).toBe("kucoin:mainnet:ETHUSDTM")
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
