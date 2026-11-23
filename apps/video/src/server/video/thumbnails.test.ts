import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  newTextLayer,
  THUMBNAIL_CONFLICT_MESSAGE,
  THUMBNAIL_NOT_FOUND_MESSAGE,
  THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE,
} from "@/lib/video/thumbnails"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { createOwnedProject } from "@/server/video/projects"
import { thumbnailsForVideos } from "@/server/video/project-videos"
import {
  videoProjectVideos,
  videoRenderJobs,
  videoThumbnails,
  type VideoProjectGuestRow,
} from "@/server/video/schema"

/**
 * The Thumbnail section's records on a real database: whose thumbnails are
 * listed, saves that lose a race, starring, the library picture, templates
 * on the site, and the covers of exports. Drawing and storage are stood in
 * for; drawing is tested in thumbnail-export.test.ts.
 */

const outside = vi.hoisted(() => ({
  database: null as unknown,
  workspaceId: "",
  uploads: [] as string[],
  removed: [] as string[],
}))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (path: string) => {
    outside.uploads.push(path)
  },
  deleteFromR2: async (path: string) => {
    outside.removed.push(path)
  },
}))
vi.mock("@/server/video/thumbnail-export", () => ({
  renderThumbnailJpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
}))
vi.mock("sharp", () => ({
  default: () => ({ resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from([1]) }) }) }),
}))
vi.mock("@/server/video/asset-factories/media", () => ({
  saveGeneratedAsset: async (options: { userId: string; name: string }) => {
    const database = outside.database as CustomShellDb
    const id = uuid()
    const row = {
      id,
      workspaceId: outside.workspaceId,
      userId: options.userId,
      filename: `${id}.jpg`,
      originalName: `${options.name}.jpg`,
      fileSize: 4,
      mimeType: "image/jpeg",
      fileType: "image",
      storagePath: `${options.userId}/${id}.jpg`,
      createdAt: now(),
      updatedAt: now(),
    }
    await database.insert(customShellMedia).values(row)
    return { ...row, url: `https://files.test/${row.storagePath}` }
  },
}))

const thumbnails = await import("@/server/video/thumbnails")

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://files.test"
  outside.uploads = []
  outside.removed = []
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  outside.database = database
})

afterEach(async () => {
  await client.close()
})

async function personWithVideo(workspaceId?: string) {
  const site = workspaceId ?? (await insertWorkspace(database)).id
  outside.workspaceId = site
  const user = await insertUser(database, { currentWorkspaceId: site })
  const made = await createOwnedProject(user.id, "Trip", database)
  return { user, videoId: made.video, projectId: made.project.id }
}

function words(text: string) {
  return [{ ...newTextLayer("wide", []), text }]
}

describe("thumbnails of a video", () => {
  it("lists a thumbnail only on its own video and for its own owner", async () => {
    const { user, videoId } = await personWithVideo()
    const other = await createOwnedProject(user.id, "Other", database)
    await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("HELLO"), database })
    expect((await thumbnails.listVideoThumbnails(user.id, videoId, database)).thumbnails).toHaveLength(1)
    expect((await thumbnails.listVideoThumbnails(user.id, other.video, database)).thumbnails).toHaveLength(0)
    const stranger = await insertUser(database)
    await expect(thumbnails.listVideoThumbnails(stranger.id, videoId, database)).rejects.toThrow()
  })

  it("refuses a save made from an older version", async () => {
    const { user, videoId } = await personWithVideo()
    const made = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("ONE"), database })
    const saved = await thumbnails.saveThumbnail({ owner: user.id, thumbnailId: made.id, layers: words("TWO"), backgroundColor: "#000000", version: made.version, database })
    expect(saved.version).toBe(made.version + 1)
    await expect(
      thumbnails.saveThumbnail({ owner: user.id, thumbnailId: made.id, layers: words("THREE"), backgroundColor: "#000000", version: made.version, database })
    ).rejects.toThrow(THUMBNAIL_CONFLICT_MESSAGE)
  })
})

