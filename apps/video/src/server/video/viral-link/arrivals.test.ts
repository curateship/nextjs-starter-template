import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { customShellMedia, customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"
import { videoProjectMedia, videoProjectVideos, videoViralArrivals, videoViralLinks, type VideoViralLinkRow } from "@/server/video/schema"

vi.mock("@/server/notifications/events", () => ({ publishNotificationCreated: async () => undefined }))

const { acceptDraft, copyArrival, draftShape, hello, projects, sendStatus, sweepViralArrivals, viralDraftName } = await import("./arrivals")
const { answerViral, findViralCaller, makeViralKey } = await import("./link")
const { createOwnedProject } = await import("@/server/video/projects")

const VIRAL = "http://localhost:3027"
const TOKEN = "t".repeat(32)

let client: PGlite
let db: TestDatabase
let admin: CustomShellUser
let key: string
let link: VideoViralLinkRow
let projectId: string
let workspaceId: string

/** The videos a new project starts with, left out of every count below. */
let startingVideoIds: Set<string>

/** The videos Viral made. */
const sentVideos = () => db.select().from(videoProjectVideos).then((rows) => rows.filter((row) => !startingVideoIds.has(row.id)))

const withKey = (value: string, init: RequestInit = {}) =>
  new Request("http://video/api/connect/viral/x", { ...init, headers: { authorization: `Bearer ${value}`, ...(init.headers ?? {}) } })

const note = (overrides: Partial<ReturnType<typeof draftShape.parse>> = {}) =>
  draftShape.parse({
    sendId: "send-1",
    projectId,
    title: "Meal prep in 30 seconds",
    script: "Hook: you're wasting Sundays\nProblem: ...",
    notes: "Film it in the kitchen",
    vaultItemUrl: `${VIRAL}/admin/vault?open=item-1`,
    viralProjectName: "Meal prep",
    ...overrides,
  })

const withFile = { file: { token: TOKEN, name: "original.mp4", contentType: "video/mp4", size: 4 } }

/** Answers the file address with these bytes and type, and records each call. */
function fakeFetch(body: Uint8Array | number, contentType = "video/mp4") {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe(`${VIRAL}/api/connect/video/file/${TOKEN}`)
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${key}`)
    expect(init?.redirect).toBe("error")
    if (typeof body === "number") return new Response("broken", { status: body })
    return new Response(body as Uint8Array<ArrayBuffer>, { headers: { "content-type": contentType } })
  }) as unknown as typeof fetch
}

/** Stores a media row in the test database the way the library would. */
async function saveFile({ userId, bytes, mimeType }: { userId: string; bytes: Uint8Array; mimeType: string }) {
  const id = uuid()
  const at = now()
  await db.insert(customShellMedia).values({
    id,
    workspaceId,
    userId,
    filename: `${id}.mp4`,
    originalName: "original.mp4",
    fileSize: bytes.byteLength,
    mimeType,
    fileType: "video",
    storagePath: `${userId}/${id}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  return { id }
}

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-the-viral-link"
  ;({ client, db } = await createTestDatabase())
  admin = await insertUser(db, { role: "admin", name: "Tyler" })
  workspaceId = (await insertWorkspace(db)).id
  projectId = (await createOwnedProject(admin.id, "Launch videos", db)).project.id
  startingVideoIds = new Set((await db.select({ id: videoProjectVideos.id }).from(videoProjectVideos)).map((row) => row.id))
  key = await makeViralKey(admin.id, db)
  link = (await findViralCaller(withKey(key), db))!
  await hello(link, { viralUrl: `${VIRAL}/` }, db)
  ;[link] = await db.select().from(videoViralLinks).where(eq(videoViralLinks.userId, admin.id))
})

afterEach(async () => {
  await client.close()
})

