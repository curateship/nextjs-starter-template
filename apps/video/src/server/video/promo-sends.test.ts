import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { videoCarousels, videoProjectVideos, videoPromoSends, videoRenderJobs, videoThumbnails } from "@/server/video/schema"

/**
 * Send to Promo from Video's side: the note Promo is posted, the file token,
 * Promo's news, Try again and the remembered picks. Promo is a stand-in
 * `fetch`; storage is never touched.
 */

vi.mock("@/server/notifications/events", () => ({ publishNotificationCreated: async () => undefined }))
const storage = vi.hoisted(() => ({ uploaded: [] as string[], deleted: [] as string[] }))
vi.mock("@/server/media/storage", () => ({
  getFromR2: async () => ({ Body: { transformToWebStream: () => new Response("12345").body }, ContentLength: 5 }),
  uploadToR2: async (path: string) => void storage.uploaded.push(path),
  deleteFromR2: async (path: string) => void storage.deleted.push(path),
}))
vi.mock("@/server/video/thumbnails", () => ({
  getOwnedThumbnail: async () => ({}),
  drawThumbnail: async () => new Uint8Array([1, 2, 3]),
}))
vi.mock("@/server/video/promo-slideshow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/video/promo-slideshow")>()),
  renderSlideshow: async () => ({ storagePath: "video/promo-sends/slideshow.mp4", size: 9, durationMs: 6000 }),
}))

const sends = await import("@/server/video/promo-sends")
const { savePromoUrl } = await import("@/server/video/settings")
const { withLanguageCopies } = await import("@/server/video/promo-copies")
const { createOwnedProject } = await import("@/server/video/projects")
const { makeTestCarousel } = await import("@/server/video/carousel-test-support")

const PROMO = { url: "http://localhost:3018", key: "pv_test" }

let client: PGlite
let db: TestDatabase
let user: CustomShellUser
let projectId: string
let videoId: string

/** A ready export of the project's video. */
async function readyExport(overrides: Partial<typeof videoRenderJobs.$inferInsert> = {}) {
  const at = new Date()
  const id = crypto.randomUUID()
  const [row] = await db
    .insert(videoRenderJobs)
    .values({
      id,
      userId: user.id,
      kind: "video",
      projectId,
      videoId,
      status: "ready",
      quality: "high",
      aspect: "9:16",
      storagePath: `video/exports/${user.id}/${id}.mp4`,
      thumbnailStoragePath: `video/export-covers/${user.id}/${id}.jpg`,
      fileSize: 5,
      durationMs: 30_000,
      width: 1080,
      height: 1920,
      title: "Launch video",
      description: "The launch",
      createdAt: at,
      updatedAt: at,
      finishedAt: at,
      ...overrides,
    })
    .returning()
  return row
}

/** Promo, answering each item with an id, or refusing with a message. */
function promo(answer: "takes" | "refuses" = "takes") {
  const notes: unknown[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/api/connect/video/items")) {
      notes.push(JSON.parse(String(init?.body)))
      if (answer === "refuses") return Response.json({ error: "That Promo project is not there any more. Pick another one." }, { status: 404 })
      return Response.json({ itemId: `item-${notes.length}`, itemUrl: `${PROMO.url}/admin/archive?open=item-${notes.length}`, status: "copying" })
    }
    if (url.includes("/api/connect/video/sends/")) return Response.json({ status: "ready", itemId: "item-1", itemUrl: `${PROMO.url}/a` })
    return new Response("no", { status: 404 })
  }) as unknown as typeof fetch
  return { fetchImpl, notes }
}

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-promo-sends"
  ;({ client, db } = await createTestDatabase())
  user = await insertUser(db, { role: "admin" })
  const made = await createOwnedProject(user.id, "Launch", db)
  projectId = made.project.id
  videoId = made.video
  // Open in Promo is kept only on the saved Promo address.
  await savePromoUrl(PROMO.url, db)
})

/** An export sent to Promo and arrived, as Posted needs. */
async function sentToPromo(exportId: string) {
  const [send] = await sends.startPromoSends(
    { userId: user.id, exportIds: [exportId], promoProjects: [{ id: "pp", name: "P" }] },
    { db, fetchImpl: promo().fetchImpl, connection: PROMO }
  )
  await sends.applyPromoEvent({ type: "arrived", sendId: send.id, itemId: "item", itemUrl: `${PROMO.url}/a` }, db)
}

