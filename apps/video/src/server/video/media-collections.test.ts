import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
} from "@/lib/video/media-collections"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  addMediaToOwnedCollection,
  createOwnedCollection,
  deleteOwnedCollection,
  listOwnedCollections,
  removeMediaFromOwnedCollection,
  renameOwnedCollection,
  setMediaItemCollections,
} from "@/server/video/media-collections"
import { listVideoMedia } from "@/server/video/media-list"
import { videoMediaCollectionItems } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

// serializeMedia builds public URLs, which need the R2 base — same pattern as
// the shell's own tests.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

async function insertMedia(
  ownerId: string,
  overrides: Partial<typeof customShellMedia.$inferInsert> = {}
) {
  const timestamp = now()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp4`,
      originalName: "clip.mp4",
      fileSize: 1000,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${ownerId}/${uuid()}.mp4`,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()
  return row
}

describe("collections", () => {
  it("lists by name and counts items", async () => {
    const beta = await createOwnedCollection(user.id, "beta", database)
    await createOwnedCollection(user.id, "Alpha", database)
    const media = await insertMedia(user.id)
    await addMediaToOwnedCollection(user.id, beta.id, [media.id], database)

    const listed = await listOwnedCollections(user.id, database)
    expect(listed.map((c) => c.name)).toEqual(["Alpha", "beta"])
    expect(listed[1].item_count).toBe(1)
  })

  it("refuses a name that only differs by case or spacing", async () => {
    await createOwnedCollection(user.id, "B-roll", database)
    await expect(
      createOwnedCollection(user.id, "  b-roll  ", database)
    ).rejects.toThrowError(COLLECTION_NAME_TAKEN_MESSAGE)
  })

  it("refuses renaming onto a taken name", async () => {
    await createOwnedCollection(user.id, "Hooks", database)
    const other = await createOwnedCollection(user.id, "Logos", database)
    await expect(
      renameOwnedCollection(user.id, other.id, "hooks", database)
    ).rejects.toThrowError(COLLECTION_NAME_TAKEN_MESSAGE)
  })

  it("deleting a collection detaches media without destroying it", async () => {
    const collection = await createOwnedCollection(user.id, "Hooks", database)
    const media = await insertMedia(user.id)
    await addMediaToOwnedCollection(user.id, collection.id, [media.id], database)

    await deleteOwnedCollection(user.id, collection.id, database)

    const items = await database.select().from(videoMediaCollectionItems)
    expect(items).toEqual([])
    const survivors = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, media.id))
    expect(survivors).toHaveLength(1)
  })

  it("never attaches media the caller does not own", async () => {
    const stranger = await insertUser(database)
    const strangersMedia = await insertMedia(stranger.id)
    const collection = await createOwnedCollection(user.id, "Mine", database)

    const result = await addMediaToOwnedCollection(
      user.id,
      collection.id,
      [strangersMedia.id],
      database
    )
    expect(result.added_count).toBe(0)
  })

  it("adding twice is harmless and says so", async () => {
    const collection = await createOwnedCollection(user.id, "Hooks", database)
    const media = await insertMedia(user.id)
    await addMediaToOwnedCollection(user.id, collection.id, [media.id], database)
    const again = await addMediaToOwnedCollection(
      user.id,
      collection.id,
      [media.id],
      database
    )
    expect(again.added_count).toBe(0)
  })

  it("replaces one item's memberships wholesale", async () => {
    const first = await createOwnedCollection(user.id, "First", database)
    const second = await createOwnedCollection(user.id, "Second", database)
    const media = await insertMedia(user.id)
    await addMediaToOwnedCollection(user.id, first.id, [media.id], database)

    await setMediaItemCollections(user.id, media.id, [second.id], database)

    const items = await database.select().from(videoMediaCollectionItems)
    expect(items.map((item) => item.collectionId)).toEqual([second.id])
  })

  it("refuses membership in a collection that is not the caller's", async () => {
    const stranger = await insertUser(database)
    const strangers = await createOwnedCollection(stranger.id, "Not yours", database)
    const media = await insertMedia(user.id)

    await expect(
      setMediaItemCollections(user.id, media.id, [strangers.id], database)
    ).rejects.toThrowError(COLLECTION_NOT_FOUND_MESSAGE)
  })

  it("removes membership and reports the honest count", async () => {
    const collection = await createOwnedCollection(user.id, "Hooks", database)
    const media = await insertMedia(user.id)
    await addMediaToOwnedCollection(user.id, collection.id, [media.id], database)
    const removed = await removeMediaFromOwnedCollection(
      user.id,
      collection.id,
      [media.id],
      database
    )
    expect(removed.removed_count).toBe(1)
  })
})

describe("the media list with video extras", () => {
  it("filters to one collection, to Uncollected, or not at all", async () => {
    const collection = await createOwnedCollection(user.id, "Hooks", database)
    const inCollection = await insertMedia(user.id)
    const loose = await insertMedia(user.id)
    await addMediaToOwnedCollection(
      user.id,
      collection.id,
      [inCollection.id],
      database
    )

    const everything = await listVideoMedia({ userId: user.id, database })
    expect(everything.media).toHaveLength(2)

    const members = await listVideoMedia({
      userId: user.id,
      collectionId: collection.id,
      database,
    })
    expect(members.media.map((m) => m.id)).toEqual([inCollection.id])

    const uncollected = await listVideoMedia({
      userId: user.id,
      collectionId: null,
      database,
    })
    expect(uncollected.media.map((m) => m.id)).toEqual([loose.id])
  })

  it("never shows another person's media", async () => {
    const stranger = await insertUser(database)
    await insertMedia(stranger.id)
    const mine = await insertMedia(user.id)

    const listed = await listVideoMedia({ userId: user.id, database })
    expect(listed.media.map((m) => m.id)).toEqual([mine.id])
  })

  it("searches by name with wildcards kept literal", async () => {
    await insertMedia(user.id, { originalName: "gym-hook.mp4" })
    await insertMedia(user.id, { originalName: "other.mp4" })

    const hits = await listVideoMedia({
      userId: user.id,
      search: "gym-hook",
      database,
    })
    expect(hits.media).toHaveLength(1)

    const literal = await listVideoMedia({
      userId: user.id,
      search: "%",
      database,
    })
    expect(literal.media).toHaveLength(0)
  })

  it("falls back to the original file until a proxy is ready", async () => {
    await insertMedia(user.id)
    const listed = await listVideoMedia({ userId: user.id, database })
    expect(listed.media[0].playback_url).toBe(listed.media[0].url)
    expect(listed.media[0].proxy_status).toBeNull()
  })
})
