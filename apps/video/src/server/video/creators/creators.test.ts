import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  deleteCreator,
  listCreators,
  setCreatorWatch,
} from "@/server/video/creators/creators"
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  saveFolderOrder,
  setCreatorInFolder,
} from "@/server/video/creators/folders"
import { loadFeedPage, loadFeedView } from "@/server/video/creators/feed"
import {
  videoCreatorPosts,
  videoCreators,
  videoViralVideos,
} from "@/server/video/schema"
import { MAX_CREATOR_FOLDERS } from "@/lib/video/creators"

/**
 * These run against a real database with every migration replayed in order, so
 * they are also the proof that `0093_video_research.sql` applies cleanly on top
 * of everything before it.
 *
 * The one that matters most is the deletion rule: unfollowing somebody must
 * take their feed posts and leave a video you already studied standing. Getting
 * that backwards would quietly destroy work somebody paid AI credits for.
 */

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

/** A creator row written straight in, so the tests need no network. */
async function addCreator(
  overrides: Partial<typeof videoCreators.$inferInsert> = {}
) {
  const at = now()
  const id = overrides.id ?? uuid()
  await database.insert(videoCreators).values({
    id,
    ownerId: user.id,
    platform: "tiktok",
    handle: `creator-${id.slice(0, 8)}`,
    profileUrl: "https://www.tiktok.com/@creator",
    watch: true,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  })
  return id
}

async function addPost(
  creatorId: string,
  overrides: Partial<typeof videoCreatorPosts.$inferInsert> = {}
) {
  const id = overrides.id ?? uuid()
  await database.insert(videoCreatorPosts).values({
    id,
    ownerId: user.id,
    creatorId,
    platform: "tiktok",
    platformVideoId: `video-${id.slice(0, 8)}`,
    url: "https://www.tiktok.com/@creator/video/1",
    firstSeenAt: now(),
    postedAt: now(),
    ...overrides,
  })
  return id
}

describe("creators", () => {
  it("lists only your own, never somebody else's", async () => {
    await addCreator({ handle: "mine" })
    await addCreator({ ownerId: other.id, handle: "theirs" })

    const mine = await listCreators(user.id)
    expect(mine.map((creator) => creator.handle)).toEqual(["mine"])
  })

  it("works out a views-a-day pace from the posts already fetched", async () => {
    const creatorId = await addCreator()
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    await addPost(creatorId, { views: 1_000, postedAt: tenDaysAgo })

    const [creator] = await listCreators(user.id)
    // 1,000 views over 10 days is 100 a day.
    expect(creator.viewsPerDay).toBe(100)
  })

  it("leaves the pace blank when no post carries a view count", async () => {
    const creatorId = await addCreator()
    await addPost(creatorId, { views: null })

    const [creator] = await listCreators(user.id)
    expect(creator.viewsPerDay).toBeNull()
  })

  it("refuses to switch watching for somebody else's creator", async () => {
    const theirs = await addCreator({ ownerId: other.id })
    await expect(setCreatorWatch(user.id, theirs, false)).rejects.toThrow(
      /CREATOR_NOT_FOUND/
    )
  })

  it("takes the creator's posts but leaves a video already broken down", async () => {
    const creatorId = await addCreator()
    await addPost(creatorId, { platformVideoId: "kept-video" })

    const at = now()
    await database.insert(videoViralVideos).values({
      id: uuid(),
      ownerId: user.id,
      platform: "tiktok",
      platformVideoId: "kept-video",
      sourceUrl: "https://www.tiktok.com/@creator/video/1",
      status: "ready",
      breakdown: { transcript: [], segments: [], scenes: [] },
      createdAt: at,
      updatedAt: at,
    })

    await deleteCreator(user.id, creatorId)

    const posts = await database
      .select()
      .from(videoCreatorPosts)
      .where(eq(videoCreatorPosts.ownerId, user.id))
    const saved = await database
      .select()
      .from(videoViralVideos)
      .where(eq(videoViralVideos.ownerId, user.id))

    expect(posts).toHaveLength(0)
    // The whole point: the breakdown somebody spent credits on survives.
    expect(saved).toHaveLength(1)
    expect(saved[0].status).toBe("ready")
  })
})

