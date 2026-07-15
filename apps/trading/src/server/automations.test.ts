import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_AUTOMATION_BACKTEST_SETTINGS,
  type AutomationGraph,
  type AutomationProtection,
} from "@/lib/automations/automation"
import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import { resolveAutomationRun } from "@/lib/api/backtests"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  createUserAutomation,
  deleteUserAutomation,
  duplicateUserAutomation,
  getUserAutomation,
  inspectAutomation,
  listUserAutomations,
  saveUserAutomation,
} from "@/server/automations"
import { createUserBacktest, getUserBacktest } from "@/server/backtests"
import { customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

async function applyMigration(target: PGlite, file: string) {
  const migration = await readFile(new URL(file, import.meta.url), "utf8")
  await target.exec(migration)
}

const EMPTY_GRAPH: AutomationGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

const VALID_GRAPH: AutomationGraph = {
  nodes: [
    {
      id: "ema",
      kind: "indicator",
      x: 0,
      y: 0,
      indicator: {
        type: "ema_cross",
        params: { fast: 20, slow: 50 },
      },
    },
    {
      id: "buy",
      kind: "action",
      action: "buy",
      targetEquityPct: 25,
      x: 300,
      y: 0,
    },
  ],
  edges: [
    {
      id: "ema-buy",
      from: "ema",
      sourcePort: "bullish",
      to: "buy",
    },
  ],
  viewport: { x: 25, y: 40, zoom: 1.25 },
}

const WHALE_WALL_GRAPH: AutomationGraph = {
  nodes: [
    {
      id: "wall",
      kind: "whaleWall",
      minUsd: 500_000,
      relativeSize: 5,
      maxDistancePct: 0.5,
      confirmationMs: 2_000,
      x: 0,
      y: 0,
    },
    {
      id: "buy",
      kind: "action",
      action: "buy",
      targetEquityPct: 25,
      x: 300,
      y: 0,
    },
  ],
  edges: [
    {
      id: "wall-buy",
      from: "wall",
      sourcePort: "bidWall",
      to: "buy",
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

/** VALID_GRAPH plus a Take Profit + Stop Loss hung on the Long entry. */
const PROTECTED_GRAPH: AutomationGraph = {
  ...VALID_GRAPH,
  nodes: [
    ...VALID_GRAPH.nodes,
    { id: "tp", kind: "takeProfit", pct: 4, x: 300, y: -140 },
    { id: "sl", kind: "stopLoss", pct: 2, x: 300, y: 140 },
  ],
  edges: [
    ...VALID_GRAPH.edges,
    { id: "buy-tp", from: "buy", sourcePort: "tp", to: "tp" },
    { id: "buy-sl", from: "buy", sourcePort: "sl", to: "sl" },
  ],
}

/** VALID_GRAPH plus a Stop Loss node with a non-positive percent. */
const INVALID_PROTECTION_GRAPH: AutomationGraph = {
  ...VALID_GRAPH,
  nodes: [
    ...VALID_GRAPH.nodes,
    { id: "sl", kind: "stopLoss", pct: -2, x: 300, y: 140 },
  ],
  edges: [
    ...VALID_GRAPH.edges,
    { id: "buy-sl", from: "buy", sourcePort: "sl", to: "sl" },
  ],
}

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

const BASE_MIGRATIONS = [
  "../../drizzle/0000_custom_shell_baseline.sql",
  "../../drizzle/0003_custom_shell_workspaces.sql",
  "../../drizzle/0004_trading.sql",
  "../../drizzle/0008_backtests.sql",
  "../../drizzle/0011_run_status.sql",
  "../../drizzle/0013_multi_market_bots.sql",
  "../../drizzle/0014_strategy_rebuild.sql",
  "../../drizzle/0016_backtest_result_stats.sql",
  "../../drizzle/0017_remove_legacy_strategies.sql",
]

beforeEach(async () => {
  client = new PGlite()
  for (const migration of BASE_MIGRATIONS) {
    await applyMigration(client, migration)
  }
  await applyMigration(client, "../../drizzle/0020_trading_automations.sql")
  await applyMigration(client, "../../drizzle/0025_automation_type.sql")
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
})

async function createTestUser() {
  const userId = uuid()
  const createdAt = now()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `${userId}@internal.dev`,
    name: "Trader",
    role: "admin",
    passwordHash: "not-a-real-hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

describe("Automation storage", () => {
  it("creates an empty, non-runnable draft with the requested timeframe", async () => {
    const userId = await createTestUser()

    const row = await createUserAutomation(userId, {
      name: "  Opening setup  ",
      interval: "15m",
    })
    const inspected = inspectAutomation(row)

    expect(row.name).toBe("Opening setup")
    expect(row.interval).toBe("15m")
    expect(row.compiledConfig).toBeNull()
    expect(inspected.graph).toEqual(EMPTY_GRAPH)
    expect(inspected.protection).toEqual({})
    expect(inspected.backtest).toEqual(DEFAULT_AUTOMATION_BACKTEST_SETTINGS)
    expect(inspected.errors.map((error) => error.code)).toContain("empty")
  })

  it("defaults backtest settings on rows saved before they existed", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Old row",
      interval: "15m",
    })
    // Simulate a pre-change row: stored draft without a `backtest` key.
    await database
      .update(schema.tradingAutomations)
      .set({ graph: EMPTY_GRAPH })
      .where(eq(schema.tradingAutomations.id, created.id))

    const row = await getUserAutomation(userId, created.id)
    expect(inspectAutomation(row!).backtest).toEqual(
      DEFAULT_AUTOMATION_BACKTEST_SETTINGS
    )
  })

  it("compiles Take Profit / Stop Loss nodes into per-side protection", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "EMA entry",
      interval: "15m",
    })
    const protection: AutomationProtection = {
      long: { takeProfitPct: 4, stopLossPct: 2 },
    }

    const saved = await saveUserAutomation(userId, created.id, {
      name: "EMA entry",
      interval: "1h",
      graph: PROTECTED_GRAPH,
    })

    expect(saved).not.toBeNull()
    expect(saved?.compiledConfig).toMatchObject({
      v: 2,
      kind: "automation",
      interval: "1h",
      protection,
    })
    expect(inspectAutomation(saved!).graph).toEqual(PROTECTED_GRAPH)
    expect(inspectAutomation(saved!).protection).toEqual(protection)
    expect(inspectAutomation(saved!).errors).toEqual([])
  })

  it("saves an invalid draft and clears the previously compiled config", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Draft",
      interval: "15m",
    })
    const valid = await saveUserAutomation(userId, created.id, {
      name: "Draft",
      interval: "15m",
      graph: VALID_GRAPH,
    })
    expect(valid?.compiledConfig).not.toBeNull()

    const invalid = await saveUserAutomation(userId, created.id, {
      name: "Draft",
      interval: "15m",
      graph: EMPTY_GRAPH,
    })

    expect(invalid?.compiledConfig).toBeNull()
    expect(inspectAutomation(invalid!).graph).toEqual(EMPTY_GRAPH)
    expect(
      inspectAutomation(invalid!).errors.map((error) => error.code)
    ).toContain("empty")
  })

  it("keeps invalid protection editable while clearing runnable config", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Invalid protection draft",
      interval: "15m",
    })

    const saved = await saveUserAutomation(userId, created.id, {
      name: created.name,
      interval: "15m",
      graph: INVALID_PROTECTION_GRAPH,
    })
    const inspected = inspectAutomation(saved!)

    expect(inspected.compiledConfig).toBeNull()
    expect(inspected.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })

  it("keeps every read and write scoped to the owning user", async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const created = await createUserAutomation(owner, {
      name: "Private",
      interval: "15m",
    })

    expect(await getUserAutomation(stranger, created.id)).toBeNull()
    expect(
      await saveUserAutomation(stranger, created.id, {
        name: "Stolen",
        interval: "1h",
        graph: VALID_GRAPH,
      })
    ).toBeNull()
    expect(await duplicateUserAutomation(stranger, created.id)).toBeNull()
    expect(await deleteUserAutomation(stranger, created.id)).toBe(false)
    expect((await getUserAutomation(owner, created.id))?.name).toBe("Private")
  })

  it("duplicates the saved draft with a collision-safe copy name", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Momentum",
      interval: "15m",
    })
    const saved = await saveUserAutomation(userId, created.id, {
      name: "Momentum",
      interval: "15m",
      graph: PROTECTED_GRAPH,
    })

    const first = await duplicateUserAutomation(userId, saved!.id)
    const second = await duplicateUserAutomation(userId, saved!.id)

    expect(first?.name).toBe("Momentum copy")
    expect(second?.name).toBe("Momentum copy 2")
    expect(first?.graph).toEqual(saved?.graph)
    expect(first?.compiledConfig).toEqual(saved?.compiledConfig)
  })

  it("enforces unique names per user and lists only the user's rows", async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    await createUserAutomation(userA, { name: "Same", interval: "15m" })
    await createUserAutomation(userB, { name: "Same", interval: "1h" })

    await expect(
      createUserAutomation(userA, { name: "Same", interval: "4h" })
    ).rejects.toThrow("Automation name already exists")
    expect((await listUserAutomations(userA)).map((row) => row.userId)).toEqual(
      [userA]
    )
  })

  it("keeps a backtest snapshot runnable after its Automation is deleted", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Backtest source",
      interval: "15m",
    })
    const saved = await saveUserAutomation(userId, created.id, {
      name: created.name,
      interval: "15m",
      graph: VALID_GRAPH,
    })
    const compiledConfig = saved?.compiledConfig
    expect(compiledConfig).not.toBeNull()

    const backtest = await createUserBacktest(userId, {
      name: "Automation snapshot",
      automationId: saved!.id,
      market: "BTC",
      network: "mainnet",
      interval: "15m",
      params: compiledConfig!,
      costs: DEFAULT_BACKTEST_COSTS,
      startTime: new Date("2026-01-01T00:00:00Z"),
      endTime: new Date("2026-01-02T00:00:00Z"),
      startingEquity: 10_000,
    })
    expect(backtest.automationId).toBe(saved?.id)

    await deleteUserAutomation(userId, saved!.id)
    const snapshot = await getUserBacktest(userId, backtest.id)
    expect(snapshot?.automationId).toBeNull()
    expect(snapshot?.params).toEqual(compiledConfig)
  })

  it("resolves a run from the owner's compiled config and stored settings", async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const created = await createUserAutomation(owner, {
      name: "Owned source",
      interval: "15m",
    })
    const saved = await saveUserAutomation(owner, created.id, {
      name: created.name,
      interval: "15m",
      graph: VALID_GRAPH,
      backtest: {
        startingEquity: 25_000,
        takerFeeBps: 10,
        makerFeeBps: 2,
        slippageBps: 3,
      },
    })

    const resolved = await resolveAutomationRun(owner, saved!.id)
    expect(resolved.params).toEqual(saved?.compiledConfig)
    expect(resolved.automationId).toBe(saved?.id)
    expect(resolved.automationName).toBe("Owned source")
    expect(resolved.interval).toBe("15m")
    // Costs and capital come from the automation row, never the client.
    expect(resolved.startingEquity).toBe(25_000)
    expect(resolved.costs).toEqual({
      takerFeeBps: 10,
      makerFeeBps: 2,
      slippageBps: 3,
    })

    await expect(resolveAutomationRun(stranger, saved!.id)).rejects.toThrow(
      "Automation not found"
    )

    const invalid = await createUserAutomation(owner, {
      name: "Incomplete source",
      interval: "15m",
    })
    await expect(resolveAutomationRun(owner, invalid.id)).rejects.toThrow(
      "Fix this Automation"
    )
  })

  it("rejects historical backtests for a live Whale Wall automation", async () => {
    const userId = await createTestUser()
    const created = await createUserAutomation(userId, {
      name: "Live wall",
      interval: "15m",
    })
    const saved = await saveUserAutomation(userId, created.id, {
      name: created.name,
      interval: "15m",
      graph: WHALE_WALL_GRAPH,
    })
    expect(saved?.compiledConfig).not.toBeNull()

    await expect(resolveAutomationRun(userId, saved!.id)).rejects.toThrow(
      "Whale Wall needs live order-book data"
    )
    await expect(
      createUserBacktest(userId, {
        name: "Unavailable replay",
        automationId: saved!.id,
        market: "BTC",
        network: "mainnet",
        interval: "15m",
        params: saved!.compiledConfig!,
        costs: DEFAULT_BACKTEST_COSTS,
        startTime: new Date("2026-01-01T00:00:00Z"),
        endTime: new Date("2026-01-02T00:00:00Z"),
        startingEquity: 10_000,
      })
    ).rejects.toThrow("Whale Wall needs live order-book data")
  })
})

