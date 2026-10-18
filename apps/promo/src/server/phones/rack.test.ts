import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

// R2, in memory: the step pictures are written and read through it.
const r2 = vi.hoisted(() => new Map<string, Uint8Array>())
vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async (key: string, data: Uint8Array) => {
    r2.set(key, data)
  }),
  getFromR2: vi.fn(async (key: string) => ({
    Body: r2.has(key) ? { transformToByteArray: async () => r2.get(key) as Uint8Array } : undefined,
  })),
  deleteFromR2: vi.fn(async (key: string) => {
    r2.delete(key)
  }),
}))

import { phoneHistory } from "./history"
import { sweepPhoneHealth } from "./health"
import { createPhone, listPhones } from "./phones"
import { queuePhoneAction } from "./queue"
import {
  checkIn,
  createPairingCode,
  disconnectRack,
  finishAction,
  nextAction,
  pairRack,
  phoneActions,
  verifyRackRequest,
  type ReportedPhone,
  type VerifiedRack,
} from "./rack"
import { answerSigned } from "./rack-http"
import { RACK_VERSION } from "./release"
import { promoPhoneActions, promoPhones } from "./schema"
import { replySignature, requestSignature } from "./signing"

const T0 = new Date("2099-01-01T12:00:00Z")
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const stamp = (at: Date) => Math.floor(at.getTime() / 1000)

function device(serial: string, usb = "usb:1-1", state = "device"): ReportedPhone {
  return { serial, state, usb, model: "Pixel 8a", android: "16", kind: "android" }
}

/**
 * Parts 2, 3 and 5 of the phone farm, Promo's side: pairing, the signed
 * messages, check-ins, the action queue, Disconnect and the shelf slot.
 * The rack program's side is tested in `rack/test_promo_rack.py`.
 */
