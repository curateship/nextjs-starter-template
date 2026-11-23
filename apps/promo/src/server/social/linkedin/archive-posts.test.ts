import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { setDbForTests } from "@/server/db"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

/**
 * LinkedIn posts from the Archive (Video's task promo/01, parts 13 and 16):
 * a post carries one of a picture, a video, a poll or a document; a document
 * is an archive carousel's PDF only; a video from the Archive carries its
 * subtitles, copied when the draft is saved; and a phone account never posts
 * a document. The browser's own steps are tested in
 * `docker/browser/test_linkedin.py`.
 */

// An address is the file's own key under one made-up host.
vi.mock("@/server/media/library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/media/library")>()
  return { ...actual, storagePathForUrl: async (url: string) => (url.startsWith("https://media.test/") ? url.slice("https://media.test/".length) : null) }
})

vi.mock("@/server/browser/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/session")>()
  return { ...actual, ensureSession: vi.fn(), stopSession: vi.fn(), touchSession: vi.fn() }
})

// Workday hours read the real clock, so every test is inside one.
vi.mock("@/lib/social/linkedin/workday", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social/linkedin/workday")>()
  return { ...actual, isWorkday: vi.fn(() => true), nextWorkdayAt: vi.fn(() => null) }
})

vi.mock("./calls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./calls")>()
  return { ...actual, linkedinPublish: vi.fn(), linkedinComment: vi.fn(), linkedinQuickState: vi.fn() }
})

const calls = await import("./calls")
const { promoArchiveItems } = await import("@/server/archive/schema")
const { promoPhones } = await import("@/server/phones/schema")
const { createProject } = await import("../projects")
const { promoAccounts } = await import("../schema")
const { promoLinkedinPosts } = await import("./schema")
const { saveLinkedinPost, queueLinkedinPublish, runLinkedinPublish } = await import("./posts")

const target = { port: 7910, token: "account-key" }
const SRT = "1\n00:00:00,000 --> 00:00:02,500\nNight mode is out.\n"

