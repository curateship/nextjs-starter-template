import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { customShellNotifications } from "@/server/schema"
import { addAccount } from "@/server/social/accounts"
import { queueJob } from "@/server/social/jobs"
import { runOneJob } from "@/server/social/runner"
import { createProject } from "@/server/social/projects"
import {
  promoAccounts,
  promoBehaviourSettings,
  promoFinds,
  promoJobs,
  promoKeywords,
  promoSearches,
} from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { clearBanScreen } from "./health"
import { phoneHistory } from "./history"
import { createPhone, listPhones } from "./phones"
import { checkIn, createPairingCode, finishAction, nextAction, pairRack, type VerifiedRack } from "./rack"
import { RACK_VERSION } from "./release"
import { promoPhoneActionChecks, promoPhoneActions, promoPhones } from "./schema"
import { exchangeScreens, sendScreenInput, setControl, watchScreen, closeScreen } from "./screens"
import { readPhoneSettings, savePhoneSettings, setRackPaused, waitingPhoneJobs } from "./settings"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Phone farm file 02, Promo's side: a phone account's job runs on its phone
 * through the same queue, one at a time per phone and side by side across
 * phones, waits while the phone is held or the rack paused, and an offline
 * phone refuses at once. The screen window and the rack's settings too.
 */
