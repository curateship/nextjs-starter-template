import type { PGlite } from "@electric-sql/pglite"
import { and, eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { promoArchiveItems } from "@/server/archive/schema"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { addAccount } from "@/server/social/accounts"
import { failExpiredClaims } from "@/server/social/jobs"
import { queueInboxRead, sendInboxReply } from "@/server/social/phone-apps/inbox"
import { addAccountToProject, createProject } from "@/server/social/projects"
import { promoAccounts, promoBehaviourSettings, promoInbox, promoJobs } from "@/server/social/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"
import { hasLink, isShort, splitTags, uploadWordsProblem, youtubeVideoLink } from "@/lib/social/youtube/options"

import { buildYoutubePrompt, joinTemplate, readYoutubeAnswer, subtitleWords, writeYoutubeWords } from "./drafts"
import { readYoutubeModuleView } from "./module"
import { recordYoutubeHealth } from "./run"
import { promoYoutubePosts } from "./schema"
import { saveYoutubeSettings } from "./settings"
import { settleFailedYoutubeJob } from "./settle"
import { arrangeYoutubeTemplates, cleanSections, createYoutubeTemplate, deleteYoutubeTemplate, listYoutubeTemplates } from "./templates"
import { cancelYoutubePosts, listYoutubePosts, queueYoutubeUpload, runYoutubeUpload } from "./uploads"
import { queueYoutubeReadings } from "./upkeep"

// The media library's addresses need a storage bucket; here an address is
// the file's own key under one made-up host.
vi.mock("@/server/media/library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/media/library")>()
  const key = (url: string) => (url.startsWith("https://media.test/") ? url.slice("https://media.test/".length) : null)
  return { ...actual, storagePathForUrl: async (url: string) => key(url) }
})

// The browser and the phone: each test says what YouTube "answered".
const calls = vi.hoisted(() => ({
  upload: vi.fn(),
  health: vi.fn(),
}))
vi.mock("./calls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./calls")>()
  return { ...actual, youtubeUpload: calls.upload, youtubeHealth: calls.health }
})

// The AI: each test hands back the answer the model gave.
const model = vi.hoisted(() => ({ answer: "" }))
vi.mock("@/server/social/drafts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/social/drafts")>()
  return {
    ...actual,
    pickProvider: async () => ({ provider: "anthropic", model: "test", key: "k" }),
    askModel: async (_call: unknown, read: (answer: string) => unknown) => read(model.answer),
  }
})

const TARGET = { port: 1, token: "t" }

/**
 * YouTube's server side (`workspace/tasks/YouTube/01-youtube-features.md`):
 * the checks on Post, the upload tried once, the daily reading with its
 * comments, the three titles and templates, the number in Settings →
 * Behaviour, and comments answered without links. The browser and the phone
 * are stand-ins; their own steps are tested in
 * `docker/browser/test_youtube.py` and `rack/test_promo_rack.py`.
 */