describe("LinkedIn posts from the Archive", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let projectId: string
  let accountId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ client, db } = await createTestDatabase())
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    projectId = await createProject(userId, "Launch week", db, ["linkedin"])
    const profileId = await createProfile(userId, { name: "Main" }, db)
    accountId = uuid()
    // First seen signed in a year ago: past the warm-up and the young days.
    await db.insert(promoAccounts).values({ id: accountId, userId, platform: "linkedin", profileId, projectId, handle: "sam-lee", signedInAt: new Date(Date.now() - 400 * 86_400_000) })
  }, 180_000)

  afterEach(async () => {
    await client.close()
  })

  /** An archive item, ready, with its files under the made-up host. */
  async function item(overrides: Partial<typeof promoArchiveItems.$inferInsert> = {}) {
    const id = uuid()
    await db.insert(promoArchiveItems).values({
      id,
      userId,
      projectId,
      kind: "video",
      status: "ready",
      title: "Launch clip",
      storagePath: `promo/archive/${id}/main.mp4`,
      mimeType: "video/mp4",
      fileSize: 1_000,
      source: "upload",
      ...overrides,
    })
    return id
  }

  const draft = (overrides: Partial<Parameters<typeof saveLinkedinPost>[3]> = {}): Parameters<typeof saveLinkedinPost>[3] => ({
    accountId,
    kind: "post",
    text: "Night mode is out.",
    title: "",
    pictureUrl: "",
    videoUrl: "",
    poll: null,
    tags: [],
    repostFindId: null,
    groupId: "",
    asPageId: "",
    source: "",
    scheduledFor: null,
    ...overrides,
  })

  it("posts a carousel's PDF as a document with the item's title, and sends it to the browser", async () => {
    const id = await item({ kind: "carousel", title: "Seven steps", storagePath: "", mimeType: "", pdfPath: "promo/archive/c/carousel.pdf" })
    const postRowId = await saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://media.test/promo/archive/c/carousel.pdf" }), db)
    const [row] = await db.select().from(promoLinkedinPosts).where(eq(promoLinkedinPosts.id, postRowId))
    expect([row.documentUrl, row.documentTitle, row.archiveItemId]).toEqual(["https://media.test/promo/archive/c/carousel.pdf", "Seven steps", id])

    await queueLinkedinPublish(userId, postRowId, db)
    vi.mocked(calls.linkedinPublish).mockResolvedValueOnce({ postId: "7300000000000002000", url: "" })
    await runLinkedinPublish(userId, postRowId, target, db)
    expect(vi.mocked(calls.linkedinPublish).mock.calls[0][1]).toMatchObject({ documentUrl: "https://media.test/promo/archive/c/carousel.pdf", documentTitle: "Seven steps", subtitles: "" })
  })

  it("refuses a document that is not an archive PDF, and a post with two things on it", async () => {
    await item({ storagePath: "promo/archive/v/main.mp4" })
    await item({ kind: "carousel", storagePath: "", mimeType: "", pdfPath: "promo/archive/c/carousel.pdf" })
    await expect(saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://media.test/promo/archive/v/main.mp4" }), db)).rejects.toThrow(
      "A document post takes a carousel's PDF from the archive."
    )
    await expect(saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://elsewhere.test/a.pdf" }), db)).rejects.toThrow("A document post takes")
    await expect(
      saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://media.test/promo/archive/c/carousel.pdf", videoUrl: "https://media.test/promo/archive/v/main.mp4" }), db)
    ).rejects.toThrow("A post carries one of a picture, a video, a poll or a document.")
    await expect(
      saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://media.test/promo/archive/c/carousel.pdf", poll: { question: "Day?", choices: ["Mon", "Fri"], days: 3 } }), db)
    ).rejects.toThrow("one of a picture, a video, a poll or a document")
  })

  it("copies a video's subtitles from its archive item when saved, keeps them after the item changes, and sends them with the video", async () => {
    const id = await item({ storagePath: "promo/archive/v/main.mp4", subtitles: SRT })
    const postRowId = await saveLinkedinPost(userId, projectId, null, draft({ videoUrl: "https://media.test/promo/archive/v/main.mp4" }), db)
    await db.update(promoArchiveItems).set({ subtitles: "" }).where(eq(promoArchiveItems.id, id))
    const [row] = await db.select().from(promoLinkedinPosts).where(eq(promoLinkedinPosts.id, postRowId))
    expect(row.subtitles).toBe(SRT)

    await queueLinkedinPublish(userId, postRowId, db)
    vi.mocked(calls.linkedinPublish).mockResolvedValueOnce({ postId: "7300000000000002001", url: "" })
    await runLinkedinPublish(userId, postRowId, target, db)
    expect(vi.mocked(calls.linkedinPublish).mock.calls[0][1]).toMatchObject({ videoUrl: "https://media.test/promo/archive/v/main.mp4", subtitles: SRT, documentUrl: "" })

    // Saved again with the video taken off, the subtitles go too.
    const other = await saveLinkedinPost(userId, projectId, null, draft({ videoUrl: "https://media.test/promo/archive/v/main.mp4" }), db)
    await saveLinkedinPost(userId, projectId, other, draft({ videoUrl: "" }), db)
    const [cleared] = await db.select().from(promoLinkedinPosts).where(eq(promoLinkedinPosts.id, other))
    expect(cleared.subtitles).toBe("")
  })

  it("never sends a document from a phone account, when Post is pressed or if the account moved to a phone after", async () => {
    await item({ kind: "carousel", storagePath: "", mimeType: "", pdfPath: "promo/archive/c/carousel.pdf" })
    const postRowId = await saveLinkedinPost(userId, projectId, null, draft({ documentUrl: "https://media.test/promo/archive/c/carousel.pdf" }), db)
    await queueLinkedinPublish(userId, postRowId, db)
    // Moved to a phone while it waited: the run refuses and nothing reaches LinkedIn.
    const phoneId = uuid()
    await db.insert(promoPhones).values({ id: phoneId, userId, name: "Pixel", serial: "A1" })
    await db.update(promoAccounts).set({ phoneId, profileId: null }).where(eq(promoAccounts.id, accountId))
    await expect(runLinkedinPublish(userId, postRowId, target, db)).rejects.toThrow("can't post a document")
    expect(calls.linkedinPublish).not.toHaveBeenCalled()
    const [failed] = await db.select().from(promoLinkedinPosts).where(eq(promoLinkedinPosts.id, postRowId))
    expect(failed.status).toBe("failed")
    await expect(queueLinkedinPublish(userId, postRowId, db)).rejects.toThrow("A document needs a LinkedIn account on a browser profile.")
  })
})
