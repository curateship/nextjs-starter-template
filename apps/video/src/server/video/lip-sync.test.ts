import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  LIP_SYNC_FAILED_MESSAGE,
  LIP_SYNC_KEY_MESSAGE,
  LIP_SYNC_NO_VOICE_MESSAGE,
  LIP_SYNC_SPEED_MESSAGE,
  lipSyncVoices,
  voiceWindow,
} from "@/lib/video/lip-sync"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoLipSyncs } from "@/server/video/schema"

/**
 * Match the lips (lip-sync.md), run against a test database with real ffmpeg
 * cutting the two files, and Sync Labs and storage stood in for. Nothing
 * reaches Sync Labs.
 */

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
const dir = mkdtempSync(path.join(tmpdir(), "lip-sync-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const stand = vi.hoisted(() => ({
  db: null as unknown,
  key: "sync-key" as string | null,
  workspaceId: "",
  files: new Map<string, string>(),
  uploads: [] as string[],
  deleted: [] as string[],
  started: [] as { model: string; input: { type: string; url: string }[]; options: unknown }[],
  syncStatus: "PROCESSING",
  output: null as Uint8Array | null,
}))

vi.mock("@/server/db", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    get db() {
      return stand.db
    },
  }
})
vi.mock("@/server/video/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/video/settings")>()),
  getSyncApiKey: async () => stand.key,
}))
vi.mock("@/server/video/render-sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/video/render-sources")>()),
  openRenderSource: async (media: { storagePath: string }) => ({
    input: stand.files.get(media.storagePath)!,
    release: async () => undefined,
  }),
}))
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadFileToR2: async (storagePath: string) => {
    stand.uploads.push(storagePath)
  },
  deleteFromR2: async (storagePath: string) => {
    stand.deleted.push(storagePath)
  },
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: async () => stand.workspaceId,
}))

const { startLipSync, checkLipSync, latestLipSync, lipSyncTick } = await import("@/server/video/lip-sync")
const { createOwnedProject } = await import("@/server/video/projects")
const { writeVideoTimeline } = await import("@/server/video/project-videos")

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let videoId: string

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args])
  if (result.status !== 0) throw new Error(result.stderr.toString())
}

