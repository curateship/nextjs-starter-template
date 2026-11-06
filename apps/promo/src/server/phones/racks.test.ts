import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { readProjectDescription } from "@/lib/social/project-description"
import { promoNotices } from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { phoneHistory } from "./history"
import { raiseProblem } from "./notices"
import { changePhone, createPhone, listPhones, putPhonesOnRack, serialInUse } from "./phones"
import { queuePhoneAction } from "./queue"
import {
  checkIn,
  createPairingCode,
  createRack,
  deleteRack,
  disconnectRack,
  listRacks,
  pairRack,
  readRack,
  updateRack,
  verifyRackRequest,
  type ReportedPhone,
  type VerifiedRack,
} from "./rack"
import { RACK_VERSION } from "./release"
import { promoPhoneActions, promoRacks } from "./schema"
import { requestSignature } from "./signing"

const T0 = new Date("2099-01-01T12:00:00Z")
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

function device(serial: string): ReportedPhone {
  return { serial, state: "device", usb: "usb:1-1", model: "Pixel 8a", android: "16", kind: "android" }
}

const PHONE = {
  name: "Spare",
  kind: "android" as const,
  model: "",
  androidVersion: "",
  serial: "",
  simCarrier: "",
  simNumber: "",
  connection: "sim" as const,
  proxyId: null,
  notes: "",
  folderId: null,
  labelId: null,
  tags: [],
  shelfSlot: "",
}

const DESCRIPTION: WrittenPageNode = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "The shelf by the window." }] }],
}

/**
 * The Racks dashboard, Promo's side (`workspace/tasks/Phone farm/12-racks-dashboard.md`):
 * a rack is made with a name and a description before the rack program
 * pairs, the program joins that rack, a disconnected rack can be deleted,
 * and phones move between racks with a line in their history.
 */
