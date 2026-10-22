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

import type { DatingAccount } from "@/server/dating/accounts"
import { DEFAULT_DATING_SETTINGS } from "@/lib/dating/settings"
import { datePhones } from "@/server/phone/schema"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { FakeTinder } from "@/server/tinder/fixtures/fake-tinder"
import { queueWalk } from "@/server/tinder/jobs"
import { dateMatches, dateOwnProfiles, datePhotoTests, dateProfiles, dateWalks, type OwnProfileReview } from "@/server/tinder/schema"

import { reviewOwnProfile, type AiAsk } from "./ai"
import { applySuggestion, photoTestView, photoTestWinner, PHOTO_TEST_WEEK_MS, startPhotoTest, stopPhotoTest, undoLastApply } from "./own-profile"
import { saveDatingSettings } from "./settings"
import { runDatingPass } from "./worker"

const T0 = new Date("2099-01-01T12:00:00Z")

/**
 * Task "features/03-your-profile": Apply and Undo as the dashboard asks for
 * them (part 1), new prompt answers from About me only (part 2), and the
 * first-photo test run week by week through the worker's pass on a pretend
 * phone (part 3). Claude is stood in for by answers each test picks.
 */
describe("your profile", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let fake: FakeTinder
  let asked: Array<{ system: string; text: string }>
  let answers: Array<Record<string, unknown>>

  const ask: AiAsk = async (question) => {
    asked.push({ system: question.system, text: question.text })
    const next = answers.shift()
    if (!next) throw new Error(`The test gave Claude no answer for: ${question.label}`)
    return { refused: false, value: question.schema.parse(next), inputTokens: 2_000, outputTokens: 300 }
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
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0, discoveryOwed: false })
    account = await insertAccount(db, { userId, workspaceId, phoneId })
    asked = []
    answers = []
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  /** One pass of the background loop, a minute after the last, waiting for everything it started. */
  async function pass() {
    clock = new Date(clock.getTime() + 60_000)
    await db.update(datePhones).set({ lastSeenAt: clock }).where(eq(datePhones.id, phoneId))
    const { work } = await runDatingPass(db, clock, { drive: fake.drive, now: () => clock, ask })
    await Promise.all(work)
  }

  const REVIEWED: OwnProfileReview = { photoIds: [], photoOrder: [], bio: "Cooks too much.", prompts: [], notes: [] }

  /** Tyler's profile read off the pretend phone, with a review so the pass leaves the AI out of it. */
  async function readMine(photos = 4) {
    fake = new FakeTinder({ me: { name: "Tyler", age: 30, photos, bio: "Product person who cooks too much." } })
    await queueWalk({ userId, accountId: account.id, phoneId, kind: "read-own-profile", askedBy: "member" }, db, clock)
    await pass()
    await db.update(dateOwnProfiles).set({ review: REVIEWED, reviewMadeAt: clock })
    const [own] = await db.select().from(dateOwnProfiles)
    return own
  }

  async function walks() {
    return db.select().from(dateWalks).orderBy(asc(dateWalks.createdAt))
  }

  describe("Apply and Undo", () => {
    it("asks the phone for the AI's photo order, with any photo the AI left out kept at the end", async () => {
      const own = await readMine()
      const [one, two, three, four] = own.photoIds
      await db.update(dateOwnProfiles).set({
        review: { ...REVIEWED, photoIds: own.photoIds, photoOrder: [{ photo: 3, why: "Smiling, face clear." }, { photo: 1, why: "Outdoors." }] },
      })
      await applySuggestion(account, { kind: "photos" }, db, clock)
      const [walk] = (await walks()).filter((row) => row.kind === "reorder-photos")
      expect(walk.input).toEqual({ photoIds: [three, one, two, four] })
      // A second press while the phone is on it is refused, so two changes never cross.
      await expect(applySuggestion(account, { kind: "bio" }, db, clock)).rejects.toThrow("The phone is still making the last change to your profile.")
    })

    it("refuses a bio longer than Tinder takes, a prompt the AI says to keep, and Undo with nothing to undo", async () => {
      await readMine()
      await db.update(dateOwnProfiles).set({
        review: { ...REVIEWED, bio: "x".repeat(501), prompts: [{ question: "My simple pleasures", answer: "", keep: true }] },
      })
      await expect(applySuggestion(account, { kind: "bio" }, db, clock)).rejects.toThrow(
        "Tinder takes 500 characters at most in a bio, and this one is 501. Press Review again for a shorter one."
      )
      await expect(applySuggestion(account, { kind: "prompt", question: "My simple pleasures" }, db, clock)).rejects.toThrow(
        "The AI suggests keeping this answer as it is."
      )
      await expect(undoLastApply(account, db, clock)).rejects.toThrow("There is nothing to undo.")
      expect(await walks()).toHaveLength(1)
    })

    it("applies the bio on the phone, then Undo puts the old one back", async () => {
      await readMine()
      await db.update(dateOwnProfiles).set({ review: { ...REVIEWED, bio: "Cooks too much, shares the leftovers." } })
      await applySuggestion(account, { kind: "bio" }, db, clock)
      await pass()
      expect(fake.mine.bio).toBe("Cooks too much, shares the leftovers.")
      await undoLastApply(account, db, clock)
      await pass()
      expect(fake.mine.bio).toBe("Product person who cooks too much.")
      const [own] = await db.select().from(dateOwnProfiles)
      expect(own).toMatchObject({ bio: "Product person who cooks too much.", before: null, appliedAt: {} })
    })
  })

  describe("new prompt answers (part 2)", () => {
    const SECTIONS = [
      { heading: "About me", items: ["Product person who cooks too much."] },
      { heading: "Prompts", items: ["My simple pleasures", "Coffee.", "Two truths and a lie", "I cook, I run, I sing."] },
    ]

    async function seed(aboutMe: string) {
      await saveDatingSettings(account, { ...DEFAULT_DATING_SETTINGS, aboutMe }, db, clock)
      await db.insert(dateOwnProfiles).values({ accountId: account.id, phoneId, userId, workspaceId, name: "Tyler", bio: "Product person who cooks too much.", sections: SECTIONS })
    }

    it("suggests a new answer for each of two prompts, written from About me alone", async () => {
      await seed("I bake sourdough every Sunday. I ran the Toronto marathon in 2025.")
      answers.push({
        photoOrder: [],
        bio: "Product person who cooks too much.",
        prompts: [
          { prompt: 1, keep: false, answer: "Sourdough out of the oven on a Sunday." },
          { prompt: 2, keep: false, answer: "I bake sourdough, I ran a marathon, I hate bread." },
        ],
        notes: [],
      })
      expect((await reviewOwnProfile(account.id, db, clock, { ask })).status).toBe("done")
      const [own] = await db.select().from(dateOwnProfiles)
      expect(own.review?.prompts).toEqual([
        { question: "My simple pleasures", answer: "Sourdough out of the oven on a Sunday.", keep: false },
        { question: "Two truths and a lie", answer: "I bake sourdough, I ran a marathon, I hate bread.", keep: false },
      ])
      // The AI is told to use About me only, and is given it, with both prompts and their answers now.
      expect(asked[0].system).toContain("using only what About me says")
      expect(asked[0].text).toContain("About me, the only facts a prompt answer may use: I bake sourdough every Sunday. I ran the Toronto marathon in 2025.")
      expect(asked[0].text).toContain("1. My simple pleasures Answer now: Coffee.")
      expect(asked[0].text).toContain("2. Two truths and a lie Answer now: I cook, I run, I sing.")
    })

    it("keeps every answer when About me is too thin, and when the AI leaves a prompt out", async () => {
      await seed("")
      answers.push({ photoOrder: [], bio: "Product person who cooks too much.", prompts: [{ prompt: 1, keep: true, answer: "" }], notes: [] })
      expect((await reviewOwnProfile(account.id, db, clock, { ask })).status).toBe("done")
      expect(asked[0].text).toContain("About me, the only facts a prompt answer may use: (empty)")
      const [own] = await db.select().from(dateOwnProfiles)
      expect(own.review?.prompts).toEqual([
        { question: "My simple pleasures", answer: "", keep: true },
        { question: "Two truths and a lie", answer: "", keep: true },
      ])
    })
  })

  describe("the first-photo test (part 3)", () => {
    /** Likes and matches made during one week, each a minute apart from its start. */
    async function seedWeek(from: Date, likes: number, matches: number) {
      for (let index = 0; index < likes; index += 1) {
        const at = new Date(from.getTime() + (index + 1) * 60_000)
        await db
          .insert(dateProfiles)
          .values({ id: uuid(), accountId: account.id, userId, workspaceId, name: `Liked ${index}`, swipe: "like", swipedAt: at, readAt: at, aiReadAt: at })
      }
      for (let index = 0; index < matches; index += 1) {
        await db
          .insert(dateMatches)
          .values({ id: uuid(), accountId: account.id, userId, workspaceId, phoneId, theirName: `Match ${index}`, matchedAt: new Date(from.getTime() + (index + 1) * 60_000) })
      }
    }

    async function rows() {
      return db.select().from(datePhotoTests).orderBy(asc(datePhotoTests.place))
    }

    it("counts three seeded weeks, shows matches per 100 likes for each, and puts the winner first", async () => {
      await readMine()
      await startPhotoTest(account, db, clock)
      await expect(startPhotoTest(account, db, clock)).rejects.toThrow("A first-photo test is already running.")

      // Week 3 has the most matches; week 2 has the most per 100 likes, and wins.
      const weeks: Array<[number, number]> = [
        [20, 4],
        [10, 3],
        [40, 5],
      ]
      for (const [index, [likes, matches]] of weeks.entries()) {
        // The pass puts this week's photo first, read back, and its week starts.
        await pass()
        const started = (await rows())[index]
        expect(started.startedAt).toEqual(clock)
        expect(fake.mine.photos[0]).toBe(index)
        await seedWeek(clock, likes, matches)
        // Six days in, the week is still counting.
        clock = new Date(started.startedAt!.getTime() + PHOTO_TEST_WEEK_MS - 120_000)
        await pass()
        expect((await rows())[index].endedAt).toBeNull()
        await pass()
        expect((await rows())[index]).toMatchObject({ likes, matches })
      }

      const view = await photoTestView(account.id, db, clock)
      expect(view?.weeks.map((week) => [week.likes, week.matches, week.per100])).toEqual([
        [20, 4, 20],
        [10, 3, 30],
        [40, 5, 13],
      ])
      expect(view?.phase).toBe("putting-winner-first")
      expect(view?.weeks.map((week) => week.winner)).toEqual([false, true, false])

      await pass()
      expect(fake.mine.photos).toEqual([1, 0, 2, 3])
      expect((await photoTestView(account.id, db, clock))?.phase).toBe("done")
      // Ten passes on the pretend phone, each moving photos it has to match by picture: past the default 10 seconds when every file runs at once.
    }, 30_000)

    it("Stop puts the order from before the test back", async () => {
      await readMine()
      await startPhotoTest(account, db, clock)
      await pass()
      clock = new Date(clock.getTime() + PHOTO_TEST_WEEK_MS)
      await pass()
      await pass()
      expect(fake.mine.photos).toEqual([1, 0, 2, 3])

      await stopPhotoTest(account, db, clock)
      expect((await photoTestView(account.id, db, clock))?.phase).toBe("restoring")
      await pass()
      expect(fake.mine.photos).toEqual([0, 1, 2, 3])
      const view = await photoTestView(account.id, db, clock)
      expect(view).toMatchObject({ phase: "restored", stopped: true })
      await expect(stopPhotoTest(account, db, clock)).rejects.toThrow("No first-photo test is running.")
    })

    it("needs three photos, and refuses to move photos by Apply or Undo while it runs", async () => {
      await readMine(2)
      await expect(startPhotoTest(account, db, clock)).rejects.toThrow("The test needs at least 3 photos on your profile, and Date read 2.")

      await readMine(4)
      await startPhotoTest(account, db, clock)
      const [own] = await db.select().from(dateOwnProfiles)
      await db.update(dateOwnProfiles).set({ review: { ...REVIEWED, photoIds: own.photoIds, photoOrder: [{ photo: 2, why: "" }] } })
      await expect(applySuggestion(account, { kind: "photos" }, db, clock)).rejects.toThrow("The first-photo test is moving your photos.")
    })

    it("ends the test, leaving the photos as they are, after a move fails on the phone three times", async () => {
      await readMine()
      await startPhotoTest(account, db, clock)
      // A photo deleted on Tinder during the test: no move can work any more.
      fake.mine.photos = [0, 1, 2]
      for (let tries = 0; tries < 3; tries += 1) {
        await pass()
        clock = new Date(clock.getTime() + 60 * 60_000)
      }
      expect((await photoTestView(account.id, db, clock))?.phase).toBe("moving")
      await pass()
      const view = await photoTestView(account.id, db, clock)
      expect(view?.phase).toBe("restored")
      expect(view?.moveError).toBe("Ended after 3 tries: Tinder shows 3 photos and Date expected 4. Read your profile again, then try once more.")
      expect(fake.mine.photos).toEqual([0, 1, 2])
      // Nothing more is asked of the phone.
      const before = (await walks()).length
      await pass()
      expect(await walks()).toHaveLength(before)
    })

    it("lets the bio be applied while a test's move waits on the phone", async () => {
      await readMine()
      await startPhotoTest(account, db, clock)
      await queueWalk(
        { userId, accountId: account.id, phoneId, kind: "reorder-photos", input: { photoIds: ["x"], photoTest: { rowId: "r", step: "week" } }, askedBy: "ai" },
        db,
        clock
      )
      await db.update(dateOwnProfiles).set({ review: { ...REVIEWED, bio: "Cooks too much, shares the leftovers." } })
      await applySuggestion(account, { kind: "bio" }, db, clock)
      expect((await walks()).map((walk) => walk.kind)).toContain("set-bio")
    })

    it("picks the best matches per 100 likes, then the week with more likes, and no winner without likes", () => {
      expect(
        photoTestWinner([
          { id: "a", place: 1, likes: 20, matches: 2 },
          { id: "b", place: 2, likes: 10, matches: 1 },
          { id: "c", place: 3, likes: 0, matches: 0 },
        ])
      ).toBe("a")
      expect(photoTestWinner([{ id: "a", place: 1, likes: 0, matches: 0 }])).toBeNull()
    })

    it("asks for a move the phone refused again an hour later, not on every pass", async () => {
      await readMine()
      await startPhotoTest(account, db, clock)
      await db.update(datePhones).set({ inControl: false })
      await pass()
      const [first] = await rows()
      expect(first.moveError).toBe("Date is switched off for Pixel 8a. Switch it on in the dashboard's Phone panel first.")
      await db.update(datePhones).set({ inControl: true })
      await pass()
      expect((await rows())[0].startedAt).toBeNull()
      clock = new Date(clock.getTime() + 60 * 60_000)
      await pass()
      expect((await rows())[0].startedAt).toEqual(clock)
    })
  })
})
