import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  getGuardianStatus,
  loadArmedGuardians,
  persistGuardianWatch,
  rearmGuardian,
  saveGuardianConfig,
  tripGuardian,
} from "@/server/guardian"
import { setDbForTests, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/util"
import * as schema from "@/server/schema"

async function applyMigration(target: PGlite, file: string) {
  const migration = await readFile(new URL(file, import.meta.url), "utf8")
  await target.exec(migration)
}

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

// One shared database for the whole file — every test isolates itself with
// its own user row, so there is nothing to reset between tests.
beforeAll(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0047_bot_guardian.sql",
  ]) {
    await applyMigration(client, file)
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterAll(async () => {
  await client.close()
})

async function createUser() {
  const userId = uuid()
  const createdAt = now()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Guardian Tester",
    role: "admin",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

const CONFIG = {
  enabled: true,
  dailyLossLimitUsd: 250,
  dailyLossLimitPct: null,
  maxDrawdownPct: 10,
  action: "pause_all" as const,
}

describe("guardian persistence", () => {
  it("returns safe defaults before any row exists", async () => {
    const userId = await createUser()
    const status = await getGuardianStatus(userId)
    expect(status.enabled).toBe(false)
    expect(status.action).toBe("pause_all")
    expect(status.trippedAt).toBeNull()
  })

  it("saves config and reads it back", async () => {
    const userId = await createUser()
    await saveGuardianConfig(userId, CONFIG)
    const status = await getGuardianStatus(userId)
    expect(status).toMatchObject({
      enabled: true,
      dailyLossLimitUsd: 250,
      dailyLossLimitPct: null,
      maxDrawdownPct: 10,
      action: "pause_all",
      trippedAt: null,
    })
  })

  it("saving restarts the watch baselines", async () => {
    const userId = await createUser()
    await saveGuardianConfig(userId, CONFIG)
    await persistGuardianWatch(userId, {
      dayDate: "2026-07-17",
      dayStartEquity: 1_000,
      peakEquity: 1_200,
      breachStreak: 2,
    })
    await saveGuardianConfig(userId, { ...CONFIG, dailyLossLimitUsd: 300 })
    const [armed] = await loadArmedGuardians([userId])
    expect(armed.watch).toEqual({
      dayDate: null,
      dayStartEquity: null,
      peakEquity: null,
      breachStreak: 0,
    })
  })

  it("only enabled, untripped guardians are armed", async () => {
    const enabledUser = await createUser()
    const disabledUser = await createUser()
    const trippedUser = await createUser()
    await saveGuardianConfig(enabledUser, CONFIG)
    await saveGuardianConfig(disabledUser, { ...CONFIG, enabled: false })
    await saveGuardianConfig(trippedUser, CONFIG)
    await tripGuardian(trippedUser, "test trip")

    const armed = await loadArmedGuardians([
      enabledUser,
      disabledUser,
      trippedUser,
    ])
    expect(armed.map((row) => row.userId)).toEqual([enabledUser])
  })

  it("the tripped latch fires exactly once", async () => {
    const userId = await createUser()
    await saveGuardianConfig(userId, CONFIG)
    const first = await tripGuardian(userId, "loss limit crossed")
    const second = await tripGuardian(userId, "loss limit crossed again")
    expect(first).toBeInstanceOf(Date)
    expect(second).toBeNull()
    const status = await getGuardianStatus(userId)
    expect(status.trippedReason).toBe("loss limit crossed")
  })

  it("stays tripped through a config save; only re-arm clears it", async () => {
    const userId = await createUser()
    await saveGuardianConfig(userId, CONFIG)
    await tripGuardian(userId, "loss limit crossed")

    await saveGuardianConfig(userId, { ...CONFIG, dailyLossLimitUsd: 500 })
    expect((await getGuardianStatus(userId)).trippedAt).not.toBeNull()

    const rearmed = await rearmGuardian(userId)
    expect(rearmed.trippedAt).toBeNull()
    expect(rearmed.trippedReason).toBeNull()
    // Re-armed guardians are watchable again, from fresh baselines.
    const [armed] = await loadArmedGuardians([userId])
    expect(armed.watch.dayStartEquity).toBeNull()
    expect(armed.watch.breachStreak).toBe(0)
  })
})