describe("folders", () => {
  it("lets one creator sit in several folders at once", async () => {
    const creatorId = await addCreator()
    await createFolder(user.id, "Hooks", creatorId)
    await createFolder(user.id, "Competitors", creatorId)

    const folders = await listFolders(user.id)
    expect(folders).toHaveLength(2)
    for (const folder of folders) {
      expect(folder.creatorIds).toEqual([creatorId])
    }
  })

  it("refuses a second folder with the same name, whatever the case", async () => {
    await createFolder(user.id, "Hooks")
    await expect(createFolder(user.id, "hooks")).rejects.toThrow(
      /FOLDER_NAME_TAKEN/
    )
  })

  it("lets two people each have a folder of the same name", async () => {
    await createFolder(user.id, "Hooks")
    await expect(createFolder(other.id, "Hooks")).resolves.toBeDefined()
  })

  it("stops at the folder limit", async () => {
    for (let index = 0; index < MAX_CREATOR_FOLDERS; index += 1) {
      await createFolder(user.id, `Folder ${index}`)
    }
    await expect(createFolder(user.id, "One too many")).rejects.toThrow(
      /FOLDER_LIMIT_REACHED/
    )
  })

  it("puts each new folder on the end rather than jumping the order", async () => {
    await createFolder(user.id, "First")
    await createFolder(user.id, "Second")
    const folders = await listFolders(user.id)
    expect(folders.map((folder) => folder.name)).toEqual(["First", "Second"])
  })

  it("keeps the creators when a folder is deleted", async () => {
    const creatorId = await addCreator()
    const [folder] = await createFolder(user.id, "Hooks", creatorId)
    await deleteFolder(user.id, folder.id)

    expect(await listFolders(user.id)).toHaveLength(0)
    expect(await listCreators(user.id)).toHaveLength(1)
  })

  it("will not file somebody else's creator into your folder", async () => {
    const theirs = await addCreator({ ownerId: other.id })
    const [folder] = await createFolder(user.id, "Hooks")
    await expect(
      setCreatorInFolder(user.id, folder.id, theirs, true)
    ).rejects.toThrow(/CREATOR_NOT_FOUND/)
  })

  it("will not let somebody else rename or delete your folder", async () => {
    const [folder] = await createFolder(user.id, "Hooks")
    await expect(renameFolder(other.id, folder.id, "Theirs")).rejects.toThrow(
      /FOLDER_NOT_FOUND/
    )
    await expect(deleteFolder(other.id, folder.id)).rejects.toThrow(
      /FOLDER_NOT_FOUND/
    )
  })

  it("ticking a box that is already ticked changes nothing", async () => {
    const creatorId = await addCreator()
    const [folder] = await createFolder(user.id, "Hooks")
    await setCreatorInFolder(user.id, folder.id, creatorId, true)
    await setCreatorInFolder(user.id, folder.id, creatorId, true)

    const [saved] = await listFolders(user.id)
    expect(saved.creatorIds).toEqual([creatorId])
  })

  it("saves a dragged order and which folders are hidden in one go", async () => {
    const [first] = await createFolder(user.id, "First")
    await createFolder(user.id, "Second")
    const before = await listFolders(user.id)
    const second = before.find((folder) => folder.name === "Second")!

    const after = await saveFolderOrder(user.id, [
      { id: second.id, position: 0, hidden: false },
      { id: first.id, position: 1, hidden: true },
    ])

    expect(after.map((folder) => folder.name)).toEqual(["Second", "First"])
    expect(after.find((folder) => folder.name === "First")?.hidden).toBe(true)
  })

  it("skips an id that is not yours rather than refusing the whole drag", async () => {
    const [mine] = await createFolder(user.id, "Mine")
    const [theirs] = await createFolder(other.id, "Theirs")

    await saveFolderOrder(user.id, [
      { id: theirs.id, position: 0, hidden: true },
      { id: mine.id, position: 1, hidden: false },
    ])

    const stillTheirs = await listFolders(other.id)
    expect(stillTheirs[0].hidden).toBe(false)
    expect(stillTheirs[0].position).toBe(0)
  })
})