describe("YouTube", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let workspaceId: string
  let projectId: string
  let profileId: string

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    workspaceId = (await insertWorkspace(db)).id
    await db.insert(promoBehaviourSettings).values({ userId, wakeFromMinute: 0, wakeUntilMinute: 0 })
    projectId = await createProject(userId, "Pomoder", db, ["youtube"])
    profileId = await createProfile(userId, { name: "Channel browser" }, db)
    calls.upload.mockReset()
    calls.health.mockReset()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await client.close()
  })

  /** A YouTube channel in a browser profile, signed in, in the project. */
  async function channel(handle = "pomoder", profile = profileId, inProject = true) {
    const id = await addAccount(userId, { profileId: profile, phoneId: null, voiceId: null, platform: "youtube" }, db)
    await db.update(promoAccounts).set({ handle, signedInAt: new Date(Date.now() - 7 * 86_400_000) }).where(eq(promoAccounts.id, id))
    if (inProject) await addAccountToProject(userId, projectId, id, db)
    return id
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

  /** A ready Archive video of the size and length given, and its address. */
  async function archiveVideo(width: number, height: number, seconds: number, extra: Partial<typeof promoArchiveItems.$inferInsert> = {}) {
    const id = uuid()
    const storagePath = `promo/archive/${userId}/${id}/main.mp4`
    await db.insert(promoArchiveItems).values({
      id,
      userId,
      projectId,
      kind: "video",
      status: "ready",
      title: "Study night",
      storagePath,
      mimeType: "video/mp4",
      fileSize: 100,
      source: "upload",
      width,
      height,
      durationMs: seconds * 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    })
    return { id, url: `https://media.test/${storagePath}` }
  }

  const upload = (accountId: string, mediaUrl: string, patch: Partial<Parameters<typeof queueYoutubeUpload>[1]> = {}) =>
    queueYoutubeUpload(
      userId,
      {
        accountId,
        mediaUrl,
        title: "Set up the timer for a study night",
        description: "Three steps.",
        tags: "study timer, pomodoro, focus",
        thumbnailUrl: "",
        aiMade: false,
        templateId: null,
        draftTitle: "",
        draftDescription: "",
        ...patch,
      },
      db
    )

  describe("the words YouTube allows", () => {
    it("refuses a missing or long title, < and >, and tags past 500 characters", () => {
      expect(uploadWordsProblem({ title: " ", description: "", tags: [] })).toBe("Give the video a title first.")
      expect(uploadWordsProblem({ title: "x".repeat(101), description: "", tags: [] })).toContain("YouTube allows 100")
      expect(uploadWordsProblem({ title: "a <b>", description: "", tags: [] })).toContain("< and >")
      expect(uploadWordsProblem({ title: "ok", description: "", tags: Array.from({ length: 30 }, (_, i) => `tag number ${i} here`) })).toContain("YouTube allows 500")
      expect(uploadWordsProblem({ title: "ok", description: "fine", tags: ["a", "b"] })).toBeNull()
    })

    it("splits tags on commas, drops repeats and hash marks, and counts them with commas", () => {
      expect(splitTags(" study timer,#Focus, study timer ,, focus")).toEqual(["study timer", "Focus"])
    })

    it("makes a Short of a tall or square video of three minutes or less only", () => {
      expect(isShort({ width: 1080, height: 1920, durationMs: 60_000 })).toBe(true)
      expect(isShort({ width: 1080, height: 1080, durationMs: 180_000 })).toBe(true)
      expect(isShort({ width: 1080, height: 1920, durationMs: 181_000 })).toBe(false)
      expect(isShort({ width: 1920, height: 1080, durationMs: 30_000 })).toBe(false)
      expect(isShort({ width: null, height: null, durationMs: 30_000 })).toBe(false)
    })

    it("keeps only YouTube's own video links", () => {
      expect(youtubeVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      expect(youtubeVideoLink("https://youtube.com/shorts/abcdefghijk")).toBe("https://youtube.com/shorts/abcdefghijk")
      expect(youtubeVideoLink("https://evil.test/watch?v=dQw4w9WgXcQ")).toBe("")
      expect(youtubeVideoLink("javascript:alert(1)")).toBe("")
    })

    it("sees a link written any common way", () => {
      expect(hasLink("see https://pomoder.app")).toBe(true)
      expect(hasLink("go to pomoder.app now")).toBe(true)
      expect(hasLink("www.pomoder.com")).toBe(true)
      expect(hasLink("Thanks, glad it helped!")).toBe(false)
    })
  })

  describe("Post", () => {
    it("writes one upload and one job, a wide Archive video as a long video with its thumbnail", async () => {
      const accountId = await channel()
      const video = await archiveVideo(1920, 1080, 600)
      const thumbnail = await mediaFile("cover.jpg", "image/jpeg", "image")
      const { id } = await upload(accountId, video.url, { thumbnailUrl: thumbnail })
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(post).toMatchObject({ status: "waiting", isShort: false, archiveItemId: video.id, thumbnailUrl: thumbnail, tags: ["study timer", "pomodoro", "focus"] })
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, post!.jobId!))
      expect(job).toMatchObject({ kind: "youtube_upload", lane: profileId, payload: { accountId, postId: id } })
    })

    it("makes a tall short Archive video a Short and sends no thumbnail with it", async () => {
      const accountId = await channel()
      const video = await archiveVideo(1080, 1920, 45)
      const thumbnail = await mediaFile("cover.jpg", "image/jpeg", "image")
      const { id } = await upload(accountId, video.url, { thumbnailUrl: thumbnail })
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(post).toMatchObject({ isShort: true, thumbnailUrl: "" })
    })

    it("refuses what is not a video of the person's own, and a thumbnail that is not a JPEG or PNG", async () => {
      const accountId = await channel()
      const picture = await mediaFile("still.png", "image/png", "image")
      await expect(upload(accountId, picture)).rejects.toThrow("YouTube cannot take that file (image/png)")
      await expect(upload(accountId, "https://elsewhere.test/a.mp4")).rejects.toThrow("Pick a video")
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const gif = await mediaFile("cover.gif", "image/gif", "image")
      await expect(upload(accountId, video, { thumbnailUrl: gif })).rejects.toThrow("JPEG or PNG thumbnail")
    })

    it("refuses a channel not seen signed in, a retired one and one a ban stopped", async () => {
      const accountId = await channel("")
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      await expect(upload(accountId, video)).rejects.toThrow("not been read signed in in this channel's browser")
      await db.update(promoAccounts).set({ handle: "pomoder", banScreenAt: new Date() }).where(eq(promoAccounts.id, accountId))
      await expect(upload(accountId, video)).rejects.toThrow("hit a ban screen")
      await db.update(promoAccounts).set({ banScreenAt: null, retiredAt: new Date() }).where(eq(promoAccounts.id, accountId))
      await expect(upload(accountId, video)).rejects.toThrow("is retired")
    })

    it("holds a channel to its uploads a day, counting the ones on their way", async () => {
      await saveYoutubeSettings(userId, { uploadsPerDay: 2 }, db)
      const accountId = await channel()
      const one = await mediaFile("one.mp4", "video/mp4", "video")
      const two = await mediaFile("two.mp4", "video/mp4", "video")
      const three = await mediaFile("three.mp4", "video/mp4", "video")
      await upload(accountId, one)
      await upload(accountId, two)
      await expect(upload(accountId, three)).rejects.toThrow("may upload 2 videos a day, and that many are up or on their way")
    })

    it("never counts an upload whose job failed before it ran, and marks its row failed", async () => {
      await saveYoutubeSettings(userId, { uploadsPerDay: 1 }, db)
      const accountId = await channel()
      const one = await mediaFile("one.mp4", "video/mp4", "video")
      const two = await mediaFile("two.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, one)
      const [row] = await db.select({ jobId: promoYoutubePosts.jobId }).from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      // The browser would not open: the job failed at the door, before the upload's own code ran.
      await db.update(promoJobs).set({ status: "failed", lastError: "The browser would not open." }).where(eq(promoJobs.id, row!.jobId!))
      await settleFailedYoutubeJob({ id: row!.jobId!, kind: "youtube_upload" }, "The browser would not open.", db)
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(post).toMatchObject({ status: "failed", lastError: "The browser would not open." })
      await expect(upload(accountId, two)).resolves.toMatchObject({ id: expect.any(String) })
    })

    it("never sends the same video and title twice while one is on its way", async () => {
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      await upload(accountId, video)
      await expect(upload(accountId, video)).rejects.toThrow("already on its way")
    })

    it("holds an important channel's first Short until a throwaway's has stayed up a day", async () => {
      const throwawayProfile = await createProfile(userId, { name: "Spare" }, db)
      const important = await channel("main")
      await db.update(promoAccounts).set({ importance: "important" }).where(eq(promoAccounts.id, important))
      const short = await archiveVideo(1080, 1920, 30)
      await expect(upload(important, short.url)).rejects.toThrow("Upload a Short from a throwaway channel first")
      // In no project: important and throwaway channels never share one.
      const spare = await channel("spare", throwawayProfile, false)
      await db.insert(promoYoutubePosts).values({
        id: uuid(),
        userId,
        accountId: spare,
        mediaUrl: "https://media.test/x.mp4",
        title: "Earlier",
        isShort: true,
        status: "posted",
        postedAt: new Date(Date.now() - 25 * 3_600_000),
      })
      await expect(upload(important, short.url)).resolves.toMatchObject({ id: expect.any(String) })
    })

    it("calls off an upload that has not started, and leaves one that has", async () => {
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, video)
      const other = await upload(accountId, video, { title: "Another title" })
      const [started] = await db.select({ jobId: promoYoutubePosts.jobId }).from(promoYoutubePosts).where(eq(promoYoutubePosts.id, other.id))
      await db.update(promoJobs).set({ status: "running" }).where(eq(promoJobs.id, started!.jobId!))
      expect(await cancelYoutubePosts(userId, [id, other.id], db)).toEqual({ completed: [id], skipped: [other.id] })
    })
  })

  describe("the upload", () => {
    it("marks it posted with YouTube's link and says why a thumbnail did not take", async () => {
      const accountId = await channel()
      const video = await archiveVideo(1920, 1080, 600)
      const thumbnail = await mediaFile("cover.jpg", "image/jpeg", "image")
      const { id } = await upload(accountId, video.url, { thumbnailUrl: thumbnail, aiMade: true })
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      calls.upload.mockResolvedValue({ postUrl: "https://www.youtube.com/watch?v=abcdefghijk", thumbnailSet: false, thumbnailNote: "" })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await runYoutubeUpload(userId, account!, TARGET, { postId: id }, post!.jobId!, db)
      expect(calls.upload).toHaveBeenCalledWith(TARGET, expect.objectContaining({ short: false, aiMade: true, thumbnailUrl: thumbnail, tags: ["study timer", "pomodoro", "focus"] }))
      const [after] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(after).toMatchObject({ status: "posted", postUrl: "https://www.youtube.com/watch?v=abcdefghijk" })
      expect(after!.thumbnailNote).toContain("verified with a phone number")
    })

    it("marks a failed upload failed with why, and lists an abandoned one as failed", async () => {
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, video)
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      calls.upload.mockRejectedValue(new Error("upload: YouTube Studio would not open"))
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await expect(runYoutubeUpload(userId, account!, TARGET, { postId: id }, post!.jobId!, db)).rejects.toThrow("would not open")
      const [after] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(after).toMatchObject({ status: "failed", lastError: "upload: YouTube Studio would not open" })

      const second = await upload(accountId, video, { title: "Again" })
      const [row] = await db.select({ jobId: promoYoutubePosts.jobId }).from(promoYoutubePosts).where(eq(promoYoutubePosts.id, second.id))
      await db.update(promoJobs).set({ status: "failed", lastError: "The upload stopped part-way." }).where(eq(promoJobs.id, row!.jobId!))
      const listed = await listYoutubePosts(userId, projectId, db)
      expect(listed.find((one) => one.id === second.id)).toMatchObject({ status: "failed", lastError: "The upload stopped part-way." })
    })

    it("never runs an upload the job no longer carries", async () => {
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, video)
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await expect(runYoutubeUpload(userId, account!, TARGET, { postId: id }, "another-job", db)).rejects.toThrow("not waiting for this job")
      expect(calls.upload).not.toHaveBeenCalled()
    })

    it("gives an upload 60 minutes before calling it abandoned, then never tries it again, and marks its row failed", async () => {
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, video)
      const [row] = await db.select({ jobId: promoYoutubePosts.jobId }).from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      const jobId = row!.jobId!
      await db.update(promoJobs).set({ status: "running", claimedAt: sql`now() - interval '55 minutes'` }).where(eq(promoJobs.id, jobId))
      await failExpiredClaims(db)
      expect((await db.select().from(promoJobs).where(eq(promoJobs.id, jobId)))[0]!.status).toBe("running")
      await db.update(promoJobs).set({ claimedAt: sql`now() - interval '65 minutes'` }).where(eq(promoJobs.id, jobId))
      await failExpiredClaims(db)
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.id, jobId))
      expect(job!.status).toBe("failed")
      expect(job!.lastError).toContain("may already be on YouTube")
      // Its row says so too, and no longer counts as on its way.
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(post).toMatchObject({ status: "failed", lastError: expect.stringContaining("may already be on YouTube") })
    })
  })

  describe("the daily reading", () => {
    it("keeps subscribers, each video's numbers and the new comments under them", async () => {
      const accountId = await channel()
      const postId = uuid()
      await db.insert(promoYoutubePosts).values({
        id: postId,
        userId,
        accountId,
        projectId,
        mediaUrl: "https://media.test/clip.mp4",
        title: "Study night",
        status: "posted",
        postUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        postedAt: new Date(),
      })
      calls.health.mockResolvedValue({
        handle: "pomoder",
        subscribers: 1200,
        videos: 14,
        verified: true,
        numbers: [{ url: "https://www.youtube.com/watch?v=abcdefghijk", views: 340, likes: 21, comments: 3 }],
        comments: [{ thread: "Study night", author: "@sam", text: "Does it work offline?" }],
        banScreen: null,
      })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await recordYoutubeHealth(userId, account!, TARGET, db)
      expect(calls.health).toHaveBeenCalledWith(TARGET, { videoUrls: ["https://www.youtube.com/watch?v=abcdefghijk"] })
      const [after] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(after).toMatchObject({ followers: 1200, postCount: 14 })
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, postId))
      expect(post).toMatchObject({ views: 340, likes: 21, comments: 3 })
      const comments = await db.select().from(promoInbox).where(eq(promoInbox.accountId, accountId))
      expect(comments).toHaveLength(1)
      expect(comments[0]).toMatchObject({ kind: "comment", platform: "youtube", author: "@sam" })
      // The same comment read again the next day is not listed twice.
      await recordYoutubeHealth(userId, account!, TARGET, db)
      expect(await db.select().from(promoInbox).where(eq(promoInbox.accountId, accountId))).toHaveLength(1)
    })

    it("stops the channel at once on a strike or terminated page", async () => {
      const accountId = await channel()
      calls.health.mockResolvedValue({ handle: null, subscribers: null, videos: null, verified: null, numbers: [], comments: [], banScreen: "This channel was terminated" })
      const [account] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      await recordYoutubeHealth(userId, account!, TARGET, db)
      const [after] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, accountId))
      expect(after!.banScreenAt).not.toBeNull()
      expect(after!.blockedReason).toBe("This channel was terminated")
    })

    it("asks for each signed-in channel's reading once a day", async () => {
      const accountId = await channel()
      expect(await queueYoutubeReadings(db)).toBe(1)
      expect(await queueYoutubeReadings(db)).toBe(0)
      const jobs = await db.select().from(promoJobs).where(and(eq(promoJobs.kind, "youtube_health"), sql`${promoJobs.payload}->>'accountId' = ${accountId}`))
      expect(jobs).toHaveLength(1)
    })
  })

  describe("comments under videos", () => {
    async function comment(accountId: string) {
      const id = uuid()
      await db.insert(promoInbox).values({
        id,
        userId,
        accountId,
        platform: "youtube",
        kind: "comment",
        thread: "Study night",
        author: "@sam",
        lines: [{ from: "@sam", text: "Where do I get it?", mine: false }],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      return id
    }

    it("refuses an answer with a link in it and sends one without from the channel's browser", async () => {
      const accountId = await channel()
      const id = await comment(accountId)
      await expect(sendInboxReply(userId, id, "Grab it at pomoder.app")).rejects.toThrow("never does")
      await sendInboxReply(userId, id, "Search Pomoder in your app store.", db)
      const [job] = await db.select().from(promoJobs).where(eq(promoJobs.kind, "inbox_reply"))
      expect(job).toMatchObject({ lane: profileId, payload: expect.objectContaining({ accountId, inboxId: id }) })
    })

    it("reads comments for a YouTube channel and never messages, which YouTube has none of", async () => {
      const accountId = await channel()
      expect(await queueInboxRead(userId, accountId, "message", "inbox", db)).toBe(false)
      expect(await queueInboxRead(userId, accountId, "comment", "inbox", db)).toBe(true)
    })

    it("lists them on the module with the project's channels, uploads and templates", async () => {
      const accountId = await channel()
      await comment(accountId)
      await createYoutubeTemplate(userId, { projectId, name: "Tutorial", sections: [{ name: "Hook", kind: "ai", text: "" }] }, db)
      const view = await readYoutubeModuleView(userId, projectId, db)
      expect(view.channels.map((row) => row.handle)).toEqual(["pomoder"])
      expect(view.channels[0]!.profileName).toBe("Channel browser")
      expect(view.comments).toHaveLength(1)
      expect(view.templates.map((row) => row.name)).toEqual(["Tutorial"])
      expect(view.uploadsPerDay).toBe(3)
    })
  })

  describe("titles, descriptions and templates", () => {
    it("reads three titles, the tags and the description off the model's answer", () => {
      const read = readYoutubeAnswer(
        ['TITLE: "Study nights, sorted"', "TITLE: Study nights, sorted", "TITLE: A timer for late study", "TITLE: Focus after dark", "TITLE: one too many", "TAGS: study timer, #focus, study timer", "[[DESCRIPTION]]", "Line one.", "", "Line two."].join("\n"),
        0
      )
      expect(read.titles).toEqual(["Study nights, sorted", "A timer for late study", "Focus after dark"])
      expect(read.tags).toEqual(["study timer", "focus"])
      expect(read.description).toBe("Line one.\n\nLine two.")
    })

    it("fills a template's AI parts in order and copies its fixed words as typed", () => {
      const sections = [
        { name: "Hook", kind: "ai" as const, text: "" },
        { name: "Links", kind: "fixed" as const, text: "Get the app: https://pomoder.app" },
        { name: "What it covers", kind: "ai" as const, text: "" },
        { name: "Sign-off", kind: "fixed" as const, text: "Subscribe for more." },
      ]
      const read = readYoutubeAnswer(["TITLE: T", "[[PART 1]] Hook", "Study at night without burning out.", "[[PART 2]] What it covers", "- setting a timer", "- breaks"].join("\n"), 2)
      expect(joinTemplate(sections, read.parts)).toBe(
        "Study at night without burning out.\n\nGet the app: https://pomoder.app\n\n- setting a timer\n- breaks\n\nSubscribe for more."
      )
    })

    it("tells the model only the AI parts of a template, never the fixed words", () => {
      const prompt = buildYoutubePrompt({
        voice: "",
        rules: "",
        product: "",
        about: "A timer",
        caption: "",
        subtitles: "",
        short: false,
        aiSections: [{ name: "Hook", note: "One line" }],
      })
      expect(prompt).toContain("[[PART 1]] Hook: One line")
      expect(prompt).not.toContain("[[DESCRIPTION]]")
    })

    it("keeps the words of subtitles without their numbers and timings", () => {
      expect(subtitleWords("1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:02,500 --> 00:00:04,000\n<i>Set a timer</i>")).toBe("Hello there Set a timer")
    })

    it("writes the words in the channel's voice from an Archive video's caption and subtitles, through a template", async () => {
      const accountId = await channel()
      const video = await archiveVideo(1920, 1080, 600, { caption: "Night study", subtitles: "1\n00:00:01,000 --> 00:00:02,000\nHi" })
      const template = await createYoutubeTemplate(
        userId,
        { projectId, name: "Tutorial", sections: [{ name: "Hook", kind: "ai", text: "" }, { name: "Sign-off", kind: "fixed", text: "Subscribe." }] },
        db
      )
      model.answer = ["TITLE: One", "TITLE: Two", "TITLE: Three", "TAGS: a, b", "[[PART 1]] Hook", "Study better."].join("\n")
      const words = await writeYoutubeWords(userId, { accountId, about: "", mediaUrl: video.url, templateId: template.id }, db)
      expect(words).toEqual({ titles: ["One", "Two", "Three"], description: "Study better.\n\nSubscribe.", tags: ["a", "b"] })
    })

    it("refuses a section with no name and fixed words with no words", () => {
      expect(() => cleanSections([{ name: " ", kind: "ai", text: "" }])).toThrow("Section 1 needs a name.")
      expect(() => cleanSections([{ name: "Links", kind: "fixed", text: " " }])).toThrow("needs its words")
    })

    it("keeps templates in the order given, and an upload keeps its words when its template is deleted", async () => {
      const a = await createYoutubeTemplate(userId, { projectId, name: "A", sections: [] }, db)
      const b = await createYoutubeTemplate(userId, { projectId, name: "B", sections: [] }, db)
      await arrangeYoutubeTemplates(userId, { projectId, ids: [b.id, a.id] }, db)
      expect((await templatesInOrder()).map((row) => row.name)).toEqual(["B", "A"])
      const accountId = await channel()
      const video = await mediaFile("clip.mp4", "video/mp4", "video")
      const { id } = await upload(accountId, video, { templateId: a.id, description: "Kept words." })
      await deleteYoutubeTemplate(userId, a.id, db)
      const [post] = await db.select().from(promoYoutubePosts).where(eq(promoYoutubePosts.id, id))
      expect(post).toMatchObject({ templateId: null, description: "Kept words." })
    })

    function templatesInOrder() {
      return listYoutubeTemplates(userId, projectId, db)
    }
  })

  it("refuses an uploads-a-day number outside 1 to 50", async () => {
    await expect(saveYoutubeSettings(userId, { uploadsPerDay: 0 }, db)).rejects.toThrow("from 1 to 50")
    await expect(saveYoutubeSettings(userId, { uploadsPerDay: 5 }, db)).resolves.toEqual({ uploadsPerDay: 5 })
  })
})
