import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { customShellNotifications } from "@/server/schema"
import { addAccount } from "@/server/social/accounts"
import { promoAccounts, promoNotices } from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async () => {}),
  getFromR2: vi.fn(async () => ({ Body: undefined })),
  deleteFromR2: vi.fn(async () => {}),
}))

import { phoneReadings, sweepPhoneHealth, tidyPhoneReadings, type ReportedVitals } from "./health"
import { phoneHistory } from "./history"
import { listPhones, phonesFreeForReddit } from "./phones"
import { checkIn, createPairingCode, finishAction, nextAction, pairRack, type ReportedPhone, type VerifiedRack } from "./rack"
import { RACK_VERSION } from "./release"
import { promoAppRollouts, promoPhoneActions, promoPhoneActionChecks, promoPhones, promoPhoneSettings } from "./schema"
import { refuseBrokenAction } from "./action-checks"
import {
  queueDailySelfTest,
  setTestPhone,
  updateOtherPhones,
  updateTestPhone,
} from "./self-test"

const T0 = new Date("2099-01-01T12:00:00Z")
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const minutes = (count: number) => later(count * 60)

function vitals(patch: Partial<ReportedVitals> = {}): ReportedVitals {
  return {
    batteryPercent: 80,
    temperatureC: 31,
    storageUsedPercent: 50,
    signal: "in_service",
    upSeconds: 10_000,
    apps: null,
    restartWhy: "",
    ...patch,
  }
}

/**
 * Phone farm file 03, Promo's side: the bell for a sick phone (part 14), the
 * battery and heat chart (19), the history (18), and the self-test and app
 * updates (20, 21). The rack's side is in `rack/test_promo_rack.py`.
 */
