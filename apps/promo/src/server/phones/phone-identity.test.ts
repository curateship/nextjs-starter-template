import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The proxy is tested from the server before a Wi-Fi phone's job. No network
// here: it answers with the proxy's address.
vi.mock("@/server/browser/proxies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/browser/proxies")>()),
  testAndRecordProxy: vi.fn(async () => ({ ok: true, ip: "198.51.100.7", country: "US", timezone: "America/New_York" })),
}))

import { uuid } from "@/server/auth/security"
import { createProfile, updateProfile } from "@/server/browser/profiles"
import { promoProxies } from "@/server/browser/schema"
import { setDbForTests } from "@/server/db"
import { addAccount, setAccountRunsOn } from "@/server/social/accounts"
import { markImportant, refuseInteraction } from "@/server/social/apart"
import { retireAccounts, setAccountVoice } from "@/server/social/account-list"
import { queueJob } from "@/server/social/jobs"
import { finishMoveFromPhone, startMoveToPhone } from "@/server/social/move-to-phone"
import { queueComment } from "@/server/social/posting"
import { addAccountToProject, createProject } from "@/server/social/projects"
import { runOneJob } from "@/server/social/runner"
import {
  promoAccounts,
  promoBehaviourSettings,
  promoComments,
  promoFinds,
  promoJobs,
  promoKeywords,
  promoNotices,
  promoSearches,
  promoVoices,
} from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { phoneHistory } from "./history"
import { listPhones, phonesFreeFor, updatePhone } from "./phones"
import { checkIn, createPairingCode, finishAction, nextAction, pairRack, type VerifiedRack } from "./rack"
import { RACK_VERSION } from "./release"
import { promoPhoneActionChecks, promoPhoneActions, promoPhones } from "./schema"
import { callPhone } from "./dispatch"
import { queueSetupCheck } from "./setup"
import { queueWipe } from "./wipe"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A rack's answer to a setup check of a SIM phone in Canada, set up as it should be. */
const GOOD_SETUP = {
  wifiOn: false,
  locationApps: { reddit: false },
  timezone: "America/Toronto",
  timezoneCountry: "CA",
  locale: "en-CA",
  sim: { country: "CA", carrier: "Rogers" },
  network: { carrier: "Rogers" },
  autoUpdate: "off",
  autoUpdateError: "",
  battery: { percent: 78, charging: true },
  outside: { ip: "192.0.2.44", country: "CA", timezone: "America/Toronto", org: "AS812 Rogers", error: "" },
  home: { ip: "203.0.113.5", country: "CA", timezone: "America/Toronto", org: "AS577 Bell", error: "" },
}

/**
 * Phone farm files 04 and 05, Promo's side: important and throwaway accounts
 * kept apart, a phone wiped between accounts, the setup check, the Wi-Fi
 * phone's address guard, Reddit steps a phone does not do, and moving an
 * account from a browser profile to a phone.
 */
