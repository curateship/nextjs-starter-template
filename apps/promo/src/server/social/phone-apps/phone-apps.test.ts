import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { checkIn, createPairingCode, finishAction, nextAction, pairRack, type VerifiedRack } from "@/server/phones/rack"
import { RACK_VERSION } from "@/server/phones/release"
import { promoPhoneActionChecks, promoPhoneActions, promoPhones } from "@/server/phones/schema"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { addAccount } from "@/server/social/accounts"
import { listRedditAccounts } from "@/server/social/account-list"
import { queueDueHealthChecks } from "@/server/social/health"
import { queueJob } from "@/server/social/jobs"
import { runOneJob } from "@/server/social/runner"
import { addAccountToProject, createProject } from "@/server/social/projects"
import { promoAccounts, promoAppPosts, promoBehaviourSettings, promoInbox, promoJobs } from "@/server/social/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

import { buildCaptionPrompt } from "./captions"
import { buildReplyPrompt, listInbox, sendInboxReply, skipInbox } from "./inbox"
import { readAppModuleView } from "./module"
import { cancelAppPosts, postLink, queueAppPost } from "./posts"
import { cleanProfileEdit, queueProfileEdit, readProfileEdits } from "./profile"

// The media library's addresses need a storage bucket; here an address is
// the file's own key under one made-up host.
vi.mock("@/server/media/library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/media/library")>()
  const key = (url: string) => (url.startsWith("https://media.test/") ? url.slice("https://media.test/".length) : null)
  return {
    ...actual,
    storagePathForUrl: async (url: string) => key(url),
    isOwnedImageUrl: async (_userId: string, url: string) => Boolean(key(url)) && /\.(jpg|png)$/.test(url),
  }
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Phone farm file 06, Promo's side: Instagram and TikTok accounts on phones
 * only, their daily reading with the shadowban line and each post's numbers,
 * posting a photo once, the profile held back in its first day, and the
 * messages and comments a phone's notification brought in, answered only
 * when a person presses Send. The phone itself is a stand-in rack answering
 * each action; the rack's own steps are tested in `rack/test_promo_rack.py`.
 */
