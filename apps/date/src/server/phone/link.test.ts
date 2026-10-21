import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

// R2, in memory: kept pictures are written and read through it.
const r2 = vi.hoisted(() => new Map<string, Uint8Array>())
vi.mock("@/server/media/storage", () => ({
  R2StorageNotConfiguredError: class extends Error {},
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

import { callPhone, PhoneActionError, queueAction } from "./actions"
import {
  checkIn,
  createPairingCode,
  finishAction,
  nextAction,
  pairPhone,
  phoneActions,
  setInControl,
  unpairPhone,
  verifyPhoneRequest,
  type VerifiedPhone,
} from "./link"
import { looksSame, readPicture } from "./pictures"
import { datePhoneActions, datePhones } from "./schema"
import { closeScreen, watchScreen } from "./screens"
import { requestSignature } from "./signing"

const T0 = new Date("2099-01-01T12:00:00Z")
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const stamp = (at: Date) => Math.floor(at.getTime() / 1000)
const noWait = { now: () => T0, sleep: async () => {} }

/** A small real JPEG of one colour, so pictures can be kept and compared. */
async function jpeg(colour: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 60, channels: 3, background: colour } }).jpeg().toBuffer()
}

/**
 * Part 1 of the Tinder task, the server's side of the phone link: pairing,
 * the signed messages, check-ins and the action queue. The phone's side is
 * the Android app in `apps/date/android/`.
 */
