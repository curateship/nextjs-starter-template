import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { videoViralCollectionItems } from "@/server/video/schema"
import {
  createCollection,
  deleteCollection,
  listCollections,
  loadCollection,
  setStarred,
  starredIn,
  type StarredVideo,
} from "@/server/video/viral/collections"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

function video(id: string, overrides: Partial<StarredVideo> = {}): StarredVideo {
  return {
    platform: "youtube",
    platformVideoId: id,
    url: `https://www.youtube.com/shorts/${id}`,
    title: `Video ${id}`,
    channelId: "UCchannel",
    channelName: "Channel",
    subscribers: 5_000,
    views: 80_000,
    likes: 2_000,
    comments: 30,
    postedAt: new Date(Date.now() - 86_400_000).toISOString(),
    durationSeconds: 40,
    thumbnailUrl: "https://img.example/x.jpg",
    ...overrides,
  }
}

describe("favourites", () => {
  it("stars one video into two collections and says which", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    const demos = await createCollection(user.id, "Product demos")
    await setStarred(user.id, hooks.id, [video("a")], true, null)
    await setStarred(user.id, demos.id, [video("a")], true, null)
    // Starring it again is not a second row.
    await setStarred(user.id, hooks.id, [video("a")], true, null)

    const starred = await starredIn(user.id)
    expect(starred["youtube:a"].sort()).toEqual([hooks.id, demos.id].sort())
    expect((await listCollections(user.id)).map((one) => one.item_count)).toEqual([1, 1])
  })

  it("stars several videos in one request and takes one out", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    expect(await setStarred(user.id, hooks.id, [video("a"), video("b")], true, null)).toBe(2)
    expect(await setStarred(user.id, hooks.id, [video("a")], false, null)).toBe(1)
    const opened = await loadCollection(user.id, hooks.id)
    expect(opened.videos.map((one) => one.platformVideoId)).toEqual(["b"])
    expect(opened.videos[0].score.score).toBeGreaterThan(0)
  })

  it("deleting a collection deletes only the collection and its stars", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    await setStarred(user.id, hooks.id, [video("a")], true, null)
    await deleteCollection(user.id, hooks.id)
    expect(await listCollections(user.id)).toEqual([])
    expect(await database.select().from(videoViralCollectionItems)).toEqual([])
  })

  it("refuses a repeated name, ignoring case", async () => {
    await createCollection(user.id, "Gym hooks")
    await expect(createCollection(user.id, "gym HOOKS")).rejects.toThrow(
      "already exists"
    )
  })

  it("refuses an address that is not the video it names", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    await expect(
      setStarred(user.id, hooks.id, [video("a", { url: "https://evil.example/a" })], true, null)
    ).rejects.toThrow("cannot be starred")
    await expect(
      setStarred(user.id, hooks.id, [video("a", { url: "https://www.youtube.com/shorts/b" })], true, null)
    ).rejects.toThrow("cannot be starred")
  })

  it("keeps no date rather than failing on one that is not a date", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    await setStarred(user.id, hooks.id, [video("a", { postedAt: "not a date" })], true, null)
    const [item] = await database.select().from(videoViralCollectionItems)
    expect(item.postedAt).toBeNull()
  })

  it("drops a picture address that is not https", async () => {
    const hooks = await createCollection(user.id, "Gym hooks")
    await setStarred(user.id, hooks.id, [video("a", { thumbnailUrl: "javascript:alert(1)" })], true, null)
    const [item] = await database.select().from(videoViralCollectionItems)
    expect(item.thumbnailUrl).toBeNull()
  })

  it("never lets somebody star into another person's collection", async () => {
    const theirs = await createCollection(other.id, "Theirs")
    await expect(setStarred(user.id, theirs.id, [video("a")], true, null)).rejects.toThrow(
      "That collection is gone"
    )
    await expect(loadCollection(user.id, theirs.id)).rejects.toThrow()
  })
})
