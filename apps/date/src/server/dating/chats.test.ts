import type { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/media/storage", () => ({
  R2StorageNotConfiguredError: class extends Error {},
  uploadToR2: vi.fn(async () => {}),
  getFromR2: vi.fn(async () => ({ Body: undefined })),
  deleteFromR2: vi.fn(async () => {}),
}))

import type { DatingAccount } from "@/server/dating/accounts"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { chatTrend } from "@/lib/dating/chat-trend"
import { DEFAULT_DATING_SETTINGS, type DatingSettings } from "@/lib/dating/settings"
import { encryptSecret } from "@/server/auth/encryption"
import { datePhones } from "@/server/phone/schema"
import { FakeTinder } from "@/server/tinder/fixtures/fake-tinder"
import { dateMatches, dateMessages, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { createOutgoingMessage, messageHash, saveChatList } from "@/server/tinder/store"

import { askAboutMatches, draftReply, learnedSends, readChatNotes, tidyReply, type AiAsk } from "./ai"
import { clearDeadMatches, deadMatches, deleteFact, dismissDraft, saveFact, setAiDrafts, setDatePlan, setManyMovedToText, setMovedToText, setNotOver } from "./chats"
import { draftsSentUnchanged, loadMatchDetail, openerTally } from "./dashboard"
import { syncDateEvent, type Fetcher } from "./google-calendar"
import { dateGoogleCalendars } from "./schema"
import { saveDatingSettings } from "./settings"
import { NUDGE_AFTER_MS, runDatingPass } from "./worker"

const T0 = new Date("2099-01-01T12:00:00Z")
const DAY = 86_400_000

type Asked = { system: string; text: string; label: string }

const NO_NOTES = { newFacts: [], memberOffered: false, dateAccepted: false, acceptedLine: "", phoneNumber: "" }
const draft = (text: string, extra: Record<string, unknown> = {}) => ({ kind: "draft", text, question: "", flag: "none", proposesDate: false, ...extra })

/**
 * Task "features/01-chats-and-replies": openers, facts, the nudge, a chat
 * that is over, agreed dates, three drafts, tidy, the member's voice, the
 * trend, moved to text, they unmatched, dead matches, the brief, opener
 * counts, Google Calendar, scam flags, "sent unchanged", the off switch, the
 * note, tone and Ask Date. Claude is stood in for by answers each test picks:
 * notes answers and draft answers wait in their own lines, because a pass
 * reads a chat for notes before it drafts.
 */
describe("chats and replies", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let asked: Asked[]
  let answers: Array<Record<string, unknown> | "refuse">
  let notes: Array<Record<string, unknown>>

  const ask: AiAsk = async (question) => {
    const forNotes = question.label.endsWith("chat for notes")
    asked.push({ system: question.system, text: question.text, label: question.label })
    const next = forNotes ? (notes.shift() ?? NO_NOTES) : answers.shift()
    if (!next) throw new Error(`The test gave Claude no answer for: ${question.label}`)
    if (next === "refuse") return { refused: true, inputTokens: 1_000, outputTokens: 10 }
    return { refused: false, value: question.schema.parse(next), inputTokens: 2_000, outputTokens: 300 }
  }
  const drafts = () => asked.filter((question) => question.label.startsWith("Drafting") || question.label.startsWith("Tidying"))

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    phoneId = uuid()
    clock = T0
    // Tinder's distance and ages are already set, so the pass does not open Tinder's settings first.
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0 })
    account = await insertAccount(db, { userId, workspaceId, phoneId })
    asked = []
    answers = []
    notes = []
    await settings()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  async function settings(change: Partial<DatingSettings> = {}) {
    await saveDatingSettings(account, { ...DEFAULT_DATING_SETTINGS, aboutMe: "I'm a designer.", ...change }, db, clock)
  }

  async function pass() {
    clock = new Date(clock.getTime() + 15_000)
    await db.update(datePhones).set({ lastSeenAt: clock }).where(eq(datePhones.id, phoneId))
    const fake = new FakeTinder({ cards: [], chats: [] })
    const { work } = await runDatingPass(db, clock, { drive: fake.drive, now: () => clock, ask })
    await Promise.all(work)
  }

  async function card(overrides: Partial<typeof dateProfiles.$inferInsert> = {}) {
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
      sections: [{ heading: "My weekend", items: ["Bouldering, then bread"] }],
      handles: { anthem: "Dreams by Fleetwood Mac" },
      aiRead: ["A climber who bakes."],
      aiScore: 80,
      aiReadAt: clock,
      swipe: "like",
      ...overrides,
    })
    return id
  }

  /** A match and its messages. `at` per message is how many days before the clock it came. */
  async function chat(
    messages: Array<["in" | "out", string] | ["in" | "out", string, number]>,
    overrides: Partial<typeof dateMatches.$inferInsert> = {},
    by: "member" | "ai" = "member"
  ) {
    const matchId = uuid()
    await db.insert(dateMatches).values({
      id: matchId,
      userId,
      workspaceId,
      accountId: account.id,
      phoneId,
      theirName: "Noor",
      matchedAt: new Date(clock.getTime() - 40 * DAY),
      messagesFromThem: messages.filter(([direction]) => direction === "in").length,
      messagesFromUs: messages.filter(([direction]) => direction === "out").length,
      lastMessageAt: messages.length ? clock : null,
      ...overrides,
    })
    let position = 0
    for (const [direction, text, daysAgo] of messages) {
      position += 1
      const at = new Date(clock.getTime() - (daysAgo ?? 0) * DAY + position)
      await db.insert(dateMessages).values({
        id: uuid(),
        userId,
        matchId,
        direction,
        sentBy: direction === "in" ? "them" : by,
        text,
        hash: messageHash(text),
        status: "sent",
        position,
        sentAt: at,
        createdAt: at,
      })
    }
    return matchId
  }

  const matchRow = async (id: string) => (await db.select().from(dateMatches).where(eq(dateMatches.id, id)))[0]

  describe("part 1, opening line", () => {
    it("writes a first message from the card for a new match nobody has written to", async () => {
      const profileId = await card()
      const matchId = await chat([], { profileId, theirName: "Maya" })
      answers.push(draft("Bread after bouldering is the correct order", { openerStyle: "prompt_question" }))
      await pass()
      expect(await matchRow(matchId)).toMatchObject({ draft: "Bread after bouldering is the correct order", draftKind: "opener", draftOpenerStyle: "prompt_question", draftSendAt: null })
      const [question] = drafts()
      expect(question.text).toContain("Nobody has written yet")
      expect(question.text).toContain("My weekend: Bouldering, then bread")
      expect(question.text).toContain("Their anthem on Spotify: Dreams by Fleetwood Mac")
    })

    it("with automate on, sends the opener only once its time after the match has come", async () => {
      await settings({ automate: true, replyDelayMin: 10, replyDelayMax: 10 })
      const profileId = await card()
      const matchId = await chat([], { profileId, theirName: "Maya", matchedAt: clock })
      answers.push(draft("Hi Maya, best bread in town?", { openerStyle: "simple_hello" }))
      await pass()
      expect((await matchRow(matchId)).draftSendAt?.toISOString()).toBe(new Date(T0.getTime() + 10 * 60_000).toISOString())
      expect(await db.select().from(dateWalks).where(eq(dateWalks.kind, "send-message"))).toHaveLength(0)
      clock = new Date(T0.getTime() + 10 * 60_000)
      await pass()
      const [sent] = await db.select().from(dateMessages).where(eq(dateMessages.matchId, matchId))
      expect(sent).toMatchObject({ sentBy: "ai", openerStyle: "simple_hello", text: "Hi Maya, best bread in town?" })
      expect(await db.select().from(dateWalks).where(eq(dateWalks.kind, "send-message"))).toHaveLength(1)
    })

    it("writes no opener for a match whose card was never read", async () => {
      await chat([], { profileId: null })
      await pass()
      expect(drafts()).toHaveLength(0)
    })
  })

  describe("part 2, what they told you", () => {
    it("keeps what they said, and never brings back a fact the member deleted or changed", async () => {
      const matchId = await chat([["out", "What do you do?"], ["in", "I'm a nurse, nights mostly"]])
      notes.push({ ...NO_NOTES, newFacts: ["Works as a nurse", "Works nights"] })
      answers.push(draft("Nights sound hard"))
      await pass()
      const facts = (await matchRow(matchId)).facts
      expect(facts.map((fact) => fact.text)).toEqual(["Works as a nurse", "Works nights"])
      // The draft written on the same pass already knew them.
      expect(drafts()[0].text).toContain("- Works as a nurse")

      await deleteFact(userId, matchId, facts[1].id, db, clock)
      await saveFact(userId, matchId, facts[0].id, "Nurse at St Mike's", db, clock)
      await db.insert(dateMessages).values({ id: uuid(), userId, matchId, direction: "in", sentBy: "them", text: "Off tonight though", hash: messageHash("Off tonight though"), status: "sent", position: 3, createdAt: clock })
      await db.update(dateMatches).set({ draft: "", messagesFromThem: 2 }).where(eq(dateMatches.id, matchId))
      notes.push({ ...NO_NOTES, newFacts: ["Works nights", "Off tonight"] })
      answers.push(draft("Lucky you"))
      await pass()
      const after = await loadMatchDetail(userId, matchId, db, clock)
      expect(after.facts.map((fact) => [fact.text, fact.edited])).toEqual([
        ["Nurse at St Mike's", true],
        ["Off tonight", false],
      ])
      // The deleted one is still known, so the AI was told not to add it.
      expect(asked.filter((question) => question.label.endsWith("chat for notes"))[1].text).toContain("- Works nights")
    })
  })

  describe("part 3, nudge a quiet chat", () => {
    it("drafts one follow-up after three days, and never a second", async () => {
      const matchId = await chat([["in", "hey!"], ["out", "Hey Noor, good weekend?", 3.05]])
      answers.push(draft("Still alive over there?"))
      await pass()
      const nudged = await matchRow(matchId)
      expect(nudged).toMatchObject({ draft: "Still alive over there?", draftKind: "nudge" })
      expect(nudged.nudgedAt).not.toBeNull()
      expect(drafts()[0].text).toContain("no answer for three days")

      // A week later, with the nudge cleared, there is still no second one.
      await db.update(dateMatches).set({ draft: "" }).where(eq(dateMatches.id, matchId))
      clock = new Date(clock.getTime() + 7 * DAY)
      await pass()
      expect(drafts()).toHaveLength(1)
    })

    it("does not nudge a chat that has been quiet for less than three days", async () => {
      await chat([["in", "hey!"], ["out", "Hey Noor", NUDGE_AFTER_MS / DAY - 0.1]])
      await pass()
      expect(drafts()).toHaveLength(0)
    })
  })

  describe("part 4, a chat that is over", () => {
    it("marks it done with their line and writes nothing, until Not over", async () => {
      const matchId = await chat([["out", "Drink this week?"], ["in", "I've started seeing someone, sorry!"]])
      answers.push({ kind: "ended", text: "", question: "", flag: "none", proposesDate: false, endedLine: "I've started seeing someone, sorry!" })
      await pass()
      const ended = await matchRow(matchId)
      expect(ended).toMatchObject({ endedLine: "I've started seeing someone, sorry!", draft: "" })
      expect(ended.endedAt).not.toBeNull()
      expect((await draftReply(matchId, db, clock, { ask })).words).toBe("The AI read this chat as over. Press Not over to let it write here again.")

      await setNotOver(userId, matchId, db, clock)
      answers.push(draft("No worries, good luck!"))
      await pass()
      expect((await matchRow(matchId)).draft).toBe("No worries, good luck!")
    })
  })

  describe("part 5, dates waiting for you", () => {
    it("notes a yes to the date and the number they sent", async () => {
      const matchId = await chat([["out", "Drink sometime? I'm 416 555 0100"], ["in", "yes, I'd love that, 647 555 0182"]], { dateProposedAt: clock })
      notes.push({ ...NO_NOTES, dateAccepted: true, acceptedLine: "yes, I'd love that, 647 555 0182", phoneNumber: "647 555 0182" })
      answers.push(draft("Great, I'll text you"))
      answers.push({ lines: ["She loves Basecamp", "Nights shift", "Wants tacos"] })
      await pass()
      const accepted = await matchRow(matchId)
      expect(accepted).toMatchObject({ theirNumber: "647 555 0182", dateAcceptedLine: "yes, I'd love that, 647 555 0182" })
      expect(accepted.dateAcceptedAt).not.toBeNull()
      // Part 13: the brief is made once the date is agreed.
      expect(accepted.briefLines).toEqual(["She loves Basecamp", "Nights shift", "Wants tacos"])
    })

    it("keeps no number that is not in one of their own messages", async () => {
      const matchId = await chat([["out", "My number is 416 555 0100"], ["in", "cool"]], { dateProposedAt: clock })
      notes.push({ ...NO_NOTES, phoneNumber: "416 555 0100" })
      answers.push(draft("So, Saturday?"))
      await pass()
      expect((await matchRow(matchId)).theirNumber).toBe("")
    })

    it("counts no yes before a date was offered", async () => {
      const matchId = await chat([["in", "yes!"]])
      notes.push({ ...NO_NOTES, dateAccepted: true, acceptedLine: "yes!" })
      answers.push(draft("Yes to what?"))
      await pass()
      expect((await matchRow(matchId)).dateAcceptedAt).toBeNull()
    })
  })

  describe("part 6, three drafts", () => {
    it("keeps the first as the draft and the other two as choices, and automate sends the first", async () => {
      await settings({ automate: true, replyDelayMin: 0, replyDelayMax: 0 })
      const matchId = await chat([["in", "Tacos or ramen?"]])
      answers.push(draft("Tacos, always", { alternatives: ["Ramen in winter, tacos in summer", "Why not both"] }))
      expect((await draftReply(matchId, db, clock, { ask }, { anyTurn: true, three: true })).status).toBe("done")
      expect(await matchRow(matchId)).toMatchObject({ draft: "Tacos, always", draftChoices: ["Ramen in winter, tacos in summer", "Why not both"] })
      expect(drafts()[0].text).toContain("Write three different messages")
      await pass()
      const [ours] = (await db.select().from(dateMessages).where(eq(dateMessages.matchId, matchId))).filter((message) => message.direction === "out")
      expect(ours.text).toBe("Tacos, always")
    })
  })

  describe("part 7, tidy", () => {
    it("puts the member's words in their voice and saves nothing", async () => {
      const matchId = await chat([["in", "Saturday works?"]])
      answers.push(draft("Saturday works for me. Coffee?"))
      const tidied = await tidyReply(matchId, "ya sat works for me, coffee?", db, clock, { ask })
      expect(tidied).toEqual({ status: "done", words: "", text: "Saturday works for me. Coffee?" })
      expect(drafts()[0].text).toContain("The member's words: ya sat works for me, coffee?")
      expect((await matchRow(matchId)).draft).toBe("")
    })
  })

  describe("part 8, the member's voice from what they send", () => {
    it("learns from their own words in other chats, not the AI's and not drafts sent unchanged", async () => {
      await chat([["out", "honestly the purple route is evil"]], { theirName: "Ava" })
      await chat([["out", "the AI wrote this one"]], { theirName: "Bea" }, "ai")
      const unchanged = await chat([], { theirName: "Cat" })
      const id = await createOutgoingMessage(unchanged, "sent as drafted", "member", { proposesDate: false, draftText: "sent as drafted" }, db, clock)
      await db.update(dateMessages).set({ status: "sent", sentAt: clock }).where(eq(dateMessages.id, id))
      const matchId = await chat([["in", "Climb much?"]])
      expect(await learnedSends(account.id, matchId, db)).toEqual(["honestly the purple route is evil"])
      answers.push(draft("Badly"))
      await draftReply(matchId, db, clock, { ask })
      expect(drafts()[0].system).toContain("- honestly the purple route is evil")
      expect(drafts()[0].system).not.toContain("the AI wrote this one")

      await settings({ learnFromSends: false })
      await db.update(dateMatches).set({ draft: "" }).where(eq(dateMatches.id, matchId))
      answers.push(draft("Badly"))
      await draftReply(matchId, db, clock, { ask })
      expect(drafts()[1].system).not.toContain("purple route")
    })
  })

  describe("part 9, warming or cooling", () => {
    const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)
    it("reads longer, faster answers as warming and shorter, slower ones as cooling", () => {
      const turns = (lengths: number[], gaps: number[]) => {
        const list: Array<{ direction: "in" | "out"; length: number; at: Date }> = []
        let minute = 0
        lengths.forEach((length, index) => {
          list.push({ direction: "out", length: 20, at: at(minute) })
          minute += gaps[index]
          list.push({ direction: "in", length, at: at(minute) })
          minute += 5
        })
        return list
      }
      expect(chatTrend(turns([10, 12, 10, 40, 45, 50], [120, 120, 120, 10, 10, 10])).trend).toBe("warming")
      expect(chatTrend(turns([60, 50, 55, 10, 8, 9], [10, 10, 10, 300, 300, 300])).trend).toBe("cooling")
      expect(chatTrend(turns([30, 30, 30, 30, 30, 30], [30, 30, 30, 30, 30, 30])).trend).toBe("steady")
      expect(chatTrend(turns([30, 30], [5, 5]))).toEqual({ trend: "too_early", reason: "Too early to tell: 2 of the 6 messages from them it needs." })
    })
  })

  describe("part 10, moved to text", () => {
    it("writes nothing in a chat moved to text", async () => {
      const matchId = await chat([["in", "texting you now"]])
      await setMovedToText(userId, matchId, true, db, clock)
      await pass()
      expect(drafts()).toHaveLength(0)
      await setMovedToText(userId, matchId, false, db, clock)
      expect((await matchRow(matchId)).movedToTextAt).toBeNull()
    })
  })

  describe("part 11, they unmatched", () => {
    const owner = () => ({ userId, workspaceId, accountId: account.id, phoneId })
    const listed = (name: string) => ({ name, preview: "", avatarHash: "", photoId: null, isNew: false })

    it("marks a chat with messages missing from two complete reads in a row, and nothing else", async () => {
      const noor = await chat([["in", "hi"]], { theirName: "Noor" })
      const ava = await chat([["in", "hey"]], { theirName: "Ava" })
      const quiet = await chat([], { theirName: "Bea" })
      // A read that did not reach the bottom of the list says nothing.
      await saveChatList(owner(), [listed("Ava")], db, clock, false)
      expect((await matchRow(noor)).missingReads).toBe(0)
      expect((await saveChatList(owner(), [listed("Ava")], db, clock, true)).theyUnmatched).toEqual([])
      expect((await matchRow(noor)).missingReads).toBe(1)
      expect((await saveChatList(owner(), [listed("Ava")], db, clock, true)).theyUnmatched).toEqual([noor])
      expect(await matchRow(noor)).toMatchObject({ unmatchedBy: "them" })
      expect((await matchRow(ava)).unmatchedAt).toBeNull()
      // A match with no messages sits in the row across the top, which is never read to its end.
      expect((await matchRow(quiet)).unmatchedAt).toBeNull()
    })

    it("starts the count again when the chat shows up", async () => {
      const noor = await chat([["in", "hi"]], { theirName: "Noor" })
      await saveChatList(owner(), [], db, clock, true)
      await saveChatList(owner(), [listed("Noor")], db, clock, true)
      await saveChatList(owner(), [], db, clock, true)
      expect(await matchRow(noor)).toMatchObject({ missingReads: 1, unmatchedAt: null })
    })
  })

  describe("part 12, clear dead matches", () => {
    it("lists only matches silent for 30 days and puts one unmatch each on the phone's list", async () => {
      const old = await chat([["in", "hi", 31]], { theirName: "Old", lastMessageAt: new Date(clock.getTime() - 31 * DAY) })
      await chat([["in", "hi", 29]], { theirName: "Recent", lastMessageAt: new Date(clock.getTime() - 29 * DAY) })
      await chat([["in", "bye", 40]], { theirName: "Over", lastMessageAt: new Date(clock.getTime() - 40 * DAY), endedAt: clock })
      const never = await chat([], { theirName: "Never", matchedAt: new Date(clock.getTime() - 35 * DAY) })
      expect((await deadMatches(account.id, db, clock)).map((match) => match.theirName)).toEqual(["Never", "Old"])
      const result = await clearDeadMatches(account, [old, never, uuid()], db, clock)
      expect(result.queued).toEqual([old, never])
      expect(result.skipped).toHaveLength(1)
      const walks = await db.select().from(dateWalks).where(eq(dateWalks.kind, "unmatch"))
      expect(walks.map((walk) => walk.input.matchId).sort()).toEqual([old, never].sort())
    })
  })

  describe("Dismiss on the AI's draft (task features/05-dashboard-layout)", () => {
    it("drops the draft and its choices, writes none for the same message, and drafts again once they write", async () => {
      const matchId = await chat([["in", "hey"]], { draft: "Hey back", draftChoices: ["Hi", "Hello"], draftSendAt: clock })
      await dismissDraft(userId, matchId, db, clock)
      expect(await matchRow(matchId)).toMatchObject({ draft: "", draftChoices: [], draftSendAt: null })

      // No answer is queued: had the pass asked the AI, drafts() would count it.
      await pass()
      expect(drafts()).toHaveLength(0)
      expect((await matchRow(matchId)).draft).toBe("")

      await db.insert(dateMessages).values({ id: uuid(), userId, matchId, direction: "in", sentBy: "them", text: "you there?", hash: messageHash("you there?"), status: "sent", position: 2, createdAt: clock })
      await db.update(dateMatches).set({ messagesFromThem: 2 }).where(eq(dateMatches.id, matchId))
      answers.push(draft("Here! Long day"))
      await pass()
      expect((await matchRow(matchId)).draft).toBe("Here! Long day")
    })

    it("holds back a first message the member dismissed, with nothing in the chat yet", async () => {
      const cardId = uuid()
      await db.insert(dateProfiles).values({ id: cardId, userId, workspaceId, accountId: account.id, phoneId, name: "Ana", age: 30, readAt: clock })
      const matchId = await chat([], { profileId: cardId, theirName: "Ana", draft: "Hi Ana", draftKind: "opener" })
      await dismissDraft(userId, matchId, db, clock)
      expect((await matchRow(matchId)).draftDismissedFor).toBe("opener")
      await pass()
      expect(drafts()).toHaveLength(0)
    })
  })

  describe("mass select, moved to text for several chats (task features/05-dashboard-layout)", () => {
    it("moves the live chats in one write, drops their drafts, and skips one already moved, one unmatched and one that is not there", async () => {
      const ana = await chat([["in", "hi"]], { theirName: "Ana", draft: "Hey Ana" })
      const bea = await chat([["in", "hi"]], { theirName: "Bea" })
      const moved = await chat([["in", "hi"]], { theirName: "Moved", movedToTextAt: new Date(clock.getTime() - DAY) })
      const gone = await chat([["in", "hi"]], { theirName: "Gone", unmatchedAt: clock })
      const result = await setManyMovedToText(userId, [ana, bea, moved, gone, uuid()], db, clock)
      expect(result.moved).toEqual([ana, bea])
      expect(result.skipped).toHaveLength(3)
      expect(await matchRow(ana)).toMatchObject({ movedToTextAt: clock, draft: "" })
      // The one moved yesterday keeps its own day.
      expect((await matchRow(moved)).movedToTextAt).toEqual(new Date(clock.getTime() - DAY))
      expect((await matchRow(gone)).movedToTextAt).toBeNull()
    })
  })

  describe("part 14, which openers work", () => {
    it("counts openers by kind, and an answer within three days as a reply", async () => {
      const answered = await chat([])
      const ignored = await chat([])
      for (const [matchId, style] of [[answered, "joke"], [ignored, "joke"]] as const) {
        const id = await createOutgoingMessage(matchId, `opener for ${matchId}`, "member", { proposesDate: false, draftText: `opener for ${matchId}`, openerStyle: style }, db, clock)
        await db.update(dateMessages).set({ status: "sent", sentAt: clock }).where(eq(dateMessages.id, id))
      }
      await db.insert(dateMessages).values({ id: uuid(), userId, matchId: answered, direction: "in", sentBy: "them", text: "haha", hash: messageHash("haha"), status: "sent", position: 2, createdAt: new Date(clock.getTime() + DAY) })
      expect(await openerTally(account.id, db)).toEqual([{ style: "joke", sent: 2, replied: 1 }])
    })
  })

  describe("part 15, the date in Google Calendar", () => {
    it("adds, moves and removes the date's event, and needs a yes first", async () => {
      vi.stubEnv("CUSTOM_SHELL_GOOGLE_CLIENT_ID", "client")
      vi.stubEnv("CUSTOM_SHELL_GOOGLE_CLIENT_SECRET", "secret")
      const matchId = await chat([["in", "yes!"]], { theirName: "Noor" })
      await expect(setDatePlan(userId, matchId, { dateAt: clock, place: "Bar Raval" }, db, clock)).rejects.toThrow("has not said yes to a date yet")
      await db.update(dateMatches).set({ dateAcceptedAt: clock }).where(eq(dateMatches.id, matchId))

      const calls: Array<{ method: string; url: string; body: string }> = []
      const fetcher: Fetcher = async (input, init) => {
        const url = String(input)
        calls.push({ method: init?.method ?? "GET", url, body: String(init?.body ?? "") })
        if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "access" })
        if (init?.method === "DELETE") return new Response(null, { status: 204 })
        return Response.json({ id: "event-1" })
      }
      // Not connected: nothing is written.
      await setDatePlan(userId, matchId, { dateAt: new Date("2099-01-03T19:00:00Z"), place: "Bar Raval" }, db, clock)
      expect(await syncDateEvent(userId, matchId, db, fetcher)).toBe("none")
      expect(calls).toHaveLength(0)

      await db.insert(dateGoogleCalendars).values({ accountId: account.id, userId, workspaceId, email: "me@example.com", refreshTokenEncrypted: encryptSecret("refresh") })
      expect(await syncDateEvent(userId, matchId, db, fetcher)).toBe("written")
      const added = calls.find((call) => call.method === "POST" && call.url.includes("/events"))
      expect(JSON.parse(added!.body)).toMatchObject({ summary: "Date with Noor", location: "Bar Raval", start: { dateTime: "2099-01-03T19:00:00.000Z" }, end: { dateTime: "2099-01-03T21:00:00.000Z" } })
      expect((await matchRow(matchId)).googleEventId).toBe("event-1")

      await setDatePlan(userId, matchId, { dateAt: new Date("2099-01-04T19:00:00Z"), place: "Bar Raval" }, db, clock)
      await syncDateEvent(userId, matchId, db, fetcher)
      expect(calls.some((call) => call.method === "PATCH" && call.url.endsWith("/events/event-1"))).toBe(true)

      await setDatePlan(userId, matchId, { dateAt: null, place: "" }, db, clock)
      expect(await syncDateEvent(userId, matchId, db, fetcher)).toBe("deleted")
      expect(await matchRow(matchId)).toMatchObject({ googleEventId: "", datePlace: "" })
      // Never a read of the calendar.
      expect(calls.filter((call) => call.method === "GET")).toHaveLength(0)
    })
  })

  describe("part 16, scam warnings", () => {
    it("flags a chat that asks for money and writes no draft", async () => {
      const matchId = await chat([["in", "can you send me $50 on Cash App"]])
      answers.push({ kind: "flag", text: "", question: "", flag: "scam", proposesDate: false })
      await pass()
      expect(await matchRow(matchId)).toMatchObject({ flaggedReason: "scam", draft: "" })
      expect(drafts()[0].system).toContain("flag scam")
    })
  })

  describe("part 17, ready to automate", () => {
    it("counts the member's sends that went exactly as the AI drafted them", async () => {
      const matchId = await chat([])
      for (const [text, drafted] of [["same words", "same words"], ["changed", "the AI's words"], ["no draft at all", null]] as const) {
        const id = await createOutgoingMessage(matchId, text, "member", { proposesDate: false, draftText: drafted }, db, clock)
        await db.update(dateMessages).set({ status: "sent", sentAt: clock }).where(eq(dateMessages.id, id))
      }
      expect(await draftsSentUnchanged(account.id, db)).toEqual({ unchanged: 1, of: 2 })
    })
  })

  describe("parts 18 to 20, the off switch, the note and tone", () => {
    it("writes nothing in a chat the member took over, and clears its waiting draft", async () => {
      const matchId = await chat([["in", "hi"]], { draft: "Hi!", draftSendAt: clock })
      await setAiDrafts(userId, matchId, false, db, clock)
      expect(await matchRow(matchId)).toMatchObject({ aiOff: true, draft: "", draftSendAt: null })
      await pass()
      expect(drafts()).toHaveLength(0)
    })

    it("gives the note to that chat's draft only, and asks for the tone", async () => {
      const noted = await chat([["in", "hi"]], { memberNote: "She's moving in March, keep it light" })
      const other = await chat([["in", "hey"]], { theirName: "Ava" })
      answers.push(draft("hey you"), draft("hi Ava"))
      await draftReply(noted, db, clock, { ask }, { tone: "shorter" })
      await draftReply(other, db, clock, { ask })
      expect(drafts()[0].text).toContain("The member's note about this chat: She's moving in March, keep it light")
      expect(drafts()[0].text).toContain("Make it shorter")
      expect(drafts()[1].text).not.toContain("moving in March")
    })
  })

  describe("part 21, Ask Date", () => {
    it("answers from the facts and points at the matches", async () => {
      const dog = await chat([], { theirName: "Noor", facts: [{ id: "f1", text: "Has a dog called Biscuit", edited: false }] })
      await chat([], { theirName: "Ava", facts: [{ id: "f2", text: "Allergic to dogs", edited: false, deleted: true }] })
      answers.push({ answers: [{ match: 1, why: "Has a dog called Biscuit" }, { match: 9, why: "nobody" }] })
      expect(await askAboutMatches({ userId, accountId: account.id }, "who has a dog?", db, clock, { ask })).toEqual([{ matchId: dog, theirName: "Noor", why: "Has a dog called Biscuit" }])
      // A deleted fact is never searched.
      expect(asked[0].text).not.toContain("Allergic")
    })
  })

  describe("found in the audit", () => {
    it("tries a failed brief once, not on every pass", async () => {
      await chat([["out", "Coffee?"], ["in", "yes!"]], { dateProposedAt: clock, dateAcceptedAt: clock, notesReadThrough: 2 })
      answers.push(draft("Great"))
      // No answer is given for the brief, so Claude fails it.
      await pass()
      await pass()
      await pass()
      expect(asked.filter((question) => question.label.startsWith("Making the brief"))).toHaveLength(1)
    })

    it("reads a chat for notes once per new message, even when the call fails", async () => {
      const matchId = await chat([["in", "hey"]])
      const failing: AiAsk = async (question) => {
        asked.push({ system: question.system, text: question.text, label: question.label })
        throw new Error("Anthropic answered with an error (HTTP 400): Your credit balance is too low.")
      }
      expect((await readChatNotes(matchId, db, clock, { ask: failing })).status).toBe("failed")
      clock = new Date(clock.getTime() + 10 * 60_000)
      expect((await readChatNotes(matchId, db, clock, { ask: failing })).status).toBe("skipped")
      expect(asked).toHaveLength(1)
    })

    it("marks a chat read through its newest message even when that message never went", async () => {
      const matchId = await chat([["in", "hey"]])
      await db.insert(dateMessages).values({ id: uuid(), userId, matchId, direction: "out", sentBy: "member", text: "hi", hash: messageHash("hi"), status: "failed", position: 2, createdAt: clock })
      await readChatNotes(matchId, db, clock, { ask })
      expect((await matchRow(matchId)).notesReadThrough).toBe(2)
    })

    it("puts a chat marked unmatched back when it shows up again, instead of making a second one", async () => {
      const owner = { userId, workspaceId, accountId: account.id, phoneId }
      const noor = await chat([["in", "hi"]], { theirName: "Noor" })
      await saveChatList(owner, [], db, clock, true)
      await saveChatList(owner, [], db, clock, true)
      expect((await matchRow(noor)).unmatchedBy).toBe("them")
      // A bad read: she was there all along.
      await saveChatList(owner, [{ name: "Noor", preview: "hi", avatarHash: "", photoId: null, isNew: false }], db, clock, true)
      const rows = await db.select().from(dateMatches)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ unmatchedAt: null, unmatchedBy: null, missingReads: 0 })
    })

    it("notes a yes to a date the member offered in their own words", async () => {
      const matchId = await chat([["out", "we should grab a coffee"], ["in", "yes let's!"]])
      notes.push({ ...NO_NOTES, memberOffered: true, dateAccepted: true, acceptedLine: "yes let's!" })
      await readChatNotes(matchId, db, clock, { ask })
      const row = await matchRow(matchId)
      expect(row.dateAcceptedLine).toBe("yes let's!")
      expect(row.dateProposedAt).not.toBeNull()
    })
  })

  it("never sends a sample chat to the AI for notes", async () => {
    await chat([["in", "I'm a nurse"]], { sample: true })
    await pass()
    expect(asked).toHaveLength(0)
    const matches = await db.select().from(dateMatches).orderBy(asc(dateMatches.createdAt))
    expect((await readChatNotes(matches[0].id, db, clock, { ask })).status).toBe("busy")
  })
})
