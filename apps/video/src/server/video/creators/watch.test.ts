import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { creatorWatchTick } from "@/server/video/creators/watch"
import { videoCreatorPosts, videoCreators } from "@/server/video/schema"
import * as uploads from "@/server/video/creators/uploads"

/**
 * The watch timer's three promises: it does nothing unless it is switched on,
 * it tells you about a video once however many times it looks, and it never
 * downloads anything.
 *
 * The last one is checked by watching what the tick calls. A timer that quietly
 * started downloading would run up storage and AI spend with nobody watching,
 * which is the failure worth a test of its own.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

const originalFlag = process.env.VIDEO_WATCH_ENABLED

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  process.env.VIDEO_WATCH_ENABLED = "1"
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
  if (originalFlag === undefined) delete process.env.VIDEO_WATCH_ENABLED
  else process.env.VIDEO_WATCH_ENABLED = originalFlag
})

async function followCreator(
  overrides: Partial<typeof videoCreators.$inferInsert> = {}
) {
  const at = now()
  const id = overrides.id ?? uuid()
  await database.insert(videoCreators).values({
    id,
    ownerId: user.id,
    platform: "tiktok",
    handle: "creator",
    profileUrl: "https://www.tiktok.com/@creator",
    watch: true,
    lastCheckedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  })
  return id
}

/** Stands in for the platform, so no test touches the network. */
function platformAnswers(uploadsFound: { platformVideoId: string }[]) {
  return vi.spyOn(uploads, "listRecentUploads").mockResolvedValue({
    uploads: uploadsFound.map((one) => ({
      platformVideoId: one.platformVideoId,
      url: `https://www.tiktok.com/@creator/video/${one.platformVideoId}`,
      title: "A video",
      thumbnailUrl: null,
      durationSeconds: 30,
      views: 1_000,
      likes: 10,
      comments: 1,
      postedAt: new Date(),
    })),
    profile: { displayName: "A Creator", followerCount: 5_000 },
  })
}

async function noticesFor(userId: string) {
  return database
    .select()
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("the flag", () => {
  it("does nothing at all when it is not set", async () => {
    delete process.env.VIDEO_WATCH_ENABLED
    await followCreator()
    const asked = platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()

    expect(asked).not.toHaveBeenCalled()
    expect(await database.select().from(videoCreatorPosts)).toHaveLength(0)
  })
})

describe("finding new videos", () => {
  it("writes down what it has not seen and tells you once", async () => {
    await followCreator()
    platformAnswers([{ platformVideoId: "a" }, { platformVideoId: "b" }])

    await creatorWatchTick()

    const posts = await database.select().from(videoCreatorPosts)
    expect(posts).toHaveLength(2)

    const notices = await noticesFor(user.id)
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe("app_activity")
    expect(notices[0].message).toBe("2 new videos from 1 creator you follow")
  })

  it("looking again at the same videos tells you nothing", async () => {
    const creatorId = await followCreator()
    platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()
    // The creator is due again, but the video is not new any more.
    await database
      .update(videoCreators)
      .set({ lastCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      .where(eq(videoCreators.id, creatorId))
    await creatorWatchTick()

    expect(await database.select().from(videoCreatorPosts)).toHaveLength(1)
    // One notice in all, not one per look. This is the rule that stops the
    // tray filling up with the same video every six hours.
    expect(await noticesFor(user.id)).toHaveLength(1)
  })

  it("keeps a video's numbers current without adding a second row", async () => {
    const creatorId = await followCreator()
    platformAnswers([{ platformVideoId: "a" }])
    await creatorWatchTick()

    vi.restoreAllMocks()
    vi.spyOn(uploads, "listRecentUploads").mockResolvedValue({
      uploads: [
        {
          platformVideoId: "a",
          url: "https://www.tiktok.com/@creator/video/a",
          title: "A video",
          thumbnailUrl: null,
          durationSeconds: 30,
          views: 99_000,
          likes: 500,
          comments: 20,
          postedAt: new Date(),
        },
      ],
      profile: null,
    })
    await database
      .update(videoCreators)
      .set({ lastCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      .where(eq(videoCreators.id, creatorId))
    await creatorWatchTick()

    const posts = await database.select().from(videoCreatorPosts)
    expect(posts).toHaveLength(1)
    expect(posts[0].views).toBe(99_000)
    expect(await noticesFor(user.id)).toHaveLength(1)
  })

  it("writes back what it learned about the creator", async () => {
    const creatorId = await followCreator()
    platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()

    const [creator] = await database
      .select()
      .from(videoCreators)
      .where(eq(videoCreators.id, creatorId))
    expect(creator.displayName).toBe("A Creator")
    expect(creator.followerCount).toBe(5_000)
    expect(creator.lastCheckedAt).not.toBeNull()
  })

  it("skips a creator whose watch switch is off", async () => {
    await followCreator({ watch: false })
    const asked = platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()

    expect(asked).not.toHaveBeenCalled()
  })

  it("skips a creator checked within the last six hours", async () => {
    await followCreator({ lastCheckedAt: new Date(Date.now() - 60_000) })
    const asked = platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()

    expect(asked).not.toHaveBeenCalled()
  })

  it("one creator's platform being down does not stop the others", async () => {
    await followCreator({ handle: "broken" })
    await followCreator({ handle: "fine" })
    vi.spyOn(uploads, "listRecentUploads").mockImplementation(
      async ({ handle }) => {
        if (handle === "broken") throw new Error("TikTok would not answer")
        return {
          uploads: [
            {
              platformVideoId: "a",
              url: "https://www.tiktok.com/@fine/video/a",
              title: "A video",
              thumbnailUrl: null,
              durationSeconds: 30,
              views: 10,
              likes: 1,
              comments: 0,
              postedAt: new Date(),
            },
          ],
          profile: null,
        }
      }
    )

    await creatorWatchTick()

    expect(await database.select().from(videoCreatorPosts)).toHaveLength(1)
  })

  it("tells each person about their own creators only", async () => {
    const other = await insertUser(database)
    await followCreator({ handle: "mine" })
    await followCreator({ ownerId: other.id, handle: "theirs" })
    platformAnswers([{ platformVideoId: "a" }])

    await creatorWatchTick()

    expect(await noticesFor(user.id)).toHaveLength(1)
    expect(await noticesFor(other.id)).toHaveLength(1)
  })

  it("says nothing when it finds nothing new", async () => {
    await followCreator()
    platformAnswers([])

    await creatorWatchTick()

    expect(await noticesFor(user.id)).toHaveLength(0)
  })
})
