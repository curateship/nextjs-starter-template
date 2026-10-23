import type { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
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

import { FACEBOOK_PACKAGE, type PhoneActionKind } from "@/lib/dating/options"
import { DEFAULT_DATING_SETTINGS, type DatingSettings } from "@/lib/dating/settings"
import { setAccountPaused, type DatingAccount } from "@/server/dating/accounts"
import { decideSwipe, draftReply, readChatNotes, scoreCard, type AiAsk } from "@/server/dating/ai"
import { compareProfiles } from "@/server/dating/compare"
import { loadDashboard, secondLookList } from "@/server/dating/dashboard"
import { addSamples } from "@/server/dating/samples"
import { dateAccounts } from "@/server/dating/schema"
import { saveDatingSettings } from "@/server/dating/settings"
import { runDatingPass, startLoop } from "@/server/dating/worker"
import { datePhones } from "@/server/phone/schema"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { fakeCard, FakeTinder } from "@/server/tinder/fixtures/fake-tinder"
import { walkRefusal } from "@/server/tinder/limits"
import { dateMatches, dateMessages, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { createOutgoingMessage, messageHash } from "@/server/tinder/store"

import { fakeProfile, FakeFacebook } from "./fixtures/fake-facebook"

const T0 = new Date("2099-01-01T12:00:00Z")

type Asked = { system: string; text: string; images: number; label: string }

/**
 * Task "facebook/01-facebook-dating" through the background pass: a Tinder
 * and a Facebook profile sharing one phone (part 2), Facebook's pace (4),
 * waiting a day when it has nobody left (5), the check after an update (7),
 * Likes you first (9), the comment on a high-score like (10), mutual friends
 * (11), Instagram for the AI (12), the same person on two profiles (15), a
 * comment the opener answers (16), a call request (19), Pause and the break
 * (22), the comparison (23, 24) and the sample leads (8). Claude is stood in
 * for by answers the test chooses.
 */
describe("Facebook Dating in the loop", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let facebook: DatingAccount
  let tinder: DatingAccount
  let clock: Date
  let fb: FakeFacebook
  let tf: FakeTinder
  let asked: Asked[]
  let answers: Array<Record<string, unknown> | "refuse">

  const ask: AiAsk = async (question) => {
    if (question.label.endsWith("chat for notes")) {
      const next = notes.shift() ?? { newFacts: [], dateAccepted: false, acceptedLine: "", phoneNumber: "" }
      return { refused: false, value: question.schema.parse(next), inputTokens: 500, outputTokens: 20 }
    }
    asked.push({ system: question.system, text: question.text, images: question.images?.length ?? 0, label: question.label })
    const next = answers.shift()
    if (!next) throw new Error(`The test gave Claude no answer for: ${question.label}`)
    if (next === "refuse") return { refused: true, inputTokens: 1_000, outputTokens: 10 }
    return { refused: false, value: question.schema.parse(next), inputTokens: 2_000, outputTokens: 300 }
  }
  let notes: Array<Record<string, unknown>>

  /** The phone runs one app at a time: whichever was opened last gets the steps. */
  function drive(kind: PhoneActionKind, payload: Record<string, unknown>) {
    if (kind === "open-app" || kind === "close-app") front = payload.package === FACEBOOK_PACKAGE ? "facebook" : "tinder"
    return front === "facebook" ? fb.drive(kind, payload) : tf.drive(kind, payload)
  }
  let front: "tinder" | "facebook" = "tinder"

  beforeEach(async () => {
    r2.clear()
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    phoneId = uuid()
    clock = T0
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0 })
    tinder = await insertAccount(db, { userId, workspaceId, phoneId, name: "Tinder" })
    facebook = await insertAccount(db, { userId, workspaceId, phoneId, name: "Facebook", app: "facebook" })
    asked = []
    answers = []
    notes = []
    fb = new FakeFacebook({})
    tf = new FakeTinder({})
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function settings(account: DatingAccount, change: Partial<DatingSettings> = {}) {
    await saveDatingSettings(account, { ...DEFAULT_DATING_SETTINGS, lookingFor: "Someone outdoorsy who reads", ...change }, db, clock)
  }

  async function pass(step = 15_000) {
    clock = new Date(clock.getTime() + step)
    await db.update(datePhones).set({ lastSeenAt: clock }).where(eq(datePhones.id, phoneId))
    const { work } = await runDatingPass(db, clock, { drive, now: () => clock, ask })
    await Promise.all(work)
  }

  async function row(account: DatingAccount) {
    return (await db.select().from(dateAccounts).where(eq(dateAccounts.id, account.id)))[0]
  }

  async function fresh(account: DatingAccount) {
    return row(account)
  }

  const goodCard = { score: 82, read: ["A climber who bakes.", "Loves the outdoors, which you asked for.", "Nothing that clashes."], flags: [], dealbreakers: [] }

  describe("part 2, Tinder and Facebook on one phone", () => {
    it("runs each profile in its own hours, one app at a time", async () => {
      tf = new FakeTinder({ cards: [fakeCard("Maya")], chats: [] })
      fb = new FakeFacebook({ profiles: [fakeProfile("Ines")] })
      await settings(tinder, { scheduleStart: 19, scheduleEnd: 21 })
      await settings(facebook, { scheduleStart: 21, scheduleEnd: 23 })
      clock = new Date(Date.UTC(2099, 0, 1, 19, 0) - 15_000)
      await pass()
      expect((await row(tinder)).running).toBe(true)
      expect((await row(facebook)).running).toBe(false)
      for (let passes = 0; passes < 4; passes += 1) await pass()
      expect(fb.steps).toHaveLength(0)

      clock = new Date(Date.UTC(2099, 0, 1, 21, 0) - 15_000)
      answers.push(goodCard)
      for (let passes = 0; passes < 6; passes += 1) await pass()
      expect((await row(tinder)).running).toBe(false)
      expect((await row(facebook)).running).toBe(true)
      expect(fb.steps.some((step) => step.kind === "open-app")).toBe(true)
      const walks = await db.select().from(dateWalks).where(eq(dateWalks.accountId, facebook.id)).orderBy(asc(dateWalks.createdAt))
      expect(walks.map((walk) => walk.kind)).toContain("read-card")
    })

    it("never has the schedule start a profile while another on the phone swipes", async () => {
      tf = new FakeTinder({ cards: [fakeCard("Maya")], chats: [] })
      fb = new FakeFacebook({ profiles: [fakeProfile("Ines")] })
      await settings(tinder)
      await settings(facebook, { scheduleStart: 21, scheduleEnd: 23 })
      // Tinder started by hand at 20:00, outside any window, so the schedule leaves it running.
      clock = new Date(Date.UTC(2099, 0, 1, 20, 0))
      await startLoop(await fresh(tinder), db, clock)
      clock = new Date(Date.UTC(2099, 0, 1, 21, 0) - 15_000)
      for (let passes = 0; passes < 3; passes += 1) await pass()
      expect((await row(tinder)).running).toBe(true)
      expect((await row(facebook)).running).toBe(false)
    })

    it("keeps one profile's stop screen its own, and refuses Start while the other swipes", async () => {
      fb = new FakeFacebook({ checkpoint: true })
      tf = new FakeTinder({ cards: [fakeCard("Maya")], chats: [] })
      await settings(tinder)
      await settings(facebook)
      await startLoop(facebook, db, clock)
      await expect(startLoop(tinder, db, clock)).rejects.toThrow("Facebook Dating (Facebook) is swiping on Pixel 8a now. Stop it first; the phone runs one app at a time.")
      for (let passes = 0; passes < 4; passes += 1) await pass()
      expect(await row(facebook)).toMatchObject({ stoppedReason: "verification", running: false })
      expect((await row(tinder)).stoppedReason).toBeNull()
      await startLoop(await fresh(tinder), db, clock)
      expect((await row(tinder)).running).toBe(true)
    })
  })

  describe("part 4, Facebook's pace", () => {
    it("allows 50 swipes a day and 20 an hour on Facebook whatever the settings say, 8 to 20 seconds apart", async () => {
      const owner = { accountId: facebook.id, app: "facebook" as const, timeZone: "UTC" }
      const open = { ...DEFAULT_DATING_SETTINGS, quietStart: 0, quietEnd: 0 }
      for (let index = 0; index < 20; index += 1) {
        await db.insert(dateProfiles).values({ id: uuid(), accountId: facebook.id, userId, workspaceId, phoneId, name: `Hour${index}`, swipe: "pass", swipedBy: "ai", swipedAt: new Date(T0.getTime() - (index + 1) * 60_000) })
      }
      expect(await walkRefusal(owner, "like", open, db, T0)).toMatchObject({ limit: "swipes", words: expect.stringMatching(/^20 swipes in the last hour/) })
      // Tinder's own profile on the same phone counts its own swipes.
      expect(await walkRefusal({ ...owner, accountId: tinder.id, app: "tinder" }, "like", open, db, T0)).toBeNull()
      for (let index = 0; index < 30; index += 1) {
        await db.insert(dateProfiles).values({ id: uuid(), accountId: facebook.id, userId, workspaceId, phoneId, name: `Day${index}`, swipe: "pass", swipedBy: "ai", swipedAt: new Date(Date.UTC(2099, 0, 1, 1) + index * 60_000) })
      }
      expect(await walkRefusal(owner, "like", open, db, new Date(T0.getTime() + 2 * 3_600_000))).toMatchObject({ limit: "day", words: expect.stringMatching(/^50 swipes today/) })
      // Five seconds after a swipe is too soon on Facebook.
      const [latest] = await db.insert(dateProfiles).values({ id: uuid(), accountId: tinder.id, userId, workspaceId, phoneId, name: "Gap", swipe: "pass", swipedBy: "ai", swipedAt: T0 }).returning()
      expect(latest).toBeDefined()
      const soon = await walkRefusal({ accountId: tinder.id, app: "facebook", timeZone: "UTC" }, "like", open, db, new Date(T0.getTime() + 5_000))
      expect(soon).toMatchObject({ limit: "gap", words: expect.stringMatching(/^Swipes are kept 8 to 20 seconds apart/) })
    })

    it("starts a new Facebook profile at Facebook's pace", async () => {
      const { createAccount } = await import("@/server/dating/accounts")
      await settings(tinder, { swipesPerDay: 150, swipesPerHour: 60 })
      const made = await createAccount(tinder, { name: "Second Facebook", app: "facebook" }, db, clock)
      const { readDatingSettings } = await import("@/server/dating/settings")
      expect(await readDatingSettings(made.id, db)).toMatchObject({ swipesPerDay: 50, swipesPerHour: 20 })
    })
  })

  describe("part 5, out of suggestions", () => {
    it("ends the loop until after midnight on the phone's clock, without a stop screen", async () => {
      fb = new FakeFacebook({ profiles: [] })
      await settings(facebook)
      await startLoop(facebook, db, clock)
      for (let passes = 0; passes < 6; passes += 1) await pass()
      const stopped = await row(facebook)
      expect(stopped).toMatchObject({ running: false, stoppedReason: null })
      expect(stopped.stopWhy).toMatch(/^Facebook Dating has nobody more to suggest today/)
      expect(stopped.resumeAt?.toISOString()).toBe("2099-01-02T00:00:00.000Z")
    })
  })

  describe("part 7, a new Facebook version", () => {
    it("checks the buttons before the profile swipes again, then marks the version checked", async () => {
      fb = new FakeFacebook({ profiles: [fakeProfile("Ines")] })
      await settings(facebook)
      await db.update(datePhones).set({ facebookVersion: "541.0", facebookVersionChecked: "540.0" }).where(eq(datePhones.id, phoneId))
      await startLoop(facebook, db, clock)
      await pass()
      const walks = await db.select().from(dateWalks).where(eq(dateWalks.accountId, facebook.id)).orderBy(asc(dateWalks.createdAt))
      expect(walks[0]).toMatchObject({ kind: "check-labels", status: "done" })
      expect((await db.select().from(datePhones))[0].facebookVersionChecked).toBe("541.0")
      // Tinder's version did not change, so Tinder is not checked.
      expect((await db.select().from(dateWalks).where(eq(dateWalks.accountId, tinder.id))).map((walk) => walk.kind)).not.toContain("check-labels")
    })
  })

  describe("part 9, Likes you first", () => {
    it("reads and likes back the people on Likes you before the suggested profiles", async () => {
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")], likers: [fakeProfile("Ines")] })
      await settings(facebook)
      await startLoop(facebook, db, clock)
      answers.push(goodCard)
      for (let passes = 0; passes < 10 && !fb.liked.length; passes += 1) await pass()
      expect(fb.liked.map((like) => like.name)).toEqual(["Ines"])
      const reads = (await db.select().from(dateWalks).where(eq(dateWalks.kind, "read-card")).orderBy(asc(dateWalks.createdAt))).map((walk) => walk.input)
      expect(reads[0]).toEqual({ likesYou: true })
      expect(await db.select().from(dateMatches)).toHaveLength(1)
    })
  })

  describe("part 10, the comment on a high-score like", () => {
    it("has the AI write the comment first and sends it with the like", async () => {
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")] })
      await settings(facebook, { likeAbove: 70 })
      await startLoop(facebook, db, clock)
      answers.push({ ...goodCard, score: 85 })
      answers.push({ kind: "draft", text: "Which bakery is first on the crawl?", question: "", flag: "none", proposesDate: false, openerStyle: "prompt_question", about: "Bakery crawl, then a long walk by the lake" })
      for (let passes = 0; passes < 12 && !fb.liked.length; passes += 1) await pass()
      expect(fb.liked).toEqual([{ name: "Maya", comment: "Which bakery is first on the crawl?", on: "answer" }])
      expect(asked[1].label).toBe("Writing the comment for Maya's like")
      expect(asked[1].system).toContain("Facebook Dating conversation")
    })

    it("likes a card under 10 over the line with no comment and no extra AI call", async () => {
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")] })
      await settings(facebook, { likeAbove: 70 })
      await startLoop(facebook, db, clock)
      // 74 is close to the line, so Opus looks a second time: two answers, and no third for a comment.
      answers.push({ ...goodCard, score: 74 }, { ...goodCard, score: 74 })
      for (let passes = 0; passes < 10 && !fb.liked.length; passes += 1) await pass()
      expect(fb.liked).toEqual([{ name: "Maya", comment: "", on: "" }])
      expect(asked.map((question) => question.label)).toEqual(["Reading Maya's card", "Reading Maya's card"])
    })
  })

  describe("parts 11 and 12, mutual friends and Instagram", () => {
    it("passes a card with 3 mutual friends whatever its score, and gives the AI the Instagram pictures", async () => {
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya", { mutualFriends: 3 })] })
      await settings(facebook)
      await startLoop(facebook, db, clock)
      answers.push({ ...goodCard, score: 90 })
      for (let passes = 0; passes < 10 && !fb.passedNow.length; passes += 1) await pass()
      expect(fb.passedNow).toEqual(["Maya"])
      const [card] = await db.select().from(dateProfiles)
      expect(card.aiFlags).toContain("mutual_friends")
      expect(asked[0].images).toBe(5)
      expect(asked[0].text).toContain("the last 2 are from their Instagram")
    })
  })

  describe("part 15, the same person on two profiles", () => {
    it("passes someone passed on Tinder, and leaves someone matched there to the member", async () => {
      // Learn the look of Maya's first photo on Facebook.
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")] })
      const { claimNextWalk, queueWalk, runWalk } = await import("@/server/tinder/jobs")
      await queueWalk({ userId, accountId: facebook.id, phoneId, kind: "read-card", askedBy: "member" }, db, clock)
      await runWalk((await claimNextWalk(phoneId, db, clock))!, db, { drive, now: () => clock })
      const [learned] = await db.select().from(dateProfiles)
      await db.delete(dateProfiles)
      const tinderMaya = uuid()
      await db.insert(dateProfiles).values({ id: tinderMaya, accountId: tinder.id, userId, workspaceId, phoneId, name: "Maya", age: 29, faceHash: learned.faceHash, swipe: "pass", swipedBy: "member", swipedAt: T0, aiScore: 30, aiReadAt: T0 })

      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")] })
      await settings(facebook)
      await startLoop(facebook, db, clock)
      answers.push({ ...goodCard, score: 90 })
      for (let passes = 0; passes < 10 && !fb.passedNow.length; passes += 1) await pass()
      expect(fb.passedNow).toEqual(["Maya"])
      const facebookMaya = (await db.select().from(dateProfiles).where(eq(dateProfiles.accountId, facebook.id)))[0]
      expect(facebookMaya).toMatchObject({ seenOnAccountId: tinder.id, seenOnOutcome: "passed" })
      expect(facebookMaya.aiFlags).toContain("passed_elsewhere")

      // Matched on Tinder instead: the loop waits on the member.
      await db.delete(dateProfiles).where(eq(dateProfiles.accountId, facebook.id))
      await db.insert(dateMatches).values({ id: uuid(), accountId: tinder.id, userId, workspaceId, phoneId, profileId: tinderMaya, theirName: "Maya" })
      fb = new FakeFacebook({ profiles: [fakeProfile("Maya")] })
      await db.update(dateAccounts).set({ runningSince: clock }).where(eq(dateAccounts.id, facebook.id))
      answers.push({ ...goodCard, score: 90 })
      for (let passes = 0; passes < 8; passes += 1) await pass()
      expect(fb.liked).toEqual([])
      expect(fb.passedNow).toEqual([])
      const waiting = (await db.select().from(dateProfiles).where(eq(dateProfiles.accountId, facebook.id)))[0]
      expect(waiting).toMatchObject({ seenOnOutcome: "matched", swipe: "none" })
      const dashboard = await loadDashboard(await fresh(facebook), db, clock)
      expect(dashboard.leads.find((lead) => lead.name === "Maya")?.waiting).toBe("decide")
    })
  })

  describe("parts 16 and 19, chats", () => {
    async function chat(card: Partial<typeof dateProfiles.$inferInsert>, messages: Array<["in" | "out", string]>) {
      const profileId = uuid()
      await db.insert(dateProfiles).values({ id: profileId, accountId: facebook.id, userId, workspaceId, phoneId, name: "Ines", age: 29, swipe: "like", ...card })
      const matchId = uuid()
      await db.insert(dateMatches).values({ id: matchId, accountId: facebook.id, userId, workspaceId, phoneId, profileId, theirName: "Ines", messagesFromThem: messages.filter(([way]) => way === "in").length })
      for (const [index, [direction, text]] of messages.entries()) {
        await db.insert(dateMessages).values({ id: uuid(), userId, matchId, direction, sentBy: direction === "in" ? "them" : "member", text, hash: messageHash(text), position: index + 1, sentAt: T0, createdAt: T0 })
      }
      return matchId
    }

    it("writes the first message as an answer to the comment they sent with their like", async () => {
      await settings(facebook)
      const matchId = await chat({ source: "likes_you", theirComment: "Love the dog", theirCommentOn: "photo", bio: "Dog person, early riser." }, [])
      answers.push({ kind: "draft", text: "He'd love you too. What's yours called?", question: "", flag: "none", proposesDate: false, openerStyle: "photo_comment" })
      await draftReply(matchId, db, clock, { ask }, { mode: "opener" })
      expect(asked[0].text).toContain('When they liked the member, they wrote: "Love the dog". A first message answers that.')
      expect(asked[0].text).toContain("Their profile, as read off Facebook Dating")
    })

    it("flags a call request with no draft, and lets the AI draft again once the member writes", async () => {
      await settings(facebook)
      const matchId = await chat({}, [["in", "Want to FaceTime tonight?"]])
      notes.push({ newFacts: [], dateAccepted: false, acceptedLine: "", phoneNumber: "", askedForCall: true })
      await readChatNotes(matchId, db, clock, { ask })
      expect((await db.select().from(dateMatches))[0]).toMatchObject({ flaggedReason: "asked_for_call", draft: "" })
      expect(await draftReply(matchId, db, clock, { ask })).toMatchObject({ status: "skipped" })
      await createOutgoingMessage(matchId, "Sure, 8pm works", "member", { proposesDate: false }, db, clock)
      expect((await db.select().from(dateMatches))[0].flaggedReason).toBeNull()
    })

    it("leaves the AI's question to the member in place when a call ask comes", async () => {
      await settings(facebook)
      const matchId = await chat({}, [["in", "Where do you work? Also want to FaceTime?"]])
      await db.update(dateMatches).set({ flaggedReason: "missing_fact", askQuestion: "Where do you work?" }).where(eq(dateMatches.id, matchId))
      notes.push({ newFacts: [], dateAccepted: false, acceptedLine: "", phoneNumber: "", askedForCall: true })
      await readChatNotes(matchId, db, clock, { ask })
      expect((await db.select().from(dateMatches))[0]).toMatchObject({ flaggedReason: "missing_fact", askQuestion: "Where do you work?" })
    })
  })

  describe("part 22, Pause and Facebook's break", () => {
    it("asks the phone to turn the break on at Pause and off at Resume, and never on Tinder", async () => {
      await setAccountPaused(facebook, true, db, clock)
      await setAccountPaused(await fresh(facebook), false, db, clock)
      await setAccountPaused(tinder, true, db, clock)
      const walks = await db.select().from(dateWalks).orderBy(asc(dateWalks.createdAt))
      expect(walks.map((walk) => [walk.accountId === facebook.id ? "facebook" : "tinder", walk.kind, walk.input])).toEqual([
        ["facebook", "set-break", { on: true }],
        ["facebook", "set-break", { on: false }],
      ])
    })
  })

  describe("parts 23 and 24, compare the apps", () => {
    async function likes(account: DatingAccount, count: number, matched: number) {
      for (let index = 0; index < count; index += 1) {
        const id = uuid()
        await db.insert(dateProfiles).values({ id, accountId: account.id, userId, workspaceId, phoneId, name: `P${index}`, swipe: "like", swipedBy: "ai", swipedAt: T0 })
        if (index < matched) await db.insert(dateMatches).values({ id: uuid(), accountId: account.id, userId, workspaceId, phoneId, profileId: id, theirName: `P${index}`, matchedAt: T0 })
      }
    }

    it("puts the profiles side by side and suggests moving hours only with enough likes and a clear difference", async () => {
      await likes(tinder, 100, 4)
      await likes(facebook, 100, 9)
      const compare = await compareProfiles(userId, workspaceId, db, clock)
      // Both profiles were made in the same moment, so their order is not the point.
      expect(compare.rows.map((item) => [item.app, item.likes, item.matches, item.perHundred]).sort()).toEqual([
        ["facebook", 100, 9, 9],
        ["tinder", 100, 4, 4],
      ])
      expect(compare.words).toBe("Facebook Dating (Facebook) made 9 matches out of 100 likes this month, Tinder (Tinder) 4. Give Facebook Dating (Facebook) more hours?")
      await db.delete(dateMatches)
      await db.delete(dateProfiles)
      await likes(tinder, 30, 2)
      await likes(facebook, 30, 5)
      expect((await compareProfiles(userId, workspaceId, db, clock)).moveHours).toBeNull()
    })
  })

  describe("part 8, Facebook's sample leads", () => {
    it("adds a Likes you lead with a comment, a Second Look card, the weekly match, a call request, a scam and a lead to decide", async () => {
      await settings(facebook)
      await addSamples(facebook, db, clock)
      const cards = await db.select().from(dateProfiles).where(eq(dateProfiles.accountId, facebook.id))
      expect(cards.find((card) => card.name === "Mila")).toMatchObject({ source: "likes_you", theirComment: "Okay but which bakery is the best one?" })
      expect(cards.find((card) => card.name === "Tess")).toMatchObject({ source: "weekly" })
      expect(cards.find((card) => card.name === "Zoe")).toMatchObject({ mutualFriends: 2, sharedGroups: ["Toronto Climbers"] })
      expect(cards.find((card) => card.name === "Ruth")).toMatchObject({ seenOnOutcome: "matched", seenOnAccountId: tinder.id })
      expect((await secondLookList(facebook.id, 70, db, clock)).map((card) => card.name)).toEqual(["Lena"])
      // A near miss that a rule passes, here 3 mutual friends, is never offered.
      await db.update(dateProfiles).set({ aiFlags: ["mutual_friends"] }).where(eq(dateProfiles.name, "Lena"))
      expect(await secondLookList(facebook.id, 70, db, clock)).toEqual([])
      const dashboard = await loadDashboard(await fresh(facebook), db, clock)
      expect(dashboard.leads.find((lead) => lead.name === "Ruth")?.waiting).toBe("decide")
      expect(dashboard.leads.find((lead) => lead.name === "Rosa")?.waiting).toBe("flag")
      const matches = await db.select().from(dateMatches).where(eq(dateMatches.accountId, facebook.id))
      expect(matches.find((match) => match.theirName === "Vera")?.flaggedReason).toBe("scam")
      const photo = await db.select().from(dateMessages).where(eq(dateMessages.kind, "photo"))
      expect(photo).toHaveLength(1)
      // Tinder's samples have none of Facebook's extras.
      await addSamples(tinder, db, clock)
      expect((await db.select().from(dateProfiles).where(eq(dateProfiles.accountId, tinder.id))).map((card) => card.name)).not.toContain("Mila")
    })
  })

  describe("the AI's card read", () => {
    it("decides pass on the flags that always pass", () => {
      expect(decideSwipe({ aiScore: 99, aiFlags: ["mutual_friends"] }, { likeAbove: 70 })).toBe("pass")
      expect(decideSwipe({ aiScore: 99, aiFlags: ["passed_elsewhere"] }, { likeAbove: 70 })).toBe("pass")
      expect(decideSwipe({ aiScore: 71, aiFlags: [] }, { likeAbove: 70 })).toBe("like")
    })

    it("names Facebook Dating to the AI when it reads a Facebook card", async () => {
      await settings(facebook)
      const id = uuid()
      await db.insert(dateProfiles).values({ id, accountId: facebook.id, userId, workspaceId, phoneId, name: "Maya", age: 29, bio: "Climbing.", texts: ["Climbing."] })
      answers.push(goodCard)
      await scoreCard(id, db, clock, { ask })
      expect(asked[0].system).toContain("You read one Facebook Dating profile")
    })
  })
})