afterEach(async () => {
  await client.close()
})

describe("sending an export to Promo", () => {
  it("posts Promo a note naming the file, cover, words and where to edit it", async () => {
    const exported = await readyExport()
    const { fetchImpl, notes } = promo()
    const [view] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "pp-1", name: "Launch week" }], drafts: ["instagram"] },
      { db, fetchImpl, connection: PROMO }
    )
    expect(view).toMatchObject({ status: "sending", promoProjectName: "Launch week", exportId: exported.id })
    const note = notes[0] as Record<string, unknown>
    expect(note).toMatchObject({
      sendId: view.id,
      projectId: "pp-1",
      kind: "video",
      title: "Launch video",
      description: "The launch",
      aspect: "9:16",
      drafts: ["instagram"],
      videoProjectName: "Launch",
    })
    expect(String((note.file as { url: string }).url)).toMatch(/\/api\/connect\/promo\/file\/[0-9a-f]{64}\?part=main$/)
    expect(note.cover).toMatchObject({ mimeType: "image/jpeg" })
    expect(String(note.videoEditUrl)).toContain(`/admin/video-editor/${projectId}?video=${videoId}`)
    // The token works for this send only, and the file streams with its count.
    const token = /file\/([0-9a-f]{64})/.exec(String((note.file as { url: string }).url))![1]
    const send = await sends.sendForToken(token, db)
    expect(send?.id).toBe(view.id)
    const response = await sends.streamPart(send!, { kind: "main" }, db)
    expect(await response.text()).toBe("12345")
  })

  it("ends a send Promo refuses as failed, with Promo's words and a bell", async () => {
    const exported = await readyExport()
    const { fetchImpl } = promo("refuses")
    const [view] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "gone", name: "Gone" }] },
      { db, fetchImpl, connection: PROMO }
    )
    expect(view).toMatchObject({ status: "failed", error: "That Promo project is not there any more. Pick another one." })
    const bells = await db.select().from(customShellNotifications)
    expect(bells.map((bell) => bell.message)).toEqual(["Launch video didn't reach Promo"])
    const [row] = await db.select().from(videoPromoSends)
    expect(row.tokenHash).toBeNull()
  })

  it("sends one export to two projects as two sends, and remembers both for the project", async () => {
    const exported = await readyExport()
    const { fetchImpl, notes } = promo()
    const views = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
      { db, fetchImpl, connection: PROMO }
    )
    expect(views).toHaveLength(2)
    expect(notes).toHaveLength(2)
    expect(await sends.readPicks(user.id, projectId, db)).toEqual(["a", "b"])
  })

  it("marks a send sent when Promo says it arrived, and fails it with a bell when Promo says it failed", async () => {
    const exported = await readyExport()
    const { fetchImpl } = promo()
    const [first, second] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
      { db, fetchImpl, connection: PROMO }
    )
    await sends.applyPromoEvent({ type: "arrived", sendId: first.id, itemId: "item-1", itemUrl: `${PROMO.url}/x` }, db)
    await sends.applyPromoEvent({ type: "failed", sendId: second.id, error: "The file arrived incomplete." }, db)
    const rows = await sends.listPromoSends(user.id, { exportIds: [exported.id] }, db)
    expect(rows.find((row) => row.id === first.id)).toMatchObject({ status: "sent", promoItemUrl: `${PROMO.url}/x` })
    expect(rows.find((row) => row.id === second.id)).toMatchObject({ status: "failed", error: "The file arrived incomplete." })
    expect(await db.select().from(customShellNotifications)).toHaveLength(1)
    // A sent send's token no longer opens anything.
    const [sent] = await db.select().from(videoPromoSends).where(eq(videoPromoSends.id, first.id))
    expect(sent.tokenHash).toBeNull()
  })

  it("ignores an Open in Promo address that isn't on the saved Promo address", async () => {
    const exported = await readyExport()
    const [view] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }] },
      { db, fetchImpl: promo().fetchImpl, connection: PROMO }
    )
    await sends.applyPromoEvent({ type: "arrived", sendId: view.id, itemId: "i", itemUrl: "https://evil.test/x" }, db)
    const [row] = await sends.listPromoSends(user.id, { exportIds: [exported.id] }, db)
    expect(row).toMatchObject({ status: "sent", promoItemUrl: "" })
  })

  it("tries a failed send again under the same id", async () => {
    const exported = await readyExport()
    const [failed] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }] },
      { db, fetchImpl: promo("refuses").fetchImpl, connection: PROMO }
    )
    const { fetchImpl, notes } = promo()
    const again = await sends.retryPromoSend(user.id, failed.id, { db, fetchImpl, connection: PROMO })
    expect(again).toMatchObject({ id: failed.id, status: "sending", error: "" })
    expect((notes[0] as { sendId: string }).sendId).toBe(failed.id)
    await expect(sends.retryPromoSend(user.id, failed.id, { db, fetchImpl, connection: PROMO })).rejects.toThrow("Only a failed send")
  })

  it("asks Promo about a send on its way and marks it sent when it is ready", async () => {
    const exported = await readyExport()
    const { fetchImpl } = promo()
    const [view] = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }] },
      { db, fetchImpl, connection: PROMO }
    )
    // Asked again at once, Video answers from its own row without asking Promo.
    const [early] = await sends.refreshPromoSends(user.id, [view.id], { db, fetchImpl, connection: PROMO })
    expect(early.status).toBe("sending")
    const later = () => new Date(Date.now() + 30_000)
    const [refreshed] = await sends.refreshPromoSends(user.id, [view.id], { db, fetchImpl, connection: PROMO, now: later })
    expect(refreshed.status).toBe("sent")
  })

  it("refuses an export that isn't ready", async () => {
    const waiting = await readyExport({ status: "queued", storagePath: null })
    await expect(
      sends.startPromoSends(
        { userId: user.id, exportIds: [waiting.id], promoProjects: [{ id: "a", name: "A" }] },
        { db, fetchImpl: promo().fetchImpl, connection: PROMO }
      )
    ).rejects.toThrow("isn't ready")
  })
})