describe("phone health", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
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
    return { serial, state: "device", usb: "usb:1-1", model: "Pixel 8a", android: "16", ...patch }
  }

  async function report(at: Date, ...phones: ReportedPhone[]) {
    await checkIn(rack, { version: RACK_VERSION, platform: "", phones, rolledBack: null }, db, at)
  }

  async function notices() {
    return db.select().from(customShellNotifications)
  }

  async function phoneId(serial = "A1") {
    const [row] = await db.select().from(promoPhones).where(eq(promoPhones.serial, serial))
    return row.id
  }

  describe("the bell", () => {
    it("rings once for a phone unplugged five minutes, not once per sweep, and clears when it is back", async () => {
      await report(T0, phone("A1"))
      await db.update(promoPhones).set({ shelfSlot: "4" })
      // The rack keeps checking in, without the phone.
      for (let second = 15; second <= 300; second += 15) await report(later(second))
      await sweepPhoneHealth(db, later(300))
      expect(await notices()).toEqual([])

      await report(later(315))
      await sweepPhoneHealth(db, later(316))
      const [notice] = await notices()
      expect(notice.message).toBe("Phone offline: Pixel 8a in slot 4")
      expect(notice.detail).toBe("Not plugged in. Its jobs fail until it is back. It was on USB port usb:1-1.")

      // Ten more sweeps: still one notice, and it is not pushed back to the top.
      for (let index = 0; index < 10; index += 1) await sweepPhoneHealth(db, later(330 + index * 15))
      const after = await notices()
      expect(after).toHaveLength(1)
      expect(after[0].createdAt).toEqual(notice.createdAt)

      await report(later(500), phone("A1"))
      await sweepPhoneHealth(db, later(501))
      expect(await notices()).toEqual([])
      expect(await db.select().from(promoNotices)).toEqual([])
      const kinds = (await phoneHistory(userId, await phoneId(), db)).map((line) => line.kind)
      expect(kinds).toEqual(["notice_cleared", "plugged_in", "notice_raised", "unplugged", "plugged_in"])
    })

    it("never rings for the phones of a rack someone disconnected", async () => {
      await report(T0, phone("A1"))
      const { disconnectRack } = await import("./rack")
      await disconnectRack(userId, rack.id, db, later(1))
      await sweepPhoneHealth(db, minutes(10))
      expect(await notices()).toEqual([])
    })

    it("takes the rack's notice away when it is disconnected, and a deleted phone's notices with it", async () => {
      await report(T0, phone("A1", { vitals: vitals({ temperatureC: 47 }) }))
      await sweepPhoneHealth(db, minutes(6))
      expect((await notices()).map((notice) => notice.message).sort()).toEqual([
        "Rack not checking in: Mac",
      ])
      await report(minutes(7), phone("A1", { vitals: vitals({ temperatureC: 47, upSeconds: 10_420 }) }))
      await sweepPhoneHealth(db, minutes(7))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Phone running hot: Pixel 8a is at 47.0°C"])

      await sweepPhoneHealth(db, minutes(13))
      expect((await notices()).map((notice) => notice.message).sort()).toEqual([
        "Phone running hot: Pixel 8a is at 47.0°C",
        "Rack not checking in: Mac",
      ])
      const { disconnectRack } = await import("./rack")
      await disconnectRack(userId, rack.id, db, minutes(14))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Phone running hot: Pixel 8a is at 47.0°C"])
      const { deletePhones } = await import("./phones")
      await deletePhones(userId, [await phoneId()], db)
      expect(await notices()).toEqual([])
    })

    it("never rings for an old reading of a phone that is gone", async () => {
      await report(T0, phone("A1", { vitals: vitals({ signal: "out_of_service", storageUsedPercent: 95 }) }))
      // Unplugged a minute later, before the ten minutes without signal were up.
      for (let second = 60; second <= 15 * 60; second += 60) await report(later(second))
      await sweepPhoneHealth(db, minutes(15))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Phone offline: Pixel 8a"])
    })

    it("never rings for a held phone", async () => {
      await report(T0, phone("A1"))
      await db.update(promoPhones).set({ held: true })
      await report(later(15))
      await report(minutes(10))
      await sweepPhoneHealth(db, minutes(10))
      expect(await notices()).toEqual([])
    })

    it("rings for a battery over 45°C, keeps it at 44, and clears at 43", async () => {
      await report(T0, phone("A1", { vitals: vitals({ temperatureC: 46.2 }) }))
      await sweepPhoneHealth(db, later(1))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Phone running hot: Pixel 8a is at 46.2°C"])

      await report(minutes(1), phone("A1", { vitals: vitals({ temperatureC: 44, upSeconds: 10_060 }) }))
      await sweepPhoneHealth(db, minutes(1))
      expect(await notices()).toHaveLength(1)

      await report(minutes(2), phone("A1", { vitals: vitals({ temperatureC: 43, upSeconds: 10_120 }) }))
      await sweepPhoneHealth(db, minutes(2))
      expect(await notices()).toEqual([])
      const history = await phoneHistory(userId, await phoneId(), db)
      expect(history.map((line) => [line.kind, line.detail])).toEqual([
        ["notice_cleared", "Running hot: cooled to 43.0°C."],
        ["ran_hot", "The battery reached 46.2°C."],
        ["plugged_in", "On USB port usb:1-1."],
      ])
    })

    it("rings for a SIM with no signal for ten minutes, never for a phone on Wi-Fi", async () => {
      await report(T0, phone("A1", { vitals: vitals({ signal: "out_of_service" }) }), phone("B2", { usb: "usb:1-2", vitals: vitals({ signal: "out_of_service" }) }))
      await db.update(promoPhones).set({ connection: "wifi" }).where(eq(promoPhones.serial, "B2"))
      // The rack keeps reading no signal every minute; the first loss is what counts.
      for (let minute = 1; minute <= 10; minute += 1) {
        await report(minutes(minute), phone("A1", { vitals: vitals({ signal: "out_of_service", upSeconds: 10_000 + minute * 60 }) }), phone("B2", { usb: "usb:1-2" }))
      }
      await sweepPhoneHealth(db, minutes(9))
      expect(await notices()).toEqual([])
      await sweepPhoneHealth(db, later(10 * 60 + 1))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Phone has no signal: Pixel 8a"])

      await report(minutes(11), phone("A1", { vitals: vitals({ signal: "in_service", upSeconds: 10_700 }) }), phone("B2", { usb: "usb:1-2" }))
      await sweepPhoneHealth(db, minutes(11))
      expect(await notices()).toEqual([])
    })

    it("rings for storage more than 90 out of 100 full", async () => {
      await report(T0, phone("A1", { vitals: vitals({ storageUsedPercent: 91 }) }))
      await sweepPhoneHealth(db, later(1))
      const [notice] = await notices()
      expect(notice.message).toBe("Phone storage nearly full: Pixel 8a")
      expect(notice.detail).toContain("91 out of 100 full")
      await report(minutes(1), phone("A1", { vitals: vitals({ storageUsedPercent: 90, upSeconds: 10_060 }) }))
      await sweepPhoneHealth(db, minutes(1))
      expect(await notices()).toEqual([])
    })

    it("rings once for a rack not checking in, not for each of its phones, and clears when it is back", async () => {
      await report(T0, phone("A1"), phone("B2", { usb: "usb:1-2" }))
      await sweepPhoneHealth(db, minutes(4))
      expect(await notices()).toEqual([])
      await sweepPhoneHealth(db, minutes(6))
      expect((await notices()).map((notice) => notice.message)).toEqual(["Rack not checking in: Mac"])
      await sweepPhoneHealth(db, minutes(7))
      expect(await notices()).toHaveLength(1)

      await report(minutes(8), phone("A1"), phone("B2", { usb: "usb:1-2" }))
      await sweepPhoneHealth(db, minutes(8))
      expect(await notices()).toEqual([])
    })
  })

  describe("readings", () => {
    it("keeps a point every ten minutes, and every hot reading between, for four weeks", async () => {
      for (let minute = 0; minute <= 25; minute += 1) {
        const temperatureC = minute === 13 ? 47.5 : 30
        await report(minutes(minute), phone("A1", { vitals: vitals({ temperatureC, upSeconds: 10_000 + minute * 60 }) }))
      }
      const id = await phoneId()
      const points = await phoneReadings(userId, id, db, minutes(26))
      expect(points.map((point) => [(point.at.getTime() - T0.getTime()) / 60_000, point.temperatureC])).toEqual([
        [0, 30],
        [10, 30],
        [13, 47.5],
        [20, 30],
      ])
      expect(await tidyPhoneReadings(db, later(29 * 86_400))).toBe(4)
    })

    it("writes a restart with the rack's reason, and an app update, in the history", async () => {
      await report(T0, phone("A1", { vitals: vitals({ upSeconds: 90_000, apps: { reddit: "2025.39.0" } }) }))
      await report(minutes(1), phone("A1", { vitals: vitals({ upSeconds: 90_060 }) }))
      await report(minutes(5), phone("A1", { vitals: vitals({ upSeconds: 70, restartWhy: "It stopped answering for three minutes, so the rack restarted it." }) }))
      await report(minutes(15), phone("A1", { vitals: vitals({ upSeconds: 670, apps: { reddit: "2025.40.0", tiktok: "37.1.4" } }) }))
      const history = await phoneHistory(userId, await phoneId(), db)
      expect(history.map((line) => [line.kind, line.detail])).toEqual([
        ["app_updated", "Reddit went from 2025.39.0 to 2025.40.0."],
        ["restarted", "It stopped answering for three minutes, so the rack restarted it."],
        ["plugged_in", "On USB port usb:1-1."],
      ])
      const [listed] = await listPhones(userId, db, minutes(15))
      expect(listed.apps).toEqual({ reddit: "2025.40.0", tiktok: "37.1.4" })
    })

    it("shows a phone the rack is restarting as restarting, not unplugged", async () => {
      await report(T0, phone("A1"))
      await report(later(15), phone("A1", { state: "restarting", usb: "" }))
      const [listed] = await listPhones(userId, db, later(16))
      expect(listed).toMatchObject({ status: "offline", offlineReason: "Restarting", usbPort: "usb:1-1" })
      expect((await phoneHistory(userId, listed.id, db)).map((line) => line.kind)).toEqual(["plugged_in"])
    })
  })

  describe("the self-test and app updates", () => {
    async function testPhone() {
      await report(T0, phone("T1", { vitals: vitals({ apps: { reddit: "2025.39.0" } }) }), phone("A1", { usb: "usb:1-2", vitals: vitals({ apps: { reddit: "2025.39.0" } }) }), phone("B2", { usb: "usb:1-3", vitals: vitals({ apps: { reddit: "2025.39.0" } }) }))
      const id = await phoneId("T1")
      await setTestPhone(userId, id, db)
      return id
    }

    /** Hands the next action to the rack and answers it. */
    async function answer(at: Date, reply: { ok: boolean; result?: Record<string, unknown>; error?: string }) {
      const action = await nextAction(rack, db, at)
      if (!action) throw new Error("Nothing was waiting for the rack.")
      await finishAction(rack, { id: action.id, ok: reply.ok, result: reply.result ?? {}, error: reply.error ?? "" }, db, at)
      return action
    }

    it("refuses a phone with an account as the test phone, and keeps the test phone out of Runs on", async () => {
      await report(T0, phone("A1"), phone("T1", { usb: "usb:1-2" }))
      await addAccount(userId, { profileId: null, phoneId: await phoneId("A1"), voiceId: null }, db)
      await expect(setTestPhone(userId, await phoneId("A1"), db)).rejects.toThrow("must be a spare one")
      const test = await phoneId("T1")
      await setTestPhone(userId, test, db)
      expect((await phonesFreeForReddit(userId, null, db)).map((one) => one.id)).not.toContain(test)
      await expect(addAccount(userId, { profileId: null, phoneId: test, voiceId: null }, db)).rejects.toThrow("is the self-test phone")
    })

    it("asks once a day, and not while the rack is paused", async () => {
      await testPhone()
      await db.update(promoPhoneSettings).set({ pausedAt: T0 })
      expect(await queueDailySelfTest(db, later(1))).toBe(false)
      await db.update(promoPhoneSettings).set({ pausedAt: null })
      expect(await queueDailySelfTest(db, later(2))).toBe(true)
      expect(await queueDailySelfTest(db, later(3))).toBe(false)
      const actions = await db.select().from(promoPhoneActions)
      expect(actions.map((row) => row.action).sort()).toEqual(["phone/check-updates", "phone/self-test"])
    })

    it("marks a broken action, rings the bell, refuses it, and lets it go once it passes", async () => {
      const id = await testPhone()
      await queueDailySelfTest(db, later(1))
      await answer(later(2), {
        ok: true,
        result: { actions: [{ action: "reddit/comment", passed: false, step: "Open the reply box", error: 'Could not find "Reply" on the screen.' }] },
      })
      const [notice] = await notices()
      expect(notice.message).toBe("Self-test failed: reddit/comment")
      expect(notice.detail).toContain('It stopped at "Open the reply box": Could not find "Reply" on the screen.')
      await expect(refuseBrokenAction(userId, "reddit/comment", db)).rejects.toThrow('broken on 2099-01-01, at "Open the reply box"')
      await expect(refuseBrokenAction(userId, "reddit/search", db)).resolves.toBeUndefined()

      await db.delete(promoPhoneActions).where(eq(promoPhoneActions.phoneId, id))
      await db.update(promoPhoneSettings).set({ selfTestAt: null })
      await queueDailySelfTest(db, later(10))
      await answer(later(11), { ok: true, result: { actions: [{ action: "reddit/comment", passed: true }] } })
      await expect(refuseBrokenAction(userId, "reddit/comment", db)).resolves.toBeUndefined()
      expect(await notices()).toEqual([])
      const [check] = await db.select().from(promoPhoneActionChecks)
      expect(check).toMatchObject({ passed: true, step: "" })
    })

    it("puts an update on the test phone first, and the rest of the rack only after it passes the self-test", async () => {
      await testPhone()
      await queueDailySelfTest(db, later(1))
      await answer(later(2), { ok: true, result: { actions: [{ action: "phone/android-version", passed: true }] } })
      await answer(later(3), { ok: true, result: { apps: { reddit: { version: "2025.39.0", update: true } } } })
      expect((await notices()).map((notice) => notice.message)).toContain("App update out: Reddit")

      await expect(updateOtherPhones(userId, "reddit", db, later(4))).rejects.toThrow("has to pass the self-test")
      await updateTestPhone(userId, "reddit", db, later(5))
      const update = await answer(later(6), { ok: true, result: { app: "reddit", from: "2025.39.0", to: "2025.40.0" } })
      expect(update).toMatchObject({ action: "phone/update-app", args: { app: "reddit" }, serial: "T1" })
      const [testing] = await db.select().from(promoAppRollouts)
      expect(testing).toMatchObject({ status: "testing", fromVersion: "2025.39.0", toVersion: "2025.40.0" })
      // Still testing, so still refused.
      await expect(updateOtherPhones(userId, "reddit", db, later(7))).rejects.toThrow("has to pass the self-test")

      const selfTest = await answer(later(8), { ok: true, result: { actions: [{ action: "phone/android-version", passed: true }] } })
      expect(selfTest.action).toBe("phone/self-test")
      const [passed] = await db.select().from(promoAppRollouts)
      expect(passed.status).toBe("passed")

      const { queued } = await updateOtherPhones(userId, "reddit", db, later(9))
      expect(queued).toHaveLength(2)
      const waiting = await db.select().from(promoPhoneActions).where(eq(promoPhoneActions.status, "queued"))
      expect(waiting.map((row) => [row.action, row.args])).toEqual([
        ["phone/update-app", { app: "reddit" }],
        ["phone/update-app", { app: "reddit" }],
      ])
    })

    it("stops the round when the new version fails the self-test", async () => {
      await testPhone()
      await queueDailySelfTest(db, later(1))
      await answer(later(2), { ok: true, result: { actions: [] } })
      await answer(later(3), { ok: true, result: { apps: { reddit: { version: "2025.39.0", update: true } } } })
      await updateTestPhone(userId, "reddit", db, later(4))
      await answer(later(5), { ok: true, result: { app: "reddit", from: "2025.39.0", to: "2025.40.0" } })
      await answer(later(6), {
        ok: true,
        result: { actions: [{ action: "phone/android-version", passed: false, step: "Find the Android version", error: "Not on screen." }] },
      })
      const [round] = await db.select().from(promoAppRollouts)
      expect(round).toMatchObject({ status: "failed", note: "The self-test on the new version failed: Read the Android version from Settings." })
      await expect(updateOtherPhones(userId, "reddit", db, later(7))).rejects.toThrow("has to pass the self-test")
    })
  })

  it("writes an account moving onto a phone and off it in the phone's history", async () => {
    await report(T0, phone("A1"), phone("B2", { usb: "usb:1-2" }))
    const accountId = await addAccount(userId, { profileId: null, phoneId: await phoneId("A1"), voiceId: null }, db)
    await db.update(promoAccounts).set({ handle: "promo_tester" }).where(eq(promoAccounts.id, accountId))
    const { setAccountRunsOn } = await import("@/server/social/accounts")
    await setAccountRunsOn(userId, accountId, { profileId: null, phoneId: await phoneId("B2") }, db)
    expect((await phoneHistory(userId, await phoneId("A1"), db)).map((line) => line.detail)).toContain("u/promo_tester moved off it.")
    expect((await phoneHistory(userId, await phoneId("B2"), db)).map((line) => line.detail)).toContain("u/promo_tester moved onto it.")
  })
})
