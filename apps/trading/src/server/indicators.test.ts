import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_INDICATORS } from "@/lib/trading/indicators-config"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import { listUserIndicators, upsertUserIndicator } from "@/server/indicators"
import { customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

async function applyMigration(target: PGlite, file: string) {
  const migration = await readFile(new URL(file, import.meta.url), "utf8")
  await target.exec(migration)
}

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0018_indicator_settings.sql",
    "../../drizzle/0019_indicator_pinned.sql",
  ]) {
    await applyMigration(client, file)
  }
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

describe("listUserIndicators", () => {
  it("returns the defaults when the user has no rows", async () => {
    const userId = await createTestUser()
    expect(await listUserIndicators(userId)).toEqual(DEFAULT_INDICATORS)
  })

  it("overlays a saved row and keeps the other defaults", async () => {
    const userId = await createTestUser()
    await upsertUserIndicator(userId, {
      id: "rsi",
      enabled: true,
      pinned: true,
      params: { period: 21, overbought: 75, oversold: 25 },
      name: "My RSI",
      color: "#ff0000",
    })

    const list = await listUserIndicators(userId)
    expect(list.find((ind) => ind.id === "rsi")).toEqual({
      id: "rsi",
      type: "rsi",
      enabled: true,
      pinned: true,
      name: "My RSI",
      params: { period: 21, overbought: 75, oversold: 25 },
      color: "#ff0000",
    })
    expect(list.filter((ind) => ind.id !== "rsi")).toEqual(
      DEFAULT_INDICATORS.filter((ind) => ind.id !== "rsi")
    )
  })

  it("fills params a stored row predates from the defaults", async () => {
    const userId = await createTestUser()
    // A row saved before overbought/oversold became params.
    await upsertUserIndicator(userId, {
      id: "rsi",
      enabled: true,
      pinned: false,
      params: { period: 21 },
    })

    const rsi = (await listUserIndicators(userId)).find(
      (ind) => ind.id === "rsi"
    )
    expect(rsi?.params).toEqual({ period: 21, overbought: 70, oversold: 30 })
  })

  it("round-trips the picked session", async () => {
    const userId = await createTestUser()
    await upsertUserIndicator(userId, {
      id: "session",
      enabled: true,
      pinned: true,
      params: {},
      session: "tokyo",
    })

    const session = (await listUserIndicators(userId)).find(
      (ind) => ind.id === "session"
    )
    expect(session?.session).toBe("tokyo")
    expect(session?.enabled).toBe(true)
    expect(session?.pinned).toBe(true)
  })
})

describe("upsertUserIndicator", () => {
  it("rejects ids that are not in DEFAULT_INDICATORS", async () => {
    const userId = await createTestUser()
    await expect(
      upsertUserIndicator(userId, {
        id: "not-a-real-indicator",
        enabled: true,
        pinned: false,
        params: {},
      })
    ).rejects.toThrow("Unknown indicator")
  })

  it("updates the existing row instead of duplicating it", async () => {
    const userId = await createTestUser()
    await upsertUserIndicator(userId, {
      id: "ema-20",
      enabled: true,
      pinned: true,
      params: { period: 20 },
    })
    const updated = await upsertUserIndicator(userId, {
      id: "ema-20",
      enabled: false,
      pinned: false,
      params: { period: 34 },
      color: "#00ff00",
    })

    expect(updated).toEqual({
      id: "ema-20",
      type: "ema",
      enabled: false,
      pinned: false,
      params: { period: 34 },
      color: "#00ff00",
    })
    const rows = await database.select().from(schema.tradingIndicatorSettings)
    expect(rows).toHaveLength(1)
  })

  it("drops params keys the indicator type does not define", async () => {
    const userId = await createTestUser()
    await upsertUserIndicator(userId, {
      id: "ema-20",
      enabled: true,
      pinned: false,
      params: { period: 25, bogus: 1, injected: 999 },
    })

    const ema = (await listUserIndicators(userId)).find(
      (ind) => ind.id === "ema-20"
    )
    expect(ema?.params).toEqual({ period: 25 })
  })

  it("keeps users isolated from each other", async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    await upsertUserIndicator(userA, {
      id: "vwap",
      enabled: true,
      pinned: true,
      params: {},
    })

    expect(await listUserIndicators(userB)).toEqual(DEFAULT_INDICATORS)
  })
})

describe("0019 pinned migration", () => {
  it("backfills pinned = enabled once, then leaves later unpins alone", async () => {
    const fresh = new PGlite()
    await applyMigration(fresh, "../../drizzle/0000_custom_shell_baseline.sql")
    await applyMigration(fresh, "../../drizzle/0018_indicator_settings.sql")
    // Pre-pinned-era rows: one enabled, one disabled.
    await fresh.exec(`
      insert into users (id, email, name, role, password_hash, created_at, updated_at)
      values ('u1', 'u1@internal.dev', 'T', 'admin', 'x', now(), now());
      insert into indicator_settings (id, user_id, indicator_id, type, enabled, params, created_at, updated_at)
      values
        ('i1', 'u1', 'ema-20', 'ema', true, '{}', now(), now()),
        ('i2', 'u1', 'rsi', 'rsi', false, '{}', now(), now());
    `)

    await applyMigration(fresh, "../../drizzle/0019_indicator_pinned.sql")
    let rows = await fresh.query<{ indicator_id: string; pinned: boolean }>(
      "select indicator_id, pinned from indicator_settings order by indicator_id"
    )
    expect(rows.rows).toEqual([
      { indicator_id: "ema-20", pinned: true },
      { indicator_id: "rsi", pinned: false },
    ])

    // The user unpins the enabled one; a re-run (every boot) must not undo it.
    await fresh.exec("update indicator_settings set pinned = false where id = 'i1'")
    await applyMigration(fresh, "../../drizzle/0019_indicator_pinned.sql")
    rows = await fresh.query(
      "select indicator_id, pinned from indicator_settings where id = 'i1'"
    )
    expect(rows.rows).toEqual([{ indicator_id: "ema-20", pinned: false }])
    await fresh.close()
  })
})