describe("jobs on phones", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    // The rack's actions are written through the app's own database handle.
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    // Awake all day, so no job waits for morning unless a test says so.
    await db.insert(promoBehaviourSettings).values({ userId, wakeFromMinute: 0, wakeUntilMinute: 0 })
    const { code } = await createPairingCode(userId, db)
    const paired = await pairRack({ code, name: "Mac", platform: "", version: RACK_VERSION }, db)
    rack = { id: paired.rackId, userId, key: paired.key }
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function plugIn(...serials: string[]) {
    await checkIn(
      rack,
      {
        version: RACK_VERSION,
        platform: "",
        phones: serials.map((serial) => ({ serial, state: "device", usb: "usb:1", model: `Phone ${serial}`, android: "16", timezone: "UTC" })),
        rolledBack: null,
      },
      db
    )
    const phones = await db.select().from(promoPhones)
    return Object.fromEntries(phones.map((phone) => [phone.serial, phone.id]))
  }

  async function accountOn(phoneId: string) {
    return addAccount(userId, { profileId: null, phoneId, voiceId: null }, db)
  }

  type FakeReply = {
    ok: boolean
    error?: string
    result?: Record<string, unknown>
    recovered?: string
    banScreen?: { app: string; kind: string; words: string }
  }

  /** The rack's side: answers every action it is handed, until stopped. */
  function fakeRack(answer: (action: { action: string; serial: string }) => FakeReply) {
    const seen: Array<{ action: string; serial: string; at: number }> = []
    const working: Array<Promise<unknown>> = []
    let stopped = false
    const loop = (async () => {
      while (!stopped) {
        const action = await nextAction(rack, db)
        if (!action) {
          await sleep(20)
          continue
        }
        seen.push({ action: action.action, serial: action.serial, at: Date.now() })
        const reply = answer(action)
        // Each action on a thread of its own, as the real program does, and
        // a whole second on the phone, so overlap between two phones shows
        // even on a busy machine.
        working.push(
          sleep(1_000).then(() =>
            finishAction(
              rack,
              {
                id: action.id,
                ok: reply.ok,
                result: reply.result ?? {},
                error: reply.error ?? "",
                recovered: reply.recovered ?? "",
                banScreen: reply.banScreen ?? null,
              },
              db
            )
          )
        )
      }
    })()
    return { seen, stop: async () => ((stopped = true), await loop, await Promise.all(working)) }
  }

  const unknown = (action: { action: string }) => ({ ok: false, error: `This rack does not know the action ${action.action}.` })

  it("files a phone account's job under its phone, and sends its Reddit step to that phone", async () => {
    const { A1 } = await plugIn("A1")
    const accountId = await accountOn(A1)
    const jobId = await queueJob(userId, "health", { accountId }, db)
    const [queued] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
    expect(queued.lane).toBe(`phone:${A1}`)

    // A browser lane never takes a phone job.
    expect(await runOneJob("browser-lane", db, "browser")).toEqual({ did: "nothing" })

    const fake = fakeRack(unknown)
    const result = await runOneJob("phone-lane", db, "phone")
    await fake.stop()
    expect(fake.seen.map((one) => [one.action, one.serial])).toEqual([
      ["reddit/health", "A1"],
      ["reddit/quick_state", "A1"],
    ])
    expect(result).toMatchObject({ did: "job", ok: false, error: "This rack does not know the action reddit/health." })
  }, 20_000)

  it("runs two jobs for one phone one after the other, and jobs for two phones side by side", async () => {
    const { A1, B2 } = await plugIn("A1", "B2")
    const first = await accountOn(A1)
    const second = await accountOn(B2)
    // A1 can hold only one Reddit account, so its second job is a second health reading.
    await queueJob(userId, "health", { accountId: first }, db)
    await queueJob(userId, "health", { accountId: first }, db)
    await queueJob(userId, "health", { accountId: second }, db)

    const fake = fakeRack(unknown)
    // Two phone lanes, as with "Phones working at once" set to 2.
    await Promise.all([runOneJob("lane-0", db, "phone"), runOneJob("lane-1", db, "phone")])
    await runOneJob("lane-0", db, "phone")
    await fake.stop()

    const health = fake.seen.filter((one) => one.action === "reddit/health")
    expect(health.map((one) => one.serial)).toEqual(["A1", "B2", "A1"])
    // The two phones started while each other's first second was running;
    // A1's second waited for its first to end.
    expect(Math.abs(health[1].at - health[0].at)).toBeLessThan(900)
    expect(health[2].at - health[0].at).toBeGreaterThanOrEqual(1_000)
  }, 30_000)

  it("fails a comment at once on an offline phone, with words, and never tries it again", async () => {
    const { A1 } = await plugIn("A1")
    await db.update(promoPhones).set({ shelfSlot: "4", adbState: "gone" }).where(eq(promoPhones.id, A1))
    const accountId = await accountOn(A1)
    const jobId = await queueJob(userId, "comment", { accountId, findId: "f1", text: "Hi." }, db)

    const result = await runOneJob("phone-lane", db, "phone")
    expect(result).toMatchObject({
      ok: false,
      error: "Phone A1 in slot 4 is offline: Not plugged in. Nothing was sent. Check it on the Phones dashboard.",
    })
    const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
    expect(job.status).toBe("failed")
    expect(await db.select().from(promoPhoneActions)).toHaveLength(0)
  })

  it("leaves a held phone's jobs waiting, and a phone under control from its screen too", async () => {
    const { A1 } = await plugIn("A1")
    const accountId = await accountOn(A1)
    await queueJob(userId, "health", { accountId }, db)

    await db.update(promoPhones).set({ held: true }).where(eq(promoPhones.id, A1))
    expect(await runOneJob("lane", db, "phone")).toEqual({ did: "nothing" })

    await db.update(promoPhones).set({ held: false }).where(eq(promoPhones.id, A1))
    await setControl(userId, A1, true, db)
    expect(await runOneJob("lane", db, "phone")).toEqual({ did: "nothing" })
    expect((await listPhones(userId, db))[0]).toMatchObject({ status: "held", inUse: true })

    // Closing the window lets go, and the job runs.
    await setControl(userId, A1, false, db)
    const fake = fakeRack(unknown)
    expect(await runOneJob("lane", db, "phone")).toMatchObject({ did: "job" })
    await fake.stop()
  }, 20_000)

  it("lets a forgotten window go after fifteen minutes", async () => {
    const { A1 } = await plugIn("A1")
    const now = new Date()
    await setControl(userId, A1, true, db, new Date(now.getTime() - 16 * 60_000))
    const accountId = await accountOn(A1)
    await queueJob(userId, "health", { accountId }, db)
    const fake = fakeRack(unknown)
    expect(await runOneJob("lane", db, "phone")).toMatchObject({ did: "job" })
    await fake.stop()
  }, 20_000)

  it("waits for the phone's own morning before lighting its screen", async () => {
    const { A1 } = await plugIn("A1")
    // Awake for one minute, twelve hours from now.
    const minute = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 720) % 1440
    await db.update(promoBehaviourSettings).set({ wakeFromMinute: minute, wakeUntilMinute: (minute + 1) % 1440 })
    const accountId = await accountOn(A1)
    const jobId = await queueJob(userId, "health", { accountId }, db)
    expect(await runOneJob("lane", db, "phone")).toMatchObject({ did: "put back" })
    const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
    expect(job.status).toBe("queued")
    expect(job.runAfter!.getTime()).toBeGreaterThan(Date.now() + 11 * 3_600_000)
  })

  it("pauses the rack: nothing new starts, the bell says so, and resuming lists what waited", async () => {
    const { A1 } = await plugIn("A1")
    const accountId = await accountOn(A1)
    const jobId = await queueJob(userId, "health", { accountId }, db)

    await setRackPaused(userId, true, db)
    expect(await runOneJob("lane", db, "phone")).toEqual({ did: "nothing" })
    const [notice] = await db.select().from(customShellNotifications)
    expect(notice.message).toBe("The rack is paused")
    expect((await waitingPhoneJobs(userId, db)).map((job) => [job.id, job.kind, job.phoneName])).toEqual([
      [jobId, "health", "Phone A1"],
    ])

    await setRackPaused(userId, false, db)
    expect(await db.select().from(customShellNotifications)).toHaveLength(0)
    expect((await readPhoneSettings(db)).pausedAt).toBeNull()
  })

  it("moves a job filed under an old profile to the phone the account now runs on", async () => {
    const { A1 } = await plugIn("A1")
    const accountId = await accountOn(A1)
    const jobId = await queueJob(userId, "health", { accountId }, db)
    await db.update(promoJobs).set({ lane: null }).where(eq(promoJobs.id, jobId))
    // A job from before lanes has none and runs in the browser pool; it is filed again under the phone.
    expect(await runOneJob("lane", db, "browser")).toMatchObject({ did: "put back" })
    const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
    expect(job.lane).toBe(`phone:${A1}`)
  })

  describe("phone farm file 03", () => {
    const signedIn = { checked: true, handle: "promo_tester", karma: 10, createdSeconds: null, blocked: false, reason: "" }

    async function insertFind() {
      const projectId = await createProject(userId, "Promo", db)
      const [keyword] = await db
        .insert(promoKeywords)
        .values({ id: uuid(), userId, projectId, term: "client work", subreddits: ["productivity"], sort: "new", timeWindow: "week" })
        .returning()
      const [search] = await db.insert(promoSearches).values({ id: uuid(), userId, keywordId: keyword.id, status: "done" }).returning()
      const [find] = await db
        .insert(promoFinds)
        .values({
          id: uuid(),
          userId,
          keywordId: keyword.id,
          firstSearchId: search.id,
          redditId: "t3_1abc234",
          permalink: "/r/productivity/comments/1abc234/a_post/",
          subreddit: "productivity",
          title: "What do you use to keep track of client work?",
          score: 4,
          commentCount: 1,
          rank: 1,
        })
        .returning()
      return find.id
    }

    it("stops an account at a ban screen within one action: blocked with the screen's words, its waiting jobs dropped, the bell rung", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await accountOn(A1)
      await db.update(promoAccounts).set({ handle: "promo_tester" }).where(eq(promoAccounts.id, accountId))
      for (let index = 0; index < 3; index += 1) await queueJob(userId, "health", { accountId }, db)
      const words = "Your account has been suspended This account has been suspended for violating Reddit's Content Policy."
      const fake = fakeRack((action) =>
        action.action === "reddit/health"
          ? { ok: false, error: "Could not read the profile.", banScreen: { app: "reddit", kind: "suspended", words } }
          : { ok: true, result: signedIn }
      )
      await runOneJob("phone-lane", db, "phone")
      await fake.stop()

      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account).toMatchObject({ blocked: true, blockedReason: words })
      expect(account.banScreenAt).not.toBeNull()
      // The two waiting readings were dropped; the one that ran failed and is not tried again.
      expect((await db.select().from(promoJobs)).map((job) => job.status)).toEqual(["failed"])
      const messages = (await db.select().from(customShellNotifications)).map((notice) => notice.message)
      expect(messages).toContain("Ban screen: u/promo_tester on Phone A1")

      // A new job is refused before anything reaches the phone.
      await queueJob(userId, "health", { accountId }, db)
      const before = (await db.select().from(promoPhoneActions)).length
      const refused = await runOneJob("phone-lane", db, "phone")
      expect(refused).toMatchObject({ ok: false })
      expect(String((refused as { error?: string }).error)).toContain("hit a ban screen")
      expect(await db.select().from(promoPhoneActions)).toHaveLength(before)

      await clearBanScreen(userId, accountId, db)
      const [cleared] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(cleared).toMatchObject({ blocked: false, blockedReason: "", banScreenAt: null })
    }, 30_000)

    it("tries a reading again after a freeze, and it finishes on the reopened app", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await accountOn(A1)
      // A health reading's stranger's-eye half is filed for the reader browser.
      const readerProfileId = await createProfile(userId, { name: "Reader" }, db)
      await db.update(promoBehaviourSettings).set({ readerProfileId }).where(eq(promoBehaviourSettings.userId, userId))
      const jobId = await queueJob(userId, "health", { accountId }, db)
      let healthAsks = 0
      const fake = fakeRack((action) => {
        if (action.action !== "reddit/health") return { ok: true, result: signedIn }
        healthAsks += 1
        return healthAsks === 1
          ? { ok: false, recovered: "app", error: "The app stopped responding, so the rack closed it and opened it again." }
          : {
              ok: true,
              result: {
                handle: "promo_tester",
                karma: 12,
                createdSeconds: null,
                blocked: false,
                reason: "",
                profile: { signedIn: { status: 200, found: true, suspended: false } },
              },
            }
      })
      await runOneJob("phone-lane", db, "phone")
      const [waiting] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(waiting).toMatchObject({ status: "queued", attempts: 1 })
      await runOneJob("phone-lane", db, "phone")
      await fake.stop()

      const [done] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(done.status).toBe("done")
      expect(healthAsks).toBe(2)
      const history = await phoneHistory(userId, A1, db)
      expect(history.map((line) => line.kind)).toContain("restarted")
    }, 30_000)

    it("fails a comment caught by a freeze and never sends it again", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await accountOn(A1)
      const findId = await insertFind()
      // A phone comment goes out only once the self-test has walked it.
      await db.insert(promoPhoneActionChecks).values({ userId, action: "reddit/comment", passed: true })
      const jobId = await queueJob(userId, "comment", { accountId, findId, text: "We keep it all in one board." }, db)
      const fake = fakeRack((action) =>
        action.action === "reddit/comment"
          ? { ok: false, recovered: "app", error: "The app stopped responding, so the rack closed it and opened it again." }
          : { ok: true, result: signedIn }
      )
      await runOneJob("phone-lane", db, "phone")
      expect(await runOneJob("phone-lane", db, "phone")).toEqual({ did: "nothing" })
      await fake.stop()

      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.status).toBe("failed")
      const comments = (await db.select().from(promoPhoneActions)).filter((row) => row.action === "reddit/comment")
      expect(comments).toHaveLength(1)
    }, 30_000)

    it("refuses a job whose action the self-test found broken, before anything reaches the phone", { timeout: 30_000 }, async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await accountOn(A1)
      await db.insert(promoPhoneActionChecks).values({
        userId,
        action: "reddit/health",
        passed: false,
        step: "Open the profile",
        error: 'Could not find "Profile" on the screen.',
      })
      await queueJob(userId, "health", { accountId }, db)
      const fake = fakeRack(() => ({ ok: true, result: signedIn }))
      const result = await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      expect(result).toMatchObject({ ok: false })
      expect(String((result as { error?: string }).error)).toContain('found Reddit health reading broken on')
      expect((await db.select().from(promoPhoneActions)).filter((row) => row.action === "reddit/health")).toHaveLength(0)
      // A refusal is final; it is not tried again.
      expect((await db.select().from(promoJobs))[0].status).toBe("failed")
    })
  })
})

