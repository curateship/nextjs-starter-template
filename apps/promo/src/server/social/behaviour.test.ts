import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoProxies } from "@/server/browser/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { BEHAVIOUR_DEFAULTS, NO_READER_MESSAGE } from "@/lib/social/options"

import { saveAccount } from "./accounts"
import {
  isYoung,
  profileTimeZone,
  readBehaviour,
  readBehaviourView,
  readerProfile,
  saveBehaviour,
  warmUpEndsAt,
} from "./behaviour"
import { promoAccounts } from "./schema"

const DAY_MS = 86_400_000

describe("Settings → Behaviour", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let mainId: string
  let readerId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    mainId = await createProfile(userId, { name: "Main" }, db)
    readerId = await createProfile(userId, { name: "Reader" }, db)
    await db.insert(promoAccounts).values({ id: uuid(), userId, profileId: mainId })
  })

  afterEach(async () => {
    await client.close()
  })

  it("starts at Tyler's numbers with no reader", async () => {
    expect(await readBehaviour(userId, db)).toEqual({ readerProfileId: null, ...BEHAVIOUR_DEFAULTS })
    expect(BEHAVIOUR_DEFAULTS).toMatchObject({ warmUpDays: 3, youngDays: 90, youngPerHour: 2, youngPerDay: 6 })
    await expect(readerProfile(userId, db)).rejects.toThrow(NO_READER_MESSAGE)
  })

  it("offers only profiles that hold no account as the reader, and saves one", async () => {
    const view = await readBehaviourView(userId, db)
    expect(view.readers.map((profile) => profile.name)).toEqual(["Reader"])

    await saveBehaviour(userId, { ...view.settings, readerProfileId: readerId }, db)
    expect(await readerProfile(userId, db)).toEqual({ id: readerId, name: "Reader" })
  })

  it("refuses a profile that holds an account as the reader, by name", async () => {
    const settings = await readBehaviour(userId, db)
    await expect(saveBehaviour(userId, { ...settings, readerProfileId: mainId }, db)).rejects.toThrow(
      "The profile Main holds an account, so it cannot be the reader."
    )
  })

  it("refuses to put the account in the reader, and stops reading in a reader given an account", async () => {
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
    await expect(saveAccount(userId, { profileId: readerId, phoneId: null, voiceId: null }, db)).rejects.toThrow(
      "is the reader browser"
    )

    // Written behind the app's back, the reader is still refused at run time.
    await db.insert(promoAccounts).values({ id: uuid(), userId, profileId: readerId, platform: "instagram" })
    await expect(readerProfile(userId, db)).rejects.toThrow("now holds an account")
  })

  it("refuses waking hours that start and end together, and numbers out of bounds", async () => {
    const settings = await readBehaviour(userId, db)
    await expect(saveBehaviour(userId, { ...settings, wakeFromMinute: 480, wakeUntilMinute: 480 }, db)).rejects.toThrow(
      "different times"
    )
    await expect(saveBehaviour(userId, { ...settings, youngPerHour: 0 }, db)).rejects.toThrow("from 1 to 30")
  })

  it("takes the account's clock from its proxy's last test, else UTC", async () => {
    expect(await profileTimeZone(mainId, db)).toBe("UTC")
    const proxyId = uuid()
    await db.insert(promoProxies).values({
      id: proxyId,
      userId,
      host: "proxy.example",
      port: 8000,
      lastTestResult: { ok: true, timezone: "Europe/Berlin" },
    })
    const { promoProfiles } = await import("@/server/browser/schema")
    await db.update(promoProfiles).set({ proxyId })
    expect(await profileTimeZone(mainId, db)).toBe("Europe/Berlin")
  })

  it("counts warm-up and youth from the day Reddit made the account", () => {
    const now = new Date("2026-10-12T12:00:00Z")
    const made = new Date("2026-10-11T12:00:00Z")
    expect(warmUpEndsAt(made, 3, now)?.toISOString()).toBe("2026-10-14T12:00:00.000Z")
    expect(warmUpEndsAt(new Date(now.getTime() - 4 * DAY_MS), 3, now)).toBeNull()
    expect(warmUpEndsAt(null, 3, now)).toBeUndefined()
    expect(warmUpEndsAt(null, 0, now)).toBeNull()
    expect(isYoung(new Date(now.getTime() - 89 * DAY_MS), 90, now)).toBe(true)
    expect(isYoung(new Date(now.getTime() - 91 * DAY_MS), 90, now)).toBe(false)
    expect(isYoung(null, 90, now)).toBe(true)
  })
})