describe("the key", () => {
  it("finds the admin by their key and refuses a wrong, old or member's key", async () => {
    expect((await findViralCaller(withKey(key), db))?.userId).toBe(admin.id)
    expect(await findViralCaller(withKey("vv_" + "x".repeat(43)), db)).toBeNull()
    expect(await findViralCaller(withKey("not-a-key"), db)).toBeNull()
    const newer = await makeViralKey(admin.id, db)
    expect(await findViralCaller(withKey(key), db)).toBeNull()
    expect((await findViralCaller(withKey(newer), db))?.userId).toBe(admin.id)
    const member = await insertUser(db, { role: "member" })
    expect(await findViralCaller(withKey(await makeViralKey(member.id, db)), db)).toBeNull()
  })

  it("answers 401 for a wrong key and 400 for a body it doesn't know", async () => {
    const wrong = await answerViral(withKey("vv_" + "y".repeat(43), { method: "POST", body: "{}" }), draftShape, async () => ({}), db)
    expect(wrong.status).toBe(401)
    const bad = await answerViral(withKey(key, { method: "POST", body: JSON.stringify({ sendId: "" }) }), draftShape, async () => ({}), db)
    expect(bad.status).toBe(400)
  })

  it("answers a draft through the address with the key", async () => {
    const body = JSON.stringify({ sendId: "send-9", projectId, title: "Through the door" })
    const response = await answerViral(
      withKey(key, { method: "POST", body, headers: { "content-type": "application/json" } }),
      draftShape,
      (caller, data) => acceptDraft(caller, data, db),
      db
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "ready" })
  })

  it("keeps Viral's address from Test and lists only the admin's own live projects", async () => {
    expect(link.viralUrl).toBe(VIRAL)
    const member = await insertUser(db, { role: "member" })
    await createOwnedProject(member.id, "Not offered", db)
    expect(await projects(link, db)).toEqual({ projects: [{ id: projectId, name: "Launch videos" }] })
  })
})

describe("a send with no file", () => {
  it("makes one draft with the script, notes and vault link, and rings the bell", async () => {
    const answer = await acceptDraft(link, note(), db)
    expect(answer.status).toBe("ready")
    expect(answer.editUrl).toContain(`/admin/video-editor/${projectId}?video=${answer.videoId}`)
    const [video] = await db.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, answer.videoId))
    expect(video).toMatchObject({
      name: "Meal prep in 30 seconds",
      status: "draft",
      viralScript: "Hook: you're wasting Sundays\nProblem: ...",
      viralNotes: "Film it in the kitchen",
      viralVaultUrl: `${VIRAL}/admin/vault?open=item-1`,
    })
    const bells = await db.select().from(customShellNotifications)
    expect(bells.map((bell) => [bell.message, bell.detail])).toEqual([["Meal prep in 30 seconds arrived from Viral", "From Meal prep."]])
  })

  it("makes one draft when the same send comes twice", async () => {
    const first = await acceptDraft(link, note(), db)
    const second = await acceptDraft(link, note(), db)
    expect(second.videoId).toBe(first.videoId)
    expect(await sentVideos()).toHaveLength(1)
    expect(await sendStatus(link, "send-1", db)).toEqual({ status: "ready", videoId: first.videoId, editUrl: first.editUrl })
    expect(await sendStatus(link, "other", db)).toEqual({ status: "gone" })
  })

  it("refuses another admin's project and a file that isn't a video", async () => {
    const other = await insertUser(db, { role: "admin" })
    const theirs = (await createOwnedProject(other.id, "Theirs", db)).project.id
    await expect(acceptDraft(link, note({ projectId: theirs }), db)).rejects.toThrow("isn't there any more")
    await expect(
      acceptDraft(link, note({ file: { ...withFile.file, contentType: "image/png" } }), db)
    ).rejects.toThrow("only takes a video")
  })

  it("keeps the vault link only when it is on the Viral address Test saved", async () => {
    for (const [sendId, vaultItemUrl] of [["send-js", "javascript:alert(1)"], ["send-off", "https://evil.test/admin/vault"]]) {
      const answer = await acceptDraft(link, note({ sendId, vaultItemUrl }), db)
      const [video] = await db.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, answer.videoId))
      expect(video.viralVaultUrl).toBeNull()
    }
  })

  it("names a draft from the script when there is no title", () => {
    expect(viralDraftName("", "  First line\nSecond")).toBe("First line")
    expect(viralDraftName("", "")).toBe("From Viral")
    expect(viralDraftName("x".repeat(100), "")).toHaveLength(80)
  })
})