async function mediaRow(storagePath: string, fileType: "video" | "audio") {
  const id = uuid()
  await database.insert(customShellMedia).values({
    id,
    workspaceId: stand.workspaceId,
    userId: user.id,
    filename: path.basename(storagePath),
    originalName: path.basename(storagePath),
    fileSize: 100,
    mimeType: fileType === "video" ? "video/mp4" : "audio/mpeg",
    fileType,
    storagePath,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  stand.db = database
  stand.key = "sync-key"
  stand.uploads = []
  stand.deleted = []
  stand.started = []
  stand.syncStatus = "PROCESSING"
  stand.output = null
  user = await insertUser(database)
  stand.workspaceId = (await insertWorkspace(database)).id

  if (hasFfmpeg && !stand.files.size) {
    const face = path.join(dir, "face.mp4")
    const voice = path.join(dir, "voice.mp3")
    ffmpeg(["-f", "lavfi", "-i", "color=c=gray:s=160x120:r=25:d=6", "-pix_fmt", "yuv420p", face])
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=300:duration=4", voice])
    stand.files.set("face.mp4", face)
    stand.files.set("voice.mp3", voice)
  }
  const faceId = await mediaRow("face.mp4", "video")
  const voiceId = await mediaRow("voice.mp3", "audio")
  const made = await createOwnedProject(user.id, "Interview", database)
  videoId = made.video
  await writeVideoTimeline(
    user.id,
    videoId,
    {
      aspect: "16:9",
      tracks: [
        {
          id: "picture",
          muted: false,
          clips: [
            { id: "face", kind: "video", name: "Face", mediaId: faceId, startMs: 0, durationMs: 5_000, trimStartMs: 1_000, sourceDurationMs: 6_000 },
          ],
        },
        {
          id: "sound",
          muted: false,
          clips: [
            { id: "voice", kind: "audio", name: "Voice", mediaId: voiceId, startMs: 1_000, durationMs: 4_000, trimStartMs: 0, sourceDurationMs: 4_000, origin: undefined },
          ],
        },
      ],
    } satisfies ProjectTimeline as never,
    1,
    database
  )

  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: FormData }) => {
    if (url === "https://api.sync.so/v2/generate" && init?.method === "POST") {
      const form = init.body!
      stand.started.push({
        model: String(form.get("model")),
        input: JSON.parse(String(form.get("input"))),
        options: JSON.parse(String(form.get("options"))),
      })
      return Response.json({ id: "gen-1", status: "PENDING" }, { status: 201 })
    }
    if (url === "https://api.sync.so/v2/generate/gen-1") {
      return Response.json({
        id: "gen-1",
        status: stand.syncStatus,
        outputUrl: "https://sync.test/out.mp4",
        outputDuration: 5,
      })
    }
    if (url === "https://sync.test/out.mp4") {
      return new Response(new Uint8Array(stand.output ?? readFileSync(stand.files.get("face.mp4")!)))
    }
    throw new Error(`Unexpected fetch ${url}`)
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

describe("which voice and which stretch", () => {
  it("offers sound clips over the clip, a read voice first", () => {
    const clip = { id: "c", kind: "video", startMs: 0, durationMs: 5_000, mediaId: "m" }
    const music = { id: "music", kind: "audio", startMs: 0, durationMs: 9_000, mediaId: "a" }
    const voice = { id: "voice", kind: "audio", startMs: 2_000, durationMs: 1_000, mediaId: "b", origin: { tool: "voice" } }
    const away = { id: "away", kind: "audio", startMs: 6_000, durationMs: 1_000, mediaId: "c" }
    const stock = { id: "pop", kind: "audio", startMs: 0, durationMs: 1_000 }
    expect(lipSyncVoices([{ clips: [clip, music, voice, away, stock] }], clip).map((one) => one.id)).toEqual([
      "voice",
      "music",
    ])
  })

  it("puts silence before a voice that starts late, and cuts one that runs on", () => {
    expect(
      voiceWindow({ startMs: 1_000, durationMs: 5_000 }, { startMs: 2_500, durationMs: 9_000, trimStartMs: 300 })
    ).toEqual({ silenceBeforeMs: 1_500, soundFromMs: 300, soundMs: 3_500 })
  })
})

describe.skipIf(!hasFfmpeg)("matching the lips", () => {
  it("sends the footage under the clip and the voice over it to Sync, and waits", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    expect(job.status).toBe("working")
    expect(stand.started).toEqual([
      {
        model: "lipsync-2",
        input: [
          { type: "video", url: expect.stringMatching(/^https:\/\/media\.test\/.+-video\.mp4$/) },
          { type: "audio", url: expect.stringMatching(/^https:\/\/media\.test\/.+-voice\.wav$/) },
        ],
        options: { sync_mode: "cut_off" },
      },
    ])
    expect(stand.uploads).toHaveLength(2)
    // A second press while it works gets the same job, not a second charge.
    const again = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    expect(again.id).toBe(job.id)
    expect(stand.started).toHaveLength(1)
  }, 60_000)

  it("brings the finished video in, charges $0.05 a second, and deletes what was sent", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    expect((await checkLipSync(user.id, job.id, database)).status).toBe("working")

    stand.syncStatus = "COMPLETED"
    const done = await checkLipSync(user.id, job.id, database)
    expect(done.status).toBe("ready")
    expect(done.media?.name).toBe("Face (lips matched).mp4")
    expect(done.cost_cents).toBe(25)
    const [charge] = await database.select().from(customShellAiUsageEvents)
    expect(charge).toMatchObject({ provider: "sync", feature: "lip_sync", costCents: 25, status: "success" })
    expect(stand.deleted.filter((one) => one.includes("lip-sync-"))).toHaveLength(2)
    expect((await latestLipSync(user.id, videoId, "face", database))?.status).toBe("ready")
  }, 60_000)

  it("ends a job Sync turned down at no charge", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    stand.syncStatus = "FAILED"
    const ended = await checkLipSync(user.id, job.id, database)
    expect(ended).toMatchObject({ status: "failed", error: LIP_SYNC_FAILED_MESSAGE, media: null })
    const [charge] = await database.select().from(customShellAiUsageEvents)
    expect(charge).toMatchObject({ status: "failed", costCents: 0 })
  }, 60_000)

  it("keeps nothing that is not a video", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    stand.syncStatus = "COMPLETED"
    stand.output = new TextEncoder().encode("<html>not a video</html>")
    const checked = await checkLipSync(user.id, job.id, database)
    expect(checked.status).toBe("working")
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.originalName, "Face (lips matched).mp4"))).toEqual([])
  }, 60_000)

  it("gives up on a finished job it can never bring in, after 30 minutes", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    stand.syncStatus = "COMPLETED"
    stand.output = new TextEncoder().encode("expired link")
    const later = new Date(Date.now() + 31 * 60_000)
    const ended = await checkLipSync(user.id, job.id, database, later)
    expect(ended).toMatchObject({ status: "failed", cost_cents: 0 })
    expect(stand.deleted.filter((one) => one.includes("lip-sync-"))).toHaveLength(2)
  }, 60_000)

  it("makes one job from two presses at the same moment", async () => {
    const press = () => startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    const [one, two] = await Promise.all([press(), press()])
    expect(one.id).toBe(two.id)
    expect(stand.started).toHaveLength(1)
    expect(await database.select().from(videoLipSyncs)).toHaveLength(1)
  }, 60_000)

  it("counts a job still working against the video's spend limit", async () => {
    await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    // The working job is expected to cost 25 cents; a limit of 30 leaves no
    // room for another 25 on a second clip.
    const { videoProjectVideos } = await import("@/server/video/schema")
    await database.update(videoProjectVideos).set({ spendLimitCents: 30 }).where(eq(videoProjectVideos.id, videoId))
    const [row] = await database.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, videoId))
    const timeline = row.timeline as ProjectTimeline
    // A second face clip under the same voice, on a lane of its own.
    timeline.tracks.push({ id: "picture-2", muted: false, clips: [{ ...timeline.tracks[0].clips[0], id: "face-2" }] })
    await writeVideoTimeline(user.id, videoId, timeline as never, row.version, database)
    const refused = await startLipSync({ userId: user.id, videoId, clipId: "face-2", soundClipId: "voice" }, database).catch((error: Error) => error)
    expect(refused).toBeInstanceOf(Error)
    expect(isProjectSpendLimitMessage((refused as Error).message)).toBe(true)
    expect(stand.started).toHaveLength(1)
  }, 60_000)

  it("lands a job whose window was closed, from the background sweep", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    stand.syncStatus = "COMPLETED"
    await lipSyncTick(database, new Date(Date.now() + 2 * 60_000))
    const swept = await latestLipSync(user.id, videoId, "face", database)
    expect(swept).toMatchObject({ id: job.id, status: "ready", cost_cents: 25 })
    expect(stand.deleted.filter((one) => one.includes("lip-sync-"))).toHaveLength(2)
  }, 60_000)

  it("shows nobody else the job", async () => {
    const job = await startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    const stranger = await insertUser(database)
    await expect(checkLipSync(stranger.id, job.id, database)).rejects.toThrow()
  }, 60_000)
})

describe("what is refused before anything is sent", () => {
  it("needs a key, a voice, and normal speed", async () => {
    stand.key = null
    await expect(
      startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    ).rejects.toThrow(LIP_SYNC_KEY_MESSAGE)
    stand.key = "sync-key"
    await expect(
      startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "face" }, database)
    ).rejects.toThrow(LIP_SYNC_NO_VOICE_MESSAGE)

    const { videoProjectVideos } = await import("@/server/video/schema")
    const [row] = await database.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, videoId))
    const timeline = row.timeline as ProjectTimeline
    timeline.tracks[0].clips[0] = { ...timeline.tracks[0].clips[0], speed: 2, durationMs: 2_500 }
    await writeVideoTimeline(user.id, videoId, timeline as never, row.version, database)
    await expect(
      startLipSync({ userId: user.id, videoId, clipId: "face", soundClipId: "voice" }, database)
    ).rejects.toThrow(LIP_SYNC_SPEED_MESSAGE)
    expect(stand.started).toHaveLength(0)
    expect(await database.select().from(videoLipSyncs)).toEqual([])
  })
})
