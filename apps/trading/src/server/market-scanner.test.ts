import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { MarketScannerRuleInput } from "@/lib/market-scanner"
import type { CustomShellDb } from "@/server/db"
import {
  createMarketScannerRule,
  deleteAllMarketScannerAlerts,
  deleteMarketScannerRule,
  getMarketScannerAlertsPage,
  getMarketScannerPaused,
  getMarketScannerRules,
  getMarketScannerRuntimeEnabled,
  insertMarketScannerAlert,
  listEnabledMarketScannerRules,
  markMarketScannerAlertRead,
  setMarketScannerPaused,
  setMarketScannerRuntimeEnabled,
  updateMarketScannerRule,
} from "@/server/market-scanner"
import * as schema from "@/server/schema"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0035_market_scanner.sql",
    "../../drizzle/0041_market_scanner_pause.sql",
    "../../drizzle/0042_market_scanner_runtime_control.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

async function createUser(email: string) {
  const id = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id,
    email,
    name: "Trader",
    role: "user",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

const input: MarketScannerRuleInput = {
  name: "BTC fast move",
  kind: "price_move",
  direction: "up",
  threshold: 5,
  marketScope: "selected",
  markets: ["BTC"],
  window: "15m",
  cooldown: "15m",
  enabled: true,
}

describe("market scanner storage", () => {
  it("keeps the scanner runtime on until it is explicitly turned off", async () => {
    expect(
      await getMarketScannerRuntimeEnabled(database as unknown as CustomShellDb)
    ).toBe(true)

    await setMarketScannerRuntimeEnabled(
      false,
      database as unknown as CustomShellDb
    )
    expect(
      await getMarketScannerRuntimeEnabled(database as unknown as CustomShellDb)
    ).toBe(false)

    await setMarketScannerRuntimeEnabled(
      true,
      database as unknown as CustomShellDb
    )
    expect(
      await getMarketScannerRuntimeEnabled(database as unknown as CustomShellDb)
    ).toBe(true)
  })

  it("pauses scanner rule evaluation without disabling saved rules", async () => {
    const userId = await createUser("owner@example.test")
    await createMarketScannerRule(
      userId,
      input,
      database as unknown as CustomShellDb
    )

    expect(
      await listEnabledMarketScannerRules(database as unknown as CustomShellDb)
    ).toHaveLength(1)

    await setMarketScannerPaused(
      userId,
      true,
      database as unknown as CustomShellDb
    )

    expect(
      await getMarketScannerPaused(
        userId,
        database as unknown as CustomShellDb
      )
    ).toBe(true)
    expect(
      await listEnabledMarketScannerRules(database as unknown as CustomShellDb)
    ).toEqual([])
    expect(
      await getMarketScannerRules(userId, database as unknown as CustomShellDb)
    ).toHaveLength(1)

    await setMarketScannerPaused(
      userId,
      false,
      database as unknown as CustomShellDb
    )

    expect(
      await listEnabledMarketScannerRules(database as unknown as CustomShellDb)
    ).toHaveLength(1)
  })

  it("enforces the 100-rule limit during simultaneous creates", async () => {
    const userId = await createUser("owner@example.test")
    const results = await Promise.allSettled(
      Array.from({ length: 101 }, (_, index) =>
        createMarketScannerRule(
          userId,
          { ...input, name: `Rule ${index + 1}` },
          database as unknown as CustomShellDb
        )
      )
    )

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(100)
    expect(
      (await getMarketScannerRules(userId, database as unknown as CustomShellDb))
    ).toHaveLength(100)
  })

  it("keeps rules and alerts private to their owner", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const rule = await createMarketScannerRule(
      ownerId,
      input,
      database as unknown as CustomShellDb
    )
    await insertMarketScannerAlert(
      {
        rule,
        coin: "BTC",
        observed: 5.2,
        occurredAt: new Date("2026-07-14T12:00:00.000Z"),
      },
      database as unknown as CustomShellDb
    )

    const ownerRules = await getMarketScannerRules(
      ownerId,
      database as unknown as CustomShellDb
    )
    const ownerAlerts = await getMarketScannerAlertsPage(
      ownerId,
      { limit: 20 },
      database as unknown as CustomShellDb
    )
    const otherRules = await getMarketScannerRules(
      otherId,
      database as unknown as CustomShellDb
    )
    const otherAlerts = await getMarketScannerAlertsPage(
      otherId,
      { limit: 20 },
      database as unknown as CustomShellDb
    )

    expect(ownerRules).toHaveLength(1)
    expect(ownerAlerts.alerts).toMatchObject([{ coin: "BTC", observed: 5.2 }])
    expect(ownerAlerts.unreadCount).toBe(1)
    expect(otherRules).toEqual([])
    expect(otherAlerts).toEqual({ alerts: [], unreadCount: 0, nextCursor: null })
  })

  it("rejects updates, deletes, and reads from another user", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const rule = await createMarketScannerRule(
      ownerId,
      input,
      database as unknown as CustomShellDb
    )
    const alert = await insertMarketScannerAlert(
      { rule, coin: "BTC", observed: 5.2, occurredAt: now() },
      database as unknown as CustomShellDb
    )
    expect(alert).not.toBeNull()

    await expect(
      updateMarketScannerRule(
        otherId,
        rule.id,
        { ...input, name: "Stolen" },
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("Rule not found")
    await expect(
      deleteMarketScannerRule(
        otherId,
        rule.id,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("Rule not found")
    await expect(
      markMarketScannerAlertRead(
        otherId,
        alert!.id,
        database as unknown as CustomShellDb
      )
    ).rejects.toThrow("Alert not found")
  })

  it("keeps alert history when its rule is deleted", async () => {
    const userId = await createUser("owner@example.test")
    const rule = await createMarketScannerRule(
      userId,
      input,
      database as unknown as CustomShellDb
    )
    await insertMarketScannerAlert(
      { rule, coin: "BTC", observed: 5.2, occurredAt: now() },
      database as unknown as CustomShellDb
    )

    await deleteMarketScannerRule(
      userId,
      rule.id,
      database as unknown as CustomShellDb
    )
    const rules = await getMarketScannerRules(
      userId,
      database as unknown as CustomShellDb
    )
    const page = await getMarketScannerAlertsPage(
      userId,
      { limit: 20 },
      database as unknown as CustomShellDb
    )

    expect(rules).toEqual([])
    expect(page.alerts).toMatchObject([{ ruleId: null, ruleName: input.name }])
  })

  it("deletes every alert for one user without touching another user", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const ownerRule = await createMarketScannerRule(
      ownerId,
      input,
      database as unknown as CustomShellDb
    )
    const otherRule = await createMarketScannerRule(
      otherId,
      input,
      database as unknown as CustomShellDb
    )
    await insertMarketScannerAlert(
      { rule: ownerRule, coin: "BTC", observed: 5.2, occurredAt: now() },
      database as unknown as CustomShellDb
    )
    await insertMarketScannerAlert(
      { rule: otherRule, coin: "ETH", observed: 5.3, occurredAt: now() },
      database as unknown as CustomShellDb
    )

    const result = await deleteAllMarketScannerAlerts(
      ownerId,
      database as unknown as CustomShellDb
    )
    const ownerPage = await getMarketScannerAlertsPage(
      ownerId,
      { limit: 20 },
      database as unknown as CustomShellDb
    )
    const otherPage = await getMarketScannerAlertsPage(
      otherId,
      { limit: 20 },
      database as unknown as CustomShellDb
    )
    const ownerRules = await getMarketScannerRules(
      ownerId,
      database as unknown as CustomShellDb
    )
    const otherRules = await getMarketScannerRules(
      otherId,
      database as unknown as CustomShellDb
    )

    expect(result).toEqual({ count: 1 })
    expect(ownerPage.alerts).toEqual([])
    expect(otherPage.alerts).toMatchObject([{ coin: "ETH" }])
    expect(ownerRules[0]?.lastTriggeredAt).toBeNull()
    expect(otherRules[0]?.lastTriggeredAt).not.toBeNull()
  })

  it("paginates alert history without exposing another user's alerts", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const rule = await createMarketScannerRule(
      ownerId,
      input,
      database as unknown as CustomShellDb
    )
    for (const occurredAt of [
      "2026-07-14T12:00:00.000Z",
      "2026-07-14T12:01:00.000Z",
      "2026-07-14T12:02:00.000Z",
    ]) {
      await insertMarketScannerAlert(
        { rule, coin: "BTC", observed: 5.2, occurredAt: new Date(occurredAt) },
        database as unknown as CustomShellDb
      )
    }

    const first = await getMarketScannerAlertsPage(
      ownerId,
      { limit: 2 },
      database as unknown as CustomShellDb
    )
    const second = await getMarketScannerAlertsPage(
      ownerId,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      database as unknown as CustomShellDb
    )
    const other = await getMarketScannerAlertsPage(
      otherId,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      database as unknown as CustomShellDb
    )

    expect(first.alerts.map((alert) => alert.occurredAt)).toEqual([
      "2026-07-14T12:02:00.000Z",
      "2026-07-14T12:01:00.000Z",
    ])
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(second.alerts.map((alert) => alert.occurredAt)).toEqual([
      "2026-07-14T12:00:00.000Z",
    ])
    expect(second.nextCursor).toBeNull()
    expect(other.alerts).toEqual([])
  })
})
