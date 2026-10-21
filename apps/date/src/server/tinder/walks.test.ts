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
import { saveDatingSettings } from "@/server/dating/settings"
import { DEFAULT_DATING_SETTINGS } from "@/lib/dating/settings"
import { datePhones } from "@/server/phone/schema"

import { fakeCard, FakeTinder, type FakeTinderSetup } from "./fixtures/fake-tinder"
import { claimNextWalk, expireWalkLeases, queueWalk, resumePhone, runWalk, runWalkList } from "./jobs"
import { dateMatches, dateMessages, dateOwnProfiles, dateProfiles, dateWalks } from "./schema"
import { createOutgoingMessage } from "./store"

const T0 = new Date("2099-01-01T12:00:00Z")

/**
 * Part 2 of the Tinder task: every walk, run through the job list exactly as
 * the background pass runs it, against a pretend Tinder built from the
 * hand-made screens in `fixtures/`. Nothing here has been checked against a
 * real phone yet; that is the first run with Tyler's phone.
 */
describe("Tinder walks", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let fake: FakeTinder

  beforeEach(async () => {
    r2.clear()
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    phoneId = uuid()
    await db.insert(datePhones).values({
      id: phoneId,
      userId,
      workspaceId,
      name: "Pixel 8a",
      keyEncrypted: "paired",
      timeZone: "UTC",
      lastSeenAt: T0,
    })
    account = await insertAccount(db, { userId, workspaceId, phoneId })
    clock = T0
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  function phone(setup: FakeTinderSetup) {
    fake = new FakeTinder(setup)
  }

  /**
   * Queues a walk, claims walks the way the pass does, and runs them against
   * the pretend Tinder until this one has run. A walk an earlier one put on
   * the list, such as reading a changed conversation, runs first, as it would.
   */
  async function run(kind: Parameters<typeof queueWalk>[0]["kind"], input: Record<string, unknown> = {}, askedBy: "member" | "ai" = "member") {
    clock = new Date(clock.getTime() + 20_000)
    const id = await queueWalk({ userId, accountId: account.id, phoneId, kind, input, askedBy }, db, clock)
    for (let tries = 0; tries < 10; tries += 1) {
      const walk = await claimNextWalk(phoneId, db, clock)
      expect(walk).not.toBeNull()
      await runWalk(walk!, db, { drive: fake.drive, now: () => clock })
      if (walk!.id === id) break
    }
    const [row] = await db.select().from(dateWalks).where(eq(dateWalks.id, id))
    return row
  }

  async function onlyProfile() {
    const rows = await db.select().from(dateProfiles)
    expect(rows).toHaveLength(1)
    return rows[0]
  }

  describe("read-card", () => {
    it("reads the card in front, every photo and the full profile, and leaves the same card in front", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")] })
      const walk = await run("read-card")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ name: "Maya", age: 27, photos: 4, profileOpened: true })

      const card = await onlyProfile()
      expect(card).toMatchObject({
        name: "Maya",
        age: 27,
        distance: "3 kilometres away",
        verified: true,
        bio: "Coffee first, then climbing. Looking for someone to explore the city's bakeries with.",
        job: "Graphic designer at Studio North",
        school: "University of Toronto",
        swipe: "none",
        handles: { instagram: "@maya.draws", spotifyArtists: ["Phoebe Bridgers", "Bon Iver"] },
      })
      expect(card.photoIds).toHaveLength(4)
      expect(new Set(card.photoIds).size).toBe(4)
      expect(card.sections.map((section) => section.heading)).toEqual(["About me", "Looking for", "Interests", "Instagram", "Top Spotify Artists"])
      expect(card.texts).toContain("Climbing")
      expect(card.texts).not.toContain("Recently Active")
      // The phone is back on Maya's card, not on the next one.
      expect(fake.screen).toBe("discover")
      expect(fake.card?.name).toBe("Maya")
      expect(fake.liked).toEqual([])
    })

    it("keeps one card when the same person is read twice before a swipe", async () => {
      phone({ cards: [fakeCard("Maya")] })
      await run("read-card")
      // The phone shows the first photo again, as it would after a while.
      fake.photoIndex = 0
      await run("read-card")
      await onlyProfile()
    })

    it("says so when Tinder has nobody new, without failing", async () => {
      phone({ cards: [] })
      const walk = await run("read-card")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ empty: true })
    })
  })

  describe("like and pass", () => {
    it("likes the card that was read, records who did it, and turns a match into a match", async () => {
      phone({ cards: [fakeCard("Maya", { likesBack: true }), fakeCard("Ines")] })
      await run("read-card")
      const card = await onlyProfile()
      const walk = await run("like", { profileId: card.id }, "ai")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ swipe: "like", matched: true })
      expect(fake.liked).toEqual(["Maya"])

      const [after] = await db.select().from(dateProfiles)
      expect(after).toMatchObject({ swipe: "like", swipedBy: "ai" })
      const [match] = await db.select().from(dateMatches)
      expect(match).toMatchObject({ theirName: "Maya", profileId: card.id, photoId: card.photoIds[0] })
      // Back on the next card, not on the match screen.
      expect(fake.screen).toBe("discover")
      expect(fake.card?.name).toBe("Ines")
    })

    it("passes on a card", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")] })
      await run("read-card")
      const card = await onlyProfile()
      expect((await run("pass", { profileId: card.id })).status).toBe("done")
      expect(fake.passed).toEqual(["Maya"])
      expect((await onlyProfile()).swipe).toBe("pass")
    })

    it("swipes nothing when the card in front is somebody else now", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")] })
      await run("read-card")
      const card = await onlyProfile()
      fake.cardIndex = 1
      const walk = await run("like", { profileId: card.id })
      expect(walk.status).toBe("failed")
      expect(walk.error).toBe("The card in front is Ines 27 now, not Maya. Nothing was swiped.")
      expect(fake.liked).toEqual([])
      expect((await onlyProfile()).swipe).toBe("none")
    })

    it("swipes nothing when the card has the same name and age but other photos", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Maya", { twinOf: "Maya" })] })
      await run("read-card")
      const card = await onlyProfile()
      fake.cardIndex = 1
      const walk = await run("like", { profileId: card.id })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/its photos are not the ones that were read/)
      expect(fake.liked).toEqual([])
    })

    it("refuses to swipe a card twice", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")] })
      await run("read-card")
      const card = await onlyProfile()
      await run("like", { profileId: card.id })
      const again = await run("like", { profileId: card.id })
      expect(again.status).toBe("failed")
      expect(again.error).toMatch(/already liked/)
      expect(fake.liked).toEqual(["Maya"])
    })
  })

  describe("stop screens", () => {
    it("stops the phone when Tinder says out of likes, without recording the like", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines")], likesLeft: 0 })
      await run("read-card")
      const card = await onlyProfile()
      await db.update(datePhones).set({ running: true }).where(eq(datePhones.id, phoneId))
      clock = new Date(clock.getTime() + 20_000)
      const likeId = await queueWalk({ userId, accountId: account.id, phoneId, kind: "like", input: { profileId: card.id }, askedBy: "member" }, db, clock)
      // Something else waiting behind it is called off too.
      await queueWalk({ userId, accountId: account.id, phoneId, kind: "read-matches", askedBy: "member" }, db, new Date(clock.getTime() + 1))
      const claimed = await claimNextWalk(phoneId, db, clock)
      expect(claimed?.id).toBe(likeId)
      await runWalk(claimed!, db, { drive: fake.drive, now: () => clock })
      const [walk] = await db.select().from(dateWalks).where(eq(dateWalks.id, likeId))
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/out of likes/)
      expect((await onlyProfile()).swipe).toBe("none")

      const [stopped] = await db.select().from(datePhones)
      expect(stopped).toMatchObject({ stoppedReason: "out_of_likes", running: false, stopWhy: "Tinder says you are out of likes" })
      expect(stopped.stoppedWords).toBe("Tinder gives likes again in about 12 hours.")
      expect(stopped.stoppedPictureId).not.toBeNull()
      const waiting = await db.select().from(dateWalks).where(eq(dateWalks.kind, "read-matches"))
      expect(waiting[0]).toMatchObject({ status: "cancelled" })
      // Nothing more can be asked for until Resume.
      await expect(queueWalk({ userId, accountId: account.id, phoneId, kind: "read-card", askedBy: "member" }, db, clock)).rejects.toThrow(/Resume/)
    })

    it("on Resume, looks at Tinder again and stops again if the screen is still there", async () => {
      phone({ verificationWall: true })
      expect((await run("read-card")).status).toBe("failed")
      expect((await db.select().from(datePhones))[0].stoppedReason).toBe("verification")
      const id = await resumePhone(account, db, clock)
      const walk = await claimNextWalk(phoneId, db, clock)
      expect(walk?.id).toBe(id)
      await runWalk(walk!, db, { drive: fake.drive, now: () => clock })
      expect((await db.select().from(datePhones))[0].stoppedReason).toBe("verification")
    })

    it("stops on a signed-out Tinder and on Tinder not installed", async () => {
      phone({ signedIn: false })
      await run("read-card")
      expect((await db.select().from(datePhones))[0].stoppedReason).toBe("not_signed_in")

      await db.update(datePhones).set({ stoppedReason: null })
      phone({ installed: false })
      await run("read-card")
      expect((await db.select().from(datePhones))[0].stoppedReason).toBe("tinder_missing")
    })

    it("fails the walk but stops nothing when another app is in front", async () => {
      phone({ cards: [fakeCard("Maya")], otherAppInFront: "com.whatsapp" })
      const walk = await run("read-card")
      expect(walk.status).toBe("failed")
      expect(walk.error).toBe("Tinder was not in front: the phone showed com.whatsapp. This stopped there and nothing else was done.")
      expect((await db.select().from(datePhones))[0].stoppedReason).toBeNull()
    })
  })

  describe("chats", () => {
    const chats = () => [
      { name: "Ava", preview: "", isNew: true, bubbles: [] },
      {
        name: "Noor",
        preview: "Haha that's the best one",
        isNew: false,
        bubbles: [
          { direction: "out" as const, text: "Your climbing photo is great" },
          { direction: "in" as const, text: "Thanks! Do you climb?" },
          { direction: "out" as const, text: "Badly, but yes" },
          { direction: "in" as const, text: "Bouldering or ropes?" },
          { direction: "out" as const, text: "Bouldering, mostly at Basecamp" },
          { direction: "in" as const, text: "No way, that's my gym" },
          { direction: "out" as const, text: "Then you've seen me fall off the purple one" },
          { direction: "in" as const, text: "Haha that's the best one" },
        ],
      },
    ]

    it("reads the chat list into matches and reads each changed conversation after it", async () => {
      phone({ chats: chats() })
      const walk = await run("read-matches")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ listed: 2, added: 2 })
      const matches = await db.select().from(dateMatches).orderBy(asc(dateMatches.theirName))
      expect(matches.map((match) => [match.theirName, match.lastPreview, match.needsRead])).toEqual([
        ["Ava", "", false],
        ["Noor", "Haha that's the best one", true],
      ])
      expect(matches.every((match) => match.avatarHash.length === 16 && match.photoId)).toBe(true)
      // Noor's conversation is on the list to be read next.
      const next = await db.select().from(dateWalks).where(eq(dateWalks.kind, "read-conversation"))
      expect(next).toHaveLength(1)
      expect(next[0].input).toEqual({ matchId: matches[1].id })
    })

    it("reads a whole conversation in order, scrolling back past the first screenful", async () => {
      phone({ chats: chats() })
      await run("read-matches")
      const [noor] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Noor"))
      const walk = await run("read-conversation", { matchId: noor.id })
      expect(walk.status).toBe("done")
      const messages = await db.select().from(dateMessages).orderBy(asc(dateMessages.position))
      expect(messages.map((message) => [message.direction, message.sentBy, message.text])).toEqual(
        chats()[1].bubbles.map((bubble) => [bubble.direction, bubble.direction === "in" ? "them" : "member", bubble.text])
      )
      const [after] = await db.select().from(dateMatches).where(eq(dateMatches.id, noor.id))
      expect(after).toMatchObject({ messagesFromThem: 4, messagesFromUs: 4, unreadCount: 4, needsRead: false })

      // A new message from them is added once, at the end.
      fake.chats[1].bubbles.push({ direction: "in", text: "Saturday?" })
      await run("read-conversation", { matchId: noor.id })
      const again = await db.select().from(dateMessages).orderBy(asc(dateMessages.position))
      expect(again).toHaveLength(9)
      expect(again[8]).toMatchObject({ text: "Saturday?", direction: "in" })
    })

    it("marks a chat they unmatched once two complete reads of the list miss it", async () => {
      phone({ chats: chats() })
      await run("read-matches")
      const [noor] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Noor"))
      await run("read-conversation", { matchId: noor.id })
      // Noor unmatched: Tinder's list no longer shows her.
      fake.chats = fake.chats.filter((chat) => chat.name !== "Noor")
      const first = await run("read-matches")
      expect(first.result).toMatchObject({ complete: true, theyUnmatched: [] })
      const second = await run("read-matches")
      expect(second.result).toMatchObject({ complete: true, theyUnmatched: [noor.id] })
      const [after] = await db.select().from(dateMatches).where(eq(dateMatches.id, noor.id))
      expect(after).toMatchObject({ unmatchedBy: "them" })
      expect(after.unmatchedAt).not.toBeNull()
      // Ava, a new match with no messages, is never counted.
      const [ava] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Ava"))
      expect(ava.unmatchedAt).toBeNull()
    })

    it("sends a message once, confirms it in the chat, and refuses the same words again", async () => {
      phone({ chats: chats() })
      await run("read-matches")
      const [noor] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Noor"))
      await run("read-conversation", { matchId: noor.id })
      const messageId = await createOutgoingMessage(noor.id, "Saturday morning at Basecamp?", "member", { proposesDate: true }, db, clock)
      const walk = await run("send-message", { matchId: noor.id, messageId })
      expect(walk.status).toBe("done")
      expect(fake.sent).toEqual(["Saturday morning at Basecamp?"])
      const [message] = await db.select().from(dateMessages).where(eq(dateMessages.id, messageId))
      expect(message).toMatchObject({ status: "sent", sentBy: "member" })
      const [after] = await db.select().from(dateMatches).where(eq(dateMatches.id, noor.id))
      expect(after.dateProposedAt).not.toBeNull()
      expect(after.messagesFromUs).toBe(5)

      await expect(createOutgoingMessage(noor.id, "saturday  morning at basecamp?", "ai", { proposesDate: false }, db, clock)).rejects.toThrow(
        /never sent twice/
      )
    })

    it("leaves a message unsure when Send was tapped but nothing showed, then settles it from the chat", async () => {
      phone({ chats: chats(), sendSwallowed: true })
      await run("read-matches")
      const [noor] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Noor"))
      await run("read-conversation", { matchId: noor.id })
      const messageId = await createOutgoingMessage(noor.id, "Saturday?", "member", { proposesDate: false }, db, clock)
      const walk = await run("send-message", { matchId: noor.id, messageId })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/next read of this chat will say/)
      expect((await db.select().from(dateMessages).where(eq(dateMessages.id, messageId)))[0].status).toBe("unsure")
      // It never reached Tinder, so the next read calls it not sent.
      await run("read-conversation", { matchId: noor.id })
      const [settled] = await db.select().from(dateMessages).where(eq(dateMessages.id, messageId))
      expect(settled).toMatchObject({ status: "failed", error: "It is not in the conversation on Tinder, so it was not sent." })
    })

    it("unmatches through Tinder's menu and its confirm", async () => {
      phone({ chats: chats() })
      await run("read-matches")
      const [noor] = await db.select().from(dateMatches).where(eq(dateMatches.theirName, "Noor"))
      const walk = await run("unmatch", { matchId: noor.id })
      expect(walk.status).toBe("done")
      expect(fake.unmatched).toEqual(["Noor"])
      expect((await db.select().from(dateMatches).where(eq(dateMatches.id, noor.id)))[0].unmatchedAt).not.toBeNull()
    })
  })

  describe("your own profile", () => {
    it("reads the photos and words on the edit screen without changing anything", async () => {
      phone({ me: { name: "Tyler", age: 30, photos: 3, pages: [["About me", "Product person who cooks too much."], ["Interests", "Cooking", "Running"]] } })
      const walk = await run("read-own-profile")
      expect(walk.status).toBe("done")
      const [own] = await db.select().from(dateOwnProfiles)
      expect(own).toMatchObject({ name: "Tyler", bio: "Product person who cooks too much." })
      expect(own.photoIds).toHaveLength(3)
      expect(own.sections.map((section) => section.heading)).toEqual(["About me", "Interests"])
      expect(fake.screen).toBe("profile-tab")
    })

    it("reads whose account is signed in", async () => {
      phone({ cards: [fakeCard("Maya")], me: { name: "Tyler", age: 30, photos: 0, pages: [] } })
      const walk = await run("who-is-signed-in")
      expect(walk.result).toEqual({ name: "Tyler", age: 30 })
      expect(fake.screen).toBe("discover")
    })
  })

  describe("limits", () => {
    it("refuses every walk in the phone's quiet hours, saying when it is allowed again", async () => {
      phone({ cards: [fakeCard("Maya")] })
      await db.update(datePhones).set({ timeZone: "America/Toronto" })
      // 08:00 UTC is 03:00 in Toronto in January.
      await expect(
        queueWalk({ userId, accountId: account.id, phoneId, kind: "read-card", askedBy: "ai" }, db, new Date("2099-01-01T08:00:00Z"))
      ).rejects.toThrow("Quiet hours on the phone, 1:00 to 7:00. Allowed again at 07:00.")
    })

    it("stops at the hourly swipe limit and keeps swipes 4 to 9 seconds apart", async () => {
      phone({ cards: [fakeCard("Maya"), fakeCard("Ines"), fakeCard("Lea")] })
      await saveDatingSettings(account, { ...DEFAULT_DATING_SETTINGS, swipesPerHour: 1 }, db, clock)
      await run("read-card")
      const first = await onlyProfile()
      await run("pass", { profileId: first.id })
      await run("read-card")
      const [second] = (await db.select().from(dateProfiles)).filter((row) => row.swipe === "none")
      await expect(queueWalk({ userId, accountId: account.id, phoneId, kind: "like", input: { profileId: second.id }, askedBy: "ai" }, db, clock)).rejects.toThrow(
        /^1 swipe in the last hour, the most allowed\. The next is allowed at \d\d:\d\d\.$/
      )

      // The gap only makes a swipe wait its turn.
      await saveDatingSettings(account, DEFAULT_DATING_SETTINGS, db, clock)
      const [lastSwipe] = (await db.select().from(dateProfiles)).filter((row) => row.swipe !== "none")
      const justAfter = new Date(lastSwipe.swipedAt!.getTime() + 1_000)
      await queueWalk({ userId, accountId: account.id, phoneId, kind: "like", input: { profileId: second.id }, askedBy: "ai" }, db, justAfter)
      expect(await claimNextWalk(phoneId, db, justAfter)).toBeNull()
      expect(await claimNextWalk(phoneId, db, new Date(justAfter.getTime() + 9_000))).not.toBeNull()
    })

    it("marks a walk whose process stopped as stopped part-way, and a send in it as not sent", async () => {
      phone({ chats: [] })
      const matchId = uuid()
      await db.insert(dateMatches).values({ id: matchId, userId, workspaceId, accountId: account.id, phoneId, theirName: "Noor" })
      const messageId = await createOutgoingMessage(matchId, "Hi!", "member", { proposesDate: false }, db, clock)
      await queueWalk({ userId, accountId: account.id, phoneId, kind: "send-message", input: { matchId, messageId }, askedBy: "member" }, db, clock)
      await claimNextWalk(phoneId, db, clock)
      await expireWalkLeases(db, new Date(clock.getTime() + 6 * 60_000))
      const [walk] = await db.select().from(dateWalks)
      expect(walk).toMatchObject({ status: "failed", error: "Stopped part-way: the server restarted while this was running." })
      expect((await db.select().from(dateMessages))[0].status).toBe("failed")
    })

    it("runs one walk per phone at a time from the list", async () => {
      phone({ cards: [fakeCard("Maya")], chats: [] })
      await queueWalk({ userId, accountId: account.id, phoneId, kind: "read-card", askedBy: "ai" }, db, clock)
      await queueWalk({ userId, accountId: account.id, phoneId, kind: "read-matches", askedBy: "ai" }, db, new Date(clock.getTime() + 1))
      const started = await runWalkList(db, clock, { drive: fake.drive, now: () => clock })
      expect(started).toHaveLength(1)
      // While the first runs, nothing else starts on the same phone.
      expect(await runWalkList(db, clock, { drive: fake.drive, now: () => clock })).toHaveLength(0)
      await Promise.all(started)
      const rows = await db.select().from(dateWalks).orderBy(asc(dateWalks.createdAt))
      expect(rows.map((row) => row.status)).toEqual(["done", "waiting"])
    })
  })
})