describe("Instagram and TikTok on phones", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let rack: VerifiedRack
  let projectId: string

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    await db.insert(promoBehaviourSettings).values({ userId, wakeFromMinute: 0, wakeUntilMinute: 0 })
    const { code } = await createPairingCode(userId, db)
    const paired = await pairRack({ code, name: "Mac", platform: "", version: RACK_VERSION }, db)
    rack = { id: paired.rackId, userId, key: paired.key }
    projectId = await createProject(userId, "Pomoder", db)
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

  /** An Instagram account on the phone, signed in a week ago, in the project. */
  async function instagramOn(phoneId: string, handle = "quiet.maple") {
    const id = await addAccount(userId, { profileId: null, phoneId, voiceId: null, platform: "instagram" }, db)
    await db
      .update(promoAccounts)
      .set({ handle, signedInAt: new Date(Date.now() - 7 * 86_400_000) })
      .where(eq(promoAccounts.id, id))
    await addAccountToProject(userId, projectId, id, db)
    return id
  }

  async function passSelfTest(...actions: string[]) {
    await db.insert(promoPhoneActionChecks).values(actions.map((action) => ({ userId, action, passed: true })))
  }

  async function mediaFile(name: string, mimeType: string, fileType: "image" | "video") {
    await db.insert(customShellMedia).values({
      id: uuid(),
      workspaceId,
      userId,
      filename: name,
      originalName: name,
      fileSize: 1000,
      mimeType,
      fileType,
      storagePath: name,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return `https://media.test/${name}`
  }

  type Reply = { ok: boolean; error?: string; result?: Record<string, unknown> }

  /** The rack's side: answers every action it is handed, until stopped. */
  function fakeRack(answer: (action: { action: string; args: Record<string, unknown> }) => Reply) {
    const seen: Array<{ action: string; args: Record<string, unknown> }> = []
    let stopped = false
    const loop = (async () => {
      while (!stopped) {
        const action = await nextAction(rack, db)
        if (!action) {
          await sleep(10)
          continue
        }
        seen.push({ action: action.action, args: action.args ?? {} })
        const reply = answer({ action: action.action, args: action.args ?? {} })
        await finishAction(rack, { id: action.id, ok: reply.ok, result: reply.result ?? {}, error: reply.error ?? "" }, db)
      }
    })()
    return { seen, stop: async () => ((stopped = true), await loop) }
  }

  /** Runs the next phone job with the stand-in rack answering. */
  async function runPhoneJob(answer: (action: { action: string; args: Record<string, unknown> }) => Reply) {
    const phone = fakeRack(answer)
    const turn = await runOneJob("phone-lane", db, "phone")
    await phone.stop()
    return { turn, seen: phone.seen }
  }

  const signedIn = (handle: string) => ({ ok: true, result: { checked: true, handle } })

  describe("accounts", () => {
    it("runs an Instagram account on a phone only, one per phone, beside the phone's Reddit account", async () => {
      const { A1 } = await plugIn("A1")
      const profileId = await createProfile(userId, { name: "Browser one" }, db)
      await expect(
        addAccount(userId, { profileId, phoneId: null, voiceId: null, platform: "instagram" }, db)
      ).rejects.toThrow("An Instagram account runs on a phone only")
      await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "reddit" }, db)
      const id = await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "instagram" }, db)
      const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, id))
      expect(row.platform).toBe("instagram")
      await expect(
        addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "instagram" }, db)
      ).rejects.toThrow("already has an Instagram account on it")
      // A TikTok account fits on the same phone, as on one person's phone.
      await addAccount(userId, { profileId: null, phoneId: A1, voiceId: null, platform: "tiktok" }, db)
    })

    it("refuses a Reddit job for an Instagram account before anything reaches the phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "warm_up", { accountId }, db)
      const { turn, seen } = await runPhoneJob(() => ({ ok: true }))
      expect(turn).toMatchObject({ did: "job", ok: false })
      expect(turn.did === "job" && turn.error).toContain("That is Reddit's, and this is an Instagram account")
      expect(seen).toEqual([])
    })
  })

  describe("the daily reading (parts 32 and 39)", () => {
    it("stores followers and the shadowban line, reads each post's numbers, and rings the bell once", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      const postId = uuid()
      await db.insert(promoAppPosts).values({
        id: postId,
        userId,
        accountId,
        projectId,
        platform: "instagram",
        mediaUrl: "https://media.test/a.jpg",
        mediaKind: "photo",
        caption: "Night mode",
        status: "posted",
        postUrl: "https://www.instagram.com/p/ABC/",
        postedAt: new Date(),
      })

      const reading = (hidden: boolean) => ({
        ok: true,
        result: {
          handle: "quiet.maple",
          followers: 1234,
          following: 56,
          posts: 12,
          shadowban: { read: true, hidden, words: hidden ? "Your account can't be recommended" : "You haven't posted anything that affects it" },
          numbers: [{ url: "https://www.instagram.com/p/ABC/", views: 2345, likes: 321, comments: 18 }],
        },
      })

      expect(await queueDueHealthChecks(db)).toBe(1)
      const first = await runPhoneJob(() => reading(true))
      expect(first.turn).toMatchObject({ did: "job", ok: true })
      // The reading has just read who is signed in, so no second look follows it.
      expect(first.seen.map((action) => action.action)).toEqual(["instagram/health"])
      expect(first.seen[0].args).toEqual({ postUrls: ["https://www.instagram.com/p/ABC/"] })

      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect([account.followers, account.following, account.postCount, account.shadowbanned]).toEqual([1234, 56, 12, true])
      const [post] = await db.select().from(promoAppPosts).where(eq(promoAppPosts.id, postId))
      expect([post.views, post.likes, post.comments]).toEqual([2345, 321, 18])
      const bells = async () =>
        (await db.select().from(customShellNotifications)).filter((row) => row.message?.startsWith("Shadowbanned:"))
      expect((await bells()).map((row) => row.message)).toEqual(["Shadowbanned: @quiet.maple on Instagram"])

      const [listed] = await listRedditAccounts(userId, { retired: false }, db)
      expect(listed.status.warning).toContain("Shadowbanned")

      // A second day still shadowbanned rings nothing new; a clear one takes the notice away.
      await queueJob(userId, "health", { accountId }, db)
      await runPhoneJob(() => reading(true))
      expect(await bells()).toHaveLength(1)
      await queueJob(userId, "health", { accountId }, db)
      await runPhoneJob(() => reading(false))
      expect(await bells()).toHaveLength(0)
      const [after] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(after.shadowbanned).toBe(false)
    })

    it("writes down a signed-out app, so Post refuses and the first day starts again", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "health", { accountId }, db)
      const { turn } = await runPhoneJob(() => ({
        ok: true,
        result: { handle: null, followers: null, following: null, posts: null, shadowban: { read: false, hidden: false, words: "" } },
      }))
      expect(turn).toMatchObject({ did: "job", ok: false })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect([account.handle, account.signedInAt]).toEqual(["", null])
    })

    it("keeps the last shadowban answer when the Account status page could not be read", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await db.update(promoAccounts).set({ shadowbanned: false }).where(eq(promoAccounts.id, accountId))
      await queueJob(userId, "health", { accountId }, db)
      await runPhoneJob(() => ({
        ok: true,
        result: { handle: "quiet.maple", followers: 10, following: 1, posts: 2, shadowban: { read: false, hidden: false, words: "" }, numbers: [] },
      }))
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(account.shadowbanned).toBe(false)
      expect(account.followers).toBe(10)
    })
  })

  describe("posting (parts 34 and 35)", () => {
    it("refuses a post until the self-test has walked it, and a file that is not the person's own", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      const photo = await mediaFile("a.jpg", "image/jpeg", "image")
      await expect(queueAppPost(userId, { accountId, mediaUrl: photo, caption: "Hi", draftCaption: "" }, db)).rejects.toThrow(
        "self-test has not walked"
      )
      await passSelfTest("instagram/post")
      await expect(
        queueAppPost(userId, { accountId, mediaUrl: "https://elsewhere.test/b.jpg", caption: "Hi", draftCaption: "" }, db)
      ).rejects.toThrow("Pick a photo or video from your media library first.")
      const gif = await mediaFile("c.gif", "image/gif", "image")
      await expect(queueAppPost(userId, { accountId, mediaUrl: gif, caption: "Hi", draftCaption: "" }, db)).rejects.toThrow(
        "Instagram cannot post that file"
      )
      const tags = Array.from({ length: 31 }, (_, index) => `#tag${index}`).join(" ")
      await expect(queueAppPost(userId, { accountId, mediaUrl: photo, caption: tags, draftCaption: "" }, db)).rejects.toThrow(
        "31 hashtags"
      )
    })

    it("sends the post once with the edited caption, saves its link, and refuses a second press of the same post", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/post")
      const video = await mediaFile("night.mp4", "video/mp4", "video")
      const { id } = await queueAppPost(
        userId,
        { accountId, mediaUrl: video, caption: "Night mode, my edit #study", draftCaption: "Night mode #study" },
        db
      )
      await expect(
        queueAppPost(userId, { accountId, mediaUrl: video, caption: "Night mode, my edit #study", draftCaption: "" }, db)
      ).rejects.toThrow("already on its way")

      const { turn, seen } = await runPhoneJob((action) =>
        action.action === "instagram/post"
          ? { ok: true, result: { postUrl: "https://www.instagram.com/reel/XYZ/" } }
          : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: true })
      expect(seen.filter((action) => action.action === "instagram/post")).toEqual([
        { action: "instagram/post", args: { mediaUrl: video, mediaKind: "video", caption: "Night mode, my edit #study" } },
      ])
      const [post] = await db.select().from(promoAppPosts).where(eq(promoAppPosts.id, id))
      expect([post.status, post.postUrl, post.caption, post.draftCaption]).toEqual([
        "posted",
        "https://www.instagram.com/reel/XYZ/",
        "Night mode, my edit #study",
        "Night mode #study",
      ])
      const view = await readAppModuleView(userId, projectId, "instagram", db)
      expect(view.posts.map((row) => [row.status, row.mediaKind])).toEqual([["posted", "video"]])
    })

    it("lets the same post go again once the job that carried it failed", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/post")
      const photo = await mediaFile("a.jpg", "image/jpeg", "image")
      const post = { accountId, mediaUrl: photo, caption: "Hi", draftCaption: "" }
      await queueAppPost(userId, post, db)
      await db.update(promoJobs).set({ status: "failed" }).where(eq(promoJobs.kind, "app_post"))
      await queueAppPost(userId, post, db)
      expect(await db.select().from(promoAppPosts)).toHaveLength(2)
    })

    it("fails a post the phone could not make, rings the bell, and never tries it again", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/post")
      const photo = await mediaFile("a.jpg", "image/jpeg", "image")
      const { id } = await queueAppPost(userId, { accountId, mediaUrl: photo, caption: "Hi", draftCaption: "" }, db)
      const { turn, seen } = await runPhoneJob((action) =>
        action.action === "instagram/post" ? { ok: false, error: "post: the app said it could not post" } : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: false })
      expect(seen.filter((action) => action.action === "instagram/post")).toHaveLength(1)
      const [post] = await db.select().from(promoAppPosts).where(eq(promoAppPosts.id, id))
      expect(post.status).toBe("failed")
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "app_post"))
      expect(job.status).toBe("failed")
      const bell = (await db.select().from(customShellNotifications)).map((row) => row.message)
      expect(bell).toContain("Did not go out: a post on Instagram")
      // Nothing is left waiting for another go.
      expect((await runOneJob("again", db, "phone")).did).toBe("nothing")
    })

    it("keeps a post's link only when it is the network's own https address", () => {
      expect(postLink("instagram", " https://www.instagram.com/reel/XYZ/ ")).toBe("https://www.instagram.com/reel/XYZ/")
      expect(postLink("instagram", "javascript:alert(1)")).toBe("")
      expect(postLink("instagram", "https://www.instagram.com.evil.test/p/X/")).toBe("")
      expect(postLink("tiktok", "https://vm.tiktok.com/ZM123/")).toBe("https://vm.tiktok.com/ZM123/")
      expect(postLink("tiktok", "https://www.instagram.com/p/X/")).toBe("")
    })

    it("calls off a post the phone has not started, and nothing reaches the phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/post")
      const photo = await mediaFile("a.jpg", "image/jpeg", "image")
      const { id } = await queueAppPost(userId, { accountId, mediaUrl: photo, caption: "Hi", draftCaption: "" }, db)
      expect(await cancelAppPosts(userId, [id, "not-mine"], db)).toEqual({ completed: [id], skipped: ["not-mine"] })
      expect(await db.select().from(promoAppPosts)).toEqual([])
      expect((await runOneJob("again", db, "phone")).did).toBe("nothing")
    })

    it("tells the AI the voice's rules and the network's hashtag cap for a caption", () => {
      const prompt = buildCaptionPrompt({
        network: "instagram",
        voice: "Plain and warm.",
        rules: "Never say best.",
        product: "Pomoder, a study timer.",
        about: "Night mode",
        kind: "video",
      })
      expect(prompt).toContain("Never say best.")
      expect(prompt).toContain("at most 30 hashtags")
      expect(prompt).toContain("Night mode")
    })
  })

  describe("the profile (part 33)", () => {
    it("is held back in the account's first day after signing in, then goes to the phone", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/profile")
      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 3_600_000) }).where(eq(promoAccounts.id, accountId))
      const change = { displayName: null, bio: "Night timers.", link: null, pictureUrl: null }
      await expect(queueProfileEdit(userId, accountId, change, db)).rejects.toThrow("less than a day ago")
      expect((await readProfileEdits(userId, accountId, db)).opensAt).not.toBeNull()

      await db.update(promoAccounts).set({ signedInAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(promoAccounts.id, accountId))
      await queueProfileEdit(userId, accountId, change, db)
      await expect(queueProfileEdit(userId, accountId, change, db)).rejects.toThrow("already on its way")
      const { turn, seen } = await runPhoneJob((action) =>
        action.action === "instagram/profile" ? { ok: true, result: { applied: ["bio"], bioAfter: "Night timers." } } : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: true })
      expect(seen[0]).toEqual({
        action: "instagram/profile",
        args: { displayName: null, bio: "Night timers.", link: null, pictureUrl: null },
      })
      const edits = await readProfileEdits(userId, accountId, db)
      expect(edits.last?.status).toBe("done")
      expect(edits.applied.bio).toBe("Night timers.")
    })

    it("fails a change whose bio the profile does not show afterwards", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await passSelfTest("instagram/profile")
      await queueProfileEdit(userId, accountId, { displayName: null, bio: "Night timers.", link: null, pictureUrl: null }, db)
      const { turn } = await runPhoneJob((action) =>
        action.action === "instagram/profile" ? { ok: true, result: { applied: ["bio"], bioAfter: "Old bio" } } : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: false })
      expect((await readProfileEdits(userId, accountId, db)).last?.status).toBe("failed")
    })

    it("checks each field against the network's own limits", () => {
      expect(() => cleanProfileEdit("tiktok", { displayName: null, bio: "x".repeat(81), link: null, pictureUrl: null })).toThrow(
        "TikTok allows 80"
      )
      expect(() => cleanProfileEdit("instagram", { displayName: null, bio: null, link: "javascript:alert(1)", pictureUrl: null })).toThrow(
        "https://"
      )
      expect(() => cleanProfileEdit("instagram", { displayName: null, bio: null, link: null, pictureUrl: null })).toThrow(
        "Change the name, the bio, the link or the picture first."
      )
    })
  })

  describe("messages and comments (parts 37 and 38)", () => {
    const conversation = (lines: Array<{ from: string; text: string; mine: boolean }>) => ({
      ok: true,
      result: { conversations: [{ thread: "sam.reads", lines }], comments: [] },
    })

    it("reads the account's messages when the phone's notification says one arrived, once per alert", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      const alert = {
        version: RACK_VERSION,
        platform: "",
        phones: [
          {
            serial: "A1",
            state: "device",
            usb: "usb:1",
            model: "Phone A1",
            android: "16",
            timezone: "UTC",
            alerts: [
              { app: "instagram" as const, kind: "message" as const },
              { app: "tiktok" as const, kind: "message" as const },
            ],
          },
        ],
        rolledBack: null,
      }
      await checkIn(rack, alert, db)
      await checkIn(rack, alert, db)
      const reads = await db.select().from(promoJobs).where(eq(promoJobs.kind, "inbox_read"))
      // One read, for the Instagram account; there is no TikTok account on the phone.
      expect(reads.map((job) => job.payload)).toEqual([{ accountId, inboxKind: "message", via: "notification" }])

      const lines = [
        { from: "sam.reads", text: "is the night mode free?", mine: false },
        { from: "", text: "Yes.", mine: true },
        { from: "sam.reads", text: "does it work offline?", mine: false },
      ]
      const { turn, seen } = await runPhoneJob((action) => (action.action === "instagram/inbox" ? conversation(lines) : signedIn("quiet.maple")))
      expect(turn).toMatchObject({ did: "job", ok: true })
      expect(seen[0]).toEqual({ action: "instagram/inbox", args: { kind: "message", via: "notification", handle: "quiet.maple" } })
      const [item] = await listInbox(userId, { kind: "message" }, db)
      expect([item.thread, item.author, item.status, item.lines]).toEqual(["sam.reads", "sam.reads", "open", lines])
      expect((await db.select().from(customShellNotifications)).map((row) => row.message)).toContain(
        "New message for @quiet.maple on Instagram"
      )

      // The same lines read again add nothing.
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob((action) => (action.action === "instagram/inbox" ? conversation(lines) : signedIn("quiet.maple")))
      expect(await db.select().from(promoInbox)).toHaveLength(1)
    })

    it("sends an answer only when a person presses Send, once, and then deletes the conversation", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob((action) =>
        action.action === "instagram/inbox" ? conversation([{ from: "sam.reads", text: "hi?", mine: false }]) : signedIn("quiet.maple")
      )
      const [item] = await listInbox(userId, { kind: "message" }, db)
      // Reading it queued nothing: no answer goes out by itself.
      expect(await db.select().from(promoJobs).where(eq(promoJobs.kind, "inbox_reply"))).toEqual([])

      await sendInboxReply(userId, item.id, "Hello!", db)
      await expect(sendInboxReply(userId, item.id, "Hello again", db)).rejects.toThrow("already on its way")
      const { turn, seen } = await runPhoneJob((action) =>
        action.action === "instagram/reply" ? { ok: true, result: { sent: true } } : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: true })
      expect(seen.filter((action) => action.action === "instagram/reply")).toEqual([
        { action: "instagram/reply", args: { kind: "message", thread: "sam.reads", author: "sam.reads", quote: "hi?", text: "Hello!" } },
      ])
      // Kept only while it was open in Promo: the words are gone now, from
      // the phone's action history and the finished job too.
      expect(await db.select().from(promoInbox)).toEqual([])
      const actions = await db.select().from(promoPhoneActions)
      expect(
        actions.filter((row) => /\/(inbox|reply)$/.test(row.action)).map((row) => [row.action, row.args, row.result])
      ).toEqual([
        ["instagram/inbox", {}, null],
        ["instagram/reply", {}, null],
      ])
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "inbox_reply"))
      expect(job.payload).toEqual({ accountId, inboxId: item.id, inboxKind: "message" })
    })

    it("keeps a conversation open when a new line came in after Send, and a read never undoes the Send", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      const readOf = (lines: Array<{ from: string; text: string; mine: boolean }>) => (action: { action: string }) =>
        action.action === "instagram/inbox" ? conversation(lines) : signedIn("quiet.maple")
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob(readOf([{ from: "sam.reads", text: "hi?", mine: false }]))
      // A second read is waiting on the phone when Send is pressed, and runs first.
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "notification" }, db)
      const [item] = await listInbox(userId, { kind: "message" }, db)
      await sendInboxReply(userId, item.id, "Hello!", db)
      const later = [
        { from: "sam.reads", text: "hi?", mine: false },
        { from: "sam.reads", text: "also, is it free?", mine: false },
      ]
      await runPhoneJob(readOf(later))
      const [sending] = await db.select().from(promoInbox)
      expect([sending.status, sending.lines]).toEqual(["sending", later])

      const { turn } = await runPhoneJob((action) =>
        action.action === "instagram/reply" ? { ok: true, result: { sent: true } } : signedIn("quiet.maple")
      )
      expect(turn).toMatchObject({ did: "job", ok: true })
      const [open] = await listInbox(userId, { kind: "message" }, db)
      expect([open.status, open.lines, open.replyText]).toEqual(["open", later, ""])
    })

    it("lets a person skip a conversation whose answer's job was lost", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob((action) =>
        action.action === "instagram/inbox" ? conversation([{ from: "sam.reads", text: "hi?", mine: false }]) : signedIn("quiet.maple")
      )
      const [item] = await listInbox(userId, { kind: "message" }, db)
      await sendInboxReply(userId, item.id, "Hello!", db)
      // On its way: Skip leaves it alone.
      expect(await skipInbox(userId, [item.id], db)).toEqual({ completed: [], skipped: [item.id] })
      // Dropped with the account's other jobs, as a ban screen does.
      await db.delete(promoJobs).where(eq(promoJobs.kind, "inbox_reply"))
      expect(await skipInbox(userId, [item.id], db)).toEqual({ completed: [item.id], skipped: [] })
      expect(await db.select().from(promoInbox)).toEqual([])
    })

    it("puts a failed answer back as open with why, never sends it again by itself, and lets a person send again", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob((action) =>
        action.action === "instagram/inbox" ? conversation([{ from: "sam.reads", text: "hi?", mine: false }]) : signedIn("quiet.maple")
      )
      const [item] = await listInbox(userId, { kind: "message" }, db)
      await sendInboxReply(userId, item.id, "Hello!", db)
      const { seen } = await runPhoneJob((action) =>
        action.action === "instagram/reply" ? { ok: false, error: "reply: pressed Send but the words did not show" } : signedIn("quiet.maple")
      )
      expect(seen.filter((action) => action.action === "instagram/reply")).toHaveLength(1)
      const [failed] = await listInbox(userId, { kind: "message" }, db)
      expect([failed.status, failed.lastError]).toEqual(["open", "reply: pressed Send but the words did not show"])
      expect((await runOneJob("again", db, "phone")).did).toBe("nothing")
      await sendInboxReply(userId, item.id, "Hello!", db)
      expect(await db.select().from(promoJobs).where(and(eq(promoJobs.kind, "inbox_reply"), eq(promoJobs.status, "queued")))).toHaveLength(1)
    })

    it("lists a comment under the project's network, marks it answered, and skips leave a comment but delete a conversation", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "comment", via: "notification" }, db)
      await runPhoneJob((action) =>
        action.action === "instagram/inbox"
          ? {
              ok: true,
              result: {
                conversations: [],
                comments: [
                  { thread: "Night mode is out", author: "sam.reads", text: "where is it?" },
                  { thread: "Night mode is out", author: "night_owl", text: "love it" },
                ],
              },
            }
          : signedIn("quiet.maple")
      )
      const view = await readAppModuleView(userId, projectId, "instagram", db)
      expect(view.comments.map((row) => [row.author, row.status])).toEqual(
        expect.arrayContaining([
          ["sam.reads", "open"],
          ["night_owl", "open"],
        ])
      )
      const answered = view.comments.find((row) => row.author === "sam.reads")!
      await sendInboxReply(userId, answered.id, "Top right.", db)
      await runPhoneJob((action) => (action.action === "instagram/reply" ? { ok: true, result: { sent: true } } : signedIn("quiet.maple")))
      const skipped = view.comments.find((row) => row.author === "night_owl")!
      expect(await skipInbox(userId, [skipped.id], db)).toEqual({ completed: [skipped.id], skipped: [] })
      const after = await readAppModuleView(userId, projectId, "instagram", db)
      expect(after.comments.map((row) => [row.author, row.status, row.replyText]).sort()).toEqual([
        ["night_owl", "skipped", ""],
        ["sam.reads", "answered", "Top right."],
      ])
    })

    it("refuses an answer longer than the network allows, and tells the AI the voice's rules", async () => {
      const { A1 } = await plugIn("A1")
      const accountId = await instagramOn(A1)
      await queueJob(userId, "inbox_read", { accountId, inboxKind: "message", via: "inbox" }, db)
      await runPhoneJob((action) =>
        action.action === "instagram/inbox" ? conversation([{ from: "sam.reads", text: "hi?", mine: false }]) : signedIn("quiet.maple")
      )
      const [item] = await listInbox(userId, { kind: "message" }, db)
      await expect(sendInboxReply(userId, item.id, "x".repeat(1_001), db)).rejects.toThrow("it may be 1000")
      const prompt = buildReplyPrompt({
        network: "TikTok",
        kind: "comment",
        handle: "@quiet.maple",
        voice: "Plain.",
        rules: "No links.",
        product: "",
        thread: "Night mode",
        lines: [{ from: "sam", text: "where?", mine: false }],
        max: 150,
      })
      expect(prompt).toContain("No links.")
      expect(prompt).toContain("at most 150 characters")
    })
  })
})