describe("racks made on the Racks dashboard", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function paired(rackId: string, at = T0): Promise<VerifiedRack> {
    const { code } = await createPairingCode(userId, rackId, db, at)
    const { key } = await pairRack({ code, platform: "macOS 15", version: RACK_VERSION }, db, at)
    return { id: rackId, userId, key }
  }

  it("makes a rack with its name and description, unpaired and refusing any signed message", async () => {
    const rackId = await createRack(userId, { name: " Desk rack ", description: DESCRIPTION }, db, T0)
    const [rack] = await listRacks(userId, db, T0)
    expect(rack).toMatchObject({ id: rackId, name: "Desk rack", state: "unpaired", live: false, pairedAt: null })
    expect(rack.descriptionText).toBe("The shelf by the window.")

    const headers = new Headers({
      "x-rack-id": rackId,
      "x-rack-time": String(Math.floor(T0.getTime() / 1000)),
      "x-rack-nonce": "ab".repeat(16),
      "x-rack-signature": requestSignature("anything", "POST", "/api/rack/next", Math.floor(T0.getTime() / 1000), "ab".repeat(16), "{}"),
    })
    await expect(verifyRackRequest({ method: "POST", path: "/api/rack/next", headers, body: "{}" }, db, T0)).rejects.toThrow(
      "not paired"
    )
    await expect(createRack(userId, { name: "  " }, db)).rejects.toThrow("needs a name")
  })

  it("pairs the program with the rack the code was made for, keeping its name, and makes no second rack", async () => {
    const rackId = await createRack(userId, { name: "Desk rack", description: DESCRIPTION }, db, T0)
    await paired(rackId)
    const racks = await listRacks(userId, db, T0)
    expect(racks).toHaveLength(1)
    expect(racks[0]).toMatchObject({ id: rackId, name: "Desk rack", platform: "macOS 15", state: "silent" })
    expect(racks[0].pairedAt).toEqual(T0)
  })

  it("refuses a new code for a connected rack, and gives one again once it is disconnected", async () => {
    const rackId = await createRack(userId, { name: "Desk rack" }, db, T0)
    const rack = await paired(rackId)
    await expect(createPairingCode(userId, rackId, db, T0)).rejects.toThrow("already paired")

    await disconnectRack(userId, rackId, db, later(10))
    expect((await readRack(userId, rackId, db))?.state).toBe("disconnected")
    const again = await paired(rackId, later(20))
    expect((await readRack(userId, rackId, db))?.state).toBe("silent")
    expect(again.key).not.toBe(rack.key)
  })

  it("never lets a second code take a connected rack's key: pairing spends every other code for it", async () => {
    const rackId = await createRack(userId, { name: "Desk rack" }, db, T0)
    // New code pressed twice while waiting: two codes for one rack.
    const first = await createPairingCode(userId, rackId, db, T0)
    const second = await createPairingCode(userId, rackId, db, T0)
    const { key } = await pairRack({ code: first.code, platform: "macOS 15", version: RACK_VERSION }, db, T0)
    await expect(pairRack({ code: second.code, platform: "macOS 15", version: RACK_VERSION }, db, later(1))).rejects.toThrow(
      "not valid"
    )
    // The first computer's key still signs.
    const stamp = Math.floor(later(2).getTime() / 1000)
    const headers = new Headers({
      "x-rack-id": rackId,
      "x-rack-time": String(stamp),
      "x-rack-nonce": "cd".repeat(16),
      "x-rack-signature": requestSignature(key, "POST", "/api/rack/next", stamp, "cd".repeat(16), "{}"),
    })
    await expect(verifyRackRequest({ method: "POST", path: "/api/rack/next", headers, body: "{}" }, db, later(2))).resolves.toMatchObject({
      id: rackId,
    })

    // A code made while it is connected is refused at pairing too, should one slip past.
    await disconnectRack(userId, rackId, db, later(3))
    const third = await createPairingCode(userId, rackId, db, later(3))
    const fourth = await createPairingCode(userId, rackId, db, later(3))
    await pairRack({ code: third.code, platform: "macOS 15", version: RACK_VERSION }, db, later(4))
    await expect(pairRack({ code: fourth.code, platform: "macOS 15", version: RACK_VERSION }, db, later(5))).rejects.toThrow("not valid")
  })

  it("refuses a code or a change for another person's rack", async () => {
    const stranger = (await insertUser(db, { role: "admin" })).id
    const theirs = await createRack(stranger, { name: "Theirs" }, db)
    await expect(createPairingCode(userId, theirs, db)).rejects.toThrow("does not exist")
    await expect(updateRack(userId, theirs, { name: "Mine now" }, db)).rejects.toThrow("does not exist")
    await expect(deleteRack(userId, theirs, db)).rejects.toThrow("does not exist")
    await expect(createPhone(userId, PHONE, theirs, db)).rejects.toThrow("does not exist")
    expect(await readRack(userId, theirs, db)).toBeNull()
  })

  it("saves the name and description one at a time", async () => {
    const rackId = await createRack(userId, { name: "Desk rack" }, db)
    await updateRack(userId, rackId, { description: readProjectDescription(JSON.stringify(DESCRIPTION)) }, db)
    await updateRack(userId, rackId, { name: "Garage rack" }, db)
    expect(await readRack(userId, rackId, db)).toMatchObject({ name: "Garage rack", descriptionText: "The shelf by the window." })
    await expect(updateRack(userId, rackId, { name: "" }, db)).rejects.toThrow("needs a name")
  })

  it("deletes a disconnected rack, keeping its phones, their history and finished actions, and its notices go", async () => {
    const rackId = await createRack(userId, { name: "Desk rack" }, db, T0)
    const rack = await paired(rackId)
    await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
    const [phone] = await listPhones(userId, db, T0)
    await queuePhoneAction(userId, phone.id, "phone/health", db, T0)
    await db.update(promoPhoneActions).set({ status: "done", finishedAt: T0 })
    await raiseProblem(userId, { kind: "rack_silent", targetId: rackId, message: "Rack not checking in", detail: "", href: "" }, null, db, T0)

    await expect(deleteRack(userId, rackId, db)).rejects.toThrow("is connected")
    await disconnectRack(userId, rackId, db, later(5))
    await deleteRack(userId, rackId, db, later(6))

    expect(await listRacks(userId, db)).toEqual([])
    const [left] = await listPhones(userId, db, later(6))
    expect(left).toMatchObject({ id: phone.id, rackId: null })
    expect(await db.select().from(promoPhoneActions)).toHaveLength(1)
    expect((await phoneHistory(userId, phone.id, db)).map((line) => line.kind)).toContain("plugged_in")
    expect(await db.select().from(promoNotices).where(eq(promoNotices.kind, "rack_silent"))).toEqual([])
  })

  it("deletes a rack that never paired", async () => {
    const rackId = await createRack(userId, { name: "Never used" }, db)
    await deleteRack(userId, rackId, db)
    expect(await db.select().from(promoRacks)).toEqual([])
  })

  it("moves a phone to the rack that sees it, and says so in its history with both names", async () => {
    const desk = await paired(await createRack(userId, { name: "Desk rack" }, db, T0))
    const garage = await paired(await createRack(userId, { name: "Garage rack" }, db, T0))
    await checkIn(desk, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
    await checkIn(desk, { version: RACK_VERSION, platform: "", phones: [], rolledBack: null }, db, later(15))
    await checkIn(garage, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, later(30))

    const [phone] = await listPhones(userId, db, later(30))
    expect(phone.rackId).toBe(garage.id)
    const history = await phoneHistory(userId, phone.id, db)
    expect(history.find((line) => line.kind === "moved_rack")?.detail).toBe("Moved from Desk rack to Garage rack.")
  })

  it("puts a hand-made phone on a rack, and never calls it unplugged before it was ever plugged in", async () => {
    const desk = await paired(await createRack(userId, { name: "Desk rack" }, db, T0))
    const garageId = await createRack(userId, { name: "Garage rack" }, db, T0)
    const phoneId = await createPhone(userId, { ...PHONE, serial: "Z9" }, garageId, db)
    const moved = await putPhonesOnRack(userId, [phoneId], desk.id, db, T0)
    expect(moved.done).toEqual([phoneId])

    await checkIn(desk, { version: RACK_VERSION, platform: "", phones: [], rolledBack: null }, db, later(15))
    const kinds = (await phoneHistory(userId, phoneId, db)).map((line) => line.kind)
    expect(kinds).toEqual(["put_on_rack"])
    expect((await listPhones(userId, db, later(15)))[0]).toMatchObject({ rackId: desk.id, offlineReason: "Never seen by the rack" })
  })

  it("saves only the fields a person changed, so the rack's own reading is kept", async () => {
    const desk = await paired(await createRack(userId, { name: "Desk rack" }, db, T0))
    await checkIn(desk, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
    const [phone] = await listPhones(userId, db, T0)
    expect(phone.androidVersion).toBe("16")
    await changePhone(userId, phone.id, { notes: "Top shelf, cracked corner" }, db)
    expect((await listPhones(userId, db, T0))[0]).toMatchObject({ notes: "Top shelf, cracked corner", androidVersion: "16", model: "Pixel 8a" })
    expect(await serialInUse(userId, " A1 ", db)).toBe(true)
    expect(await serialInUse(userId, "B2", db)).toBe(false)
  })
})
