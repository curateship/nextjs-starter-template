import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { workOutAiParts } from "@/server/video/ai-parts"
import { setOwnedExportHandEdited } from "@/server/video/exports"
import { createOwnedProject } from "@/server/video/projects"
import { serializeRenderJob } from "@/server/video/render-queue"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
  videoRenderJobs,
  videoVoiceovers,
} from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
})

afterEach(async () => {
  await client.close()
})

async function insertMedia(fileType: "image" | "video" | "audio", id = uuid()) {
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: user.id,
    filename: id,
    originalName: id,
    fileSize: 8,
    mimeType: `${fileType}/x`,
    fileType,
    storagePath: `${user.id}/${id}`,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

/** A project with a first frame, a shot from it, and two voiceovers kept on the shelf. */
async function seedMadeByAi() {
  const at = now()
  const project = await createOwnedProject(user.id, "Bread", database)
  const actorId = uuid()
  await database.insert(videoActors).values({
    id: actorId,
    userId: user.id,
    name: "Mia",
    prompt: "Mia, 30s",
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: [],
    imageMediaId: await insertMedia("image"),
    createdAt: at,
    updatedAt: at,
  })
  const frameMediaId = await insertMedia("image")
  const frameId = uuid()
  await database.insert(videoFirstFrames).values({
    id: frameId,
    userId: user.id,
    projectId: project.id,
    actorId,
    name: "Kitchen",
    prompt: "Kitchen",
    model: "gemini-3.1-flash-image",
    aspectRatio: "9:16",
    imageMediaId: frameMediaId,
    createdAt: at,
    updatedAt: at,
  })
  const shotMediaId = await insertMedia("video")
  await database.insert(videoAiGenerations).values({
    id: "shot-1",
    userId: user.id,
    projectId: project.id,
    firstFrameId: frameId,
    firstFrameMediaId: frameMediaId,
    prompt: "She turns",
    model: "gemini-omni-1.1-flash",
    aspectRatio: "9:16",
    durationSeconds: 4,
    shotId: "shot-1",
    shotIndex: 1,
    shotPieces: 1,
    status: "ready",
    outputMediaId: shotMediaId,
    createdAt: at,
    updatedAt: at,
  })
  const voiceIds: string[] = []
  for (const voiceId of ["alloy", "rachel-voice-id"]) {
    const mediaId = await insertMedia("audio")
    await database.insert(videoVoiceovers).values({
      mediaId,
      script: "Bread goes stale fast.",
      voiceId,
      voiceName: voiceId,
      durationMs: 2000,
      captions: [],
      createdAt: at,
    })
    voiceIds.push(mediaId)
  }
  return { project, frameMediaId, shotMediaId, voiceIds }
}

function laneOf(
  clips: Partial<ProjectTimeline["tracks"][number]["clips"][number]>[]
) {
  return {
    id: uuid(),
    muted: false,
    clips: clips.map((clip) => ({
      id: uuid(),
      kind: "image" as const,
      name: "clip",
      startMs: 0,
      durationMs: 2000,
      trimStartMs: 0,
      ...clip,
    })),
  }
}

describe("workOutAiParts", () => {
  it("finds files the AI made that were laid down without a recipe", async () => {
    const { frameMediaId, shotMediaId, voiceIds } = await seedMadeByAi()
    const upload = await insertMedia("image")
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [
        laneOf([
          { kind: "audio", mediaId: voiceIds[0] },
          { kind: "audio", mediaId: voiceIds[1], startMs: 2000 },
        ]),
        laneOf([
          { mediaId: frameMediaId },
          { mediaId: upload, startMs: 2000 },
        ]),
        laneOf([{ kind: "video", mediaId: shotMediaId, startMs: 4000 }]),
      ],
    }

    expect(await workOutAiParts(timeline, database)).toEqual([
      { kind: "voice", speaker: "openai", atSeconds: [0] },
      { kind: "voice", speaker: "elevenlabs", atSeconds: [2] },
      { kind: "picture", model: "gemini-3.1-flash-image", atSeconds: [0] },
      { kind: "clip", model: "gemini-omni-1.1-flash", atSeconds: [4] },
    ])
  })

  it("is an empty list for a project of uploads", async () => {
    const upload = await insertMedia("video")
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [laneOf([{ kind: "video", mediaId: upload }])],
    }
    expect(await workOutAiParts(timeline, database)).toEqual([])
  })
})

describe("an export's AI list", () => {
  async function exportRow(ownerId = user.id) {
    const project = await createOwnedProject(ownerId, "Reel", database)
    const at = now()
    const [row] = await database
      .insert(videoRenderJobs)
      .values({
        id: uuid(),
        userId: ownerId,
        projectId: project.id,
        status: "ready",
        quality: "high",
        aspect: "9:16",
        storagePath: `video/exports/${ownerId}/${uuid()}.mp4`,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return row
  }

  it("is unknown on an export made before the list existed, with the tick on", async () => {
    const summary = serializeRenderJob(await exportRow())
    expect(summary.ai_parts).toBeNull()
    expect(summary.ai_hand_edited).toBe(true)
  })

  it("remembers the hand-edited tick per export", async () => {
    const first = await exportRow()
    const second = await exportRow()
    const saved = await setOwnedExportHandEdited({
      userId: user.id,
      exportId: first.id,
      handEdited: false,
      database,
    })
    expect(saved.ai_hand_edited).toBe(false)
    const rows = await database.select().from(videoRenderJobs)
    const byId = new Map(rows.map((row) => [row.id, row.aiHandEdited]))
    expect(byId.get(first.id)).toBe(false)
    expect(byId.get(second.id)).toBe(true)
  })

  it("will not change somebody else's export", async () => {
    const stranger = await insertUser(database)
    const theirs = await exportRow(stranger.id)
    await expect(
      setOwnedExportHandEdited({
        userId: user.id,
        exportId: theirs.id,
        handEdited: false,
        database,
      })
    ).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
  })
})
