import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { forgetAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import {
  loadMediaBootstrap,
  savePersonalBackground,
  savePersonalSound,
} from "@/server/pomodoro/personal-room"
import { loadOrCreatePreferences } from "@/server/pomodoro/productivity"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroPersonalRooms,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Shuffle, tags and the admin's defaults, against a real database.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetAppSettings()
  forgetMediaCatalog()
})

afterEach(async () => {
  await client.close()
})

async function personalRoom(userId: string) {
  const [row] = await db
    .select()
    .from(pomodoroPersonalRooms)
    .where(eq(pomodoroPersonalRooms.userId, userId))
  return row
}

describe("saving a choice", () => {
  it("saves silence as none, and shuffle and tags as they are", async () => {
    const member = (await insertUser(db)).id
    await savePersonalSound(member, null)
    expect((await personalRoom(member)).sound).toBe("none")
    await savePersonalSound(member, "tags:nature,rain")
    expect((await personalRoom(member)).sound).toBe("tags:nature,rain")
    await savePersonalBackground(member, "shuffle")
    expect((await personalRoom(member)).background).toBe("shuffle")
    await expect(savePersonalSound(member, "tags:")).rejects.toThrow("UNKNOWN_SOUND")
  })
})

describe("somebody who never picked", () => {
  it("gets the admin's defaults, and keeps silence once they chose it", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const fresh = (await insertUser(db)).id
    const quiet = (await insertUser(db)).id
    await savePersonalSound(quiet, null)
    await saveAppSetting({ key: "media.shuffleUnset", value: false, actorUserId: admin })
    await saveAppSetting({
      key: "media.defaults",
      value: { sound: "curated:rain", background: "scene:stars" },
      actorUserId: admin,
    })

    const forFresh = await loadMediaBootstrap(fresh)
    expect(forFresh.personal).toMatchObject({
      sound: "curated:rain",
      background: "scene:stars",
    })
    expect(forFresh.fallbackBackground).toBe("scene:stars")
    expect((await loadMediaBootstrap(quiet)).personal.sound).toBe("none")
    const logs = await db.select().from(pomodoroAuditLogs)
    expect(logs.map((log) => log.recordIds)).toContainEqual(["media.defaults"])
  })

  it("shuffles by default, and the server picks the first sound and theme", async () => {
    // Nothing saved: the switch starts on (Tyler, 9 Oct 2026).
    const fresh = (await insertUser(db)).id

    const boot = await loadMediaBootstrap(fresh)
    expect(boot.personal).toMatchObject({ sound: "shuffle", background: "shuffle" })
    expect(boot.picks.sound).toMatch(/^curated:/)
    expect(boot.picks.background).toMatch(/^scene:/)
  })

  it("draws tags from the built-in starter tags", async () => {
    const [rain] = await db
      .select({ tags: pomodoroCatalogItems.tags })
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.key, "rain"))
    expect(rain.tags).toEqual(["rain", "nature"])
  })
})

describe("a new account's timer", () => {
  it("starts on the admin's numbers, and an existing account keeps its own", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const before = (await insertUser(db)).id
    await loadOrCreatePreferences(before)
    await saveAppSetting({
      key: "timer.newAccount",
      value: {
        focusMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 20,
        sessionsBeforeLongBreak: 3,
        dailyGoalSessions: 6,
      },
      actorUserId: admin,
    })
    const after = (await insertUser(db)).id

    expect(await loadOrCreatePreferences(after)).toMatchObject({
      focusMinutes: 50,
      shortBreakMinutes: 10,
      sessionsBeforeLongBreak: 3,
      dailyGoalSessions: 6,
    })
    expect((await loadOrCreatePreferences(before)).focusMinutes).toBe(25)
  })
})
