import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_APP_SETTINGS } from "@/lib/fitness/app-settings"
import type { CustomShellDb } from "@/server/db"
import { loadAppSettings, saveAppSetting } from "@/server/fitness/app-settings"
import { preferencesFor } from "@/server/fitness/profile"
import { fitnessAppSettings } from "@/server/fitness/schema"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let admin: CustomShellUser
let member: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  admin = await insertUser(database, { name: "Admin", email: "admin@example.test", role: "admin" })
  member = await insertUser(database, { name: "Ben", email: "ben@example.test" })
})

afterEach(async () => {
  await client.close()
})

describe("app-wide settings", () => {
  it("starts on the defaults: kilograms, 2.5 kg jumps, a 20 kg bar", async () => {
    expect(await loadAppSettings(database)).toEqual(DEFAULT_APP_SETTINGS)
  })

  it("is one answer for everybody once the admin saves it", async () => {
    await saveAppSetting("units", { unit: "lb", stepKg: 2.27, barKg: 20.4, platesKg: [10, 20, 10, 5] }, admin.id, database)
    const prefs = await preferencesFor(member.id, database)
    expect(prefs).toMatchObject({ unit: "lb", stepKg: 2.27, barKg: 20.4, platesKg: [20, 10, 5] })
    expect(prefs.weeklyGoal).toBe(3)
  })

  it("refuses a value that breaks its rules", async () => {
    await expect(
      saveAppSetting("workouts", { warmupsOn: true, weeklyGoal: 40, sex: null }, admin.id, database)
    ).rejects.toThrow()
  })

  it("falls back to the default for a stored group that no longer fits", async () => {
    await database
      .insert(fitnessAppSettings)
      .values({ key: "reminders", value: { time: "not a time" }, updatedAt: new Date(), updatedByUserId: admin.id })
    expect((await loadAppSettings(database)).reminders).toEqual(DEFAULT_APP_SETTINGS.reminders)
  })
})