describe("the rack", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    r2.clear()
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

  async function paired(): Promise<VerifiedRack & { key: string }> {
    const { code } = await createPairingCode(userId, db, T0)
    const { rackId, key } = await pairRack({ code, name: "Mac", platform: "macOS 15", version: RACK_VERSION }, db, T0)
    return { id: rackId, userId, key }
  }

  function signed(rack: { id: string; key: string }, body: string, at: Date, nonce = "ab".repeat(16), path = "/api/rack/next") {
    const headers = new Headers({
      "x-rack-id": rack.id,
      "x-rack-time": String(stamp(at)),
      "x-rack-nonce": nonce,
      "x-rack-signature": requestSignature(rack.key, "POST", path, stamp(at), nonce, body),
    })
    return { method: "POST", path, headers, body }
  }

  describe("pairing", () => {
    it("swaps a code for a key once, and refuses the code after that", async () => {
      const { code } = await createPairingCode(userId, db, T0)
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      const first = await pairRack({ code: code.toLowerCase(), name: "Mac", platform: "", version: "" }, db, T0)
      expect(first.key.length).toBeGreaterThan(40)
      await expect(pairRack({ code, name: "Mac", platform: "", version: "" }, db, T0)).rejects.toThrow("not valid")
    })

    it("leaves the code usable when the server has no encryption key", async () => {
      const { code } = await createPairingCode(userId, db, T0)
      vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "")
      await expect(pairRack({ code, name: "", platform: "", version: "" }, db, T0)).rejects.toThrow("ENCRYPTION_NOT_CONFIGURED")
      vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
      await expect(pairRack({ code, name: "", platform: "", version: "" }, db, T0)).resolves.toHaveProperty("rackId")
    })

    it("refuses a made-up code and one more than fifteen minutes old", async () => {
      await expect(pairRack({ code: "AAAA-BBBB", name: "", platform: "", version: "" }, db, T0)).rejects.toThrow("not valid")
      const { code } = await createPairingCode(userId, db, T0)
      await expect(pairRack({ code, name: "", platform: "", version: "" }, db, later(16 * 60))).rejects.toThrow("not valid")
    })
  })

  describe("signed messages", () => {
    it("accepts a message signed with the rack's key", async () => {
      const rack = await paired()
      await expect(verifyRackRequest(signed(rack, "{}", T0), db, T0)).resolves.toMatchObject({ id: rack.id, userId })
    })

    it("refuses no signature, a changed body, a wrong key and a clock five minutes out", async () => {
      const rack = await paired()
      const unsigned = { method: "POST", path: "/api/rack/next", headers: new Headers(), body: "{}" }
      await expect(verifyRackRequest(unsigned, db, T0)).rejects.toThrow("not signed")
      await expect(verifyRackRequest({ ...signed(rack, "{}", T0), body: '{"x":1}' }, db, T0)).rejects.toThrow("signature")
      await expect(verifyRackRequest(signed({ id: rack.id, key: "wrong" }, "{}", T0), db, T0)).rejects.toThrow("signature")
      await expect(verifyRackRequest(signed(rack, "{}", later(-301)), db, T0)).rejects.toThrow("clock")
    })

    it("refuses the same message sent twice", async () => {
      const rack = await paired()
      await verifyRackRequest(signed(rack, "{}", T0), db, T0)
      await expect(verifyRackRequest(signed(rack, "{}", T0), db, later(1))).rejects.toThrow("already received")
    })

    it("refuses a disconnected rack's key at once", async () => {
      const rack = await paired()
      await disconnectRack(userId, rack.id, db, T0)
      await expect(verifyRackRequest(signed(rack, "{}", T0), db, T0)).rejects.toThrow("disconnected")
    })

    it("signs every reply so the rack can check it", async () => {
      const rack = await paired()
      const nonce = "cd".repeat(16)
      const now = new Date()
      const request = new Request("http://promo.test/api/rack/next", {
        method: "POST",
        body: "{}",
        headers: signed(rack, "{}", now, nonce).headers,
      })
      const response = await answerSigned(request, z.object({}), async () => ({ action: null }), db)
      const text = await response.text()
      const replyStamp = Number(response.headers.get("x-promo-time"))
      expect(response.status).toBe(200)
      expect(response.headers.get("x-promo-signature")).toBe(replySignature(rack.key, 200, nonce, replyStamp, text))
    })

    it("answers a refused message without a signature, since there is no rack to sign for", async () => {
      const request = new Request("http://promo.test/api/rack/next", { method: "POST", body: "{}" })
      const response = await answerSigned(request, z.object({}), async () => ({}), db)
      expect(response.status).toBe(401)
      expect(response.headers.get("x-promo-signature")).toBeNull()
    })
  })

  describe("check-ins", () => {
    it("adds two new phones as connected, and shows one offline once it is unplugged", async () => {
      const rack = await paired()
      const answer = await checkIn(rack, { version: RACK_VERSION, platform: "macOS", phones: [device("A1"), device("B2", "usb:1-2")], rolledBack: null }, db, T0)
      expect(answer).toEqual({ latestVersion: RACK_VERSION, checkInSeconds: 15 })
      // Both are named after their model, so they are put in serial order here.
      const bySerial = (list: Awaited<ReturnType<typeof listPhones>>) =>
        [...list].sort((a, b) => a.serial.localeCompare(b.serial))
      let phones = bySerial(await listPhones(userId, db, later(1)))
      expect(phones.map((phone) => [phone.serial, phone.status, phone.androidVersion])).toEqual([
        ["A1", "connected", "16"],
        ["B2", "connected", "16"],
      ])

      await checkIn(rack, { version: RACK_VERSION, platform: "macOS", phones: [device("A1")], rolledBack: null }, db, later(15))
      phones = bySerial(await listPhones(userId, db, later(16)))
      expect(phones.map((phone) => [phone.serial, phone.status, phone.offlineReason])).toEqual([
        ["A1", "connected", ""],
        ["B2", "offline", "Not plugged in"],
      ])
    })

    it("shows every phone offline within a minute when the rack stops checking in", async () => {
      const rack = await paired()
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
      expect((await listPhones(userId, db, later(44)))[0].status).toBe("connected")
      expect((await listPhones(userId, db, later(46)))[0].status).toBe("offline")
    })

    it("moves the USB port by itself, and writes plugging in and pulling out in the phone's history", async () => {
      const rack = await paired()
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1", "usb:1-1")], rolledBack: null }, db, T0)
      const [phone] = await db.select().from(promoPhones)
      await db.update(promoPhones).set({ shelfSlot: "4" }).where(eq(promoPhones.id, phone.id))

      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1", "usb:1-3")], rolledBack: null }, db, later(15))
      expect((await db.select().from(promoPhones))[0].usbPort).toBe("usb:1-3")

      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [], rolledBack: null }, db, later(30))
      expect((await listPhones(userId, db, later(31)))[0]).toMatchObject({ status: "offline", shelfSlot: "4" })
      // The bell waits five minutes (health.test.ts); the history does not.
      expect(await db.select().from(customShellNotifications)).toEqual([])
      expect((await phoneHistory(userId, phone.id, db)).map((line) => [line.kind, line.detail])).toEqual([
        ["unplugged", "It was on USB port usb:1-3."],
        ["plugged_in", "On USB port usb:1-1."],
      ])
    })

    it("asks for a tap on the screen when USB debugging is not allowed yet", async () => {
      const rack = await paired()
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [{ ...device("C3", "usb:2-1", "unauthorized"), model: "", android: "" }], rolledBack: null }, db, T0)
      const [phone] = await listPhones(userId, db, later(1))
      expect(phone).toMatchObject({ name: "Phone C3", status: "offline", offlineReason: "Allow USB debugging on its screen" })
      // Nothing changes until a person taps the phone, so the bell rings at once.
      await sweepPhoneHealth(db, later(2))
      const [notice] = await db.select().from(customShellNotifications)
      expect(notice.message).toBe("Phone offline: Phone C3")
      expect(notice.detail).toBe(
        "Allow USB debugging on its screen. It was on USB port usb:2-1. Type its shelf slot on the Phones dashboard so the notice can say where it is."
      )
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [{ ...device("C3", "usb:2-1", "unauthorized"), model: "", android: "" }], rolledBack: null }, db, later(15))
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("C3", "usb:2-1")], rolledBack: null }, db, later(30))
      expect((await listPhones(userId, db, later(31)))[0]).toMatchObject({ name: "Pixel 8a", status: "connected" })
      await sweepPhoneHealth(db, later(32))
      expect(await db.select().from(customShellNotifications)).toEqual([])
    })

    it("ties a phone typed in by hand to the plugged-in phone by its serial", async () => {
      const rack = await paired()
      const id = await createPhone(userId, {
        name: "Tyler's Galaxy", kind: "android", model: "Galaxy A15", androidVersion: "", serial: "A1", simCarrier: "", simNumber: "",
        connection: "sim", proxyId: null, notes: "", folderId: null, labelId: null, tags: [], shelfSlot: "",
      }, db)
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
      const phones = await listPhones(userId, db, later(1))
      expect(phones).toHaveLength(1)
      expect(phones[0]).toMatchObject({ id, name: "Tyler's Galaxy", model: "Galaxy A15", androidVersion: "16", status: "connected" })
    })
  })

  describe("actions", () => {
    async function rackWithPhone() {
      const rack = await paired()
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [device("A1")], rolledBack: null }, db, T0)
      const [phone] = await db.select().from(promoPhones)
      return { rack, phoneId: phone.id }
    }

    it("hands an action out once, shows the phone busy, and keeps the answer and a picture of each step", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const id = await queuePhoneAction(userId, phoneId, "phone/android-version", db, later(1))
      expect(await queuePhoneAction(userId, phoneId, "phone/android-version", db, later(2))).toBe(id)

      expect(await nextAction(rack, db, later(3))).toEqual({
        id,
        serial: "A1",
        action: "phone/android-version",
        args: {},
        timeoutSeconds: 300,
      })
      expect(await nextAction(rack, db, later(4))).toBeNull()
      expect((await listPhones(userId, db, later(5)))[0].status).toBe("busy")

      const accepted = await finishAction(rack, {
        id,
        ok: true,
        result: { fromScreen: "16", fromSystem: "16", match: true },
        error: "",
        steps: [
          { step: "Opened About phone", jpeg: "/9j/AAAA" },
          { step: "Read Android 16", jpeg: "/9j/BBBB" },
        ],
      }, db, later(6))
      expect(accepted).toBe(true)
      const [view] = await phoneActions(userId, phoneId, db)
      expect(view).toMatchObject({
        status: "done",
        answer: "Settings says Android 16, the same as the phone itself reports.",
        steps: ["Opened About phone", "Read Android 16"],
      })
      // Kept in R2 encrypted, never as the picture itself.
      const stored = [...r2.values()].map((bytes) => Buffer.from(bytes).toString("utf8"))
      expect(stored).toHaveLength(2)
      expect(stored.some((text) => text.includes("/9j/AAAA"))).toBe(false)
      const { stepPictures } = await import("./trail")
      expect((await stepPictures(userId, id, db)).map((picture) => [picture.step, picture.src])).toEqual([
        ["Opened About phone", "data:image/jpeg;base64,/9j/AAAA"],
        ["Read Android 16", "data:image/jpeg;base64,/9j/BBBB"],
      ])
    })

    it("refuses an unknown action, a held phone and a rack that stopped checking in", async () => {
      const { phoneId } = await rackWithPhone()
      await expect(queuePhoneAction(userId, phoneId, "reddit/post" as never, db, later(1))).rejects.toThrow("not an action")
      await expect(queuePhoneAction(userId, phoneId, "phone/health", db, later(120))).rejects.toThrow("has not checked in")
      await db.update(promoPhones).set({ held: true }).where(eq(promoPhones.id, phoneId))
      await expect(queuePhoneAction(userId, phoneId, "phone/health", db, later(1))).rejects.toThrow("held")
    })

    it("cancels what was waiting for a phone when it is held", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const { holdPhones } = await import("./phones")
      const id = await queuePhoneAction(userId, phoneId, "phone/health", db, later(1))
      await holdPhones(userId, [phoneId], true, db)
      const [row] = await db.select().from(promoPhoneActions).where(eq(promoPhoneActions.id, id))
      expect(row).toMatchObject({ status: "cancelled", error: "The phone was held." })
      expect(await nextAction(rack, db, later(2))).toBeNull()
    })

    it("refuses a check for a phone that is unplugged while the rack still checks in", async () => {
      const { rack, phoneId } = await rackWithPhone()
      await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [], rolledBack: null }, db, later(15))
      await expect(queuePhoneAction(userId, phoneId, "phone/health", db, later(16))).rejects.toThrow("phone is offline")
    })

    it("keeps the first steps and the last when an answer has too many, and deletes them with the phone", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const id = await queuePhoneAction(userId, phoneId, "phone/android-version", db, later(1))
      await nextAction(rack, db, later(1))
      const steps = Array.from({ length: 40 }, (_, index) => ({ step: `Step ${index + 1}`, jpeg: "/9j/AAAA" }))
      expect(await finishAction(rack, { id, ok: false, result: null, error: "Stopped.", steps }, db, later(2))).toBe(true)
      const [view] = await phoneActions(userId, phoneId, db)
      expect(view.steps).toHaveLength(30)
      expect(view.steps.at(-1)).toBe("Step 40")
      expect(r2.size).toBe(30)
      const { deletePhones } = await import("./phones")
      await deletePhones(userId, [phoneId], db)
      expect(r2.size).toBe(0)
    })

    it("deletes a finished action's pictures after the days set, and keeps a failed one's until cleared", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const done = await queuePhoneAction(userId, phoneId, "phone/health", db, later(1))
      await nextAction(rack, db, later(1))
      await finishAction(rack, { id: done, ok: true, result: {}, error: "", steps: [{ step: "Read", jpeg: "/9j/AAAA" }] }, db, later(2))
      const failed = await queuePhoneAction(userId, phoneId, "phone/android-version", db, later(3))
      await nextAction(rack, db, later(3))
      await finishAction(rack, {
        id: failed, ok: false, result: null, error: "No version on screen.", steps: [{ step: "Opened About phone", jpeg: "/9j/BBBB" }],
      }, db, later(4))

      const { tidyStepPictures, clearStepPictures } = await import("./trail")
      const { promoPhoneScreenshots } = await import("./schema")
      // Seven days is the setting; the day after, the finished one's picture is gone.
      expect(await tidyStepPictures(db, later(6 * 86_400))).toBe(0)
      expect(await tidyStepPictures(db, later(8 * 86_400))).toBe(1)
      const left = await db.select().from(promoPhoneScreenshots)
      expect(left.map((row) => row.actionId)).toEqual([failed])
      expect(r2.size).toBe(1)

      await clearStepPictures(userId, failed, db)
      expect(await db.select().from(promoPhoneScreenshots)).toEqual([])
      expect(r2.size).toBe(0)
    })

    it("fails an action the rack never answered after five minutes", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const id = await queuePhoneAction(userId, phoneId, "phone/health", db, later(1))
      await nextAction(rack, db, later(2))
      await nextAction(rack, db, later(2 + 301))
      const [row] = await db.select().from(promoPhoneActions).where(eq(promoPhoneActions.id, id))
      expect(row).toMatchObject({ status: "failed", error: "The rack did not answer in time." })
    })

    it("after Disconnect, cancels what was waiting, shows the phones offline and lets no action through", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const id = await queuePhoneAction(userId, phoneId, "phone/health", db, later(1))
      await disconnectRack(userId, rack.id, db, later(2))

      const [row] = await db.select().from(promoPhoneActions).where(eq(promoPhoneActions.id, id))
      expect(row.status).toBe("cancelled")
      expect((await listPhones(userId, db, later(3)))[0]).toMatchObject({ status: "offline", offlineReason: "Its rack is not connected" })
      await expect(queuePhoneAction(userId, phoneId, "phone/health", db, later(3))).rejects.toThrow("not on a connected rack")
      expect(await finishAction(rack, { id, ok: true, result: {}, error: "" }, db, later(4))).toBe(false)
    })

    it("refuses an answer from another rack", async () => {
      const { rack, phoneId } = await rackWithPhone()
      const other = await paired()
      const id = await queuePhoneAction(userId, phoneId, "phone/health", db, later(1))
      await nextAction(rack, db, later(2))
      expect(await finishAction(other, { id, ok: true, result: {}, error: "" }, db, later(3))).toBe(false)
    })
  })

  it("keeps the rollback note the rack reports, in words", async () => {
    const rack = await paired()
    await checkIn(rack, {
      version: "2026.10.13.1",
      platform: "",
      phones: [],
      rolledBack: { from: "0.0.0-broken", to: "2026.10.13.1", at: "2099-01-01T11:59:00Z", why: "stopped with code 1 before it checked in" },
    }, db, T0)
    const { listRacks } = await import("./rack")
    const [view] = await listRacks(userId, db, later(1))
    expect(view.updateNote).toBe(
      "Went back to 2026.10.13.1 on 2099-01-01 11:59 UTC, because 0.0.0-broken stopped with code 1 before it checked in."
    )
  })
})

describe("the address a rack calls", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is this app's own dev port when no address is set, never Custom Shell's", async () => {
    vi.stubEnv("CUSTOM_SHELL_APP_URL", "")
    vi.stubEnv("NODE_ENV", "development")
    const { rackServerAddress } = await import("./release")
    expect(rackServerAddress()).toBe(`http://localhost:${__DEV_APP_PORT__}`)
  })

  it("is the app's own setting when one is set", async () => {
    vi.stubEnv("CUSTOM_SHELL_APP_URL", "https://promo.example.com")
    const { rackServerAddress } = await import("./release")
    expect(rackServerAddress()).toBe("https://promo.example.com")
  })
})
