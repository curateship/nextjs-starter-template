import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createProject, deleteProject } from "@/server/social/projects"
import { promoAccounts, promoAppPosts } from "@/server/social/schema"
import { createTestDatabase, insertUser, insertWorkspace, type TestDatabase } from "@/server/test-support"

/**
 * The Archive dashboard's reading and changing: the list's order and
 * filters, the Bin, pins, copy and move, uploads, storage per project, the
 * zip, and a project that still holds items.
 */

vi.mock("@/server/media/storage", () => ({
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
  getFromR2: async () => ({ Body: { transformToWebStream: () => new Response("abc").body } }),
}))
vi.mock("@/server/media/library", () => ({
  storagePathForUrl: async (url: string) => (url.startsWith("https://media.test/") ? url.slice("https://media.test/".length) : null),
}))

const items = await import("./items")
const { promoArchiveItems, promoArchiveSlides } = await import("./schema")
const { projectZip, streamZip } = await import("./zip")
const { writeArchiveCaptions } = await import("./posting")

let client: PGlite
let db: TestDatabase
let user: CustomShellUser
let projectId: string

async function item(overrides: Partial<typeof promoArchiveItems.$inferInsert> = {}) {
  const id = uuid()
  const at = new Date(overrides.createdAt ?? Date.now())
  await db.insert(promoArchiveItems).values({
    id,
    userId: user.id,
    projectId,
    kind: "video",
    status: "ready",
    title: "Clip",
    storagePath: `promo/archive/${user.id}/${id}/main.mp4`,
    mimeType: "video/mp4",
    fileSize: 100,
    source: "video",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  })
  return id
}

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  user = await insertUser(db, { role: "admin" })
  projectId = await createProject(user.id, "Launch week", db, ["instagram"])
})

afterEach(async () => {
  await client.close()
})

describe("the archive list", () => {
  it("puts pinned items first, then newest, and leaves a newer version still arriving out", async () => {
    const old = await item({ title: "Old", createdAt: new Date("2026-01-01") })
    const fresh = await item({ title: "Fresh", createdAt: new Date("2026-06-01") })
    const pinned = await item({ title: "Pinned", createdAt: new Date("2025-01-01") })
    await items.pinArchiveItem(user.id, pinned, true, db)
    await item({ title: "Stand-in", status: "copying", pending: { files: [], replaceItemId: fresh } })
    const { items: listed } = await items.listArchiveItems(user.id, { projectId }, db)
    expect(listed.map((row) => row.id)).toEqual([pinned, fresh, old])
  })

  it("finds by words and lists only what was never posted", async () => {
    const posted = await item({ title: "Launch teaser", caption: "Out now" })
    await item({ title: "Behind the scenes" })
    const [account] = await db
      .insert(promoAccounts)
      .values({ id: uuid(), userId: user.id, projectId, platform: "instagram", handle: "@me" })
      .returning()
    await db.insert(promoAppPosts).values({
      id: uuid(),
      userId: user.id,
      accountId: account.id,
      projectId,
      platform: "instagram",
      mediaUrl: "x",
      mediaKind: "video",
      status: "posted",
      views: 1200,
      postedAt: new Date(),
      archiveItemId: posted,
    })
    expect((await items.listArchiveItems(user.id, { projectId, q: "out now" }, db)).items.map((row) => row.id)).toEqual([posted])
    const notPosted = (await items.listArchiveItems(user.id, { projectId, notPosted: true }, db)).items
    expect(notPosted.map((row) => row.title)).toEqual(["Behind the scenes"])
    const byViews = (await items.listArchiveItems(user.id, { projectId, sort: "views" }, db)).items
    expect(byViews[0]).toMatchObject({ id: posted, posted: 1, views: 1200 })
  })

  it("adds up each project's room, the Bin included, biggest first", async () => {
    const other = await createProject(user.id, "Small", db)
    await item({ fileSize: 5_000 })
    const binned = await item({ fileSize: 1_000 })
    await items.binArchiveItems(user.id, [binned], db)
    await item({ projectId: other, fileSize: 10 })
    const rows = await items.listArchiveProjects(user.id, db)
    expect(rows.map((row) => [row.name, row.items, row.bytes])).toEqual([
      ["Launch week", 1, 6_000],
      ["Small", 1, 10],
    ])
  })
})

describe("the Bin", () => {
  it("keeps a deleted item 30 days, puts it back, and then deletes it and its files for good", async () => {
    const id = await item()
    await items.binArchiveItems(user.id, [id], db)
    expect((await items.listArchiveItems(user.id, { projectId }, db)).items).toHaveLength(0)
    expect((await items.listArchiveItems(user.id, { projectId, bin: true }, db)).binCount).toBe(1)
    await items.restoreArchiveItem(user.id, id, db)
    expect((await items.listArchiveItems(user.id, { projectId }, db)).items).toHaveLength(1)

    const removed: string[] = []
    const store = { remove: async (path: string) => void removed.push(path) } as never
    await items.binArchiveItems(user.id, [id], db, new Date("2026-01-01"))
    expect(await items.emptyOldBins(db, store, new Date("2026-01-20"))).toBe(0)
    expect(await items.emptyOldBins(db, store, new Date("2026-02-05"))).toBe(1)
    expect(removed).toEqual([`promo/archive/${user.id}/${id}/main.mp4`])
    expect(await db.select().from(promoArchiveItems)).toHaveLength(0)
  })

  it("never deletes an upload's file, which is the media library's", async () => {
    const id = await item({ source: "upload", storagePath: "media/x.mp4" })
    const removed: string[] = []
    await items.binArchiveItems(user.id, [id], db)
    await items.deleteArchiveItemForGood(user.id, id, db, { remove: async (path: string) => void removed.push(path) } as never)
    expect(removed).toEqual([])
  })
})