describe("the feed", () => {
  it("shows every creator's posts, newest first", async () => {
    const creatorId = await addCreator()
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    await addPost(creatorId, { platformVideoId: "older", postedAt: old })
    await addPost(creatorId, { platformVideoId: "newer" })

    const view = await loadFeedView(user.id, {
      folderId: null,
      creatorId: null,
    })
    expect(view.posts.map((post) => post.platformVideoId)).toEqual([
      "newer",
      "older",
    ])
    expect(view.held).toBe(2)
  })

  it("narrows to one creator, and a creator beats a folder", async () => {
    const wanted = await addCreator({ handle: "wanted" })
    const ignored = await addCreator({ handle: "ignored" })
    await addPost(wanted, { platformVideoId: "wanted-video" })
    await addPost(ignored, { platformVideoId: "ignored-video" })
    const [folder] = await createFolder(user.id, "Hooks", ignored)

    const view = await loadFeedView(user.id, {
      folderId: folder.id,
      creatorId: wanted,
    })
    expect(view.posts.map((post) => post.platformVideoId)).toEqual([
      "wanted-video",
    ])
  })

  it("narrows to a folder's creators", async () => {
    const inFolder = await addCreator({ handle: "in-folder" })
    const outside = await addCreator({ handle: "outside" })
    await addPost(inFolder, { platformVideoId: "in-video" })
    await addPost(outside, { platformVideoId: "out-video" })
    const [folder] = await createFolder(user.id, "Hooks", inFolder)

    const view = await loadFeedView(user.id, {
      folderId: folder.id,
      creatorId: null,
    })
    expect(view.posts.map((post) => post.platformVideoId)).toEqual(["in-video"])
    expect(view.held).toBe(1)
  })

  it("finds nothing through somebody else's folder id", async () => {
    const creatorId = await addCreator()
    await addPost(creatorId)
    const [theirs] = await createFolder(other.id, "Theirs")

    const view = await loadFeedView(user.id, {
      folderId: theirs.id,
      creatorId: null,
    })
    expect(view.posts).toHaveLength(0)
  })

  it("marks a post whose video has been saved, without storing it twice", async () => {
    const creatorId = await addCreator()
    await addPost(creatorId, { platformVideoId: "studied" })
    await addPost(creatorId, { platformVideoId: "untouched" })

    const at = now()
    await database.insert(videoViralVideos).values({
      id: "saved-row-id",
      ownerId: user.id,
      platform: "tiktok",
      platformVideoId: "studied",
      sourceUrl: "https://www.tiktok.com/@creator/video/1",
      status: "analysing",
      createdAt: at,
      updatedAt: at,
    })

    const view = await loadFeedView(user.id, {
      folderId: null,
      creatorId: null,
    })
    const studied = view.posts.find(
      (post) => post.platformVideoId === "studied"
    )!
    const untouched = view.posts.find(
      (post) => post.platformVideoId === "untouched"
    )!

    expect(studied.savedStatus).toBe("analysing")
    expect(studied.savedVideoId).toBe("saved-row-id")
    expect(untouched.savedStatus).toBeNull()
  })

  it("does not light up a post because somebody else saved that video", async () => {
    const creatorId = await addCreator()
    await addPost(creatorId, { platformVideoId: "shared-video" })

    const at = now()
    await database.insert(videoViralVideos).values({
      id: uuid(),
      ownerId: other.id,
      platform: "tiktok",
      platformVideoId: "shared-video",
      sourceUrl: "https://www.tiktok.com/@creator/video/1",
      status: "ready",
      createdAt: at,
      updatedAt: at,
    })

    const view = await loadFeedView(user.id, {
      folderId: null,
      creatorId: null,
    })
    expect(view.posts[0].savedStatus).toBeNull()
  })

  it("pages by the oldest post on screen", async () => {
    const creatorId = await addCreator()
    const base = Date.now()
    for (let index = 0; index < 3; index += 1) {
      await addPost(creatorId, {
        platformVideoId: `video-${index}`,
        postedAt: new Date(base - index * 60_000),
      })
    }

    const first = await loadFeedPage(user.id, {
      folderId: null,
      creatorId: null,
    })
    const older = await loadFeedPage(
      user.id,
      { folderId: null, creatorId: null },
      first.posts[0].postedAt!
    )
    expect(older.posts.map((post) => post.platformVideoId)).toEqual([
      "video-1",
      "video-2",
    ])
  })

  it("orders a post with no posted date by when it was first seen", async () => {
    const creatorId = await addCreator()
    const longAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    await addPost(creatorId, { platformVideoId: "dated", postedAt: longAgo })
    await addPost(creatorId, {
      platformVideoId: "undated",
      postedAt: null,
      firstSeenAt: new Date(),
    })

    const view = await loadFeedView(user.id, {
      folderId: null,
      creatorId: null,
    })
    // The undated one was seen just now, so it sorts above the ten-day-old one
    // rather than falling to the bottom as if it had no date at all.
    expect(view.posts.map((post) => post.platformVideoId)).toEqual([
      "undated",
      "dated",
    ])
  })
})
