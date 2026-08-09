import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { videoGenerationTick } from "@/server/video/asset-factories/generations"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
} from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
const originalGeminiKey = process.env.CUSTOM_SHELL_GEMINI_API_KEY

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  process.env.CUSTOM_SHELL_GEMINI_API_KEY = "test-key"
})

afterEach(async () => {
  await client.close()
  vi.unstubAllGlobals()
  if (originalGeminiKey === undefined) {
    delete process.env.CUSTOM_SHELL_GEMINI_API_KEY
  } else {
    process.env.CUSTOM_SHELL_GEMINI_API_KEY = originalGeminiKey
  }
})

async function seedProcessingGeneration() {
  const timestamp = now()
  const project = await createOwnedProject(user.id, "Lease test", database)
  await database.insert(customShellMedia).values({
    id: "media-1",
    userId: user.id,
    filename: "frame.png",
    originalName: "frame.png",
    altText: "Frame",
    fileSize: 8,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `${user.id}/frame.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(videoActors).values({
    id: "actor-1",
    userId: user.id,
    name: "Actor",
    prompt: "Actor",
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: [],
    imageMediaId: "media-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(videoFirstFrames).values({
    id: "frame-1",
    userId: user.id,
    actorId: "actor-1",
    name: "Frame",
    prompt: "Frame",
    model: "gemini-2.5-flash-image",
    aspectRatio: "9:16",
    tags: [],
    pinned: false,
    imageMediaId: "media-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(videoAiGenerations).values({
    id: "generation-1",
    userId: user.id,
    projectId: project.id,
    firstFrameId: "frame-1",
    firstFrameMediaId: "media-1",
    prompt: "Move",
    model: "veo-3.1-generate-preview",
    aspectRatio: "9:16",
    durationSeconds: 4,
    status: "processing",
    operationName: "operations/test",
    attempts: 1,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe("durable video generation leases", () => {
  it("lets only one overlapping worker poll a processing job", async () => {
    await seedProcessingGeneration()
    const provider = vi.fn(async () =>
      new Response(JSON.stringify({ done: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", provider)

    await Promise.all([videoGenerationTick(), videoGenerationTick()])

    expect(provider).toHaveBeenCalledTimes(1)
    const [row] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.id, "generation-1"))
    expect(row.status).toBe("processing")
    expect(row.leaseToken).toBeNull()
    expect(row.leaseExpiresAt).toBeNull()
  })
})