describe("copy, move and uploads", () => {
  it("moves an item and drops its drafts, and copies one with its own files", async () => {
    const other = await createProject(user.id, "Other", db)
    const id = await item()
    await items.moveArchiveItem(user.id, id, other, db)
    const [moved] = await db.select().from(promoArchiveItems).where(eq(promoArchiveItems.id, id))
    expect(moved.projectId).toBe(other)

    const stored = new Map<string, number>()
    const store = {
      put: async (path: string, bytes: Uint8Array) => void stored.set(path, bytes.byteLength),
      remove: async () => undefined,
    } as never
    const fetchImpl = (async () => new Response("abc")) as unknown as typeof fetch
    const copy = await items.copyArchiveItem(user.id, id, projectId, { db, store, fetchImpl })
    const [copied] = await db.select().from(promoArchiveItems).where(eq(promoArchiveItems.id, copy))
    expect(copied.projectId).toBe(projectId)
    expect(copied.storagePath).toBe(`promo/archive/${user.id}/${copy}/main.mp4`)
    expect(stored.get(copied.storagePath)).toBe(3)
  })

  it("puts an uploaded video and picture in the archive and refuses a sound", async () => {
    const site = await insertWorkspace(db)
    const media = (fileType: string, name: string) => ({
      id: uuid(),
      workspaceId: site.id,
      userId: user.id,
      filename: name,
      originalName: name,
      fileSize: 42,
      mimeType: fileType === "video" ? "video/mp4" : fileType === "image" ? "image/png" : "audio/mpeg",
      fileType,
      storagePath: `media/${uuid()}/${name}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const rows = [media("video", "clip.mp4"), media("image", "cover.png"), media("audio", "song.mp3")]
    await db.insert(customShellMedia).values(rows as never)
    const urls = rows.map((row) => `https://media.test/${row.storagePath}`)
    expect(await items.addUploadsToArchive(user.id, projectId, urls, db)).toEqual({ added: 2 })
    const kinds = (await db.select().from(promoArchiveItems)).map((row) => [row.title, row.kind, row.source]).sort()
    expect(kinds).toEqual([
      ["clip", "video", "upload"],
      ["cover", "picture", "upload"],
    ])
    await expect(items.addUploadsToArchive(user.id, projectId, [urls[2]], db)).rejects.toThrow("Sound files")
  })
})

describe("the whole project as a zip", () => {
  it("names files from their titles, puts a carousel's slides in a folder, and makes a zip that opens", async () => {
    await item({ title: "Launch", fileSize: 3 })
    const carousel = await item({ kind: "carousel", title: "Tips", storagePath: "", fileSize: 6 })
    await db.insert(promoArchiveSlides).values([
      { id: uuid(), itemId: carousel, position: 0, kind: "photo", storagePath: "s/1.png", mimeType: "image/png", fileSize: 3 },
      { id: uuid(), itemId: carousel, position: 1, kind: "photo", storagePath: "s/2.png", mimeType: "image/png", fileSize: 3 },
    ])
    const zip = await projectZip(user.id, projectId, db)
    if ("refused" in zip) throw new Error(zip.refused)
    expect(zip.name).toBe("Launch week.zip")
    expect(zip.entries.map((entry) => entry.name)).toEqual(["Launch.mp4", "Tips/slide 01.png", "Tips/slide 02.png"])
    const bytes = new Uint8Array(await new Response(streamZip(zip.entries)).arrayBuffer())
    const view = new DataView(bytes.buffer)
    // The end record says three files, and the first local header starts the file.
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = bytes.byteLength - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(3)
  })

  it("refuses an empty archive with a sentence", async () => {
    expect(await projectZip(user.id, projectId, db)).toEqual({ refused: "This project's archive is empty, so there is nothing to download." })
  })
})

describe("captions and deleting a project", () => {
  it("writes a caption for each network the project has an account on", async () => {
    const id = await item({ title: "Launch", description: "Our new app" })
    await db.insert(promoAccounts).values({ id: uuid(), userId: user.id, projectId, platform: "instagram", handle: "@me" })
    const draft = vi.fn(async () => "Out now #launch")
    const result = await writeArchiveCaptions(user.id, id, { db, draft: draft as never })
    expect(result).toEqual({ captions: { instagram: "Out now #launch" }, written: ["instagram"] })
    expect(draft).toHaveBeenCalledTimes(1)
  })

  it("refuses to delete a project that still holds archive items", async () => {
    await item()
    await expect(deleteProject(user.id, projectId, db)).rejects.toThrow("1 archive item")
  })
})