describe("a send with the original", () => {
  it("copies the video onto the project's Media shelf, then tells Viral", async () => {
    const tell = vi.fn(async () => ({}))
    const answer = await acceptDraft(link, note(withFile), db)
    expect(answer.status).toBe("copying")
    expect(await db.select().from(customShellNotifications)).toHaveLength(0)

    const result = await copyArrival(answer.arrivalId, { db, fetchImpl: fakeFetch(new Uint8Array([1, 2, 3, 4])), saveFile, tell })
    expect(result).toBe("ready")
    const shelf = await db.select().from(videoProjectMedia).where(eq(videoProjectMedia.projectId, projectId))
    expect(shelf).toHaveLength(1)
    expect(tell).toHaveBeenCalledWith(admin.id, { type: "arrived", sendId: "send-1", videoId: answer.videoId, editUrl: answer.editUrl })
    expect(await sendStatus(link, "send-1", db)).toMatchObject({ status: "ready" })
    expect(await db.select().from(customShellNotifications)).toHaveLength(1)
    // A second run finds nothing to do.
    expect(await copyArrival(answer.arrivalId, { db, fetchImpl: fakeFetch(1), saveFile, tell })).toBe("skipped")
  })

  it("deletes the draft and tells Viral when the fetch fails", async () => {
    const tell = vi.fn(async () => ({}))
    const answer = await acceptDraft(link, note(withFile), db)
    expect(await copyArrival(answer.arrivalId, { db, fetchImpl: fakeFetch(500), saveFile, tell })).toBe("failed")
    expect(await sentVideos()).toHaveLength(0)
    expect(tell).toHaveBeenCalledWith(admin.id, { type: "failed", sendId: "send-1", error: "Viral answered 500 for the video." })
    expect(await sendStatus(link, "send-1", db)).toEqual({ status: "gone" })
    await expect(acceptDraft(link, note(withFile), db)).rejects.toThrow("failed already")
  })

  it("refuses a file that turns out not to be a video, or the wrong size", async () => {
    const tell = vi.fn(async () => ({}))
    const first = await acceptDraft(link, note(withFile), db)
    expect(await copyArrival(first.arrivalId, { db, fetchImpl: fakeFetch(new Uint8Array([1, 2, 3, 4]), "text/html"), saveFile, tell })).toBe("failed")
    expect(tell).toHaveBeenLastCalledWith(admin.id, { type: "failed", sendId: "send-1", error: "Viral's file isn't a video, so Video didn't keep it." })
    const second = await acceptDraft(link, note({ ...withFile, sendId: "send-2" }), db)
    expect(await copyArrival(second.arrivalId, { db, fetchImpl: fakeFetch(new Uint8Array([1, 2])), saveFile, tell })).toBe("failed")
    expect(tell).toHaveBeenLastCalledWith(admin.id, { type: "failed", sendId: "send-2", error: "The video arrived incomplete." })
    expect(await db.select().from(customShellMedia)).toHaveLength(0)
  })

  it("Replace updates the draft's words and swaps its Media file", async () => {
    const tell = vi.fn(async () => ({}))
    const first = await acceptDraft(link, note(withFile), db)
    await copyArrival(first.arrivalId, { db, fetchImpl: fakeFetch(new Uint8Array([1, 2, 3, 4])), saveFile, tell })
    const [oldShelf] = await db.select().from(videoProjectMedia)

    const again = await acceptDraft(link, note({ ...withFile, sendId: "send-2", script: "A newer script", replaceVideoId: first.videoId }), db)
    expect(again.videoId).toBe(first.videoId)
    // The words wait for the file, so a failed Replace leaves the old ones.
    const [waiting] = await db.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, first.videoId))
    expect(waiting.viralScript).toBe("Hook: you're wasting Sundays\nProblem: ...")

    expect(await copyArrival(again.arrivalId, { db, fetchImpl: fakeFetch(new Uint8Array([5, 6, 7, 8])), saveFile, tell })).toBe("ready")
    const videos = await sentVideos()
    expect(videos).toHaveLength(1)
    expect(videos[0].viralScript).toBe("A newer script")
    const shelf = await db.select().from(videoProjectMedia)
    expect(shelf).toHaveLength(1)
    expect(shelf[0].mediaId).not.toBe(oldShelf.mediaId)
  })

  it("a failed Replace keeps the draft", async () => {
    const tell = vi.fn(async () => ({}))
    const first = await acceptDraft(link, note(), db)
    const again = await acceptDraft(link, note({ ...withFile, sendId: "send-2", replaceVideoId: first.videoId }), db)
    expect(await copyArrival(again.arrivalId, { db, fetchImpl: fakeFetch(500), saveFile, tell })).toBe("failed")
    expect((await sentVideos()).map((video) => video.id)).toEqual([first.videoId])
  })

  it("the sweep ends a copy stuck past its hour", async () => {
    const tell = vi.fn(async () => ({}))
    const answer = await acceptDraft(link, note(withFile), db)
    await db.update(videoViralArrivals).set({ claimedAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(videoViralArrivals.id, answer.arrivalId))
    await sweepViralArrivals({ db, tell })
    expect(await sendStatus(link, "send-1", db)).toEqual({ status: "gone" })
    expect(tell).toHaveBeenCalledWith(admin.id, expect.objectContaining({ type: "failed", sendId: "send-1" }))
  })
})
