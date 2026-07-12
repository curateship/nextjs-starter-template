import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { defaultStrategyConfig } from "@/lib/strategies/strategy-config"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  listUserStrategySettings,
  saveUserStrategySettings,
} from "@/server/strategies"
import { customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/util"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0003_custom_shell_workspaces.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0008_backtests.sql",
    "../../drizzle/0014_strategy_rebuild.sql",
    "../../drizzle/0017_remove_legacy_strategies.sql",
    "../../drizzle/0022_strategy_settings.sql",
  ]) {
    const migration = await readFile(new URL(file, import.meta.url), "utf8")
    await client.exec(migration)
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
})

async function createUser() {
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

describe("strategy settings", () => {
  it("stores one editable settings record per user and fixed strategy", async () => {
    const userId = await createUser()
    const config = defaultStrategyConfig("ema_cross", "15m")

    await saveUserStrategySettings(userId, "ema_cross", config, false)
    await saveUserStrategySettings(userId, "ema_cross", {
      ...config,
      interval: "1h",
    }, false)

    const rows = await listUserStrategySettings(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.strategyType).toBe("ema_cross")
    expect(rows[0]?.config).toMatchObject({
      interval: "1h",
      indicator: { type: "ema_cross" },
    })
  })

  it("keeps settings private to their owner", async () => {
    const ownerId = await createUser()
    const otherId = await createUser()

    await saveUserStrategySettings(
      ownerId,
      "rsi_levels",
      defaultStrategyConfig("rsi_levels", "15m"),
      false
    )

    await expect(listUserStrategySettings(otherId)).resolves.toEqual([])
  })

  it("persists whether a fixed strategy is pinned", async () => {
    const userId = await createUser()
    const config = defaultStrategyConfig("ema_cross", "15m")

    await saveUserStrategySettings(userId, "ema_cross", config, true)

    const rows = await listUserStrategySettings(userId)
    expect(rows[0]?.pinned).toBe(true)
  })
})