describe("0020 trading Automations migration", () => {
  it("can be applied repeatedly", async () => {
    const fresh = new PGlite()
    for (const migration of BASE_MIGRATIONS) {
      await applyMigration(fresh, migration)
    }
    await applyMigration(fresh, "../../drizzle/0020_trading_automations.sql")
    await applyMigration(fresh, "../../drizzle/0020_trading_automations.sql")

    const result = await fresh.query<{ count: number }>(
      "select count(*)::int as count from information_schema.tables where table_name = 'trading_automations'"
    )
    expect(result.rows).toEqual([{ count: 1 }])
    await fresh.close()
  })

  it("adds the type column idempotently, defaulting to Uncategorized", async () => {
    const fresh = new PGlite()
    for (const migration of BASE_MIGRATIONS) {
      await applyMigration(fresh, migration)
    }
    await applyMigration(fresh, "../../drizzle/0020_trading_automations.sql")
    await applyMigration(fresh, "../../drizzle/0025_automation_type.sql")
    await applyMigration(fresh, "../../drizzle/0025_automation_type.sql")

    const result = await fresh.query<{ column_default: string | null }>(
      `select column_default from information_schema.columns
       where table_name = 'trading_automations' and column_name = 'type'`
    )
    expect(result.rows).toEqual([
      { column_default: "'Uncategorized'::character varying" },
    ])
    await fresh.close()
  })

  it("links bot and backtest snapshots and allows Automation bots", async () => {
    const columns = await client.query<{
      table_name: string
      column_name: string
    }>(`
      select table_name, column_name
      from information_schema.columns
      where table_name in ('bots', 'backtests')
        and column_name = 'automation_id'
      order by table_name
    `)
    expect(columns.rows).toEqual([
      { table_name: "backtests", column_name: "automation_id" },
      { table_name: "bots", column_name: "automation_id" },
    ])

    const constraint = await client.query<{ definition: string }>(`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'bots_strategy_type_check'
    `)
    expect(constraint.rows[0]?.definition).toContain("automation")
  })
})
