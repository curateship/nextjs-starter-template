import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoMediaSteadyCopies } from "@/server/video/schema"
import {
  requestOwnedSteadyCopy,
  STEADY_FAILED_MESSAGE,
  STEADY_NOT_READY_MESSAGE,
  STEADY_NOT_VIDEO_MESSAGE,
  steadyCopiesForRender,
} from "@/server/video/steady-copies"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL ??= "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
})

async function insertFile(ownerId: string, fileType: "video" | "image" = "video") {
  const timestamp = new Date()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: ownerId,
      filename: `${uuid()}.mp4`,
      originalName: "walk.mp4",
      fileSize: 1000,
      mimeType: fileType === "video" ? "video/mp4" : "image/png",
      fileType,
      storagePath: `${ownerId}/${uuid()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

describe("a steadied copy of a video", () => {
  it("is queued once, the first time it is asked for", async () => {
    const take = await insertFile(user.id)
    expect(await requestOwnedSteadyCopy(user.id, take.id, {}, database)).toEqual({ status: "preparing" })
    await requestOwnedSteadyCopy(user.id, take.id, {}, database)
    const rows = await database.select().from(videoMediaSteadyCopies)
    expect(rows.map((row) => [row.mediaId, row.status])).toEqual([[take.id, "queued"]])
  })

  it("is only for the person's own videos", async () => {
    const theirs = await insertFile(other.id)
    const picture = await insertFile(user.id, "image")
    await expect(requestOwnedSteadyCopy(user.id, theirs.id, {}, database)).rejects.toThrow("Media not found")
    await expect(requestOwnedSteadyCopy(user.id, picture.id, {}, database)).rejects.toThrow(STEADY_NOT_VIDEO_MESSAGE)
  })

  it("hands back where to play it once ready, and a failure's reason with a fresh try", async () => {
    const take = await insertFile(user.id)
    await requestOwnedSteadyCopy(user.id, take.id, {}, database)
    await database.update(videoMediaSteadyCopies).set({ status: "error", error: "ffmpeg broke", attempts: 3 })
    expect(await requestOwnedSteadyCopy(user.id, take.id, {}, database)).toEqual({ status: "failed", error: "ffmpeg broke" })
    expect(await requestOwnedSteadyCopy(user.id, take.id, { retry: true }, database)).toEqual({ status: "preparing" })
    await database.update(videoMediaSteadyCopies).set({ status: "ready", storagePath: "video/steady/a.mp4", fileSize: 5 })
    const ready = await requestOwnedSteadyCopy(user.id, take.id, {}, database)
    expect(ready).toEqual({ status: "ready", url: expect.stringContaining("video/steady/a.mp4") })
  })

  it("stops an export with a sentence while a copy is missing or failed", async () => {
    const take = await insertFile(user.id)
    await expect(steadyCopiesForRender([take.id], database)).rejects.toThrow(STEADY_NOT_READY_MESSAGE)
    await requestOwnedSteadyCopy(user.id, take.id, {}, database)
    await database.update(videoMediaSteadyCopies).set({ status: "error" })
    await expect(steadyCopiesForRender([take.id], database)).rejects.toThrow(STEADY_FAILED_MESSAGE)
    await database.update(videoMediaSteadyCopies).set({ status: "ready", storagePath: "video/steady/a.mp4", fileSize: 5 })
    expect(await steadyCopiesForRender([take.id], database)).toEqual(
      new Map([[take.id, { storagePath: "video/steady/a.mp4", fileSize: 5 }]])
    )
  })
})
