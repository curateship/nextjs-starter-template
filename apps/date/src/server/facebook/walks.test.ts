import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
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
import { dateAccounts } from "@/server/dating/schema"
import { datePhones } from "@/server/phone/schema"
import { insertAccount } from "@/server/tinder/fixtures/accounts"
import { claimNextWalk, queueWalk, runWalk } from "@/server/tinder/jobs"
import { dateMatches, dateMessages, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { createOutgoingMessage } from "@/server/tinder/store"

import { fakeProfile, FakeFacebook, type FakeFacebookSetup } from "./fixtures/fake-facebook"

const T0 = new Date("2099-01-01T12:00:00Z")

/**
 * Task "facebook/01-facebook-dating": every Facebook Dating walk, run
 * through the job list exactly as the background pass runs it, against a
 * pretend Facebook built from hand-made screens. Nothing here has been
 * checked against a real phone yet; that is the first run with Tyler's phone.
 */
describe("Facebook Dating walks", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let phoneId: string
  let account: DatingAccount
  let clock: Date
  let fake: FakeFacebook

  beforeEach(async () => {
    r2.clear()
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    phoneId = uuid()
    await db.insert(datePhones).values({ id: phoneId, userId, workspaceId, name: "Pixel 8a", keyEncrypted: "paired", timeZone: "UTC", lastSeenAt: T0 })
    account = await insertAccount(db, { userId, workspaceId, phoneId, name: "Facebook", app: "facebook" })
    clock = T0
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  function phone(setup: FakeFacebookSetup) {
    fake = new FakeFacebook(setup)
  }

  /** Queues a walk and runs the list until it has run, the way the pass does. */
  async function run(kind: Parameters<typeof queueWalk>[0]["kind"], input: Record<string, unknown> = {}, askedBy: "member" | "ai" = "member") {
    clock = new Date(clock.getTime() + 30_000)
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

  async function profileRow() {
    return (await db.select().from(dateAccounts).where(eq(dateAccounts.id, account.id)))[0]
  }

  async function cards() {
    return db.select().from(dateProfiles)
  }

  describe("part 1, Facebook Dating profiles", () => {
    it("opens Dating from Facebook's menu, reads the profile to its end, and leaves it at its top", async () => {
      phone({ profiles: [fakeProfile("Maya"), fakeProfile("Ines")] })
      const walk = await run("read-card")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ name: "Maya", age: 29, photos: 3, instagram: 2 })
      const [card] = await cards()
      expect(card).toMatchObject({
        name: "Maya",
        age: 29,
        distance: "12 kilometres away",
        source: "card",
        bio: "Climber, baker, terrible at mini golf. Looking for someone to share the last croissant with.",
      })
      expect(card.photoIds).toHaveLength(3)
      expect(card.instagramPhotoIds).toHaveLength(2)
      expect(card.texts).toContain("Bakery crawl, then a long walk by the lake")
      expect(card.faceHash).toMatch(/^[0-9a-f]{16}$/)
      expect(fake.page).toBe(0)
      expect(fake.outside).toEqual([])
    })

    it("passes and likes the profile in front once it is checked to be the one read", async () => {
      phone({ profiles: [fakeProfile("Maya"), fakeProfile("Ines")] })
      await run("read-card")
      const [maya] = await cards()
      expect((await run("pass", { profileId: maya.id }, "ai")).status).toBe("done")
      expect(fake.passedNow).toEqual(["Maya"])
      await run("read-card")
      const ines = (await cards()).find((card) => card.name === "Ines")!
      const liked = await run("like", { profileId: ines.id }, "ai")
      expect(liked.result).toMatchObject({ swipe: "like", commented: false })
      expect(fake.liked).toEqual([{ name: "Ines", comment: "", on: "" }])
      expect((await db.select().from(dateProfiles).where(eq(dateProfiles.id, ines.id)))[0]).toMatchObject({ swipe: "like", swipedBy: "ai" })
    })

    it("records no pass when Facebook only asked whether you are sure", async () => {
      phone({ profiles: [fakeProfile("Maya"), fakeProfile("Ines")], passConfirm: true })
      await run("read-card")
      const [maya] = await cards()
      const walk = await run("pass", { profileId: maya.id })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/did not move on from Maya/)
      expect((await cards())[0].swipe).toBe("none")
    })

    it("refuses a swipe when someone else is in front, and Tinder's Super Like on a Facebook profile", async () => {
      phone({ profiles: [fakeProfile("Maya"), fakeProfile("Ines")] })
      await run("read-card")
      const [maya] = await cards()
      fake.profiles = fake.profiles.slice(1)
      const walk = await run("like", { profileId: maya.id })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/is Ines 29 now, not Maya/)
      expect(fake.liked).toEqual([])
      await expect(queueWalk({ userId, accountId: account.id, phoneId, kind: "super-like", input: { profileId: maya.id }, askedBy: "member" }, db, clock)).rejects.toThrow(
        "Date does not do that on Facebook Dating."
      )
    })
  })

  describe("text that is a person's own words", () => {
    it("never takes a bio or a message for Facebook's own screens", async () => {
      phone({
        profiles: [fakeProfile("Maya", { bio: "No more people pleasers.", lines: ["Meet cute", "Lives in Toronto"] })],
        chats: [{ name: "Ava", preview: "we need to confirm Saturday", isNew: false, bubbles: [{ direction: "in", text: "haha you're going too fast" }, { direction: "in", text: "we need to confirm Saturday" }] }],
      })
      const read = await run("read-card")
      expect(read.result).toMatchObject({ name: "Maya" })
      expect(await db.select().from(dateMatches)).toHaveLength(0)
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      expect((await run("read-conversation", { matchId: match.id })).status).toBe("done")
      expect((await profileRow()).stoppedReason).toBeNull()
      // Facebook's feed shows "Suggested for you" too; no walk ever tapped it.
      expect(fake.outside).toEqual([])
    })
  })

  describe("who is signed in", () => {
    it("reads the name in Facebook's menu, and stops when it changes", async () => {
      phone({ profiles: [fakeProfile("Maya")] })
      expect((await run("who-is-signed-in")).result).toMatchObject({ signedIn: true, name: "Tyler Pham" })
      phone({ profiles: [fakeProfile("Maya")], signedInAs: "Sam Lee" })
      expect((await run("who-is-signed-in")).status).toBe("failed")
      expect(await profileRow()).toMatchObject({ stoppedReason: "not_signed_in", stoppedWords: "Facebook is signed in as Sam Lee now, not Tyler Pham." })
    })
  })

  describe("part 3, stay inside Dating", () => {
    it("stops the profile when a step lands outside Dating, and presses nothing there", async () => {
      phone({ chats: [{ name: "Ava", preview: "hey", isNew: false, bubbles: [{ direction: "in", text: "hey" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      // Back from the conversation lands on Facebook's feed instead of Matches.
      const back = fake["back"].bind(fake)
      fake["back"] = () => {
        if (fake.screen === "conversation") fake.screen = "feed"
        else back()
      }
      // A Tinder profile runs on the same phone; leaving Dating stops everything on the phone, it too.
      const tinder = await insertAccount(db, { userId, workspaceId, phoneId, name: "Tinder" })
      await db.update(dateAccounts).set({ running: true }).where(eq(dateAccounts.id, tinder.id))
      const walk = await run("read-conversation", { matchId: match.id })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/^Left Facebook Dating.*Everything on the phone has stopped/)
      expect(await profileRow()).toMatchObject({ stoppedReason: "left_dating", running: false })
      expect((await db.select().from(dateAccounts).where(eq(dateAccounts.id, tinder.id)))[0]).toMatchObject({ stoppedReason: "left_dating", running: false })
      expect(fake.outside).toEqual([])
    })
  })

  describe("part 4, Facebook's stop screens", () => {
    it("stops on Facebook asking to confirm it's you, with Facebook named", async () => {
      phone({ checkpoint: true })
      const walk = await run("read-card")
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/^Facebook Dating is asking you to confirm it's you/)
      expect(await profileRow()).toMatchObject({ stoppedReason: "verification", stopWhy: "Facebook Dating is asking you to confirm it's you" })
    })

    it("stops when Facebook is not installed", async () => {
      phone({ installed: false })
      await run("read-card")
      expect((await profileRow()).stoppedReason).toBe("tinder_missing")
    })
  })

  describe("part 5, out of suggestions", () => {
    it("says Facebook has nobody left to suggest, without stopping the profile", async () => {
      phone({ profiles: [] })
      const walk = await run("read-card", {}, "ai")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ empty: true, outOfSuggestions: true })
      expect((await profileRow()).stoppedReason).toBeNull()
    })
  })

  describe("part 6, restart Facebook when it freezes", () => {
    it("closes and reopens Facebook once and finishes the walk", async () => {
      phone({ profiles: [fakeProfile("Maya")], freezes: 1 })
      const walk = await run("read-card")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ name: "Maya", restarted: true })
      expect(fake.steps.filter((step) => step.kind === "close-app")).toHaveLength(1)
    })

    it("fails after a second freeze, and waits out a screen that was only slow to draw", async () => {
      phone({ profiles: [fakeProfile("Maya")], freezes: 2 })
      const walk = await run("read-card")
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/closed and opened again once, and froze again/)
      phone({ profiles: [fakeProfile("Maya")], blanks: 1 })
      const slow = await run("read-card")
      expect(slow.status).toBe("done")
      expect(slow.result?.restarted).toBeUndefined()
    })

    it("never starts a pass over once it was tapped", async () => {
      phone({ profiles: [fakeProfile("Maya"), fakeProfile("Ines")] })
      await run("read-card")
      const [maya] = await cards()
      // Facebook freezes the moment Pass is tapped, after the pass went through.
      const tap = fake["tap"].bind(fake)
      fake["tap"] = (tag: string | undefined) => {
        tap(tag)
        if (tag === "pass") fake.screen = "frozen"
      }
      const walk = await run("pass", { profileId: maya.id })
      expect(walk.status).toBe("failed")
      expect(fake.passedNow).toEqual(["Maya"])
      expect(fake.steps.filter((step) => step.kind === "close-app")).toHaveLength(0)
    })

    it("sends a message after a restart when it froze before anything was typed", async () => {
      phone({ chats: [{ name: "Ava", preview: "hey!", isNew: false, bubbles: [{ direction: "in", text: "hey!" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      await run("read-conversation", { matchId: match.id })
      const messageId = await createOutgoingMessage(match.id, "Hi Ava", "member", { proposesDate: false }, db, clock)
      // Facebook freezes the first time the conversation is opened.
      let froze = false
      const tap = fake["tap"].bind(fake)
      fake["tap"] = (tag: string | undefined) => {
        tap(tag)
        if (tag?.startsWith("row:") && !froze) {
          froze = true
          fake.screen = "frozen"
        }
      }
      const walk = await run("send-message", { matchId: match.id, messageId })
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ sent: true, restarted: true })
      expect(fake.sent).toEqual(["Hi Ava"])
    })

    it("never starts a send over once it typed", async () => {
      phone({ chats: [{ name: "Ava", preview: "hey!", isNew: false, bubbles: [{ direction: "in", text: "hey!" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      const messageId = await createOutgoingMessage(match.id, "Hi Ava, how was the climb?", "member", { proposesDate: false }, db, clock)
      // Facebook freezes the moment Send is tapped.
      const tap = fake["tap"].bind(fake)
      fake["tap"] = (tag: string | undefined) => {
        if (tag === "send") {
          fake.screen = "frozen"
          return
        }
        tap(tag)
      }
      const walk = await run("send-message", { matchId: match.id, messageId })
      expect(walk.status).toBe("failed")
      expect(walk.error).toMatch(/already been typed or pressed, so it was not started over/)
      expect(fake.steps.filter((step) => step.kind === "close-app")).toHaveLength(0)
      expect((await db.select().from(dateMessages).where(eq(dateMessages.id, messageId)))[0].status).toBe("unsure")
    })
  })

  describe("part 7, check Facebook after it updates", () => {
    it("finds every button and says which version it checked", async () => {
      phone({ profiles: [fakeProfile("Maya")], chats: [{ name: "Ava", preview: "hey!", isNew: false, bubbles: [{ direction: "in", text: "hey!" }] }] })
      const walk = await run("check-labels", { version: "541.0" }, "ai")
      expect(walk.status).toBe("done")
      expect(walk.result).toMatchObject({ version: "541.0", checked: ["suggested", "matches", "a conversation"] })
      expect((await db.select().from(datePhones))[0].facebookVersionChecked).toBe("541.0")
      expect(fake.sent).toEqual([])
      expect(fake.liked).toEqual([])
    })

    it("stops the profile naming the buttons it lost", async () => {
      phone({ profiles: [fakeProfile("Maya")], chats: [{ name: "Ava", preview: "hey!", isNew: false, bubbles: [{ direction: "in", text: "hey!" }] }], renamed: ["like", "send"] })
      await run("check-labels", { version: "541.0" }, "ai")
      expect(await profileRow()).toMatchObject({ stoppedReason: "app_changed", stoppedWords: "Can't find: Like button, Send button" })
      expect((await profileRow()).stoppedPictureId).not.toBeNull()
      expect((await db.select().from(datePhones))[0].facebookVersionChecked).toBe("")
    })
  })

  describe("part 9, Likes you", () => {
    it("reads the first person who liked you with their comment, and a like back is a match", async () => {
      phone({ likers: [{ ...fakeProfile("Ines"), comment: "Love the dog", commentOn: "photo" }, fakeProfile("Sofia")] })
      const walk = await run("read-card", { likesYou: true }, "ai")
      expect(walk.result).toMatchObject({ name: "Ines", likesYou: true, theirComment: "Love the dog" })
      const [ines] = await cards()
      expect(ines).toMatchObject({ source: "likes_you", theirComment: "Love the dog", theirCommentOn: "photo" })
      const liked = await run("like", { profileId: ines.id }, "ai")
      expect(liked.result).toMatchObject({ matched: true })
      expect(await db.select().from(dateMatches)).toHaveLength(1)
      expect(fake.likers.map((liker) => liker.name)).toEqual(["Sofia"])
    })

    it("says so when nobody is on Likes you", async () => {
      phone({ likers: [] })
      const walk = await run("read-card", { likesYou: true }, "ai")
      expect(walk.result).toMatchObject({ empty: true, likesYou: true })
    })
  })

  describe("part 10, a like with a comment", () => {
    it("types the AI's comment on the answer it is about and sends the like", async () => {
      phone({ profiles: [fakeProfile("Maya")] })
      await run("read-card")
      const [maya] = await cards()
      await db.update(dateProfiles).set({ likeComment: "Which bakery is first on the crawl?", likeCommentOn: "Bakery crawl, then a long walk by the lake" }).where(eq(dateProfiles.id, maya.id))
      const walk = await run("like", { profileId: maya.id }, "ai")
      expect(walk.result).toMatchObject({ commented: true })
      expect(fake.liked).toEqual([{ name: "Maya", comment: "Which bakery is first on the crawl?", on: "answer" }])
    })

    it("forgets a comment Facebook never asked for", async () => {
      phone({ profiles: [fakeProfile("Maya")], likeWithoutSheet: true })
      await run("read-card")
      const [maya] = await cards()
      await db.update(dateProfiles).set({ likeComment: "Hi!", likeCommentOn: "photo" }).where(eq(dateProfiles.id, maya.id))
      const walk = await run("like", { profileId: maya.id }, "ai")
      expect(walk.result).toMatchObject({ commented: false })
      expect((await db.select().from(dateProfiles))[0].likeComment).toBe("")
    })
  })

  describe("part 11, mutual friends and groups", () => {
    it("reads the count, the names and the groups you share", async () => {
      phone({ profiles: [fakeProfile("Maya", { mutualFriends: 3, mutualNames: ["Sam", "Alex", "Jo"], group: "Toronto Climbers" })] })
      await run("read-card")
      expect((await cards())[0]).toMatchObject({ mutualFriends: 3, mutualNames: ["Sam", "Alex", "Jo"], sharedGroups: ["Toronto Climbers"] })
    })
  })

  describe("part 13, match preferences", () => {
    it("drags Dating's distance and ages to Date's and reads them back", async () => {
      phone({ profiles: [fakeProfile("Maya")], discovery: { distance: 80, ageMin: 18, ageMax: 50 } })
      const walk = await run("set-discovery", { distanceKm: 25, ageMin: 27, ageMax: 38 }, "ai")
      expect(walk.status).toBe("done")
      expect(fake.discovery).toEqual({ distance: 25, ageMin: 27, ageMax: 38 })
      expect(walk.result).toMatchObject({ distance: "25 km", ageMin: 27, ageMax: 38 })
    })
  })

  describe("part 14, Second Look", () => {
    it("likes a passed profile from Second Look and makes the AI's pass the member's like", async () => {
      phone({ passed: [fakeProfile("Clara")] })
      const [clara] = await db
        .insert(dateProfiles)
        .values({ id: uuid(), accountId: account.id, userId, workspaceId, phoneId, name: "Clara", age: 29, swipe: "pass", swipedBy: "ai", swipedAt: T0, aiScore: 67 })
        .returning()
      const walk = await run("like", { profileId: clara.id, secondLook: true })
      expect(walk.status).toBe("done")
      expect(fake.liked.map((like) => like.name)).toEqual(["Clara"])
      expect((await db.select().from(dateProfiles))[0]).toMatchObject({ swipe: "like", swipedBy: "member" })
      expect((await db.select().from(dateProfiles))[0].secondLookAt).not.toBeNull()
    })
  })

  describe("part 17 and 18, chats", () => {
    it("reads a photo as a photo, and a chat that says they left as unmatched by them", async () => {
      phone({
        chats: [
          {
            name: "Ava",
            preview: "Sent a photo",
            isNew: false,
            left: true,
            bubbles: [
              { direction: "out", text: "How was the climb?" },
              { direction: "in", text: "So good, look" },
              { direction: "in", media: "Photo" },
            ],
          },
        ],
      })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      const walk = await run("read-conversation", { matchId: match.id })
      expect(walk.result).toMatchObject({ theyLeft: true })
      const messages = await db.select().from(dateMessages).where(eq(dateMessages.matchId, match.id))
      expect(messages.map((message) => [message.kind, message.text])).toEqual([
        ["text", "How was the climb?"],
        ["text", "So good, look"],
        ["photo", "Sent a photo"],
      ])
      expect((await db.select().from(dateMatches))[0]).toMatchObject({ unmatchedBy: "them" })
    })

    it("keeps a message that says 'no longer available' as a message, and the match as it was", async () => {
      phone({ chats: [{ name: "Ava", preview: "Friday is no longer available", isNew: false, bubbles: [{ direction: "in", text: "Friday is no longer available" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      const walk = await run("read-conversation", { matchId: match.id })
      expect(walk.result).toMatchObject({ theyLeft: false })
      expect((await db.select().from(dateMessages).where(eq(dateMessages.matchId, match.id))).map((message) => message.text)).toEqual(["Friday is no longer available"])
      expect((await db.select().from(dateMatches))[0].unmatchedAt).toBeNull()
    })

    it("sends a message and unmatches through Facebook's menu", async () => {
      phone({ chats: [{ name: "Ava", preview: "hey!", isNew: false, bubbles: [{ direction: "in", text: "hey!" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      const messageId = await createOutgoingMessage(match.id, "Hi Ava", "member", { proposesDate: false }, db, clock)
      expect((await run("send-message", { matchId: match.id, messageId })).status).toBe("done")
      expect(fake.sent).toEqual(["Hi Ava"])
      expect((await run("unmatch", { matchId: match.id })).status).toBe("done")
      expect(fake.unmatched).toEqual(["Ava"])
    })
  })

  describe("part 20, report a scam", () => {
    it("reports a flagged scam to Facebook and unmatches", async () => {
      phone({ chats: [{ name: "Ava", preview: "send me $50", isNew: false, bubbles: [{ direction: "in", text: "send me $50 on cashapp" }] }] })
      await run("read-matches")
      const [match] = await db.select().from(dateMatches)
      expect((await run("report", { matchId: match.id })).error).toMatch(/not flagged as a scam/)
      expect(fake.reported).toEqual([])
      await db.update(dateMatches).set({ flaggedReason: "scam" }).where(eq(dateMatches.id, match.id))
      const walk = await run("report", { matchId: match.id })
      expect(walk.status).toBe("done")
      expect(fake.reported).toEqual(["Ava"])
      expect(fake.unmatched).toEqual(["Ava"])
      const [after] = await db.select().from(dateMatches)
      expect(after.reportedAt).not.toBeNull()
      expect(after.unmatchedBy).toBe("member")
    })
  })

  describe("part 21, the weekly surprise match", () => {
    it("keeps the weekly match as a match with its card, and shuts its screen without saying hi", async () => {
      phone({ profiles: [fakeProfile("Maya")], weekly: fakeProfile("Clara", { photos: 1, lines: ["Teacher", "Lives in Toronto"] }) })
      await run("read-card")
      const clara = (await cards()).find((card) => card.name === "Clara")!
      expect(clara).toMatchObject({ source: "weekly", swipe: "none" })
      const [match] = await db.select().from(dateMatches)
      expect(match).toMatchObject({ theirName: "Clara", profileId: clara.id })
      expect(fake.outside).toEqual([])
      expect(fake.weekly).toBeNull()
    })
  })

  describe("part 22, Facebook Dating's break", () => {
    it("turns the break on and off and reads it back", async () => {
      phone({ profiles: [fakeProfile("Maya")] })
      const on = await run("set-break", { on: true })
      expect(on.result).toMatchObject({ breakOn: true })
      expect(fake.breakOn).toBe(true)
      expect(await profileRow()).toMatchObject({ appBreak: true })
      const off = await run("set-break", { on: false })
      expect(off.result).toMatchObject({ breakOn: false })
      expect(await profileRow()).toMatchObject({ appBreak: false })
    })
  })
})