describe("every language copy", () => {
  it("brings each copy's newest export in the same shape, grouped under the original", async () => {
    const original = await readyExport()
    const at = new Date()
    const [copy] = await db
      .insert(videoProjectVideos)
      .values({
        id: crypto.randomUUID(),
        projectId,
        userId: user.id,
        name: "Launch (Spanish)",
        aspect: "9:16",
        timeline: {},
        languageOf: videoId,
        language: "Spanish",
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    const [, unexported] = await db
      .insert(videoProjectVideos)
      .values([
        { id: crypto.randomUUID(), projectId, userId: user.id, name: "x", aspect: "9:16", timeline: {}, createdAt: at, updatedAt: at },
        { id: crypto.randomUUID(), projectId, userId: user.id, name: "Launch (Hindi)", aspect: "9:16", timeline: {}, languageOf: videoId, language: "Hindi", createdAt: at, updatedAt: at },
      ])
      .returning()
    const spanish = await readyExport({ videoId: copy.id, title: "Spanish" })
    await readyExport({ videoId: copy.id, aspect: "16:9", title: "Spanish wide" })

    const result = await withLanguageCopies(user.id, [original.id], db)
    expect(result.exportIds.sort()).toEqual([original.id, spanish.id].sort())
    expect(result.groupKeys).toEqual({ [original.id]: videoId, [spanish.id]: videoId })
    expect(result.skipped).toEqual([unexported.name])
  })
})

describe("what else goes with a send", () => {
  it("carries the video's spoken captions as subtitles, cut to the export's range", async () => {
    const caption = (startMs: number, text: string) => ({
      id: crypto.randomUUID(),
      kind: "text",
      name: text,
      startMs,
      durationMs: 1000,
      trimStartMs: 0,
      text,
      fontId: "inter",
      wordTimes: [{ startMs: 0, endMs: 500 }],
    })
    await db
      .update(videoProjectVideos)
      .set({ timeline: { aspect: "9:16", tracks: [{ id: "t", muted: false, clips: [caption(0, "Hello"), caption(5000, "Later")] }] } })
      .where(eq(videoProjectVideos.id, videoId))
    const exported = await readyExport({ rangeStartMs: 4000, rangeEndMs: 8000 })
    const { fetchImpl, notes } = promo()
    await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }] },
      { db, fetchImpl, connection: PROMO }
    )
    expect((notes[0] as { subtitles: string }).subtitles).toBe("1\n00:00:01,000 --> 00:00:02,000\nLater\n")
  })

  it("draws a thumbnail as a picture of its own, and drops that file once Promo has it", async () => {
    const at = new Date()
    const [thumb] = await db
      .insert(videoThumbnails)
      .values({ id: crypto.randomUUID(), userId: user.id, videoId, shape: "wide", title: "Big news", createdAt: at, updatedAt: at })
      .returning()
    const { fetchImpl, notes } = promo()
    const [view] = await sends.startPromoSends(
      { userId: user.id, thumbnailIds: [thumb.id], promoProjects: [{ id: "a", name: "A" }] },
      { db, fetchImpl, connection: PROMO }
    )
    expect(notes[0]).toMatchObject({ kind: "picture", title: "Big news", aspect: "16:9", file: { mimeType: "image/jpeg", size: 3 } })
    const [row] = await db.select().from(videoPromoSends).where(eq(videoPromoSends.id, view.id))
    expect(storage.uploaded).toContain(row.options.filePath)
    const located = await sends.locatePart(row, { kind: "main" }, db)
    expect(located).toEqual({ storagePath: row.options.filePath, contentType: "image/jpeg" })
    await sends.applyPromoEvent({ type: "arrived", sendId: view.id, itemId: "i", itemUrl: `${PROMO.url}/i` }, db)
    expect(storage.deleted).toContain(row.options.filePath)
  })

  it("sends a carousel's slideshow as its own video, kept together with the carousel", async () => {
    const carousel = await makeTestCarousel(user.id, "Tips", db)
    const exported = await readyExport({
      kind: "carousel",
      projectId: null,
      videoId: null,
      carouselId: carousel.id,
      aspect: "4:5",
      slideRanges: [{ start: 0, size: 2 }, { start: 2, size: 2 }],
      title: "Tips",
    })
    const { fetchImpl, notes } = promo()
    const views = await sends.startPromoSends(
      { userId: user.id, exportIds: [exported.id], promoProjects: [{ id: "a", name: "A" }], slideshow: { soundId: null } },
      { db, fetchImpl, connection: PROMO, awaitSlideshows: true }
    )
    expect(views.map((view) => view.kind).sort()).toEqual(["export", "slideshow"])
    const [carouselNote, slideshowNote] = notes as Record<string, unknown>[]
    expect(carouselNote).toMatchObject({ kind: "carousel", groupKey: exported.id })
    expect(slideshowNote).toMatchObject({ kind: "video", groupKey: exported.id, aspect: "9:16", durationMs: 6000, title: "Tips (slideshow)" })
    expect(slideshowNote.file).toMatchObject({ mimeType: "video/mp4", size: 9 })
    // Both are listed, each under its own kind.
    expect(await sends.listPromoSends(user.id, { exportIds: [exported.id] }, db)).toHaveLength(2)
  })

  it("turns the video or carousel to Posted when Promo says a post went out", async () => {
    const exported = await readyExport()
    // An export never sent to Promo can't be marked Posted by Promo.
    expect(await sends.applyPromoEvent({ type: "posted", videoExportId: exported.id, network: "tiktok", postUrl: "" }, db)).toEqual({ known: false })
    await sentToPromo(exported.id)
    expect(await sends.applyPromoEvent({ type: "posted", videoExportId: exported.id, network: "tiktok", postUrl: "" }, db)).toEqual({ known: true })
    const [video] = await db.select({ status: videoProjectVideos.status }).from(videoProjectVideos).where(eq(videoProjectVideos.id, videoId))
    expect(video.status).toBe("posted")

    const carousel = await makeTestCarousel(user.id, "Tips", db)
    const carouselExport = await readyExport({
      kind: "carousel",
      projectId: null,
      videoId: null,
      carouselId: carousel.id,
      aspect: "4:5",
      slideRanges: [{ start: 0, size: 2 }],
    })
    await sentToPromo(carouselExport.id)
    await sends.applyPromoEvent({ type: "posted", videoExportId: carouselExport.id, network: "instagram", postUrl: "" }, db)
    const [after] = await db.select({ status: videoCarousels.status }).from(videoCarousels).where(eq(videoCarousels.id, carousel.id))
    expect(after.status).toBe("posted")
    expect(await sends.applyPromoEvent({ type: "posted", videoExportId: "gone", network: "x", postUrl: "" }, db)).toEqual({ known: false })
  })
})