describe("the rack's settings", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
  })

  afterEach(async () => {
    await client.close()
  })

  it("saves the numbers and refuses one out of range in words", async () => {
    expect(await readPhoneSettings(db)).toEqual({ maxWorking: 5, screenshotDays: 7, pausedAt: null, testPhoneId: null })
    await savePhoneSettings({ maxWorking: 8, screenshotDays: 30 }, db)
    expect(await readPhoneSettings(db)).toMatchObject({ maxWorking: 8, screenshotDays: 30 })
    await expect(savePhoneSettings({ maxWorking: 0, screenshotDays: 30 }, db)).rejects.toThrow(
      "The number of phones has to be a whole number from 1 to 50."
    )
    await expect(savePhoneSettings({ maxWorking: 5, screenshotDays: 91 }, db)).rejects.toThrow(
      "The days has to be a whole number from 1 to 90."
    )
  })
})

describe("a phone's screen window", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack
  let phoneId: string

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const { code } = await createPairingCode(userId, db)
    const paired = await pairRack({ code, name: "Mac", platform: "", version: RACK_VERSION }, db)
    rack = { id: paired.rackId, userId, key: paired.key }
    await checkIn(rack, { version: RACK_VERSION, platform: "", phones: [{ serial: "A1", state: "device", usb: "", model: "Pixel", android: "16" }], rolledBack: null }, db)
    phoneId = (await db.select().from(promoPhones))[0].id
  })

  afterEach(async () => {
    closeScreen(phoneId)
    vi.unstubAllEnvs()
    await client.close()
  })

  it("asks the rack for a watched phone only, and hands the picture to the window", async () => {
    expect(await exchangeScreens(rack, { frames: [], texts: [] }, db)).toEqual({ wanted: [], inputs: {} })
    watchScreen(phoneId)
    expect((await exchangeScreens(rack, { frames: [], texts: [] }, db)).wanted).toEqual(["A1"])

    await exchangeScreens(rack, { frames: [{ serial: "A1", jpeg: "/9j/AA", width: 1080, height: 2400 }], texts: [] }, db)
    expect(watchScreen(phoneId).frame).toMatchObject({ jpeg: "/9j/AA", width: 1080, height: 2400, seq: 1 })

    // A window not asked for in ten seconds is closed.
    expect((await exchangeScreens(rack, { frames: [], texts: [] }, db, new Date(Date.now() + 11_000))).wanted).toEqual([])
  })

  it("lets nothing reach the phone with control off, and taps through with it on", async () => {
    watchScreen(phoneId)
    await expect(sendScreenInput(userId, phoneId, { kind: "tap", x: 0.5, y: 0.5 }, db)).rejects.toThrow("Control is off")

    await setControl(userId, phoneId, true, db)
    await sendScreenInput(userId, phoneId, { kind: "tap", x: 0.5, y: 0.5 }, db)
    expect((await exchangeScreens(rack, { frames: [], texts: [] }, db)).inputs).toEqual({ A1: [{ kind: "tap", x: 0.5, y: 0.5 }] })
    // Handed over once.
    expect((await exchangeScreens(rack, { frames: [], texts: [] }, db)).inputs).toEqual({})

    await sendScreenInput(userId, phoneId, { kind: "key", key: "back" }, db)
    await setControl(userId, phoneId, false, db)
    expect((await exchangeScreens(rack, { frames: [], texts: [] }, db)).inputs).toEqual({})
  })

  it("shows a texted code, for ten minutes, from this rack's own phones only", async () => {
    watchScreen(phoneId)
    await exchangeScreens(rack, { frames: [], texts: [{ serial: "A1", code: "482913", from: "Reddit" }, { serial: "ZZ", code: "1", from: "" }] }, db)
    expect(watchScreen(phoneId).text).toMatchObject({ code: "482913", from: "Reddit" })
    expect(watchScreen(phoneId, Date.now() + 11 * 60_000).text).toBeNull()
  })

  it("refuses a window for another person's phone", async () => {
    const stranger = (await insertUser(db, { role: "admin" })).id
    const theirs = await createPhone(stranger, {
      name: "Theirs", model: "", androidVersion: "", serial: "", simCarrier: "", simNumber: "", connection: "sim",
      proxyId: null, notes: "", folderId: null, labelId: null, tags: [], shelfSlot: "",
    }, db)
    await expect(setControl(userId, theirs, true, db)).rejects.toThrow("does not exist")
    await expect(sendScreenInput(userId, theirs, { kind: "key", key: "home" }, db)).rejects.toThrow("Control is off")
  })
})
