import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { promoProfiles } from "@/server/browser/schema"
import { addAccount, saveAccount, setAccountRunsOn } from "@/server/social/accounts"
import { listRedditAccounts } from "@/server/social/account-list"
import { promoAccounts } from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { createPhone, deletePhones, holdPhones, listPhones, phonesFreeFor, phoneStatus, type PhoneInput } from "./phones"

const PHONE: PhoneInput = {
  name: "Pixel 8a",
  model: "Pixel 8a",
  androidVersion: "16",
  serial: "",
  simCarrier: "Mint Mobile",
  simNumber: "555 0100",
  connection: "sim",
  proxyId: null,
  notes: "",
  folderId: null,
  labelId: null,
  tags: [],
  shelfSlot: "4",
}

/**
 * Part 1 of the phone farm: phones as records, and an account that runs on a
 * profile or a phone, never both, one Reddit account per phone.
 */
describe("phones as records", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function profile(name = "Main") {
    const id = uuid()
    await db.insert(promoProfiles).values({ id, userId, name, volumeName: `promo-profile-${id}` })
    return id
  }

  it("lists a phone added by hand, offline until the rack has seen it", async () => {
    const id = await createPhone(userId, PHONE, db)
    const [phone] = await listPhones(userId, db)
    expect(phone).toMatchObject({ id, name: "Pixel 8a", simCarrier: "Mint Mobile", shelfSlot: "4", status: "offline" })
    expect(phone.offlineReason).toBe("Never seen by the rack")
  })

  it("shows the account that runs on the phone, on the phone and on the account", async () => {
    const phoneId = await createPhone(userId, PHONE, db)
    const accountId = await addAccount(userId, { profileId: null, phoneId, voiceId: null }, db)
    await db.update(promoAccounts).set({ handle: "quiet_builder" }).where(eq(promoAccounts.id, accountId))

    const [phone] = await listPhones(userId, db)
    expect(phone.accounts).toEqual([{ id: accountId, platform: "reddit", handle: "quiet_builder", blocked: false }])
    const [row] = await listRedditAccounts(userId, { retired: false }, db)
    expect(row.profile).toBeNull()
    expect(row.phone).toMatchObject({ id: phoneId, name: "Pixel 8a", connection: "sim", simCarrier: "Mint Mobile" })
  })

  it("refuses an account on a profile and a phone at once, in the code and in the database", async () => {
    const phoneId = await createPhone(userId, PHONE, db)
    const profileId = await profile()
    await expect(addAccount(userId, { profileId, phoneId, voiceId: null }, db)).rejects.toThrow("never both")

    const accountId = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
    await expect(db.update(promoAccounts).set({ phoneId }).where(eq(promoAccounts.id, accountId))).rejects.toThrow()
  })

  it("refuses a second Reddit account on the same phone", async () => {
    const phoneId = await createPhone(userId, PHONE, db)
    await addAccount(userId, { profileId: null, phoneId, voiceId: null }, db)
    await expect(addAccount(userId, { profileId: null, phoneId, voiceId: null }, db)).rejects.toThrow(
      "already has a Reddit account on it"
    )
    expect(await phonesFreeFor(userId, null, db)).toEqual([])
  })

  it("moves an account from its profile to a phone and back, clearing the other", async () => {
    const phoneId = await createPhone(userId, PHONE, db)
    const profileId = await profile()
    const accountId = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)

    await setAccountRunsOn(userId, accountId, { profileId: null, phoneId }, db)
    let [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect([row.profileId, row.phoneId]).toEqual([null, phoneId])

    await setAccountRunsOn(userId, accountId, { profileId, phoneId: null }, db)
    ;[row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect([row.profileId, row.phoneId]).toEqual([profileId, null])
  })

  it("refuses another person's phone", async () => {
    const stranger = (await insertUser(db, { role: "admin" })).id
    const theirs = await createPhone(stranger, PHONE, db)
    await expect(saveAccount(userId, { profileId: null, phoneId: theirs, voiceId: null }, db)).rejects.toThrow(
      "That phone does not exist."
    )
    expect(await deletePhones(userId, [theirs], db)).toEqual({ done: [], skipped: [theirs] })
  })

  it("refuses two phones with one serial, and keeps the account when its phone is deleted", async () => {
    const phoneId = await createPhone(userId, { ...PHONE, serial: "R58N" }, db)
    await expect(createPhone(userId, { ...PHONE, serial: "R58N" }, db)).rejects.toThrow("serial number")
    const accountId = await addAccount(userId, { profileId: null, phoneId, voiceId: null }, db)

    await deletePhones(userId, [phoneId], db)
    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
    expect(row.phoneId).toBeNull()
  })

  it("keeps a proxy only for a phone on Wi-Fi", async () => {
    const id = await createPhone(userId, { ...PHONE, connection: "sim", proxyId: null }, db)
    const [phone] = await listPhones(userId, db)
    expect(phone.id).toBe(id)
    expect(phone.proxy).toBeNull()
  })

  it("works out the status: held, then offline, then busy, then connected", () => {
    const now = new Date("2099-01-01T12:00:00Z")
    const fresh = new Date(now.getTime() - 10_000)
    const stale = new Date(now.getTime() - 50_000)
    expect(phoneStatus({ held: true, adbState: "device", lastSeenAt: fresh }, true, false, now)).toBe("held")
    expect(phoneStatus({ held: false, adbState: "device", lastSeenAt: stale }, true, false, now)).toBe("offline")
    expect(phoneStatus({ held: false, adbState: "unauthorized", lastSeenAt: fresh }, true, false, now)).toBe("offline")
    expect(phoneStatus({ held: false, adbState: "device", lastSeenAt: fresh }, false, false, now)).toBe("offline")
    expect(phoneStatus({ held: false, adbState: "device", lastSeenAt: fresh }, true, true, now)).toBe("busy")
    expect(phoneStatus({ held: false, adbState: "device", lastSeenAt: fresh }, true, false, now)).toBe("connected")
  })

  it("holds and releases phones in one request", async () => {
    const id = await createPhone(userId, PHONE, db)
    expect(await holdPhones(userId, [id], true, db)).toEqual({ done: [id], skipped: [] })
    expect((await listPhones(userId, db))[0].status).toBe("held")
  })
})
