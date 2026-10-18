import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

const r2 = vi.hoisted(() => ({ getFromR2: vi.fn() }))
vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async () => {}),
  getFromR2: r2.getFromR2,
  deleteFromR2: vi.fn(async () => {}),
}))

import { phoneHistory } from "./history"
import { MEDIA_LINK_MINUTES, makeMediaLink, mediaLinkResponse, spendMediaLink } from "./media-links"
import { checkIn, createPairingCode, finishAction, nextAction, pairRack, type ReportedPhone, type VerifiedRack } from "./rack"
import { RACK_VERSION } from "./release"
import { promoMediaLinks, promoPhoneActions, promoPhones } from "./schema"
import { ICLOUD_SIGNED_IN_WORDS, icloudState, queueIcloudCheck, queueWipe } from "./wipe"

const T0 = new Date("2099-01-01T12:00:00Z")
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

/**
 * Phone farm file 08, Promo's side: wiping an iPhone without locking it to
 * an Apple ID (part 54) and the one-time link that gets a photo or video
 * onto an iPhone (part 55). The rack's side is in `rack/test_promo_rack.py`.
 */
describe("iPhones on the rack", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    r2.getFromR2.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const { code } = await createPairingCode(userId, db, T0)
    const paired = await pairRack({ code, name: "Mac", platform: "", version: RACK_VERSION }, db, T0)
    rack = { id: paired.rackId, userId, key: paired.key }
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  function phone(serial: string, patch: Partial<ReportedPhone> = {}): ReportedPhone {
    return { serial, state: "device", usb: "usb:1-1", model: "iPhone 12", android: "17.6", kind: "iphone", ...patch }
  }

  async function report(at: Date, ...phones: ReportedPhone[]) {
    await checkIn(rack, { version: RACK_VERSION, platform: "", phones, rolledBack: null }, db, at)
  }

  async function phoneId(serial: string) {
    const [row] = await db.select().from(promoPhones).where(eq(promoPhones.serial, serial))
    return row.id
  }

  /** Hands the next action to the rack and answers it. */
  async function answer(at: Date, reply: { ok: boolean; result?: Record<string, unknown>; error?: string }) {
    const action = await nextAction(rack, db, at)
    if (!action) throw new Error("Nothing was waiting for the rack.")
    await finishAction(rack, { id: action.id, ok: reply.ok, result: reply.result ?? {}, error: reply.error ?? "" }, db, at)
    return action
  }

  describe("wiping without bricking (part 54)", () => {
    it("refuses an iPhone wipe until the rack read it as signed out of iCloud, then sends the wipe with that word", async () => {
      await report(T0, phone("I1"), phone("A1", { usb: "usb:1-2", kind: "android", model: "Pixel 8a", android: "16" }))
      const I1 = await phoneId("I1")
      // Never read: refused, with what to do.
      await expect(queueWipe(userId, I1, db, later(1))).rejects.toThrow(ICLOUD_SIGNED_IN_WORDS)
      expect(await icloudState(userId, I1, db)).toBeNull()

      // Read as signed in: still refused, and the Setup tab can say who.
      await queueIcloudCheck(userId, I1, db, later(2))
      const read = await answer(later(3), { ok: true, result: { signedOut: false, appleId: "tyler@example.com" } })
      expect(read).toMatchObject({ action: "phone/icloud-state", serial: "I1" })
      expect(await icloudState(userId, I1, db)).toMatchObject({ signedOut: false, appleId: "tyler@example.com" })
      await expect(queueWipe(userId, I1, db, later(4))).rejects.toThrow("Sign out of iCloud")

      // Signed out: the wipe goes, carrying the word the rack insists on.
      await queueIcloudCheck(userId, I1, db, later(5))
      await answer(later(6), { ok: true, result: { signedOut: true, appleId: "" } })
      await queueWipe(userId, I1, db, later(7))
      const wipe = await answer(later(8), { ok: true, result: { wiped: true } })
      expect(wipe).toMatchObject({ action: "phone/wipe", args: { icloudSignedOut: true } })
      const [wiped] = await db.select().from(promoPhones).where(eq(promoPhones.id, I1))
      expect(wiped).toMatchObject({ held: true, wipedAt: later(8) })
      expect((await phoneHistory(userId, I1, db))[0].detail).toBe(
        "The rack erased everything on it. It is held while it is set up again: tap Trust this computer when it asks, sign in to an Apple ID, put the apps on from the App Store, then release it and run its setup check."
      )

      // After the wipe the old read does not count: a fresh setup signs in again.
      await db.update(promoPhones).set({ held: false }).where(eq(promoPhones.id, I1))
      await report(later(9), phone("I1"), phone("A1", { usb: "usb:1-2", kind: "android", model: "Pixel 8a", android: "16" }))
      await expect(queueWipe(userId, I1, db, later(10))).rejects.toThrow("Sign out of iCloud")

      // An Android's wipe has no iCloud to read and carries no such word.
      await expect(queueIcloudCheck(userId, await phoneId("A1"), db)).rejects.toThrow("Only an iPhone")
      await queueWipe(userId, await phoneId("A1"), db, later(11))
      const androidWipe = await answer(later(12), { ok: true, result: { wiped: true } })
      expect(androidWipe).toMatchObject({ action: "phone/wipe", args: {} })
    })
  })

  describe("a photo or video onto an iPhone (part 55)", () => {
    it("serves the file once within ten minutes, then 410, and never for a wrong token", async () => {
      r2.getFromR2.mockResolvedValue({
        Body: { transformToWebStream: () => new Blob(["jpeg bytes"]).stream() },
        ContentType: "image/jpeg",
        ContentLength: 10,
      })
      const link = await makeMediaLink(userId, { storagePath: "media/night.jpg", mimeType: "image/jpeg" }, db, T0)
      const token = link.slice(link.lastIndexOf("/") + 1)
      expect(link).toMatch(/\/api\/media-link\/[0-9a-f]{64}$/)
      const [row] = await db.select().from(promoMediaLinks)
      expect(row.tokenHash).not.toBe(token)
      expect(row.expiresAt).toEqual(later(MEDIA_LINK_MINUTES * 60))

      const first = await mediaLinkResponse(token, db, later(60))
      expect(first.status).toBe(200)
      expect(first.headers.get("Content-Type")).toBe("image/jpeg")
      expect(await first.text()).toBe("jpeg bytes")
      expect(r2.getFromR2).toHaveBeenCalledWith("media/night.jpg")

      // Used: gone, and nothing is read from the bucket again.
      const second = await mediaLinkResponse(token, db, later(61))
      expect(second.status).toBe(410)
      expect(r2.getFromR2).toHaveBeenCalledTimes(1)

      // A wrong token, or a shape that is not a token, is not there.
      expect((await mediaLinkResponse("0".repeat(64), db, later(62))).status).toBe(404)
      expect((await mediaLinkResponse("../media/night.jpg", db, later(62))).status).toBe(404)
    })

    it("refuses a link ten minutes old even if it was never used", async () => {
      const link = await makeMediaLink(userId, { storagePath: "media/clip.mp4", mimeType: "video/mp4" }, db, T0)
      const token = link.slice(link.lastIndexOf("/") + 1)
      expect(await spendMediaLink(token, db, later(MEDIA_LINK_MINUTES * 60 + 1))).toEqual({ status: 410 })
      expect(r2.getFromR2).not.toHaveBeenCalled()
      // Links a day past their time are tidied when the next one is made.
      await makeMediaLink(userId, { storagePath: "media/next.mp4", mimeType: "video/mp4" }, db, later(2 * 86_400))
      expect((await db.select().from(promoMediaLinks)).map((one) => one.storagePath)).toEqual(["media/next.mp4"])
      expect(await db.select().from(promoPhoneActions)).toEqual([])
    })
  })
})