describe("the phone link", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string

  beforeEach(async () => {
    r2.clear()
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function paired(): Promise<VerifiedPhone> {
    const { code } = await createPairingCode(userId, workspaceId, null, db, T0)
    const { phoneId, key } = await pairPhone({ code, model: "Pixel 8a", android: "15", appVersion: "1.0.0" }, db, T0)
    return { id: phoneId, userId, workspaceId, key }
  }

  function signed(phone: VerifiedPhone, path: string, body: string, at: Date = T0, nonce = "ab".repeat(16)) {
    const headers = new Headers({
      "x-phone-id": phone.id,
      "x-phone-time": String(stamp(at)),
      "x-phone-nonce": nonce,
      "x-phone-signature": requestSignature(phone.key, "POST", path, stamp(at), nonce, body),
    })
    return { method: "POST", path, headers, body }
  }

  describe("pairing", () => {
    it("makes a six-digit code that pairs a new phone once, named after its model", async () => {
      const { code, expiresAt } = await createPairingCode(userId, workspaceId, null, db, T0)
      expect(code).toMatch(/^\d{6}$/)
      expect(expiresAt).toEqual(later(600))

      const { phoneId, key } = await pairPhone({ code, model: "Pixel 8a", android: "15", appVersion: "1.0.0" }, db, T0)
      expect(key.length).toBeGreaterThan(30)
      const [phone] = await db.select().from(datePhones).where(eq(datePhones.id, phoneId))
      expect(phone).toMatchObject({ userId, workspaceId, name: "Pixel 8a", androidVersion: "15", appVersion: "1.0.0" })
      // The key is kept encrypted, never as it was handed out.
      expect(phone.keyEncrypted).not.toContain(key)

      await expect(pairPhone({ code, model: "Pixel 8a", android: "15", appVersion: "1.0.0" }, db, T0)).rejects.toThrow(
        /already used/
      )
    })

    it("refuses a code after ten minutes, and a code that was never made", async () => {
      const { code } = await createPairingCode(userId, workspaceId, null, db, T0)
      await expect(pairPhone({ code, model: "", android: "", appVersion: "" }, db, later(601))).rejects.toThrow(/10 minutes/)
      await expect(
        pairPhone({ code: code === "000000" ? "000001" : "000000", model: "", android: "", appVersion: "" }, db, T0)
      ).rejects.toThrow(/not right/)
    })

    it("pairs the same phone again after it was unpaired, keeping its record", async () => {
      const phone = await paired()
      await unpairPhone(userId, phone.id, db, later(10))
      const { code } = await createPairingCode(userId, workspaceId, phone.id, db, later(20))
      const again = await pairPhone({ code, model: "Pixel 8a", android: "16", appVersion: "1.0.1" }, db, later(20))
      expect(again.phoneId).toBe(phone.id)
      expect(again.key).not.toBe(phone.key)
      const rows = await db.select().from(datePhones)
      expect(rows).toHaveLength(1)
      expect(rows[0].androidVersion).toBe("16")
    })

    it("refuses to pair a phone that belongs to somebody else", async () => {
      const phone = await paired()
      const stranger = (await insertUser(db)).id
      await expect(createPairingCode(stranger, workspaceId, phone.id, db, T0)).rejects.toThrow(/does not exist/)
    })
  })

  describe("signed messages", () => {
    it("accepts a correctly signed message once", async () => {
      const phone = await paired()
      const request = signed(phone, "/api/phone/check-in", "{}")
      await expect(verifyPhoneRequest(request, db, T0)).resolves.toMatchObject({ id: phone.id, userId, workspaceId })
      // The same message again is a copy, and is refused.
      await expect(verifyPhoneRequest(request, db, T0)).rejects.toThrow(/already received/)
    })

    it("refuses a wrong signature, a changed body, another address and a clock five minutes out", async () => {
      const phone = await paired()
      const good = signed(phone, "/api/phone/check-in", '{"a":1}')
      await expect(verifyPhoneRequest({ ...good, body: '{"a":2}' }, db, T0)).rejects.toThrow(/signature/)
      await expect(verifyPhoneRequest({ ...good, path: "/api/phone/next" }, db, T0)).rejects.toThrow(/signature/)
      await expect(verifyPhoneRequest(signed({ ...phone, key: "not the key" }, "/x", "{}"), db, T0)).rejects.toThrow(
        /signature/
      )
      await expect(verifyPhoneRequest(good, db, later(301))).rejects.toThrow(/five minutes/)
      await expect(
        verifyPhoneRequest({ ...good, headers: new Headers({ "x-phone-id": phone.id }) }, db, T0)
      ).rejects.toThrow(/not signed/)
    })

    it("refuses every message from an unpaired phone", async () => {
      const phone = await paired()
      await unpairPhone(userId, phone.id, db, T0)
      await expect(verifyPhoneRequest(signed(phone, "/api/phone/check-in", "{}"), db, T0)).rejects.toThrow(/unpaired/)
    })
  })

  describe("check-ins", () => {
    it("writes what the phone said and when, and says whether a window watches its screen", async () => {
      const phone = await paired()
      const answer = await checkIn(
        phone,
        {
          appVersion: "1.0.0",
          model: "Pixel 8a",
          android: "15",
          timezone: "America/Toronto",
          batteryPercent: 64,
          tinderVersion: "15.20.0",
          tinderInFront: true,
          phoneSwitchOn: true,
        },
        db,
        later(5)
      )
      expect(answer).toEqual({ checkInSeconds: 15, watched: false })
      const [row] = await db.select().from(datePhones).where(eq(datePhones.id, phone.id))
      expect(row).toMatchObject({ batteryPercent: 64, timeZone: "America/Toronto", tinderVersion: "15.20.0", tinderInFront: true })
      expect(row.lastSeenAt).toEqual(later(5))

      watchScreen(phone.id, later(6).getTime())
      const watched = await checkIn(
        phone,
        { appVersion: "", model: "", android: "", timezone: "", batteryPercent: null, tinderVersion: "", tinderInFront: false, phoneSwitchOn: false },
        db,
        later(7)
      )
      expect(watched.watched).toBe(true)
      closeScreen(phone.id)
      const [after] = await db.select().from(datePhones).where(eq(datePhones.id, phone.id))
      // A blank model or time zone keeps the one already known.
      expect(after).toMatchObject({ model: "Pixel 8a", timeZone: "America/Toronto", phoneSwitchOn: false })
    })
  })

  describe("the action queue", () => {
    it("hands actions out oldest first, one at a time", async () => {
      const phone = await paired()
      const first = await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      const second = await queueAction(userId, phone.id, "home", {}, db, later(1))

      const handed = await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)
      expect(handed.action).toMatchObject({ id: first, kind: "screenshot", timeLimitSeconds: 30 })
      // The first is still running, so the second waits.
      expect((await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)).action).toBeNull()

      await finishAction(phone, { id: first, ok: true, answer: {}, error: "", screenshot: null }, db, T0)
      expect((await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)).action?.id).toBe(second)
    })

    it("hands nothing out while Date is switched off, and switching off cancels what waits", async () => {
      const phone = await paired()
      const id = await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      await setInControl(userId, phone.id, false, db, T0)
      expect((await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)).action).toBeNull()
      const [row] = await db.select().from(datePhoneActions).where(eq(datePhoneActions.id, id))
      expect(row).toMatchObject({ status: "cancelled", error: "Date was switched off in the dashboard's Phone panel." })
      await expect(queueAction(userId, phone.id, "screenshot", {}, db, T0)).rejects.toThrow(/switched off/)
    })

    it("fails an action the phone took and never answered, a minute after its own limit", async () => {
      const phone = await paired()
      const id = await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)
      await nextAction(phone, { waitSeconds: 0, watching: false }, db, { ...noWait, now: () => later(91) })
      const [row] = await db.select().from(datePhoneActions).where(eq(datePhoneActions.id, id))
      expect(row).toMatchObject({ status: "failed", error: "The phone did not answer in time." })
    })

    it("comes back early when a window starts watching, so the phone starts sending pictures", async () => {
      const phone = await paired()
      watchScreen(phone.id, T0.getTime())
      const answer = await nextAction(phone, { waitSeconds: 20, watching: false }, db, noWait)
      expect(answer).toEqual({ action: null, watched: true })
      closeScreen(phone.id)
    })

    it("refuses a tap from the screen window while the phone is busy with another step", async () => {
      const phone = await paired()
      await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      await expect(queueAction(userId, phone.id, "tap", { x: 10, y: 10 }, db, T0)).rejects.toThrow(/busy/)
    })
  })

  describe("answers", () => {
    it("keeps the picture of an action asked for on its own, encrypted, and lists it on the action", async () => {
      const phone = await paired()
      const id = await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)
      const picture = await jpeg({ r: 200, g: 40, b: 40 })
      const accepted = await finishAction(
        phone,
        { id, ok: true, answer: { width: 1080 }, error: "", screenshot: picture.toString("base64") },
        db,
        T0
      )
      expect(accepted).toBe(true)
      const [view] = await phoneActions(userId, phone.id, db)
      expect(view).toMatchObject({ id, status: "done" })
      expect(view.pictureIds).toHaveLength(1)
      // What sits in R2 is not the picture itself.
      const stored = Array.from(r2.values())[0]
      expect(Buffer.from(stored).includes(picture)).toBe(false)
      const opened = await readPicture(userId, view.pictureIds[0], db)
      expect(opened?.kind).toBe("file")
      if (opened?.kind === "file") expect(await looksSame(opened.jpeg, picture)).toBe(true)
      // Nobody else can open it.
      expect(await readPicture((await insertUser(db)).id, view.pictureIds[0], db)).toBeNull()
    })

    it("turns away an answer to an action that is not running, or not this phone's", async () => {
      const phone = await paired()
      const other = await paired()
      const id = await queueAction(userId, phone.id, "screenshot", {}, db, T0)
      expect(await finishAction(phone, { id, ok: true, answer: {}, error: "", screenshot: null }, db, T0)).toBe(false)
      await nextAction(phone, { waitSeconds: 0, watching: false }, db, noWait)
      expect(await finishAction(other, { id, ok: true, answer: {}, error: "", screenshot: null }, db, T0)).toBe(false)
      expect(await finishAction(phone, { id, ok: false, answer: null, error: "", screenshot: null }, db, T0)).toBe(true)
      const [row] = await db.select().from(datePhoneActions).where(eq(datePhoneActions.id, id))
      expect(row).toMatchObject({ status: "failed", error: "The phone gave no reason." })
    })

    it("lets a walk wait for the phone's answer and hands it the screenshot", async () => {
      const phone = await paired()
      const picture = (await jpeg({ r: 10, g: 120, b: 10 })).toString("base64")
      // The phone, answering whatever it is handed.
      const answering = (async () => {
        for (let tries = 0; tries < 50; tries += 1) {
          const { action } = await nextAction(phone, { waitSeconds: 0, watching: false }, db, {
            now: () => new Date(),
            sleep: async () => {},
          })
          if (action) {
            await finishAction(phone, { id: action.id, ok: true, answer: { read: true }, error: "", screenshot: picture }, db)
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
      })()
      // The phone's clock in these messages is now, not T0.
      const result = await callPhone(
        { id: phone.id, userId, name: "Pixel 8a" },
        "walk-1",
        "read-screen",
        {},
        30,
        db,
        { pollMs: 10 }
      )
      await answering
      expect(result).toEqual({ answer: { read: true }, screenshot: picture })
    })

    it("calls a step off when the phone never picks it up, saying nothing was done", async () => {
      const phone = await paired()
      await expect(
        callPhone({ id: phone.id, userId, name: "Pixel 8a" }, "walk-1", "read-screen", {}, 30, db, {
          pollMs: 5,
          pickupWaitMs: 20,
        })
      ).rejects.toMatchObject({ untouched: true, message: expect.stringMatching(/did not pick up/) })
      const [row] = await db.select().from(datePhoneActions)
      expect(row.status).toBe("cancelled")
      expect(PhoneActionError).toBeDefined()
    })
  })
})