describe("the main thumbnail", () => {
  it("keeps one library picture per shape, moving it to the newly starred one", async () => {
    const { user, videoId } = await personWithVideo()
    const first = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("A"), database })
    const second = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("B"), database })
    const starred = await thumbnails.setMainThumbnail(user.id, first.id, true, database)
    expect(starred.is_main).toBe(true)
    expect(starred.picture_url).toMatch(/^https:\/\/files\.test\//)
    const moved = await thumbnails.setMainThumbnail(user.id, second.id, true, database)
    const rows = await database.select().from(videoThumbnails).where(eq(videoThumbnails.videoId, videoId))
    expect(rows.filter((row) => row.isMain).map((row) => row.id)).toEqual([second.id])
    expect(rows.find((row) => row.id === second.id)?.mediaId).toBe(rows.find((row) => row.id === first.id)?.mediaId ?? rows.find((row) => row.id === second.id)?.mediaId)
    expect(moved.picture_url).not.toBeNull()
    expect((await database.select().from(customShellMedia).where(eq(customShellMedia.userId, user.id)))).toHaveLength(1)
  })

  it("takes the library picture away when the star comes off", async () => {
    const { user, videoId } = await personWithVideo()
    const made = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("A"), database })
    await thumbnails.setMainThumbnail(user.id, made.id, true, database)
    const unstarred = await thumbnails.setMainThumbnail(user.id, made.id, false, database)
    expect(unstarred.is_main).toBe(false)
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.userId, user.id))).toHaveLength(0)
  })

  it("leaves the picture in the library when a timeline uses it", async () => {
    const { user, videoId } = await personWithVideo()
    const made = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("A"), database })
    await thumbnails.setMainThumbnail(user.id, made.id, true, database)
    const [row] = await database.select().from(videoThumbnails).where(eq(videoThumbnails.id, made.id))
    await database
      .update(videoProjectVideos)
      .set({
        timeline: {
          aspect: "16:9",
          tracks: [{ id: "t", muted: false, clips: [{ id: "c", name: "Thumb", kind: "image", mediaId: row.mediaId, startMs: 0, durationMs: 1_000, trimStartMs: 0 }] }],
        },
      })
      .where(eq(videoProjectVideos.id, videoId))
    await thumbnails.setMainThumbnail(user.id, made.id, false, database)
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.userId, user.id))).toHaveLength(1)
  })

  it("is the video's picture in the Videos tab", async () => {
    const { user, videoId } = await personWithVideo()
    const made = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("A"), database })
    await thumbnails.setMainThumbnail(user.id, made.id, true, database)
    const pictures = await thumbnailsForVideos([{ id: videoId, updatedAt: new Date() }], database)
    expect(pictures.get(videoId)?.url).toMatch(/^https:\/\/files\.test\//)
  })

  it("covers wide exports, except one whose cover was set by hand", async () => {
    const { user, videoId, projectId } = await personWithVideo()
    const job = (id: string, extra: Partial<typeof videoRenderJobs.$inferInsert>) => ({
      id,
      userId: user.id,
      projectId,
      videoId,
      kind: "video",
      status: "ready",
      aspect: "16:9",
      quality: "high",
      timeline: { aspect: "16:9", tracks: [] },
      thumbnailStoragePath: `covers/${id}.jpg`,
      storagePath: `exports/${id}.mp4`,
      fileSize: 1,
      createdAt: now(),
      updatedAt: now(),
      ...extra,
    })
    await database.insert(videoRenderJobs).values([
      job(uuid(), {}),
      job(uuid(), { coverByHand: true }),
      job(uuid(), { aspect: "9:16" }),
    ] as never)
    const made = await thumbnails.createThumbnail({ owner: user.id, videoId, shape: "wide", layers: words("A"), database })
    await thumbnails.setMainThumbnail(user.id, made.id, true, database)
    const covers = await database.select().from(videoRenderJobs).where(eq(videoRenderJobs.videoId, videoId))
    const changed = covers.filter((row) => row.thumbnailStoragePath?.startsWith("video/export-covers/"))
    expect(changed).toHaveLength(1)
    expect(changed[0].aspect).toBe("16:9")
    expect(changed[0].coverByHand).toBe(false)
  })
})

describe("templates", () => {
  it("are offered to everyone on the site, with pictures left as spots", async () => {
    const site = await insertWorkspace(database)
    const maker = await personWithVideo(site.id)
    const colleague = await personWithVideo(site.id)
    const elsewhere = await personWithVideo((await insertWorkspace(database)).id)
    const made = await thumbnails.createThumbnail({
      owner: maker.user.id,
      videoId: maker.videoId,
      shape: "wide",
      layers: [
        { id: "p", type: "image", mediaId: "m", url: "https://x", fit: "cover", x: 0, y: 0, width: 1, height: 1, zIndex: 0 },
        ...words("HELLO"),
      ],
      database,
    })
    await thumbnails.saveThumbnailTemplate(maker.user.id, made.id, "Big words", database)
    const seen = (await thumbnails.listVideoThumbnails(colleague.user.id, colleague.videoId, database)).templates
    expect(seen.map((one) => one.name)).toEqual(["Big words"])
    expect(seen[0].layers.map((layer) => layer.type).sort()).toEqual(["spot", "text"])
    expect(seen[0].mine).toBe(false)
    expect((await thumbnails.listVideoThumbnails(elsewhere.user.id, elsewhere.videoId, database)).templates).toHaveLength(0)

    await expect(thumbnails.deleteThumbnailTemplate(colleague.user.id, seen[0].id, false, database)).rejects.toThrow(
      THUMBNAIL_TEMPLATE_NOT_FOUND_MESSAGE
    )
    await thumbnails.deleteThumbnailTemplate(colleague.user.id, seen[0].id, true, database)
    expect((await thumbnails.listVideoThumbnails(maker.user.id, maker.videoId, database)).templates).toHaveLength(0)
  })
})

describe("a guest sent from Project", () => {
  it("acts as the owner on their project's thumbnail and is refused on another's", async () => {
    const mine = await personWithVideo()
    const theirs = await personWithVideo()
    const ours = await thumbnails.createThumbnail({ owner: mine.user.id, videoId: mine.videoId, shape: "wide", layers: words("A"), database })
    const other = await thumbnails.createThumbnail({ owner: theirs.user.id, videoId: theirs.videoId, shape: "wide", layers: words("B"), database })
    // Only the project is read off a guest sign-in.
    const caller = { user: null, guests: [{ projectId: mine.projectId } as VideoProjectGuestRow] }
    const actor = await thumbnails.actorForThumbnail(caller, ours.id, database)
    expect(actor.userId).toBe(mine.user.id)
    await expect(thumbnails.actorForThumbnail(caller, other.id, database)).rejects.toThrow()
    await expect(thumbnails.actorForThumbnail(caller, "no-such-thumbnail", database)).rejects.toThrow(THUMBNAIL_NOT_FOUND_MESSAGE)
  })
})

