import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/media/storage", () => ({
  getPublicMediaUrl: vi.fn(async (path: string) => `https://files.test/${path}`),
}))

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  listStartingPictures,
  loadOwnPicture,
} from "@/server/pomodoro/generation-pictures"
import { pomodoroMediaUploads } from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * Which pictures an AI background may start from (task 06, part 3): only the
 * member's own, finished pictures that are not in the bin.
 */

let client: PGlite
let db: CustomShellDb
let member: string
let workspaceId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  workspaceId = (await insertWorkspace(db)).id
  member = (await insertUser(db)).id
})

afterEach(async () => {
  await client.close()
})

async function upload(
  userId: string,
  kind: "image" | "video",
  change: { status?: string; deletedAt?: Date | null } = {}
) {
  const id = uuid()
  const timestamp = now()
  await db.insert(customShellMedia).values({
    id,
    workspaceId,
    userId,
    filename: `${id}.jpg`,
    originalName: "desk.jpg",
    altText: null,
    fileSize: 100,
    mimeType: kind === "image" ? "image/jpeg" : "video/mp4",
    fileType: kind,
    storagePath: `${userId}/${id}.jpg`,
    emailProtectedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(pomodoroMediaUploads).values({
    mediaId: id,
    userId,
    purpose: "background",
    kind,
    status: change.status ?? "ready",
    originalBytes: 100,
    name: "My desk",
    deletedAt: change.deletedAt ?? null,
  })
  return id
}

describe("starting pictures", () => {
  it("offers only the member's own ready pictures outside the bin", async () => {
    const mine = await upload(member, "image")
    await upload(member, "video")
    await upload(member, "image", { deletedAt: new Date() })
    await upload(member, "image", { status: "failed" })
    const theirs = await upload((await insertUser(db)).id, "image")

    const pictures = await listStartingPictures(member)
    expect(pictures.map((picture) => picture.mediaId)).toEqual([mine])
    expect(pictures[0].name).toBe("My desk")

    expect(await loadOwnPicture(member, mine)).not.toBeNull()
    expect(await loadOwnPicture(member, theirs)).toBeNull()
  })
})
