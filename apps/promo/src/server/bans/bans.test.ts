import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// R2 as a map in memory, so a ban's picture can be kept and the step
// pictures tidied away for real.
const stored = new Map<string, Buffer>()
vi.mock("@/server/media/storage", () => ({
  uploadToR2: vi.fn(async (key: string, body: Buffer) => void stored.set(key, Buffer.from(body))),
  getFromR2: vi.fn(async (key: string) => {
    const body = stored.get(key)
    return { Body: body ? { transformToByteArray: async () => new Uint8Array(body) } : undefined }
  }),
  deleteFromR2: vi.fn(async (key: string) => void stored.delete(key)),
}))

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoProxies } from "@/server/browser/schema"
import { setDbForTests } from "@/server/db"
import { clearBanScreen, stopForBanScreen } from "@/server/phones/health"
import { phoneHistory } from "@/server/phones/history"
import { checkIn, createPairingCode, createRack, finishAction, nextAction, pairRack, type VerifiedRack } from "@/server/phones/rack"
import { queuePhoneAction } from "@/server/phones/queue"
import { RACK_VERSION } from "@/server/phones/release"
import { promoPhoneActions, promoPhones } from "@/server/phones/schema"
import { tidyStepPictures } from "@/server/phones/trail"
import { recordWipe } from "@/server/phones/wipe"
import { addAccount, setAccountRunsOn } from "@/server/social/accounts"
import { listRedditAccounts, retireAccounts } from "@/server/social/account-list"
import { queueJob } from "@/server/social/jobs"
import { pausedBy } from "@/server/social/pause"
import { addAccountToProject, createProject } from "@/server/social/projects"
import {
  promoAccounts,
  promoAppPosts,
  promoBehaviourSettings,
  promoComments,
  promoFinds,
  promoJobs,
  promoKeywords,
} from "@/server/social/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { answerAppeal, markAppealed, remindAppeals } from "./appeals"
import { cleanUpBan } from "./clean-up"
import { loadBans, projectBanCounts, sellerLines } from "./dashboard"
import { accountHistory, phoneTenancies } from "./history"
import { finishBanLook, queueBanLooks } from "./look"
import { answerScreen, learnedPhrases, unknownScreens } from "./phrases"
import { recordBan, releaseBrake } from "./record"
import { atRiskSigns, placeBanCheck, slowReason } from "./rules"
import { promoBans, promoPhoneTenancies } from "./schema"
import { refuseImportantFirstInSubreddit } from "./throwaway-first"

const T0 = new Date("2099-01-01T12:00:00Z")
const hours = (count: number) => new Date(T0.getTime() + count * 3_600_000)
const days = (count: number) => hours(count * 24)

