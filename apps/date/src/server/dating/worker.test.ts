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
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { DEFAULT_DATING_SETTINGS, type DatingSettings } from "@/lib/dating/settings"
import { datePhones } from "@/server/phone/schema"
import { customShellAiUsageEvents } from "@/server/schema"
import { fakeCard, FakeTinder, type FakeTinderSetup } from "@/server/tinder/fixtures/fake-tinder"
import { dateMatches, dateMessages, dateOwnProfiles, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { messageHash } from "@/server/tinder/store"

import { decideSwipe, draftReply, reviewOwnProfile, scoreCard, type AiAsk } from "./ai"
import { DATING_MODEL, FIRST_LOOK_MODEL } from "./model"
import { saveDatingSettings } from "./settings"
import { monthSpendDollars } from "./spend"
import { runDatingPass, startLoop, stopLoopByHand } from "./worker"

const T0 = new Date("2099-01-01T12:00:00Z")

type Asked = { system: string; text: string; images: number; label: string }

/**
 * Parts 4 and 5 of the Tinder task: the AI's jobs and the Start/Stop loop,
 * run through the worker function exactly as the background pass runs it,
 * with Claude stood in for by an answer the test chooses. The pretend Tinder
 * from part 2 stands in for the phone.
 */
describe("the AI and the swipe loop", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let fake: FakeTinder
  let asked: Asked[]
  let answers: Array<Record<string, unknown> | "refuse">

  /** Claude, as the test wants it: each call takes the next answer, and every question is kept. */
  const ask: AiAsk = async (question) => {
    // Reading a chat for notes runs on every pass with new messages; these tests are about the rest, so it finds nothing.
    if (question.label.endsWith("chat for notes")) {
      return { refused: false, value: question.schema.parse({ newFacts: [], dateAccepted: false, acceptedLine: "", phoneNumber: "" }), inputTokens: 500, outputTokens: 20 }
    }
    asked.push({ system: question.system, text: question.text, images: question.images?.length ?? 0, label: question.label })
    const next = answers.shift()
    if (!next) throw new Error("The test gave Claude no answer for this.")
    if (next === "refuse") return { refused: true, inputTokens: 1_000, outputTokens: 10 }
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
    // Tinder's distance and ages are already set, so the pass does not open Tinder's settings first.
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0, discoveryOwed: false })
    account = await insertAccount(db, { userId, workspaceId, phoneId })
    asked = []
    answers = []
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function settings(change: Partial<DatingSettings> = {}) {
    await saveDatingSettings(
      account,
      { ...DEFAULT_DATING_SETTINGS, lookingFor: "Someone outdoorsy who reads", dealbreakers: "Smokers", ...change },
      db,
      clock
    )
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

  const goodCard = { score: 82, read: ["A climber who bakes.", "Loves the outdoors, which you asked for.", "Nothing that clashes."], flags: [], dealbreakers: [] }

  describe("reading a card", () => {
    async function seededCard(overrides: Partial<typeof dateProfiles.$inferInsert> = {}) {
      const id = uuid()
      await db.insert(dateProfiles).values({
        id,
        userId,
        workspaceId,
        accountId: account.id,
        phoneId,
        name: "Maya",
        age: 27,
        bio: "Climbing and baking.",
        texts: ["Climbing and baking."],
        photoIds: [],
        ...overrides,
      })
      return id
    }

    it("gives a seeded card a score, a read and flags, through the usage meter", async () => {
      await settings({ ageMin: 30, ageMax: 40 })
      const id = await seededCard()
      answers.push({ ...goodCard, flags: ["photos_filtered"], dealbreakers: ["Smokers"] })
      expect(await scoreCard(id, db, clock, { ask })).toMatchObject({ status: "done" })

      const [card] = await db.select().from(dateProfiles)
      expect(card.aiScore).toBe(82)
      expect(card.aiRead).toHaveLength(3)
      expect(card.aiFlags).toEqual(["outside_age_range", "photos_filtered", "dealbreaker"])
      expect(card.aiDealbreakers).toEqual(["Smokers"])
      // The member's own words reach the AI, and the card's.
      expect(asked[0].system).toContain("Someone outdoorsy who reads")
      expect(asked[0].system).toContain("aged 30 to 40")
      expect(asked[0].text).toContain("Bio: Climbing and baking.")
      // One row on the shell's meter, under Date's name: 82 is more than 10 from the like line, so Sonnet's first look is the only one.
      const [usage] = await db.select().from(customShellAiUsageEvents)
      expect(usage).toMatchObject({ feature: "dating-read-card", model: FIRST_LOOK_MODEL, inputTokens: 2_000, outputTokens: 300, status: "success" })
    })

    it("never pays twice for a card two passes reach together", async () => {
      await settings()
      const id = await seededCard()
      answers.push(goodCard)
      const [first, second] = await Promise.all([scoreCard(id, db, clock, { ask }), scoreCard(id, db, clock, { ask })])
      expect([first.status, second.status].sort()).toEqual(["busy", "done"])
      expect(asked).toHaveLength(1)
    })

    it("marks a card the AI would not read, and passes on it", async () => {
      await settings()
      const id = await seededCard({ bio: "" })
      answers.push("refuse")
      await scoreCard(id, db, clock, { ask })
      const [card] = await db.select().from(dateProfiles)
      expect(card.aiFlags).toEqual(["no_bio", "ai_declined"])
      expect(decideSwipe(card, DEFAULT_DATING_SETTINGS)).toBe("pass")
    })

    it("likes at the member's number or more, passes below, and always passes a dealbreaker", () => {
      expect(decideSwipe({ aiScore: 70, aiFlags: [] }, { likeAbove: 70 })).toBe("like")
      expect(decideSwipe({ aiScore: 69, aiFlags: [] }, { likeAbove: 70 })).toBe("pass")
      expect(decideSwipe({ aiScore: 99, aiFlags: ["dealbreaker"] }, { likeAbove: 70 })).toBe("pass")
      expect(decideSwipe({ aiScore: null, aiFlags: [] }, { likeAbove: 70 })).toBeNull()
    })

    it("makes no call once the month's spend reaches the cap", async () => {
      await settings({ spendCapDollars: 20 })
      // A million tokens each way at $4 and $20 a million is $24.
      await db.insert(customShellAiUsageEvents).values({
        id: uuid(),
        userId,
        provider: "anthropic",
        model: DATING_MODEL,
        feature: "dating-read-card",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        costCents: 0,
        status: "success",
        monthStart: "2099-01-01",
        metadata: { accountId: account.id },
        createdAt: clock,
      })
      expect(await monthSpendDollars({ userId, accountId: account.id }, db, clock)).toBe(24)
      const id = await seededCard()
      const outcome = await scoreCard(id, db, clock, { ask })
      expect(outcome.status).toBe("cap")
      expect(outcome.words).toBe("Spend cap reached, $20 this month. The AI starts again on the 1st, or when the cap is raised in the Dating settings.")
      expect(asked).toHaveLength(0)
      // A pause, not a failure: the card is left to be read once there is room.
      const [card] = await db.select().from(dateProfiles)
      expect(card).toMatchObject({ aiError: "", aiStartedAt: null, aiScore: null })
      await settings({ spendCapDollars: 50 })
      answers.push(goodCard)
      expect((await scoreCard(id, db, clock, { ask })).status).toBe("done")
    })
  })

  describe("drafting a reply", () => {
    async function seededChat(messages: Array<["in" | "out", string]>, overrides: Partial<typeof dateMatches.$inferInsert> = {}) {
      const matchId = uuid()
      await db.insert(dateMatches).values({
        id: matchId,
        userId,
        workspaceId,
        accountId: account.id,
        phoneId,
        theirName: "Noor",
        messagesFromThem: messages.filter(([direction]) => direction === "in").length,
        ...overrides,
      })
      let position = 0
      for (const [direction, text] of messages) {
        position += 1
        await db.insert(dateMessages).values({
          id: uuid(),
          userId,
          matchId,
          direction,
          sentBy: direction === "in" ? "them" : "member",
          text,
          hash: messageHash(text),
          status: "sent",
          position,
          sentAt: clock,
          createdAt: clock,
        })
      }
      return matchId
    }

    it("drafts a reply in the member's voice and keeps it until they press Send", async () => {
      await settings({ aboutMe: "I'm a product designer. I run on weekends.", examples: ["haha yes", "ok but what about tacos"] })
      const matchId = await seededChat([["in", "Hey! Do you run?"]])
      answers.push({ kind: "draft", text: "every weekend, mostly slowly 😅", question: "", flag: "none", proposesDate: false })
      expect((await draftReply(matchId, db, clock, { ask })).status).toBe("done")
      const [match] = await db.select().from(dateMatches)
      // The examples use no emoji, so the draft has none either.
      expect(match).toMatchObject({ draft: "every weekend, mostly slowly", draftProposesDate: false, flaggedReason: null, draftSendAt: null })
      expect(asked[0].system).toContain("I'm a product designer. I run on weekends.")
      expect(asked[0].system).toContain("- ok but what about tacos")
      expect(asked[0].text).toContain("Noor: Hey! Do you run?")
    })

    it("proposes meeting once both sides have sent enough, and says how many each sent", async () => {
      await settings()
      const matchId = await seededChat([
        ["out", "Hi Noor"],
        ["in", "Hi!"],
        ["out", "How was your week?"],
        ["in", "Long. Yours?"],
        ["out", "Same. Climbed it off"],
        ["in", "Where do you climb?"],
        ["out", "Basecamp, mostly"],
        ["in", "No way, me too"],
        ["out", "Small world"],
        ["in", "We should climb sometime"],
      ])
      answers.push({ kind: "draft", text: "We should. Drink after? My number's 555 0100", question: "", flag: "none", proposesDate: true })
      await draftReply(matchId, db, clock, { ask })
      expect(asked[0].text).toContain("Messages so far: 5 from the member, 5 from Noor.")
      expect(asked[0].system).toContain("Once both sides have sent at least 4 messages")
      expect(asked[0].system).toContain("Never name a day, a time or a place")
      expect((await db.select().from(dateMatches))[0].draftProposesDate).toBe(true)
    })

    it("flags a chat that asks if this is a bot, and writes no draft", async () => {
      await settings()
      const matchId = await seededChat([["in", "are you a bot?"]])
      answers.push({ kind: "flag", text: "", question: "", flag: "asked_if_bot", proposesDate: false })
      await draftReply(matchId, db, clock, { ask })
      const [match] = await db.select().from(dateMatches)
      expect(match).toMatchObject({ flaggedReason: "asked_if_bot", draft: "" })
      // A flagged chat is not drafted again.
      expect((await draftReply(matchId, db, clock, { ask })).status).toBe("skipped")
      expect(asked).toHaveLength(1)
    })

    it("asks the member for a fact rather than inventing one", async () => {
      await settings()
      const matchId = await seededChat([["in", "What do you do for work?"]])
      answers.push({ kind: "ask", text: "", question: "What do you do for work?", flag: "none", proposesDate: false })
      await draftReply(matchId, db, clock, { ask })
      expect((await db.select().from(dateMatches))[0]).toMatchObject({ flaggedReason: "missing_fact", askQuestion: "What do you do for work?" })
    })

    it("asks again once when a draft is too long, then gives up saying why", async () => {
      await settings()
      const matchId = await seededChat([["in", "Tell me everything"]])
      const long = "x".repeat(250)
      answers.push({ kind: "draft", text: long, question: "", flag: "none", proposesDate: false })
      answers.push({ kind: "draft", text: long, question: "", flag: "none", proposesDate: false })
      const outcome = await draftReply(matchId, db, clock, { ask })
      expect(outcome).toEqual({ status: "failed", words: "The AI's draft for Noor was longer than 200 characters twice." })
      expect(asked[1].text).toContain("That was 250 characters")
    })
  })

  describe("the loop", () => {
    it("reads a card, waits for the score, likes it, and goes on to the next", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")], chats: [] })
      await settings()
      await startLoop(account, db, clock)
      answers.push(goodCard, { ...goodCard, score: 20 })

      for (let passes = 0; passes < 8 && fake.passed.length === 0; passes += 1) await pass()
      expect(fake.liked).toEqual(["Maya"])
      expect(fake.passed).toEqual(["Ines"])
      const cards = await db.select().from(dateProfiles).orderBy(asc(dateProfiles.readAt))
      expect(cards.map((card) => [card.name, card.swipe, card.swipedBy, card.aiScore])).toEqual([
        ["Maya", "like", "ai", 82],
        ["Ines", "pass", "ai", 20],
      ])
      // The AI saw Maya's four photos.
      expect(asked[0].images).toBe(4)
      // The chat list was looked at first, and every walk was the AI's.
      const walks = await db.select().from(dateWalks).orderBy(asc(dateWalks.createdAt))
      expect(walks[0].kind).toBe("read-matches")
      expect(walks.every((walk) => walk.askedBy === "ai")).toBe(true)
    })

    it("ends at the hourly swipe limit, saying so", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")], chats: [] })
      await settings({ swipesPerHour: 1 })
      await startLoop(account, db, clock)
      answers.push(goodCard, goodCard)
      for (let passes = 0; passes < 10; passes += 1) await pass()
      expect(fake.liked).toEqual(["Maya"])
      const [stopped] = await db.select().from(datePhones)
      expect(stopped.running).toBe(false)
      expect(stopped.stopWhy).toMatch(/^1 swipe in the last hour, the most allowed\. The next is allowed at/)
    })

    it("ends on a stop screen", async () => {
      phone({ cards: [fakeCard("Maya")], chats: [], likesLeft: 0 })
      await settings()
      await startLoop(account, db, clock)
      answers.push(goodCard)
      for (let passes = 0; passes < 8; passes += 1) await pass()
      const [stopped] = await db.select().from(datePhones)
      expect(stopped).toMatchObject({ running: false, stoppedReason: "out_of_likes" })
      expect(fake.liked).toEqual([])
    })

    it("ends when the phone goes away", async () => {
      phone({ cards: [fakeCard("Maya")], chats: [] })
      await settings()
      await startLoop(account, db, clock)
      clock = new Date(clock.getTime() + 3 * 60_000)
      const { work } = await runDatingPass(db, clock, { drive: fake.drive, now: () => clock, ask })
      await Promise.all(work)
      const [stopped] = await db.select().from(datePhones)
      expect(stopped.running).toBe(false)
      expect(stopped.stopWhy).toBe("The phone went away since 12:00: it stopped checking in.")
    })

    it("Stop ends it at once, and calls off what the loop queued", async () => {
      phone({ cards: [fakeCard("Maya")], chats: [] })
      await settings()
      await startLoop(account, db, clock)
      await stopLoopByHand(account, db, clock)
      await pass()
      expect(fake.steps).toHaveLength(0)
      expect((await db.select().from(datePhones))[0]).toMatchObject({ running: false, stopWhy: "Stopped by you." })
    })
  })

  describe("automated replies", () => {
    it("sends the AI's draft by itself only once its time has come, as the AI's message", async () => {
      const chat = { name: "Noor", preview: "Do you climb?", isNew: false, bubbles: [{ direction: "in" as const, text: "Do you climb?" }] }
      phone({ cards: [], chats: [chat] })
      await settings({ automate: true, replyDelayMin: 10, replyDelayMax: 10 })
      const matchId = uuid()
      await db.insert(dateMatches).values({ id: matchId, userId, workspaceId, accountId: account.id, phoneId, theirName: "Noor", lastPreview: "Do you climb?", messagesFromThem: 1 })
      await db.insert(dateMessages).values({
        id: uuid(),
        userId,
        matchId,
        direction: "in",
        sentBy: "them",
        text: "Do you climb?",
        hash: messageHash("Do you climb?"),
        status: "sent",
        position: 1,
        sentAt: clock,
        createdAt: clock,
      })
      answers.push({ kind: "draft", text: "Badly, but yes", question: "", flag: "none", proposesDate: false })

      await pass()
      const [drafted] = await db.select().from(dateMatches)
      expect(drafted.draft).toBe("Badly, but yes")
      // Ten minutes after their message, which came at the start.
      expect(drafted.draftSendAt?.toISOString()).toBe(new Date(T0.getTime() + 10 * 60_000).toISOString())

      // Not before its time.
      await pass()
      expect(fake.sent).toEqual([])
      expect(await db.select().from(dateWalks).where(eq(dateWalks.kind, "send-message"))).toHaveLength(0)

      clock = new Date(T0.getTime() + 10 * 60_000)
      await pass()
      await pass()
      expect(fake.sent).toEqual(["Badly, but yes"])
      const ours = (await db.select().from(dateMessages)).find((message) => message.direction === "out")
      expect(ours).toMatchObject({ sentBy: "ai", status: "sent" })
    })

    it("leaves the draft for the member to send while automate is off", async () => {
      phone({ cards: [], chats: [] })
      await settings({ automate: false })
      const matchId = uuid()
      await db.insert(dateMatches).values({ id: matchId, userId, workspaceId, accountId: account.id, phoneId, theirName: "Noor", draft: "Hi!", draftMadeAt: clock })
      clock = new Date(clock.getTime() + 24 * 60 * 60_000)
      await pass()
      expect(await db.select().from(dateWalks).where(eq(dateWalks.kind, "send-message"))).toHaveLength(0)
      expect((await db.select().from(dateMatches))[0].draftSendAt).toBeNull()
    })
  })

  describe("your own profile", () => {
    it("is reviewed once it has been read, with its photos", async () => {
      phone({ cards: [] })
      await settings()
      await db.insert(dateOwnProfiles).values({ phoneId, userId, workspaceId, accountId: account.id, name: "Tyler", bio: "Cooks too much.", photoIds: [] })
      answers.push({ photoOrder: [], bio: "Cooks too much, shares the leftovers.", notes: ["Add a photo outdoors."] })
      expect((await reviewOwnProfile(account.id, db, clock, { ask })).status).toBe("done")
      const [own] = await db.select().from(dateOwnProfiles)
      expect(own.review).toEqual({ photoOrder: [], bio: "Cooks too much, shares the leftovers.", notes: ["Add a photo outdoors."] })
    })
  })
})