describe("phone farm files 04 and 05", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
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
        phones: serials.map((serial) => ({ serial, state: "device", usb: "usb:1", model: `Phone ${serial}`, android: "16", kind: "android" as const, timezone: "UTC" })),
        rolledBack: null,
      },
      db
    )
    const phones = await db.select().from(promoPhones)
    return Object.fromEntries(phones.map((phone) => [phone.serial, phone.id]))
  }

  async function named(accountId: string, handle: string) {
    await db.update(promoAccounts).set({ handle }).where(eq(promoAccounts.id, accountId))
  }

  /** Answers every action the rack is handed, until stopped. */
  function fakeRack(answer: (action: { action: string; serial: string }) => { ok: boolean; result?: Record<string, unknown>; error?: string }) {
    const seen: string[] = []
    let stopped = false
    const loop = (async () => {
      while (!stopped) {
        const action = await nextAction(rack, db)
        if (!action) {
          await sleep(20)
          continue
        }
        seen.push(action.action)
        const reply = answer(action)
        await finishAction(rack, { id: action.id, ok: reply.ok, result: reply.result ?? {}, error: reply.error ?? "" }, db)
      }
    })()
    return { seen, stop: async () => ((stopped = true), await loop) }
  }

  async function insertFind(patch: { redditId?: string; author?: string; projectId?: string } = {}) {
    const projectId = patch.projectId ?? (await createProject(userId, `Promo ${uuid().slice(0, 4)}`, db))
    const [keyword] = await db
      .insert(promoKeywords)
      .values({ id: uuid(), userId, projectId, term: `term ${uuid().slice(0, 6)}`, subreddits: [], sort: "new", timeWindow: "week" })
      .returning()
    const [search] = await db.insert(promoSearches).values({ id: uuid(), userId, keywordId: keyword.id, status: "done" }).returning()
    const [find] = await db
      .insert(promoFinds)
      .values({
        id: uuid(),
        userId,
        keywordId: keyword.id,
        firstSearchId: search.id,
        redditId: patch.redditId ?? "t3_1abc234",
        permalink: "/r/productivity/comments/1abc234/a_post/",
        subreddit: "productivity",
        title: "What do you use to keep track of client work?",
        author: patch.author ?? "someone_else",
        score: 4,
        commentCount: 1,
        rank: 1,
      })
      .returning()
    return { findId: find.id, projectId }
  }

  describe("important and throwaway kept apart (part 22)", () => {
    it("starts every account as throwaway, and marks one important only on a phone, for good", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const onProfile = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      const onPhone = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      const rows = await db.select().from(promoAccounts)
      expect(rows.map((row) => row.importance)).toEqual(["throwaway", "throwaway"])

      await expect(markImportant(userId, onProfile, db)).rejects.toThrow(
        "an important account runs on a phone only. Use Move to a phone"
      )
      await markImportant(userId, onPhone, db)
      const [phone] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(phone.heldImportantAt).not.toBeNull()
      // Never back onto a browser profile.
      const spare = await createProfile(userId, { name: "Browser two" }, db)
      await expect(setAccountRunsOn(userId, onPhone, { profileId: spare, phoneId: null }, db)).rejects.toThrow(
        "is important, so it runs on a phone only"
      )
    })

    it("refuses a throwaway on a phone that held an important account until it is wiped", async () => {
      const { A1, B2 } = await plugIn("A1", "B2")
      const important = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(important, "big_account")
      await markImportant(userId, important, db)
      await setAccountRunsOn(userId, important, { profileId: null, phoneId: B2 }, db)
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const throwaway = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await expect(setAccountRunsOn(userId, throwaway, { profileId: null, phoneId: A1 }, db)).rejects.toThrow(
        "the phone Phone A1 held an important account, so a throwaway like this account may not run on it until it is wiped"
      )
    })

    it("refuses a phone and a browser profile sharing a proxy, either way round", async () => {
      const { A1 } = await plugIn("A1")
      const [proxy] = await db.insert(promoProxies).values({ id: uuid(), userId, host: "gate.test", port: 8000, label: "US home line" }).returning()
      const input = {
        name: "Phone A1",
        model: "",
        kind: "android" as const,
        androidVersion: "",
        serial: "A1",
        simCarrier: "",
        simNumber: "",
        connection: "wifi" as const,
        proxyId: proxy.id,
        notes: "",
        folderId: null,
        labelId: null,
        tags: [],
        shelfSlot: "",
      }
      await updatePhone(userId, A1, input, db)
      await expect(createProfile(userId, { name: "Browser one", proxyId: proxy.id }, db)).rejects.toThrow(
        "that proxy is already used by the phone Phone A1"
      )

      const [other] = await db.insert(promoProxies).values({ id: uuid(), userId, host: "gate2.test", port: 8000 }).returning()
      const profileId = await createProfile(userId, { name: "Browser two" }, db)
      await updateProfile(userId, profileId, { name: "Browser two", proxyId: other.id, notes: "", folderId: null, labelId: null, tags: [] }, db)
      await expect(updatePhone(userId, A1, { ...input, proxyId: other.id }, db)).rejects.toThrow(
        "that proxy is already used by the browser profile Browser two"
      )
    })

    it("refuses one voice and one project shared by both groups", async () => {
      const { A1 } = await plugIn("A1")
      const important = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(important, "big_account")
      await markImportant(userId, important, db)
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const throwaway = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)

      const [voice] = await db.insert(promoVoices).values({ id: uuid(), userId, name: "Plain" }).returning()
      await setAccountVoice(userId, important, voice.id, db)
      await expect(setAccountVoice(userId, throwaway, voice.id, db)).rejects.toThrow(
        "that voice is used by the important account u/big_account"
      )

      const projectId = await createProject(userId, "Promo", db)
      await addAccountToProject(userId, projectId, important, db)
      await expect(addAccountToProject(userId, projectId, throwaway, db)).rejects.toThrow(
        "this project already has the important account u/big_account"
      )
    })

    it("refuses a throwaway commenting on an important account's post, naming it, or under a post it commented on", async () => {
      const { A1 } = await plugIn("A1")
      const important = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(important, "Big_Account")
      await markImportant(userId, important, db)
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const throwaway = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      // Old enough to be past its warm-up and its young-account limits.
      await db.update(promoAccounts).set({ redditCreatedAt: new Date("2023-01-01T00:00:00Z") }).where(eq(promoAccounts.id, throwaway))
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, throwaway))

      // A post by the important account.
      const byImportant = await insertFind({ author: "big_account", redditId: "t3_aaa" })
      await expect(
        queueComment(userId, row, { findId: byImportant.findId, text: "Nice.", draftId: null }, db)
      ).rejects.toThrow("that post is by your important account u/Big_Account")

      // Words naming it, as u/name or a link to its profile.
      const plain = await insertFind({ redditId: "t3_bbb" })
      await expect(
        queueComment(userId, row, { findId: plain.findId, text: "Ask u/big_account, they know.", draftId: null }, db)
      ).rejects.toThrow("the words name your important account u/Big_Account")
      await expect(
        refuseInteraction(userId, row, { words: ["https://www.reddit.com/user/Big_Account/"] }, db)
      ).rejects.toThrow("name your important account")
      // A name that only starts the same is someone else.
      await expect(refuseInteraction(userId, row, { words: ["u/big_account_fan said so"] }, db)).resolves.toBeUndefined()

      // A link to one of its comments.
      await db.insert(promoComments).values({
        id: uuid(),
        userId,
        findId: plain.findId,
        accountId: important,
        text: "We use a board.",
        commentUrl: "https://www.reddit.com/r/productivity/comments/bbb/a_post/kq1x2y3/",
      })
      await expect(
        refuseInteraction(userId, row, { words: ["see reddit.com/r/productivity/comments/bbb/a_post/kq1x2y3"] }, db)
      ).rejects.toThrow("name your important account")

      // Under a post the important account already commented on, from another find of the same post.
      const samePost = await insertFind({ redditId: "t3_bbb" })
      await expect(
        queueComment(userId, row, { findId: samePost.findId, text: "We use paper.", draftId: null }, db)
      ).rejects.toThrow("the important account u/Big_Account already commented under this post")

      // A reply by the important account is not answered.
      await expect(refuseInteraction(userId, row, { replyAuthor: "BIG_ACCOUNT", words: ["Thanks"] }, db)).rejects.toThrow(
        "that reply is by your important account"
      )
    })

    it("refuses an important account under a post a throwaway has a comment on its way to", async () => {
      const { A1 } = await plugIn("A1")
      const important = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(important, "big_account")
      await markImportant(userId, important, db)
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const throwaway = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await named(throwaway, "small_one")
      const first = await insertFind({ redditId: "t3_ccc" })
      await queueJob(userId, "comment", { findId: first.findId, accountId: throwaway, text: "Hi." }, db)
      const second = await insertFind({ redditId: "t3_ccc" })
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, important))
      await expect(
        refuseInteraction(userId, row, { redditPostId: "t3_ccc", words: ["Hello."] }, db)
      ).rejects.toThrow("the throwaway account u/small_one already commented under this post, or has a comment on its way")
      expect(second.findId).not.toBe(first.findId)
    })
  })

  describe("wiping between accounts (part 26)", () => {
    it("marks a phone an account left as needing a wipe, and refuses the next account until it is wiped and set up", async () => {
      const { A1, B2 } = await plugIn("A1", "B2")
      const first = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await setAccountRunsOn(userId, first, { profileId: null, phoneId: B2 }, db)
      expect((await phoneHistory(userId, A1, db)).map((line) => line.detail)).toContain(
        "A Reddit account moved off it. It needs wiping before another account goes on."
      )
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)).rejects.toThrow(
        "The phone Phone A1 needs wiping"
      )
      expect((await phonesFreeFor(userId, null, db)).find((phone) => phone.id === A1)?.note).toBe("needs wiping")

      // The wipe goes through the rack; the phone is held while it is set up by hand.
      await queueWipe(userId, A1, db)
      const fake = fakeRack(() => ({ ok: true, result: { wiped: true } }))
      while (!fake.seen.includes("phone/wipe")) await sleep(20)
      await fake.stop()
      const [wiped] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(wiped).toMatchObject({ held: true, needsWipeAt: null, heldImportantAt: null })
      expect(wiped.wipedAt).not.toBeNull()
      expect((await phoneHistory(userId, A1, db)).map((line) => line.kind)).toContain("wiped")
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)).rejects.toThrow(
        "was wiped on"
      )

      // Released and checked: every line passes, so it takes an account again.
      await db.update(promoPhones).set({ held: false }).where(eq(promoPhones.id, A1))
      await plugIn("A1", "B2")
      await queueSetupCheck(userId, A1, db)
      const checker = fakeRack(() => ({ ok: true, result: GOOD_SETUP }))
      while (!checker.seen.includes("phone/setup-check")) await sleep(20)
      await checker.stop()
      // A charging limit is read from the last day's readings.
      const [checked] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(checked.setupCheck?.lines.find((line) => line.key === "charging")?.verdict).toBe("unknown")
    })

    it("refuses a wipe while an account is on the phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(accountId, "promo_tester")
      await expect(queueWipe(userId, A1, db)).rejects.toThrow("u/promo_tester runs on this phone")
    })
  })

  describe("the setup check (part 23)", () => {
    it("saves each line and writes the check in the phone's history", async () => {
      const { A1 } = await plugIn("A1")
      await queueSetupCheck(userId, A1, db)
      const fake = fakeRack(() => ({ ok: true, result: { ...GOOD_SETUP, wifiOn: true } }))
      while (!fake.seen.includes("phone/setup-check")) await sleep(20)
      await fake.stop()
      const [phone] = (await listPhones(userId, db)).filter((one) => one.id === A1)
      expect(phone.setupCheck?.passed).toBe(false)
      expect(phone.setupCheck?.lines.find((line) => line.key === "wifi")?.verdict).toBe("fails")
      expect(phone.setupCheck?.seen.find((line) => line.label === "Country")?.verdict).toBe("matches")
      const [line] = (await phoneHistory(userId, A1, db)).filter((one) => one.kind === "setup_checked")
      expect(line.detail).toContain("Wi-Fi off")
    })
  })

  describe("a Wi-Fi phone's address (part 28)", () => {
    async function wifiPhone() {
      const { A1 } = await plugIn("A1")
      const [proxy] = await db
        .insert(promoProxies)
        .values({ id: uuid(), userId, host: "gate.test", port: 8000, label: "US home line", country: "US" })
        .returning()
      await db.update(promoPhones).set({ connection: "wifi", proxyId: proxy.id }).where(eq(promoPhones.id, A1))
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      return { A1, accountId }
    }

    it("refuses the job and stops the phone when the house's address shows, and lets it run once the proxy's does", async () => {
      const { A1, accountId } = await wifiPhone()
      // The health reading's stranger look goes to the reader afterwards.
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await db.update(promoBehaviourSettings).set({ readerProfileId: readerId }).where(eq(promoBehaviourSettings.userId, userId))
      await queueJob(userId, "health", { accountId }, db)
      const home = { ip: "203.0.113.5", country: "CA", timezone: "America/Toronto", org: "AS577 Bell", error: "" }
      let proxyOn = false
      const fake = fakeRack((action) =>
        action.action === "phone/outside-address"
          ? { ok: true, result: { phone: proxyOn ? { ...home, ip: "198.51.100.7" } : home, home } }
          : action.action === "phone/setup-check"
            ? { ok: true, result: { ...GOOD_SETUP, outside: { ...home, ip: "198.51.100.7" }, home } }
            : { ok: true, result: { checked: true, handle: "promo_tester", karma: 1, createdSeconds: null, blocked: false, reason: "", profile: { signedIn: { status: 200, found: true, suspended: false } } } }
      )
      const first = await runOneJob("phone-lane", db, "phone")
      expect(first).toMatchObject({ ok: false })
      expect(String((first as { error?: string }).error)).toContain("Apps see 203.0.113.5, the house's own address")
      const [stopped] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(stopped.addressStopAt).not.toBeNull()
      const notices = await db.select().from(promoNotices).where(eq(promoNotices.kind, "phone_address"))
      expect(notices).toHaveLength(1)
      expect(fake.seen).not.toContain("reddit/health")

      // The next job is refused without asking the phone again.
      await queueJob(userId, "health", { accountId }, db)
      const second = await runOneJob("phone-lane", db, "phone")
      expect(String((second as { error?: string }).error)).toContain("was stopped for showing the wrong address")

      // The proxy app is back on: a setup check sees the proxy's address and lifts the stop.
      proxyOn = true
      await db
        .update(promoProxies)
        .set({ lastTestResult: { ok: true, ip: "198.51.100.7", country: "US" } })
        .where(eq(promoProxies.userId, userId))
      await queueSetupCheck(userId, A1, db)
      while (!fake.seen.includes("phone/setup-check")) await sleep(20)
      await sleep(50)
      const [lifted] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(lifted.addressStopAt).toBeNull()
      expect(await db.select().from(promoNotices).where(eq(promoNotices.kind, "phone_address"))).toHaveLength(0)

      await queueJob(userId, "health", { accountId }, db)
      const third = await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      expect(third, JSON.stringify(third)).toMatchObject({ ok: true })
      expect(fake.seen).toContain("reddit/health")
    }, 30_000)
  })

  describe("Reddit on a phone (part 29)", () => {
    it("refuses a Reddit step the phone does not do, and a comment the self-test has not walked, before anything reaches the phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(accountId, "promo_tester")
      await db.update(promoAccounts).set({ redditCreatedAt: new Date("2023-01-01T00:00:00Z") }).where(eq(promoAccounts.id, accountId))
      const { findId } = await insertFind()
      await queueJob(userId, "warm_up", { accountId }, db)
      await queueJob(userId, "comment", { accountId, findId, text: "We keep it in one board." }, db)
      const fake = fakeRack(() => ({ ok: true, result: { checked: true, handle: "promo_tester", karma: 1, createdSeconds: null, blocked: false, reason: "" } }))
      const warmUp = await runOneJob("phone-lane", db, "phone")
      const comment = await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      expect(String((warmUp as { error?: string }).error)).toContain("Phone A1 cannot do the warm-up visit yet")
      expect(String((comment as { error?: string }).error)).toContain("The daily self-test has not walked Post a Reddit comment")
      // Only the sign-in look after each job reached the phone.
      expect(new Set(fake.seen)).toEqual(new Set(["reddit/quick_state"]))
    }, 20_000)

    it("refuses a phone account's edit or delete when it is pressed, never queuing it", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(accountId, "promo_tester")
      const { findId } = await insertFind()
      const commentId = uuid()
      await db.insert(promoComments).values({
        id: commentId,
        userId,
        findId,
        accountId,
        text: "We keep it in one board.",
        commentUrl: "https://www.reddit.com/r/productivity/comments/1abc234/a_post/kq1/",
      })
      const { queueCommentChange } = await import("@/server/social/comments")
      await expect(queueCommentChange(userId, commentId, { kind: "delete" }, db)).rejects.toThrow(
        "u/promo_tester's phone cannot do deleting a sent comment yet"
      )
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "delete_comment"))).toHaveLength(0)
    })

    it("posts a comment from a phone once the self-test passed it, and asks the reader for its link", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await named(accountId, "promo_tester")
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await db.update(promoBehaviourSettings).set({ readerProfileId: readerId }).where(eq(promoBehaviourSettings.userId, userId))
      await db.insert(promoPhoneActionChecks).values({ userId, action: "reddit/comment", passed: true })
      const { findId } = await insertFind()
      const jobId = await queueJob(userId, "comment", { accountId, findId, text: "We keep it in one board." }, db)
      const fake = fakeRack((action) =>
        action.action === "reddit/comment"
          ? { ok: true, result: { commentUrl: "", visit: null } }
          : { ok: true, result: { checked: true, handle: "promo_tester", karma: 1, createdSeconds: null, blocked: false, reason: "" } }
      )
      const result = await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      expect(result).toMatchObject({ ok: true })
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job.status).toBe("done")
      const [comment] = await db.select().from(promoComments)
      expect(comment).toMatchObject({ status: "posted", commentUrl: "" })
      const [link] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "comment_link"))
      expect(link).toMatchObject({ lane: readerId, payload: { commentId: comment.id, accountId } })
      expect(fake.seen.filter((name) => name === "reddit/comment")).toHaveLength(1)
    }, 20_000)

    it("keeps an exact account date a browser read when the phone reads only a rough age", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      const exact = new Date("2024-03-02T10:00:00Z")
      await db.update(promoAccounts).set({ handle: "promo_tester", redditCreatedAt: exact }).where(eq(promoAccounts.id, accountId))
      await queueJob(userId, "health", { accountId }, db)
      // "2y" counted down from today, which is later than the real date.
      const rough = Math.floor((Date.now() - 730 * 86_400_000) / 1000)
      const fake = fakeRack(() => ({
        ok: true,
        result: { checked: true, handle: "promo_tester", karma: 40, createdSeconds: rough, blocked: false, reason: "", profile: { signedIn: { status: 200, found: true, suspended: false } } },
      }))
      await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.karma).toBe(40)
      expect(account.redditCreatedAt?.toISOString()).toBe(exact.toISOString())
    }, 20_000)
  })

  describe("moving an account from a browser profile to a phone (part 31)", () => {
    it("keeps the phone for the account on its way: no other account is set onto it meanwhile", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const mover = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await named(mover, "promo_tester")
      await startMoveToPhone(userId, mover, A1, db)
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)).rejects.toThrow(
        "one on its way. One Reddit account per phone: u/promo_tester is being moved onto it"
      )
      await expect(queueWipe(userId, A1, db)).rejects.toThrow("is being moved onto this phone")
    })

    it("finishes when the phone reads the account signed in: on the phone, important, its profile's sign-in deleted", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const accountId = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await expect(startMoveToPhone(userId, accountId, A1, db)).rejects.toThrow("has never been seen signed in")
      await named(accountId, "promo_tester")
      await startMoveToPhone(userId, accountId, A1, db)
      // The phone reads someone else first: the move waits.
      const { checkMoveToPhone } = await import("@/server/social/move-to-phone")
      await checkMoveToPhone(userId, accountId, db)
      let who = "somebody_else"
      const fake = fakeRack(() => ({ ok: true, result: { handle: who, karma: null, createdSeconds: null, blocked: false, reason: "", url: "" } }))
      while (!fake.seen.includes("reddit/state")) await sleep(20)
      await sleep(50)
      let [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account).toMatchObject({ profileId, phoneId: null, importance: "throwaway", movingToPhoneId: A1 })

      who = "Promo_Tester"
      await checkMoveToPhone(userId, accountId, db)
      while (fake.seen.filter((name) => name === "reddit/state").length < 2) await sleep(20)
      await sleep(50)
      await fake.stop()
      ;[account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account).toMatchObject({ profileId: null, phoneId: A1, importance: "important", movingToPhoneId: null })
      const [forget] = await db.select().from(promoJobs).where(and(eq(promoJobs.kind, "forget"), eq(promoJobs.userId, userId)))
      expect(forget).toMatchObject({ lane: profileId, payload: { profileId, accountId } })
      await expect(setAccountRunsOn(userId, accountId, { profileId, phoneId: null }, db)).rejects.toThrow(
        "runs on a phone only, never on a browser profile"
      )
    }, 20_000)
  })

  describe("waiting on a phone, moves that change meanwhile, and dates", () => {
    it("calls off a phone step only while it waits its turn, and once started waits its whole time from the start", async () => {
      const { A1 } = await plugIn("A1")
      const target = { phone: { id: A1, userId, rackId: rack.id, name: "Phone A1", kind: "android" as const } }
      const realNow = Date.now.bind(Date)
      let ahead = 0
      const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + ahead)
      try {
        // Waiting behind the phone's other action for more than five minutes: called off, nothing sent.
        await db.insert(promoPhoneActions).values({ id: uuid(), userId, rackId: rack.id, phoneId: A1, action: "phone/setup-check", status: "running", startedAt: new Date() })
        const waiting = callPhone(target, "reddit/health", {}, 60_000)
        await sleep(600)
        ahead = 6 * 60_000
        await expect(waiting).rejects.toThrow("did not start reddit/health within 5 minutes, behind its other actions. Nothing was sent.")
        const [called] = await db.select().from(promoPhoneActions).where(eq(promoPhoneActions.action, "reddit/health"))
        expect(called.status).toBe("cancelled")

        // Started by the rack, with ten minutes to run: six minutes in, past
        // any wait for a turn, it is still waited for, and its answer is taken.
        ahead = 0
        await db.update(promoPhoneActions).set({ status: "done" }).where(eq(promoPhoneActions.action, "phone/setup-check"))
        const running = callPhone(target, "reddit/state", {}, 600_000)
        await sleep(300)
        const started = await nextAction(rack, db)
        expect(started?.action).toBe("reddit/state")
        ahead = 6 * 60_000
        await sleep(1200)
        await finishAction(rack, { id: started!.id, ok: true, result: { handle: "promo_tester" }, error: "" }, db, new Date(realNow() + ahead))
        await expect(running).resolves.toEqual({ handle: "promo_tester" })
      } finally {
        clock.mockRestore()
      }
    }, 20_000)

    it("counts a throwaway on its way to a phone as important, and asks the rules again when the move finishes", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const mover = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await named(mover, "promo_tester")
      const projectId = await createProject(userId, "Promo", db)
      await addAccountToProject(userId, projectId, mover, db)
      await startMoveToPhone(userId, mover, A1, db)
      const spare = await createProfile(userId, { name: "Browser two" }, db)
      const other = await addAccount(userId, { profileId: spare, phoneId: null, voiceId: null }, db)
      await expect(addAccountToProject(userId, projectId, other, db)).rejects.toThrow(
        "this project already has the important account u/promo_tester"
      )
      // A throwaway slipped in by hand meanwhile: the move waits rather than mixing the project.
      await db.update(promoAccounts).set({ projectId }).where(eq(promoAccounts.id, other))
      expect(await finishMoveFromPhone(userId, A1, { handle: "promo_tester" }, db)).toBeNull()
      const [still] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, mover))
      expect(still).toMatchObject({ importance: "throwaway", movingToPhoneId: A1 })
    })

    it("ends a move when its account is retired, so the phone is free again", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      const mover = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await named(mover, "promo_tester")
      await startMoveToPhone(userId, mover, A1, db)
      await retireAccounts(userId, [mover], true, db)
      const [retired] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, mover))
      expect(retired.movingToPhoneId).toBeNull()
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)).resolves.toBeTypeOf("string")
    })

    it("lifts a wrong-address stop once the phone goes out over its SIM", async () => {
      const { A1 } = await plugIn("A1")
      await db.update(promoPhones).set({ addressStopAt: new Date(), addressStopWords: "Apps see 203.0.113.5." }).where(eq(promoPhones.id, A1))
      await queueSetupCheck(userId, A1, db)
      const fake = fakeRack(() => ({ ok: true, result: GOOD_SETUP }))
      while (!fake.seen.includes("phone/setup-check")) await sleep(20)
      await sleep(50)
      await fake.stop()
      const [phone] = await db.select().from(promoPhones).where(eq(promoPhones.id, A1))
      expect(phone.addressStopAt).toBeNull()
    })

    it("takes a new account's own date when another account signs in on the same phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null }, db)
      await db.update(promoAccounts).set({ handle: "old_one", redditCreatedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(promoAccounts.id, accountId))
      await queueJob(userId, "health", { accountId }, db)
      const young = Math.floor((Date.now() - 5 * 86_400_000) / 1000)
      const fake = fakeRack(() => ({
        ok: true,
        result: { checked: true, handle: "young_one", karma: 1, createdSeconds: young, blocked: false, reason: "", profile: { signedIn: { status: 200, found: true, suspended: false } } },
      }))
      await runOneJob("phone-lane", db, "phone")
      await fake.stop()
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.handle).toBe("young_one")
      expect(account.redditCreatedAt?.getTime()).toBe(young * 1000)
    }, 20_000)
  })
})
