import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { videoCreatorPosts, videoCreators } from "@/server/video/schema"

const fakes = vi.hoisted(() => ({
  uploaded: [] as string[],
  deleted: [] as string[],
  ytDlpCalls: [] as string[][],
  freshAddress: "https://cdn.example/fresh.jpg",
}))

// Storage and yt-dlp are the outside world here: storage keeps a list, and
// yt-dlp answers a fresh cover address without downloading anything.
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async (path: string) => {
    fakes.uploaded.push(path)
  },
  deleteFromR2: async (path: string) => {
    fakes.deleted.push(path)
  },
  getPublicMediaUrl: async (path: string) => `https://pub.example/${path}`,
}))
vi.mock("@/server/video/viral/download", async (original) => ({
  ...(await original<typeof import("@/server/video/viral/download")>()),
  runYtDlp: async (args: string[]) => {
    fakes.ytDlpCalls.push(args)
    return `${fakes.freshAddress}\n`
  },
}))

import { coverUrl, creatorCoverTick } from "@/server/video/creators/covers"
import { deleteCreator } from "@/server/video/creators/creators"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  fakes.uploaded = []
  fakes.deleted = []
  fakes.ytDlpCalls = []
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

/** A picture server: addresses containing "expired" answer 403, others a JPEG. */
function pictures() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("expired")
        ? new Response("", { status: 403 })
        : new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          })
    )
  )
}

async function addPost(platform: string, thumbnailUrl: string | null) {
  const at = now()
  const creatorId = uuid()
  await database.insert(videoCreators).values({
    id: creatorId,
    ownerId: user.id,
    platform,
    handle: `creator-${creatorId.slice(0, 6)}`,
    profileUrl: "https://www.tiktok.com/@creator",
    watch: true,
    createdAt: at,
    updatedAt: at,
  })
  const id = uuid()
  await database.insert(videoCreatorPosts).values({
    id,
    ownerId: user.id,
    creatorId,
    platform,
    platformVideoId: id.slice(0, 8),
    url: `https://www.tiktok.com/@creator/video/${id.slice(0, 8)}`,
    thumbnailUrl,
    firstSeenAt: at,
  })
  return id
}

async function post(id: string) {
  const rows = await database.select().from(videoCreatorPosts)
  return rows.find((row) => row.id === id)!
}

describe("keeping a copy of each cover", () => {
  it("keeps the picture from the saved address, without asking yt-dlp", async () => {
    pictures()
    const id = await addPost("tiktok", "https://cdn.example/still-good.jpg")
    expect(await creatorCoverTick()).toBe(1)
    const saved = await post(id)
    expect(saved.thumbnailStoragePath).toBe(`video-creator-covers/${user.id}/${id}.img`)
    expect(fakes.ytDlpCalls).toEqual([])
    expect(await coverUrl(saved)).toBe(`https://pub.example/video-creator-covers/${user.id}/${id}.img`)
  })

  it("reads a fresh address when the saved one has expired, and never downloads the video", async () => {
    pictures()
    const id = await addPost("tiktok", "https://cdn.example/expired.jpg")
    expect(await creatorCoverTick()).toBe(1)
    expect(fakes.ytDlpCalls).toHaveLength(1)
    expect(fakes.ytDlpCalls[0]).toContain("--skip-download")
    const saved = await post(id)
    expect(saved.thumbnailUrl).toBe(fakes.freshAddress)
    expect(saved.thumbnailStoragePath).not.toBeNull()
  })

  it("leaves YouTube alone, whose covers never expire", async () => {
    pictures()
    await addPost("youtube", "https://i.ytimg.com/vi/x/hq.jpg")
    expect(await creatorCoverTick()).toBe(0)
    expect(fakes.uploaded).toEqual([])
  })

  it("tries a cover it could not get again a day later, not on every pass", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })))
    const id = await addPost("tiktok", "https://cdn.example/expired.jpg")
    expect(await creatorCoverTick()).toBe(0)
    expect((await post(id)).coverCheckedAt).not.toBeNull()
    expect(await creatorCoverTick()).toBe(0)
    expect(fakes.ytDlpCalls).toHaveLength(1)
  })

  it("shows the platform's address until a copy is kept", async () => {
    expect(
      await coverUrl({ thumbnailStoragePath: null, thumbnailUrl: "https://cdn.example/a.jpg" })
    ).toBe("https://cdn.example/a.jpg")
  })

  it("deletes the kept cover from storage when the creator is unfollowed for good", async () => {
    pictures()
    const id = await addPost("tiktok", "https://cdn.example/still-good.jpg")
    await creatorCoverTick()
    const kept = await post(id)
    await deleteCreator(user.id, kept.creatorId)
    expect(fakes.deleted).toEqual([kept.thumbnailStoragePath])
  })
})
