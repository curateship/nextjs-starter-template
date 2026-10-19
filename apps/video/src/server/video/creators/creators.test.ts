import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  addCreatorByLink,
  deleteCreator,
} from "@/server/video/creators/creators"
import {
  videoCreatorPosts,
  videoCreators,
  videoViralVideos,
} from "@/server/video/schema"

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
  it("follows a TikTok creator from a link, once however it is typed", async () => {
    const { id } = await addCreatorByLink(user.id, "https://www.tiktok.com/@ZachKing")
    const [row] = await database
      .select()
      .from(videoCreators)
      .where(eq(videoCreators.id, id))
    expect(row.handle).toBe("zachking")
    await expect(
      addCreatorByLink(user.id, "https://www.tiktok.com/@zachking")
    ).rejects.toThrow("CREATOR_ALREADY_FOLLOWED")
    // Somebody else following the same creator is their own row.
    await expect(
      addCreatorByLink(other.id, "https://www.tiktok.com/@zachking")
    ).resolves.toHaveProperty("id")
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