/** Bans task (workspace/tasks/Bans/01-ban-features.md), Promo's side. The rack's side is in `rack/test_promo_rack.py`. */
describe("bans", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    stored.clear()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    // Always awake, so nothing waits for a morning.
    await db.insert(promoBehaviourSettings).values({ userId, wakeFromMinute: 0, wakeUntilMinute: 1439, appWarmUpDays: 0 })
    const { code } = await createPairingCode(userId, await createRack(userId, { name: "Mac" }, db), db, T0)
    const paired = await pairRack({ code, platform: "", version: RACK_VERSION }, db, T0)
    rack = { id: paired.rackId, userId, key: paired.key }
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function plugIn(at: Date, ...serials: string[]) {
    await checkIn(
      rack,
      {
        version: RACK_VERSION,
        platform: "",
        phones: serials.map((serial) => ({ serial, state: "device", usb: "usb:1", model: `Phone ${serial}`, android: "16", kind: "android" as const, timezone: "UTC" })),
        rolledBack: null,
      },
      db,
      at
    )
    const phones = await db.select().from(promoPhones)
    return Object.fromEntries(phones.map((phone) => [phone.serial, phone.id]))
  }

  async function account(phoneId: string, platform: "reddit" | "instagram" | "tiktok", handle: string) {
    const id = await addAccount(userId, { profileId: null, phoneId, voiceId: null, platform }, db)
    await db.update(promoAccounts).set({ handle }).where(eq(promoAccounts.id, id))
    return id
  }

  const ban = (phoneId: string, app: string, at: Date, kind = "suspended") =>
    stopForBanScreen(userId, phoneId, { app, kind, words: `Your account has been ${kind}` }, db, at)

  const bansOf = (accountId: string) => db.select().from(promoBans).where(eq(promoBans.accountId, accountId))

  describe("the ban record on a phone (parts 1 and 2)", () => {
    it("writes one row and one History line, a second report writes neither, and a wipe keeps the line", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "instagram", "sam")
      await ban(A1, "instagram", hours(1))
      await ban(A1, "instagram", hours(2))
      expect(await bansOf(accountId)).toHaveLength(1)
      const lines = () => phoneHistory(userId, A1, db).then((all) => all.filter((line) => line.kind === "banned"))
      expect(await lines()).toHaveLength(1)
      expect((await lines())[0].detail).toBe('@sam on Instagram, suspended: "Your account has been suspended"')
      await recordWipe(userId, A1, db, hours(3))
      expect(await lines()).toHaveLength(1)
    })

    it("closes a phone's row as moved when the account moves, and as banned after Clean up", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const accountId = await account(A1, "reddit", "persona")
      await setAccountRunsOn(userId, accountId, { profileId: null, phoneId: B2 }, db)
      const onA = await phoneTenancies(userId, A1, db)
      expect(onA).toHaveLength(1)
      expect(onA[0].leftHow).toBe("moved")
      expect((await phoneTenancies(userId, B2, db))[0].leftAt).toBeNull()
      await ban(B2, "reddit", hours(1))
      await cleanUpBan(userId, accountId, db, hours(2))
      expect((await phoneTenancies(userId, B2, db))[0].leftHow).toBe("banned")
    })
  })

  describe("a phone kept off an app (parts 3, 5 and 13)", () => {
    it("warns after one ban, refuses after two with the same words, and still takes another app", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const first = await account(A1, "instagram", "one")
      await ban(A1, "instagram", hours(1))
      await cleanUpBan(userId, first, db, hours(2))
      await db.update(promoPhones).set({ needsWipeAt: null }).where(eq(promoPhones.id, A1))
      const warned = await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)
      expect(warned.refusal).toBeNull()
      expect(warned.warnings).toEqual(["Banned on Instagram once."])
      const second = await account(A1, "instagram", "two")
      await ban(A1, "instagram", hours(3))
      await cleanUpBan(userId, second, db, hours(4))
      await db.update(promoPhones).set({ needsWipeAt: null }).where(eq(promoPhones.id, A1))
      const refused = await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)
      expect(refused.refusal).toBe("This phone lost two Instagram accounts. Use another phone for Instagram.")
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "instagram" }, db)).rejects.toThrow(refused.refusal!)
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "tiktok" }, db)).resolves.toBeTruthy()
    })

    it("a locked screen is recorded but does not count toward keeping a phone off", async () => {
      const { A1 } = await plugIn(T0, "A1")
      await account(A1, "instagram", "locked")
      await ban(A1, "instagram", hours(1), "locked")
      expect((await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)).warnings).toEqual([])
    })

    it("refuses a banned Wi-Fi proxy for that app until the phone's proxy changes", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const [burned, fresh] = await db
        .insert(promoProxies)
        .values([
          { id: uuid(), userId, host: "gate.test", port: 8000, label: "US line" },
          { id: uuid(), userId, host: "gate2.test", port: 8000, label: "Fresh line" },
        ])
        .returning()
      await db.update(promoPhones).set({ connection: "wifi", proxyId: burned.id }).where(eq(promoPhones.id, A1))
      const first = await account(A1, "instagram", "first")
      await ban(A1, "instagram", hours(1))
      await cleanUpBan(userId, first, db, hours(2))
      await db.update(promoPhones).set({ needsWipeAt: null }).where(eq(promoPhones.id, A1))
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "instagram" }, db)).rejects.toThrow(
        "The proxy US line was used by a banned Instagram account"
      )
      await db.update(promoPhones).set({ proxyId: fresh.id }).where(eq(promoPhones.id, A1))
      await expect(addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "instagram" }, db)).resolves.toBeTruthy()
    })

    it("a SIM in a ban only warns, and an empty SIM number never matches", async () => {
      const { A1, B2, C3 } = await plugIn(T0, "A1", "B2", "C3")
      await db.update(promoPhones).set({ simNumber: "+1 555 0100" }).where(eq(promoPhones.id, A1))
      await account(A1, "instagram", "simmed")
      await ban(A1, "instagram", hours(1))
      // The SIM moved to B2.
      await db.update(promoPhones).set({ simNumber: "+1 555 0100" }).where(eq(promoPhones.id, B2))
      const onB = await placeBanCheck(userId, { phoneId: B2, profileId: null }, "instagram", db)
      expect(onB).toEqual({ refusal: null, warnings: ["This SIM was used by a banned Instagram account."], note: "its SIM was in an Instagram ban" })
      expect((await placeBanCheck(userId, { phoneId: C3, profileId: null }, "instagram", db)).warnings).toEqual([])
    })
  })

  describe("Clean up (part 6)", () => {
    it("retires the account as Banned, leaves the phone with no account, and queues its wipe", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "reddit", "gone")
      await ban(A1, "reddit", T0)
      await plugIn(hours(1), "A1")
      const answer = await cleanUpBan(userId, accountId, db, hours(1))
      expect(answer.wipeQueued).toBe(true)
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(row.retiredReason).toBe("banned")
      expect(row.phoneId).toBeNull()
      const wipes = await db.select().from(promoPhoneActions).where(and(eq(promoPhoneActions.phoneId, A1), eq(promoPhoneActions.action, "phone/wipe")))
      expect(wipes).toHaveLength(1)
    })

    it("refuses an account no ban stopped", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "reddit", "fine")
      await expect(cleanUpBan(userId, accountId, db)).rejects.toThrow("Only an account a ban stopped is cleaned up.")
    })
  })

  describe("a screen Promo does not know (part 9)", () => {
    it("stops the account and asks; It's a ban writes the record and teaches the rack", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "instagram", "odd")
      const line = "Your account was restricted for 30 days"
      await stopForBanScreen(userId, A1, { app: "instagram", kind: "unknown", words: `${line} OK`, line }, db, T0)
      expect((await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId)))[0].banScreenAt).not.toBeNull()
      expect(await bansOf(accountId)).toHaveLength(0)
      const [asked] = await unknownScreens(userId, db)
      expect(asked.line).toBe(line)
      await answerScreen(userId, asked.id, "ban", db, hours(1))
      expect(await bansOf(accountId)).toHaveLength(1)
      expect((await learnedPhrases(userId, db)).bans).toEqual([{ app: "instagram", line }])
    })

    it("Not a ban lets it run again at full pace and teaches the rack the line is harmless", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "tiktok", "fine")
      const line = "Your account is locked to this phone for safety"
      await stopForBanScreen(userId, A1, { app: "tiktok", kind: "unknown", words: line, line }, db, T0)
      const [asked] = await unknownScreens(userId, db)
      await answerScreen(userId, asked.id, "harmless", db, hours(1))
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(row.banScreenAt).toBeNull()
      expect(row.slowUntil).toBeNull()
      expect((await learnedPhrases(userId, db)).harmless).toEqual([{ app: "tiktok", line }])
    })
  })

  describe("the ban picture (part 10)", () => {
    it("keeps the step that found the ban after the tidy-up deletes the other step pictures", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const accountId = await account(A1, "instagram", "pictured")
      await queuePhoneAction(userId, A1, "instagram/ban_look", db, T0, { args: {} })
      const action = await nextAction(rack, db, T0)
      await finishAction(
        rack,
        {
          id: action!.id,
          ok: true,
          result: {},
          error: "",
          steps: [{ step: "Opened Instagram", jpeg: "QUJD" }],
          banScreen: { app: "instagram", kind: "suspended", words: "Your account has been suspended" },
        },
        db,
        T0
      )
      const [row] = await bansOf(accountId)
      expect(row.pictureKey).toBe(`promo-ban-pictures/${row.id}.bin`)
      await tidyStepPictures(db, days(8))
      expect([...stored.keys()]).toEqual([row.pictureKey])
    })
  })

  describe("the app-wide brake (part 11)", () => {
    it("two Instagram bans in a day pause every Instagram account, leave TikTok running, and Release lets it run", async () => {
      const { A1, B2, C3 } = await plugIn(T0, "A1", "B2", "C3")
      await account(A1, "instagram", "a")
      await account(B2, "instagram", "b")
      const still = await account(C3, "instagram", "c")
      const tiktok = await account(C3, "tiktok", "t")
      await ban(A1, "instagram", T0)
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBeNull()
      await ban(B2, "instagram", hours(1))
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBe("brake")
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "tiktok" }, db)).toBeNull()
      const rows = await listRedditAccounts(userId, { retired: false }, db, hours(2))
      expect(rows.find((row) => row.id === still)?.paused).toBe("brake")
      expect(rows.find((row) => row.id === tiktok)?.paused).toBeNull()
      const bell = await db.select().from(customShellNotifications)
      expect(bell.some((notice) => notice.message === "Two Instagram bans in a day. Every Instagram account is paused.")).toBe(true)
      await releaseBrake(userId, "instagram", db)
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBeNull()
    })

    it("two bans more than a day apart put no brake on", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      await account(A1, "instagram", "a")
      await account(B2, "instagram", "b")
      await ban(A1, "instagram", T0)
      await ban(B2, "instagram", hours(25))
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBeNull()
    })
  })

  describe("records (parts 12, 14, 15, 16 and 18)", () => {
    it("an account moved, banned, appealed and cleaned up shows those lines in order", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const accountId = await account(A1, "reddit", "story")
      await setAccountRunsOn(userId, accountId, { profileId: null, phoneId: B2 }, db)
      await ban(B2, "reddit", hours(1))
      const [row] = await bansOf(accountId)
      await markAppealed(userId, row.id, "Sent from the app", db, hours(2))
      await cleanUpBan(userId, accountId, db, hours(3))
      const kinds = (await accountHistory(userId, accountId, db)).map((line) => line.kind).reverse()
      expect(kinds).toEqual(["added", "moved", "banned", "appealed", "cleaned_up"])
    })

    it("retiring two accounts keeps each reason, and an older retire reads Not recorded", async () => {
      const { A1, B2, C3 } = await plugIn(T0, "A1", "B2", "C3")
      const sold = await account(A1, "reddit", "sold")
      const other = await account(B2, "reddit", "other")
      const old = await account(C3, "reddit", "old")
      await retireAccounts(userId, [sold], true, db, { reason: "sold", note: "" })
      await retireAccounts(userId, [other], true, db, { reason: "other", note: "Lost the email" })
      await db.update(promoAccounts).set({ retiredAt: T0 }).where(eq(promoAccounts.id, old))
      await expect(retireAccounts(userId, [old], true, db)).rejects.toThrow("Pick why the account is retired")
      const rows = await listRedditAccounts(userId, { retired: true }, db)
      const words = Object.fromEntries(rows.map((row) => [row.handle, row.retiredReason.words]))
      expect(words).toEqual({ sold: "Sold", other: "Other: Lost the email", old: "Not recorded" })
      expect((await phoneTenancies(userId, A1, db))[0].leftHow).toBe("retired")
    })

    it("groups bans by seller with the dollars lost", async () => {
      const { A1, B2, C3 } = await plugIn(T0, "A1", "B2", "C3")
      const one = await account(A1, "instagram", "one")
      const two = await account(B2, "instagram", "two")
      const three = await account(C3, "instagram", "three")
      await db.update(promoAccounts).set({ source: "bought", seller: "Seller A", priceCents: 4000 }).where(eq(promoAccounts.id, one))
      await db.update(promoAccounts).set({ source: "bought", seller: "Seller A", priceCents: 4000 }).where(eq(promoAccounts.id, two))
      await db.update(promoAccounts).set({ source: "bought", seller: "Seller B", priceCents: 1500 }).where(eq(promoAccounts.id, three))
      await ban(A1, "instagram", T0)
      await ban(C3, "instagram", days(3))
      expect(await sellerLines(userId, db)).toEqual([
        { seller: "Seller A", bought: 2, banned: 1, lostCents: 4000 },
        { seller: "Seller B", bought: 1, banned: 1, lostCents: 1500 },
      ])
      const page = await loadBans(userId, db)
      expect(page.bans.map((row) => row.seller)).toEqual(["Seller B", "Seller A"])
    })

    it("a project counts bans of the last 30 days and not one 40 days old", async () => {
      const { A1, B2, C3 } = await plugIn(T0, "A1", "B2", "C3")
      const projectId = await createProject(userId, "Shop", db)
      for (const [phone, handle] of [[A1, "a"], [B2, "b"], [C3, "c"]] as const) {
        const id = await account(phone, "reddit", handle)
        await addAccountToProject(userId, projectId, id, db)
      }
      await ban(A1, "reddit", T0)
      await ban(B2, "reddit", days(20))
      await ban(C3, "reddit", days(-10))
      expect((await projectBanCounts(userId, db, days(30))).get(projectId)).toBe(2)
    })
  })

  describe("half pace and At risk (parts 20, 21, 23 and 24)", () => {
    it("shadowbanned, let run again and a neighbour's ban each slow an account, with their own words", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const banned = await account(A1, "instagram", "banned")
      const neighbour = await account(A1, "tiktok", "neighbour")
      const elsewhere = await account(B2, "tiktok", "elsewhere")
      const fields = async (id: string) => (await db.select().from(promoAccounts).where(eq(promoAccounts.id, id)))[0]
      await ban(A1, "instagram", T0)
      expect(await slowReason(userId, await fields(neighbour), db, hours(1))).toBe("Half pace: an account on the same phone was banned")
      expect(await slowReason(userId, await fields(elsewhere), db, hours(1))).toBeNull()
      expect(await slowReason(userId, await fields(neighbour), db, days(3))).toBeNull()
      await clearBanScreen(userId, banned, db, days(3))
      // Let run on 4 Jan: half pace for 7 days, to 11 Jan.
      expect(await slowReason(userId, await fields(banned), db, days(4))).toBe("Half pace until 11 Jan")
      expect(await slowReason(userId, await fields(banned), db, days(9))).toBe("Half pace until 11 Jan")
      expect(await slowReason(userId, await fields(banned), db, days(11))).toBeNull()
      await db.update(promoAccounts).set({ shadowbanned: true }).where(eq(promoAccounts.id, elsewhere))
      expect(await slowReason(userId, await fields(elsewhere), db, days(11))).toBe("Half pace while shadowbanned")
    })

    it("each sign makes an account At risk with its own words, and Banned wins", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const shadow = await account(A1, "instagram", "shadow")
      const confirm = await account(B2, "instagram", "confirm")
      const neighbour = await account(B2, "tiktok", "next")
      await db.update(promoAccounts).set({ shadowbanned: true }).where(eq(promoAccounts.id, shadow))
      await ban(B2, "instagram", T0, "confirm")
      await clearBanScreen(userId, confirm, db, hours(1))
      const rows = await db.select().from(promoAccounts)
      const signs = await atRiskSigns(userId, rows, db, hours(2))
      expect(signs.get(shadow)).toBe("At risk: shadowbanned")
      expect(signs.get(confirm)).toBe('At risk: a "confirm it\'s you" screen on 1 Jan')
      expect(signs.get(neighbour)).toBe("At risk: an account on the same phone was banned on 1 Jan")
      // Banned wins over At risk on the list.
      await ban(A1, "instagram", hours(3))
      const listed = await listRedditAccounts(userId, { retired: false }, db, hours(4))
      expect(listed.find((row) => row.id === shadow)?.status.status).toBe("banned")
      expect(listed.find((row) => row.id === neighbour)?.status.status).toBe("at_risk")
    })
  })

  describe("throwaway first (part 22)", () => {
    async function comment(accountId: string, subreddit: string, at: Date, patch: Partial<typeof promoComments.$inferInsert> = {}) {
      const projectId = await createProject(userId, `P ${uuid().slice(0, 4)}`, db)
      const [keyword] = await db.insert(promoKeywords).values({ id: uuid(), userId, projectId, term: "x" }).returning()
      const [find] = await db
        .insert(promoFinds)
        .values({ id: uuid(), userId, keywordId: keyword.id, redditId: `t3_${uuid().slice(0, 6)}`, permalink: "/r/x/", subreddit })
        .returning()
      await db.insert(promoComments).values({ id: uuid(), userId, findId: find.id, accountId, text: "Hi.", status: "posted", postedAt: at, ...patch })
    }

    it("refuses an important account in a new subreddit until a throwaway's comment there is 24 hours old and still up", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const important = await account(A1, "reddit", "main")
      const throwaway = await account(B2, "reddit", "spare")
      await db.update(promoAccounts).set({ importance: "important" }).where(eq(promoAccounts.id, important))
      const self = { id: important, userId, importance: "important" }
      await expect(refuseImportantFirstInSubreddit(self, "tools", db, T0)).rejects.toThrow("Post from a throwaway in r/tools first.")
      await comment(throwaway, "tools", hours(-12))
      await expect(refuseImportantFirstInSubreddit(self, "tools", db, T0)).rejects.toThrow("Post from a throwaway in r/tools first.")
      await expect(refuseImportantFirstInSubreddit(self, "tools", db, hours(13))).resolves.toBeUndefined()
      // A removed comment, or a banned throwaway, does not count.
      await db.update(promoComments).set({ stillVisible: false })
      await expect(refuseImportantFirstInSubreddit(self, "tools", db, hours(13))).rejects.toThrow("first")
    })
  })

  describe("the appeal (part 25)", () => {
    it("rings on day 7 and not before, and an answer stops the reminder", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const first = await account(A1, "reddit", "first")
      const second = await account(B2, "reddit", "second")
      await ban(A1, "reddit", T0)
      await ban(B2, "reddit", T0)
      const [one] = await bansOf(first)
      const [two] = await bansOf(second)
      await markAppealed(userId, one.id, "", db, T0)
      await markAppealed(userId, two.id, "", db, T0)
      expect(await remindAppeals(db, days(6))).toBe(0)
      await answerAppeal(userId, two.id, "won", db, days(6))
      expect(await remindAppeals(db, days(7))).toBe(1)
      expect(await remindAppeals(db, days(8))).toBe(0)
      const bell = await db.select().from(customShellNotifications)
      expect(bell.some((notice) => notice.message === "No answer to u/first's appeal yet")).toBe(true)
    })
  })

  describe("the weekly look (part 26)", () => {
    it("queues a look a week after the ban; no ban screen rings and keeps the account stopped, a ban screen rings nothing", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const back = await account(A1, "instagram", "back")
      const still = await account(B2, "tiktok", "still")
      await ban(A1, "instagram", T0)
      await ban(B2, "tiktok", T0)
      await plugIn(days(7), "A1", "B2")
      expect(await queueBanLooks(db, days(6))).toBe(0)
      expect(await queueBanLooks(db, days(7))).toBe(2)
      expect(await queueBanLooks(db, days(7))).toBe(0)
      const [lookBack] = await bansOf(back)
      const [lookStill] = await bansOf(still)
      // Signed out is not coming back.
      await finishBanLook(userId, { accountId: back, banId: lookBack.id, banSeen: false, signedIn: false }, db, days(7))
      expect((await db.select().from(customShellNotifications)).some((notice) => notice.message?.startsWith("Looks back"))).toBe(false)
      await finishBanLook(userId, { accountId: back, banId: lookBack.id, banSeen: false, signedIn: true }, db, days(7))
      await finishBanLook(userId, { accountId: still, banId: lookStill.id, banSeen: true, signedIn: true }, db, days(7))
      const bell = (await db.select().from(customShellNotifications)).map((notice) => notice.message)
      expect(bell).toContain("Looks back: @back. Let it run again?")
      expect(bell.some((message) => message?.includes("@still. Let it run again"))).toBe(false)
      expect((await db.select().from(promoAccounts).where(eq(promoAccounts.id, back)))[0].banScreenAt).not.toBeNull()
    })

    it("skips retired accounts and accounts already cleaned up", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const gone = await account(A1, "reddit", "gone")
      await ban(A1, "reddit", T0)
      await cleanUpBan(userId, gone, db, hours(1))
      expect(await queueBanLooks(db, days(8))).toBe(0)
    })
  })

  describe("a suspended Reddit reading (part 8)", () => {
    it("stops the account's queued jobs and writes one ban, and the next reading writes no second", async () => {
      const profileId = await createProfile(userId, { name: "Persona" }, db)
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await db.update(promoBehaviourSettings).set({ readerProfileId: readerId }).where(eq(promoBehaviourSettings.userId, userId))
      const accountId = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await db.update(promoAccounts).set({ handle: "persona" }).where(eq(promoAccounts.id, accountId))
      await queueJob(userId, "warm_up", { accountId }, db)
      const { recordStrangerCheck } = await import("@/server/social/health")
      const commands = await import("@/server/browser/command")
      const spy = vi.spyOn(commands, "redditStrangerProfile").mockResolvedValue({ status: 404, found: false, suspended: true } as never)
      try {
        await recordStrangerCheck(userId, { accountId, handle: "persona", signedIn: { status: 200, found: true, suspended: false } }, {} as never, db, T0)
        await recordStrangerCheck(userId, { accountId, handle: "persona", signedIn: { status: 200, found: true, suspended: false } }, {} as never, db, days(1))
      } finally {
        spy.mockRestore()
      }
      const bans = await bansOf(accountId)
      expect(bans.map((row) => row.kind)).toEqual(["suspended_reading"])
      expect(await db.select().from(promoJobs).where(eq(promoJobs.status, "queued"))).toHaveLength(0)
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(row.blockedReason).toBe("Reddit reads this account as suspended")
    })
  })

  describe("after the review (3 Nov 2026)", () => {
    it("a suspension after a confirm-it's-you screen still counts toward the phone and the brake", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const first = await account(A1, "instagram", "first")
      await account(B2, "instagram", "second")
      await ban(A1, "instagram", T0, "confirm")
      expect((await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)).warnings).toEqual([])
      // The app then suspends it, while it is still stopped.
      await ban(A1, "instagram", hours(1), "suspended")
      expect((await bansOf(first)).map((row) => row.kind)).toEqual(["suspended"])
      expect((await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)).warnings).toEqual(["Banned on Instagram once."])
      await ban(B2, "instagram", hours(2))
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBe("brake")
    })

    it("a line already called harmless stops nothing, and one called a ban is a ban, before the rack has learned them", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const quiet = await account(A1, "tiktok", "quiet")
      const loud = await account(B2, "tiktok", "loud")
      await stopForBanScreen(userId, A1, { app: "tiktok", kind: "unknown", words: "Your account is in review", line: "Your account is in review" }, db, T0)
      await stopForBanScreen(userId, B2, { app: "tiktok", kind: "unknown", words: "Your account is on hold", line: "Your account is on hold" }, db, T0)
      const asked = await unknownScreens(userId, db)
      await answerScreen(userId, asked.find((row) => row.line === "Your account is in review")!.id, "harmless", db, hours(1))
      await answerScreen(userId, asked.find((row) => row.line === "Your account is on hold")!.id, "ban", db, hours(1))
      await clearBanScreen(userId, loud, db, hours(2))
      await stopForBanScreen(userId, A1, { app: "tiktok", kind: "unknown", words: "Your account is in review", line: "Your account is in review" }, db, hours(3))
      await stopForBanScreen(userId, B2, { app: "tiktok", kind: "unknown", words: "Your account is on hold", line: "Your account is on hold" }, db, hours(3))
      const [quietRow] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, quiet))
      const [loudRow] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, loud))
      expect(quietRow.banScreenAt).toBeNull()
      expect(loudRow.banScreenAt).not.toBeNull()
      expect(await bansOf(loud)).toHaveLength(2)
      expect(await unknownScreens(userId, db)).toHaveLength(0)
    })

    it("a new Instagram account reads Warming up until its warm-up ends, and Post says the day", async () => {
      await db.update(promoBehaviourSettings).set({ appWarmUpDays: 7 }).where(eq(promoBehaviourSettings.userId, userId))
      const { A1 } = await plugIn(T0, "A1")
      const id = await account(A1, "instagram", "fresh")
      await db.update(promoAccounts).set({ createdAt: T0 }).where(eq(promoAccounts.id, id))
      const status = async (at: Date) => (await listRedditAccounts(userId, { retired: false }, db, at)).find((row) => row.id === id)?.status.status
      expect(await status(days(6))).toBe("warming_up")
      expect(await status(days(7))).toBe("ready")
      const { refuseAppPostNow } = await import("@/server/social/phone-apps/posts")
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, id))
      await expect(refuseAppPostNow(userId, row, db, days(2))).rejects.toThrow("@fresh is warming up, so it only scrolls and likes for now. It may post from 8 January.")
      await expect(refuseAppPostNow(userId, row, db, days(8))).resolves.toBeUndefined()
    })

    it("Clean up keeps a shared browser profile's sign-ins", async () => {
      const profileId = await createProfile(userId, { name: "Shared" }, db)
      const reddit = await addAccount(userId, { profileId, phoneId: null, voiceId: null, platform: "reddit" }, db)
      await addAccount(userId, { profileId, phoneId: null, voiceId: null, platform: "medium" }, db)
      await db.update(promoAccounts).set({ banScreenAt: T0, handle: "shared" }).where(eq(promoAccounts.id, reddit))
      const answer = await cleanUpBan(userId, reddit, db, hours(1))
      expect(answer.words).toContain("keeps its saved sign-ins")
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "forget"))).toHaveLength(0)
    })
  })

  describe("after the audit (3 Nov 2026)", () => {
    it("one account banned again after Let it run again is one lost account, not a crackdown", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const once = await account(A1, "instagram", "once")
      await ban(A1, "instagram", T0)
      await clearBanScreen(userId, once, db, hours(1))
      await ban(A1, "instagram", hours(2))
      expect(await bansOf(once)).toHaveLength(2)
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBeNull()
      expect((await placeBanCheck(userId, { phoneId: A1, profileId: null }, "instagram", db)).warnings).toEqual(["Banned on Instagram once."])
    })

    it("an answer about an unknown screen settles every account it stopped", async () => {
      const { A1, B2 } = await plugIn(T0, "A1", "B2")
      const a = await account(A1, "instagram", "a")
      const b = await account(B2, "instagram", "b")
      const line = "Your account was restricted for 30 days"
      await stopForBanScreen(userId, A1, { app: "instagram", kind: "unknown", words: `${line} OK`, line }, db, T0)
      await stopForBanScreen(userId, B2, { app: "instagram", kind: "unknown", words: `${line} OK`, line }, db, hours(1))
      const [asked] = await unknownScreens(userId, db)
      await answerScreen(userId, asked.id, "ban", db, hours(2))
      expect(await bansOf(a)).toHaveLength(1)
      expect(await bansOf(b)).toHaveLength(1)
      // Two counted bans in a day: the brake.
      expect(await pausedBy(userId, { pausedAt: null, projectId: null, platform: "instagram" }, db)).toBe("brake")
    })

    it("Clean up runs once: a second press is refused and changes nothing", async () => {
      const { A1 } = await plugIn(T0, "A1")
      const gone = await account(A1, "reddit", "gone")
      await ban(A1, "reddit", T0)
      await cleanUpBan(userId, gone, db, hours(1))
      await expect(cleanUpBan(userId, gone, db, hours(2))).rejects.toThrow("already retired")
      expect((await accountHistory(userId, gone, db)).filter((line) => line.kind === "cleaned_up")).toHaveLength(1)
    })

    it("a suspended reading after a locked screen still counts as a ban", async () => {
      const profileId = await createProfile(userId, { name: "Persona" }, db)
      const readerId = await createProfile(userId, { name: "Reader" }, db)
      await db.update(promoBehaviourSettings).set({ readerProfileId: readerId }).where(eq(promoBehaviourSettings.userId, userId))
      const accountId = await addAccount(userId, { profileId, phoneId: null, voiceId: null }, db)
      await db.update(promoAccounts).set({ handle: "persona", banScreenAt: T0 }).where(eq(promoAccounts.id, accountId))
      await recordBan(userId, { accountId, kind: "locked", words: "Your account has been locked" }, db, T0)
      const { recordStrangerCheck } = await import("@/server/social/health")
      const commands = await import("@/server/browser/command")
      const spy = vi.spyOn(commands, "redditStrangerProfile").mockResolvedValue({ status: 404, found: false, suspended: true } as never)
      try {
        await recordStrangerCheck(userId, { accountId, handle: "persona", signedIn: { status: 200, found: true, suspended: false } }, {} as never, db, hours(3))
      } finally {
        spy.mockRestore()
      }
      expect((await bansOf(accountId)).map((row) => row.kind)).toEqual(["suspended_reading"])
    })
  })

  it("recordBan skips an account that already has an open ban", async () => {
    const { A1 } = await plugIn(T0, "A1")
    const accountId = await account(A1, "reddit", "twice")
    expect(await recordBan(userId, { accountId, kind: "suspended", words: "a" }, db, T0)).toBeTruthy()
    expect(await recordBan(userId, { accountId, kind: "suspended", words: "b" }, db, T0)).toBeNull()
    expect(await db.select().from(promoPhoneTenancies)).toHaveLength(1)
  })

  it("an Instagram post is counted in the week before a ban", async () => {
    const { A1 } = await plugIn(T0, "A1")
    const accountId = await account(A1, "instagram", "poster")
    await db.insert(promoAppPosts).values({ id: uuid(), userId, accountId, platform: "instagram", mediaUrl: "/m.jpg", mediaKind: "photo", status: "posted", postedAt: days(-2) })
    await ban(A1, "instagram", T0)
    expect((await bansOf(accountId))[0].postsWeek).toBe(1)
  })
})
