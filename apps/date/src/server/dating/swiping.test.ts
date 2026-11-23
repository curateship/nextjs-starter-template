import type { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import sharp from "sharp"
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

import type { DatingAccount } from "@/server/dating/accounts"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { DEFAULT_DATING_SETTINGS, parseKnownPeople, type DatingSettings } from "@/lib/dating/settings"
import { keepPicture } from "@/server/phone/pictures"
import { datePhones, datePictures } from "@/server/phone/schema"
import { customShellAiUsageEvents } from "@/server/schema"
import { fakeCard, FakeTinder, type FakeTinderSetup } from "@/server/tinder/fixtures/fake-tinder"
import { walkRefusal } from "@/server/tinder/limits"
import { dateMatches, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { dateAccounts } from "@/server/dating/schema"

import { scoreCard, type AiAsk } from "./ai"
import { scoreBands } from "./dashboard"
import { forgetPassedPhotos } from "./forget-photos"
import { DATING_MODEL, FIRST_LOOK_MODEL } from "./model"
import { saveDatingSettings } from "./settings"
import { dollarsEach, monthMatchCost } from "./spend"
import { runDatingPass, startLoop, stopLoopByHand } from "./worker"

/** Midday on a Thursday in 2099, on a phone set to UTC. */
const T0 = new Date("2099-01-01T12:00:00Z")
const DAY_MS = 86_400_000

type Asked = { model: string; text: string; label: string }

/**
 * Task "features/02-swiping-and-scoring", all ten parts: run through the
 * worker exactly as the background pass runs it, with Claude stood in for by
 * answers the test chooses and the pretend Tinder standing in for the phone.
 */
describe("swiping and scoring", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let fake: FakeTinder
  let asked: Asked[]
  /** The score each model gives, by card name. A name missing for a model fails the test. */
  let scores: Record<string, Partial<Record<string, number>>>

  const ask: AiAsk = async (question) => {
    if (question.label.endsWith("chat for notes")) {
      return { refused: false, value: question.schema.parse({ newFacts: [], dateAccepted: false, acceptedLine: "", phoneNumber: "" }), inputTokens: 500, outputTokens: 20 }
    }
    asked.push({ model: question.model, text: question.text, label: question.label })
    const name = /^Reading (.+)'s card$/.exec(question.label)?.[1] ?? ""
    const score = scores[name]?.[question.model]
    if (score === undefined) throw new Error(`The test gave ${question.model} no score for ${name}.`)
    return {
      refused: false,
      value: question.schema.parse({ score, read: [`${name} reads well.`, "Outdoorsy.", "Nothing clashes."], flags: [], dealbreakers: [] }),
      inputTokens: 2_000,
      outputTokens: 300,
    }
  }

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
    account = await insertAccount(db, { userId, workspaceId, phoneId })
    asked = []
    scores = {}
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function settings(change: Partial<DatingSettings> = {}) {
    await saveDatingSettings(account, { ...DEFAULT_DATING_SETTINGS, lookingFor: "Someone outdoorsy who reads", ...change }, db, clock)
  }

  /** One pass of the background loop, 15 seconds after the last, waiting for everything it started. */
  async function pass() {
    clock = new Date(clock.getTime() + 15_000)
    await db.update(datePhones).set({ lastSeenAt: clock }).where(eq(datePhones.id, phoneId))
    const { work } = await runDatingPass(db, clock, { drive: fake.drive, now: () => clock, ask })
    await Promise.all(work)
  }

  function phone(setup: FakeTinderSetup) {
    fake = new FakeTinder(setup)
  }

  async function card(overrides: Partial<typeof dateProfiles.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(dateProfiles).values({ id, userId, workspaceId, accountId: account.id, phoneId, name: "Maya", age: 27, bio: "Climbing.", texts: [], photoIds: [], ...overrides })
    return id
  }

  /** The profile's row, which holds the loop's state since part 2 of "facebook/01". */
  async function phoneRow() {
    return (await db.select().from(dateAccounts).where(eq(dateAccounts.id, account.id)))[0]
  }

  describe("part 1, learning from the member's swipes", () => {
    it("shows the AI the member's last 10 overruled cards, and none the AI swiped", async () => {
      await settings()
      // Twelve cards the member swiped against the score, a minute apart: the newest ten count.
      for (let index = 0; index < 12; index += 1) {
        const liked = index % 2 === 0
        await card({
          name: `Over${index}`,
          aiScore: liked ? 40 : 90,
          aiRead: [`Overruled card ${index}.`],
          aiReadAt: T0,
          swipe: liked ? "like" : "pass",
          swipedBy: "member",
          swipedAt: new Date(T0.getTime() - (12 - index) * 60_000),
        })
      }
      // The AI's own swipes, and a member swipe that agreed with the score, are not examples.
      await card({ name: "AiSwiped", aiScore: 20, aiRead: ["Swiped by the AI."], aiReadAt: T0, swipe: "like", swipedBy: "ai", swipedAt: T0 })
      await card({ name: "Agreed", aiScore: 85, aiRead: ["The member agreed."], aiReadAt: T0, swipe: "like", swipedBy: "member", swipedAt: T0 })
      const id = await card({ name: "Noor" })
      scores.Noor = { [FIRST_LOOK_MODEL]: 30 }

      await scoreCard(id, db, clock, { ask })
      const prompt = asked[0].text
      for (let index = 2; index < 12; index += 1) expect(prompt).toContain(`Overruled card ${index}.`)
      expect(prompt).not.toContain("Overruled card 0.")
      expect(prompt).not.toContain("Overruled card 1.")
      expect(prompt).not.toContain("Swiped by the AI.")
      expect(prompt).not.toContain("The member agreed.")
      expect(prompt).toContain("- Scored 40, the member liked it. Overruled card 10.")
      expect(prompt).toContain("- Scored 90, the member passed it. Overruled card 11.")
    })
  })

  describe("part 2, the swiping schedule", () => {
    async function at(hour: number, minute = 0) {
      clock = new Date(Date.UTC(2099, 0, 1, hour, minute) - 15_000)
      await pass()
    }

    it("starts at 19:00 on the phone's clock and stops at 22:00", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      await at(18, 59)
      expect((await phoneRow()).running).toBe(false)
      await at(19)
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "schedule" })
      await at(22)
      const stopped = await phoneRow()
      expect(stopped.running).toBe(false)
      expect(stopped.stopWhy).toBe("Schedule: swiping ends at 22:00 on the phone's clock, and starts again at 19:00.")
    })

    it("never starts a phone stopped on out of likes", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      await db.update(dateAccounts).set({ stoppedReason: "out_of_likes", stoppedAt: T0 }).where(eq(dateAccounts.id, account.id))
      await at(19)
      await at(20)
      expect(await phoneRow()).toMatchObject({ running: false, stoppedReason: "out_of_likes" })
    })

    it("holds after Stop inside the window until the next day", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      await at(19)
      await stopLoopByHand(account, db, clock)
      await at(20)
      expect((await phoneRow()).running).toBe(false)
      // The next evening it starts again.
      clock = new Date(Date.UTC(2099, 0, 2, 19, 0) - 15_000)
      await pass()
      expect((await phoneRow()).running).toBe(true)
    })

    it("starts again inside the window once an hourly limit allows it", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 23 })
      await at(19)
      // What the loop does when the hour's swipes run out: it stops and says when the next is allowed.
      await db
        .update(dateAccounts)
        .set({ running: false, stopWhy: "60 swipes in the last hour, the most allowed.", resumeAt: new Date(Date.UTC(2099, 0, 1, 20, 30)) })
        .where(eq(dateAccounts.id, account.id))
      await at(20)
      expect((await phoneRow()).running).toBe(false)
      await at(20, 31)
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "schedule" })
    })

    it("stops at 22:00 a loop the member started by hand inside the window", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      clock = new Date(Date.UTC(2099, 0, 1, 20, 0))
      await startLoop(account, db, clock)
      await at(21)
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "member" })
      await at(22)
      expect((await phoneRow()).running).toBe(false)
    })

    it("starts again once a phone that went away is back inside the window", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      await at(19)
      // Three minutes in a pocket with no signal.
      clock = new Date(Date.UTC(2099, 0, 1, 19, 5))
      const { work } = await runDatingPass(db, clock, { drive: fake.drive, now: () => clock, ask })
      await Promise.all(work)
      expect((await phoneRow()).running).toBe(false)
      await pass()
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "schedule" })
    })

    it("starts on a phone whose time zone the server does not know, counting it as UTC", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      await db.update(datePhones).set({ timeZone: "Not/A_Zone" }).where(eq(datePhones.id, phoneId))
      await at(19)
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "schedule", scheduleDay: "2099-01-01" })
    })

    it("leaves a loop the member started by hand outside the window alone", async () => {
      phone({ cards: [], chats: [] })
      await settings({ scheduleStart: 19, scheduleEnd: 22 })
      clock = new Date(Date.UTC(2099, 0, 1, 23, 0))
      await startLoop(account, db, clock)
      await pass()
      expect(await phoneRow()).toMatchObject({ running: true, startedBy: "member" })
    })
  })

  describe("part 3, Super Likes", () => {
    it("Super Likes the first 97 of the day and likes the second", async () => {
      phone({ cards: [fakeCard("Ines"), fakeCard("Clara")], chats: [], superLikesLeft: 5 })
      await settings()
      scores.Ines = { [FIRST_LOOK_MODEL]: 97 }
      scores.Clara = { [FIRST_LOOK_MODEL]: 97 }
      await startLoop(account, db, clock)
      for (let passes = 0; passes < 12 && fake.liked.length + fake.superLiked.length < 2; passes += 1) await pass()
      expect(fake.superLiked).toEqual(["Ines"])
      expect(fake.liked).toEqual(["Clara"])
      const cards = await db.select().from(dateProfiles).orderBy(asc(dateProfiles.readAt))
      expect(cards.map((row) => [row.name, row.swipe])).toEqual([
        ["Ines", "super"],
        ["Clara", "like"],
      ])
    })

    it("likes the card when Tinder offers to sell more Super Likes, and buys nothing", async () => {
      phone({ cards: [fakeCard("Ines"), fakeCard("Clara")], chats: [], superLikesLeft: 0 })
      await settings()
      scores.Ines = { [FIRST_LOOK_MODEL]: 97 }
      scores.Clara = { [FIRST_LOOK_MODEL]: 97 }
      await startLoop(account, db, clock)
      for (let passes = 0; passes < 12 && fake.liked.length < 2; passes += 1) await pass()
      expect(fake.bought).toEqual([])
      expect(fake.superLiked).toEqual([])
      expect(fake.liked).toEqual(["Ines", "Clara"])
      const [ines] = await db.select().from(dateProfiles).where(eq(dateProfiles.name, "Ines"))
      expect(ines.swipe).toBe("like")
      // One try a day: Clara went straight to a plain like, without meeting the offer again.
      const walks = await db.select().from(dateWalks).orderBy(asc(dateWalks.createdAt))
      expect(walks.filter((walk) => walk.kind === "super-like").map((walk) => walk.result?.superLikesGone)).toEqual([true])
    })
  })

  describe("part 4, Tinder's own filters", () => {
    it("sets 25 km and ages 28 to 36 on Tinder, reads them back, and goes back to the cards", async () => {
      phone({ cards: [fakeCard("Maya")], chats: [], discovery: { distance: 80, unit: "km", ageMin: 18, ageMax: 50 } })
      await settings({ maxDistanceKm: 25, ageMin: 28, ageMax: 36 })
      await db.update(dateAccounts).set({ discoveryOwed: true }).where(eq(dateAccounts.id, account.id))
      await pass()
      await pass()
      expect(fake.discovery).toEqual({ distance: 25, unit: "km", ageMin: 28, ageMax: 36 })
      const [walk] = await db.select().from(dateWalks).where(eq(dateWalks.kind, "set-discovery"))
      expect(walk).toMatchObject({ status: "done", result: { distance: "25 km", distanceKm: 25, ageMin: 28, ageMax: 36 } })
      expect(fake.screen).toBe("discover")
      expect((await phoneRow()).discoveryOwed).toBe(false)
      // Set once: later passes do not open Tinder's settings again.
      await pass()
      expect(await db.select().from(dateWalks).where(eq(dateWalks.kind, "set-discovery"))).toHaveLength(1)
    })

    it("sets the distance in miles when Tinder counts in miles", async () => {
      phone({ cards: [], chats: [], discovery: { distance: 50, unit: "mi", ageMin: 30, ageMax: 40 } })
      await settings({ maxDistanceKm: 25, ageMin: 45, ageMax: 50 })
      await db.update(dateAccounts).set({ discoveryOwed: true }).where(eq(dateAccounts.id, account.id))
      await pass()
      await pass()
      // 25 km is 16 miles; the new youngest is above the old oldest, so the top thumb moves first.
      expect(fake.discovery).toEqual({ distance: 16, unit: "mi", ageMin: 45, ageMax: 50 })
    })
  })

  describe("part 5, the cheaper first look", () => {
    it("passes a Sonnet 40 with one call", async () => {
      await settings()
      const id = await card({ name: "Hana" })
      scores.Hana = { [FIRST_LOOK_MODEL]: 40 }
      await scoreCard(id, db, clock, { ask })
      expect(asked.map((question) => question.model)).toEqual([FIRST_LOOK_MODEL])
      expect((await db.select().from(dateProfiles))[0]).toMatchObject({ aiScore: 40, aiModel: FIRST_LOOK_MODEL })
    })

    it("sends a Sonnet 74 to Opus, whose 66 makes it a pass, and counts both calls", async () => {
      await settings()
      const id = await card({ name: "Sofia" })
      scores.Sofia = { [FIRST_LOOK_MODEL]: 74, [DATING_MODEL]: 66 }
      await scoreCard(id, db, clock, { ask })
      expect(asked.map((question) => question.model)).toEqual([FIRST_LOOK_MODEL, DATING_MODEL])
      expect((await db.select().from(dateProfiles))[0]).toMatchObject({ aiScore: 66, aiModel: DATING_MODEL })
      const meter = await db.select().from(customShellAiUsageEvents)
      expect(meter.map((row) => row.model).sort()).toEqual([DATING_MODEL, FIRST_LOOK_MODEL].sort())
    })
  })

  describe("part 6, the daily swipe limit", () => {
    it("refuses the 151st swipe of the day, saying when it is allowed again", async () => {
      await settings()
      // 150 swipes since midnight, none in the last hour, so only the daily limit is in the way.
      for (let index = 0; index < 150; index += 1) {
        await card({ name: `Day${index}`, swipe: "pass", swipedBy: "ai", swipedAt: new Date(Date.UTC(2099, 0, 1, 1) + index * 60_000) })
      }
      const [row] = await db.select().from(datePhones)
      const owner = { accountId: account.id, app: account.app, timeZone: row.timeZone }
      const refusal = await walkRefusal(owner, "like", { ...DEFAULT_DATING_SETTINGS, quietStart: 0, quietEnd: 0 }, db, clock)
      expect(refusal).toMatchObject({ limit: "day", words: "150 swipes today, the most allowed. Allowed again at 00:00." })
      expect(refusal?.until.toISOString()).toBe("2099-01-02T00:00:00.000Z")
      // Yesterday's swipes do not count.
      expect(await walkRefusal(owner, "like", { ...DEFAULT_DATING_SETTINGS, quietStart: 0, quietEnd: 0 }, db, new Date("2099-01-02T12:00:00Z"))).toBeNull()
    })
  })

  describe("part 7, people I know", () => {
    it("passes Sarah, 31 without an AI call, and scores Sarah, 30 as usual", async () => {
      await settings({ knownPeople: [{ name: "Sarah", age: 31 }] })
      const known = await card({ name: "SARAH", age: 31 })
      const stranger = await card({ name: "Sarah", age: 30 })
      scores.Sarah = { [FIRST_LOOK_MODEL]: 30 }
      await scoreCard(known, db, clock, { ask })
      await scoreCard(stranger, db, clock, { ask })
      expect(asked).toHaveLength(1)
      const [knownRow] = await db.select().from(dateProfiles).where(eq(dateProfiles.id, known))
      expect(knownRow).toMatchObject({ aiScore: 0, aiRead: ["Someone on your People I know list."] })
      expect(knownRow.aiFlags).toContain("known_person")
      expect((await db.select().from(dateProfiles).where(eq(dateProfiles.id, stranger)))[0].aiScore).toBe(30)
    })

    it("matches a name whatever its accents", async () => {
      await settings({ knownPeople: [{ name: "Zoe", age: 29 }] })
      const id = await card({ name: "Zoë", age: 29 })
      await scoreCard(id, db, clock, { ask })
      expect(asked).toHaveLength(0)
    })

    it("reads the box one person a line, and names a line it cannot read", () => {
      expect(parseKnownPeople("Sarah, 31\n\n  Ana Lucia 28 ")).toEqual({ people: [{ name: "Sarah", age: 31 }, { name: "Ana Lucia", age: 28 }] })
      expect(parseKnownPeople("Sarah")).toEqual({ problem: '"Sarah" is not a name and an age, such as "Sarah, 31". Ages run from 18 to 99.' })
    })
  })

  describe("part 8, forgetting passed photos", () => {
    async function photo(shade: number) {
      const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: shade, g: shade, b: shade } } }).jpeg().toBuffer()
      return keepPicture(userId, jpeg, "photo", db, T0)
    }

    it("deletes a 31-day-old pass's photos, and keeps an overruled pass's and a like's", async () => {
      await settings()
      const old = new Date(T0.getTime() - 31 * DAY_MS)
      const [a, b, c, d, shared] = await Promise.all([photo(10), photo(60), photo(110), photo(160), photo(210)])
      const passed = await card({ name: "Passed", photoIds: [a, shared], aiScore: 30, aiReadAt: old, swipe: "pass", swipedBy: "ai", swipedAt: old })
      const overruled = await card({ name: "Overruled", photoIds: [b], aiScore: 85, aiReadAt: old, swipe: "pass", swipedBy: "member", swipedAt: old })
      const liked = await card({ name: "Liked", photoIds: [c], aiScore: 85, aiReadAt: old, swipe: "like", swipedBy: "ai", swipedAt: old })
      const recent = await card({ name: "Recent", photoIds: [d], aiScore: 30, aiReadAt: T0, swipe: "pass", swipedBy: "ai", swipedAt: new Date(T0.getTime() - 29 * DAY_MS) })
      // The same person read again later: the shared photo is still theirs.
      await card({ name: "Passed", photoIds: [shared] })

      expect(await forgetPassedPhotos(db, T0)).toBe(1)
      const rows = new Map((await db.select().from(dateProfiles)).map((row) => [row.id, row]))
      expect(rows.get(passed)).toMatchObject({ photoIds: [], name: "Passed", aiScore: 30 })
      expect(rows.get(passed)?.photosForgottenAt?.toISOString()).toBe(T0.toISOString())
      expect(rows.get(overruled)?.photoIds).toEqual([b])
      expect(rows.get(liked)?.photoIds).toEqual([c])
      expect(rows.get(recent)?.photoIds).toEqual([d])
      const kept = new Set((await db.select({ id: datePictures.id }).from(datePictures)).map((row) => row.id))
      expect(kept.has(a)).toBe(false)
      expect([b, c, d, shared].every((id) => kept.has(id))).toBe(true)
      // Nothing more to do the next day.
      expect(await forgetPassedPhotos(db, new Date(T0.getTime() + DAY_MS))).toBe(0)
    })
  })

  describe("part 9, what's working", () => {
    it("counts likes, matches and replies by band of score", async () => {
      await settings()
      // 80 to 89: 40 likes, 9 of them matches, 5 of those replied. 70 to 79: 3 likes, one match.
      for (let index = 0; index < 40; index += 1) {
        const id = await card({ name: `High${index}`, aiScore: 80 + (index % 10), swipe: index === 0 ? "super" : "like", swipedBy: "ai", swipedAt: T0 })
        if (index < 9) await db.insert(dateMatches).values({ id: uuid(), userId, workspaceId, accountId: account.id, phoneId, profileId: id, theirName: `High${index}`, messagesFromThem: index < 5 ? 2 : 0 })
      }
      // A perfect score counts with the 90s.
      await card({ name: "Perfect", aiScore: 100, swipe: "like", swipedBy: "ai", swipedAt: T0 })
      for (let index = 0; index < 3; index += 1) {
        const id = await card({ name: `Mid${index}`, aiScore: 72, swipe: "like", swipedBy: "member", swipedAt: T0 })
        if (index === 0) await db.insert(dateMatches).values({ id: uuid(), userId, workspaceId, accountId: account.id, phoneId, profileId: id, theirName: `Mid${index}` })
      }
      // Passes and sample cards are not counted.
      await card({ name: "Passed", aiScore: 85, swipe: "pass", swipedBy: "ai", swipedAt: T0 })
      await card({ name: "Sample", aiScore: 85, swipe: "like", swipedBy: "ai", swipedAt: T0, sample: true })

      expect(await scoreBands(account.id, db)).toEqual([
        { from: 90, to: 100, likes: 1, matches: 0, replied: 0 },
        { from: 80, to: 89, likes: 40, matches: 9, replied: 5 },
        { from: 70, to: 79, likes: 3, matches: 1, replied: 0 },
      ])
    })
  })

  describe("part 10, what a match costs", () => {
    it("gives $1.40 a match for $4.20 and 3 matches, and nothing for no dates", async () => {
      expect(dollarsEach(4.2, 3)).toBe(1.4)
      expect(dollarsEach(4.2, 0)).toBeNull()
      // $4.20 of Opus: 1,050,000 tokens in at $4 a million.
      await db.insert(customShellAiUsageEvents).values({
        id: uuid(),
        userId,
        provider: "anthropic",
        model: DATING_MODEL,
        feature: "dating-read-card",
        inputTokens: 1_050_000,
        outputTokens: 0,
        costCents: 0,
        status: "success",
        monthStart: "2099-01-01",
        metadata: { accountId: account.id },
        createdAt: T0,
      })
      for (let index = 0; index < 3; index += 1) {
        await db.insert(dateMatches).values({ id: uuid(), userId, workspaceId, accountId: account.id, phoneId, theirName: `M${index}`, matchedAt: T0 })
      }
      // Last month's match does not count.
      await db.insert(dateMatches).values({ id: uuid(), userId, workspaceId, accountId: account.id, phoneId, theirName: "Old", matchedAt: new Date("2098-12-20T12:00:00Z") })
      expect(await monthMatchCost({ userId, accountId: account.id }, db, T0)).toEqual({ dollars: 4.2, matches: 3, dates: 0, perMatch: 1.4, perDate: null })
    })
  })
})
