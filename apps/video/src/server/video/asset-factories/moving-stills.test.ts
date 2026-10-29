import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VIDEO_MODEL } from "@/lib/video/asset-factories"
import { MOVING_STILL_BUSY_MESSAGE } from "@/lib/video/moving-still"
import {
  REMAKE_ACTOR_GONE_MESSAGE,
  REMAKE_BUSY_MESSAGE,
  REMAKE_NOT_FOUND_MESSAGE,
  REMAKE_START_GONE_MESSAGE,
} from "@/lib/video/remake-clip"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  customShellMedia,
  customShellNotifications,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { videoGenerationTick } from "@/server/video/asset-factories/generations"
import {
  createStillShot,
  listStillShots,
  movingStillTick,
  settleStillShot,
} from "@/server/video/asset-factories/moving-stills"
import {
  createOwnedProject,
  getOwnedProject,
  writeProjectTimeline,
} from "@/server/video/projects"
import {
  videoAiGenerations,
  videoEditorWindows,
  videoProjectMedia,
} from "@/server/video/schema"
import { saveVideoKey } from "@/server/video/settings"

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
  getFromR2: async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([137, 80, 78, 71]) },
  }),
}))

// The picture in these tests is not a real image, so its size is stood in
// for: a tall phone picture. person-board.test.ts runs the real readers.
vi.mock("@/server/video/asset-factories/person-board", () => ({
  readStoredPicture: async (storagePath: string) => new TextEncoder().encode(storagePath),
  pictureSize: async () => ({ width: 1080, height: 1920 }),
  shrinkReference: async (bytes: Uint8Array) => ({ bytes, mimeType: "image/jpeg" }),
  buildPersonBoard: async () => {
    throw new Error("No person board for a timeline picture")
  },
}))

/** The start of an MP4 file, which is all the upload check reads. */
const MP4_START = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom\0\0\0\0isommp42")])

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const originalGeminiKey = process.env.CUSTOM_SHELL_GEMINI_API_KEY

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
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

function clip(overrides: Partial<ProjectTimeline["tracks"][number]["clips"][number]>) {
  return {
    id: "clip",
    kind: "image" as const,
    name: "Clip",
    startMs: 0,
    durationMs: 4000,
    trimStartMs: 0,
    ...overrides,
  }
}

/**
 * Scene six (a video), the lighthouse still as scene seven with a slow push
 * in, scene eight, and a voice under all three.
 */
const SEEDED: ProjectTimeline = {
  aspect: "9:16",
  tracks: [
    {
      id: "pictures",
      muted: false,
      clips: [
        clip({ id: "six", kind: "video", mediaId: "six-file", startMs: 0, durationMs: 5000 }),
        clip({
          id: "seven",
          name: "Lighthouse",
          mediaId: "still",
          startMs: 5000,
          durationMs: 4000,
          motion: "push-in",
          fit: "cover",
        }),
        clip({ id: "eight", kind: "video", mediaId: "eight-file", startMs: 9000, durationMs: 6000 }),
      ],
    },
    {
      id: "voice",
      muted: false,
      clips: [clip({ id: "voice-1", kind: "audio", mediaId: "voice-file", startMs: 0, durationMs: 15000 })],
    },
  ],
}

function starts(timeline: ProjectTimeline) {
  return timeline.tracks.flatMap((track) =>
    track.clips.map((item) => `${track.id}:${item.startMs}-${item.startMs + item.durationMs}`)
  )
}

async function seedProject() {
  const timestamp = now()
  await database.insert(customShellMedia).values({
    id: "still",
    workspaceId,
    userId: user.id,
    filename: "lighthouse.png",
    originalName: "lighthouse.png",
    fileSize: 8,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `${user.id}/lighthouse.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const project = await createOwnedProject(user.id, "Lighthouse", database)
  await writeProjectTimeline(user.id, project.id, SEEDED, project.version, database)
  return project
}

function makeLighthouseMove(projectId: string) {
  return createStillShot(user.id, {
    projectId,
    clipId: "seven",
    prompts: ["Waves crashing, lamp turning"],
    lengthSeconds: 4,
    quality: "720p",
  })
}

/** Google accepts the piece, then finishes it on the next pass. */
async function googleMakesIt(shotId?: string) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "run-1" })))
  await videoGenerationTick()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        id: "run-1",
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "video", mime_type: "video/mp4", data: MP4_START.toString("base64") }],
          },
        ],
        usage: { total_input_tokens: 2000, total_output_tokens: 23168 },
      })
    )
  )
  await videoGenerationTick()
  const [piece] = await database
    .select()
    .from(videoAiGenerations)
    .where(shotId ? eq(videoAiGenerations.shotId, shotId) : undefined)
  expect(piece.status).toBe("ready")
  return piece
}

async function savedTimeline(projectId: string) {
  const project = await getOwnedProject(user.id, projectId, database)
  return { timeline: project.timeline as ProjectTimeline, version: project.version }
}

describe("asking for a moving shot of a picture", () => {
  it("records the clip it is for, with no first frame", async () => {
    const project = await seedProject()
    const shot = await makeLighthouseMove(project.id)

    const [row] = await database.select().from(videoAiGenerations)
    expect(row).toMatchObject({
      projectId: project.id,
      firstFrameId: null,
      firstFrameMediaId: "still",
      clipId: "seven",
      clipMediaId: "still",
      clipStartMs: 5000,
      clipDurationMs: 4000,
      clipOutcome: null,
      aspectRatio: "9:16",
      durationSeconds: 4,
      model: VIDEO_MODEL,
      status: "queued",
    })
    expect(shot.clip).toEqual({ id: "seven", media_id: "still" })
    expect((await listStillShots(user.id, project.id)).shots.map((item) => item.id)).toEqual([shot.id])
  })

  it("refuses a second try while one is being made, and clears a failed one", async () => {
    const project = await seedProject()
    const first = await makeLighthouseMove(project.id)
    await expect(makeLighthouseMove(project.id)).rejects.toThrow(MOVING_STILL_BUSY_MESSAGE)

    await database
      .update(videoAiGenerations)
      .set({ status: "error", errorMessage: "Google could not generate the video." })
      .where(eq(videoAiGenerations.shotId, first.id))
    const second = await makeLighthouseMove(project.id)

    const rows = await database.select().from(videoAiGenerations)
    expect(rows.map((row) => row.shotId)).toEqual([second.id])
  })

  it("refuses a clip that is not a picture, and a length that does not fit", async () => {
    const project = await seedProject()
    const ask = (clipId: string, lengthSeconds: 4 | 16) =>
      createStillShot(user.id, {
        projectId: project.id,
        clipId,
        prompts: lengthSeconds === 16 ? ["Waves", "Lamp"] : ["Waves"],
        lengthSeconds,
        quality: "720p",
      })
    // A video the AI did not make has nothing to make it again from.
    await expect(ask("eight", 4)).rejects.toThrow(REMAKE_NOT_FOUND_MESSAGE)
    // A 4 second picture never pays for two 8 second pieces it would throw away.
    await expect(ask("seven", 16)).rejects.toThrow("Pick a length at least as long as the picture")
    expect(await database.select().from(videoAiGenerations)).toEqual([])
  })

  it("lets nobody else ask for, list or land a shot on someone's project", async () => {
    const project = await seedProject()
    const shot = await makeLighthouseMove(project.id)
    await googleMakesIt()
    const stranger = await insertUser(database)

    await expect(
      createStillShot(stranger.id, {
        projectId: project.id,
        clipId: "seven",
        prompts: ["Waves"],
        lengthSeconds: 4,
        quality: "720p",
      })
    ).rejects.toThrow()
    await expect(listStillShots(stranger.id, project.id)).rejects.toThrow()
    await expect(settleStillShot(stranger.id, shot.id, "replaced")).rejects.toThrow()

    const rows = await database.select().from(videoAiGenerations)
    expect(rows.map((row) => [row.userId, row.clipOutcome])).toEqual([[user.id, null]])
  })
})

describe("landing a finished shot", () => {
  it("replaces the picture with nobody editing, as one save, and moves nothing else", async () => {
    const project = await seedProject()
    await makeLighthouseMove(project.id)
    const piece = await googleMakesIt()
    const before = await savedTimeline(project.id)

    await movingStillTick()

    const after = await savedTimeline(project.id)
    expect(after.version).toBe(before.version + 1)
    expect(starts(after.timeline)).toEqual(starts(before.timeline))
    expect(after.timeline.tracks[0].clips[1]).toMatchObject({
      id: "seven",
      kind: "video",
      mediaId: piece.outputMediaId,
      startMs: 5000,
      durationMs: 4000,
      muted: true,
      fit: "cover",
    })
    expect(after.timeline.tracks[0].clips[1].motion).toBeUndefined()
    const [landed] = await database.select().from(videoAiGenerations)
    expect(landed.clipOutcome).toBe("replaced")
    // On the project's Media panel too, so an Undo back to the picture keeps it.
    const shelf = await database.select().from(videoProjectMedia)
    expect(shelf.map((row) => row.mediaId)).toContain(piece.outputMediaId)
    expect((await listStillShots(user.id, project.id)).shots).toEqual([])

    // A second pass finds nothing left to land.
    await movingStillTick()
    expect((await savedTimeline(project.id)).version).toBe(after.version)
  })

  it("leaves it to an open editor, and only one of the two lands it", async () => {
    const project = await seedProject()
    const shot = await makeLighthouseMove(project.id)
    await googleMakesIt()
    await database.insert(videoEditorWindows).values({
      projectId: project.id,
      windowId: "window-1",
      mode: "edit",
      openedAt: now(),
      seenAt: now(),
    })
    const before = await savedTimeline(project.id)

    await movingStillTick()
    expect((await savedTimeline(project.id)).version).toBe(before.version)

    expect(await settleStillShot(user.id, shot.id, "replaced")).toEqual({ settled: true })
    expect(await settleStillShot(user.id, shot.id, "replaced")).toEqual({ settled: false })
    await database.delete(videoEditorWindows)
    await movingStillTick()
    expect((await savedTimeline(project.id)).version).toBe(before.version)
  })

  it("lands it once a read-only window is all that is open", async () => {
    const project = await seedProject()
    await makeLighthouseMove(project.id)
    await googleMakesIt()
    await database.insert(videoEditorWindows).values({
      projectId: project.id,
      windowId: "window-1",
      mode: "view",
      openedAt: now(),
      seenAt: now(),
    })

    await movingStillTick()

    const [landed] = await database.select().from(videoAiGenerations)
    expect(landed.clipOutcome).toBe("replaced")
  })

  it("puts the shot in Media with a notice when the picture was deleted meanwhile", async () => {
    const project = await seedProject()
    await makeLighthouseMove(project.id)
    const piece = await googleMakesIt()
    const current = await savedTimeline(project.id)
    const withoutStill: ProjectTimeline = {
      ...current.timeline,
      tracks: current.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((item) => item.id !== "seven"),
      })),
    }
    await writeProjectTimeline(user.id, project.id, withoutStill, current.version, database)

    await movingStillTick()

    const after = await savedTimeline(project.id)
    expect(after.version).toBe(current.version + 1)
    expect(starts(after.timeline)).toEqual(starts(withoutStill))
    const [landed] = await database.select().from(videoAiGenerations)
    expect(landed.clipOutcome).toBe("gone")
    const shelf = await database
      .select()
      .from(videoProjectMedia)
      .where(
        and(
          eq(videoProjectMedia.projectId, project.id),
          eq(videoProjectMedia.mediaId, piece.outputMediaId ?? "")
        )
      )
    expect(shelf).toHaveLength(1)
    const notices = await database.select().from(customShellNotifications)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      recipientUserId: user.id,
      type: "app_activity",
      message: "A moving shot arrived after its clip was gone",
    })
  })

  it("keeps a failed shot off the timeline, with its reason, until Try again", async () => {
    const project = await seedProject()
    await makeLighthouseMove(project.id)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Bad picture" } }, { status: 400 }))
    )
    await videoGenerationTick()
    await movingStillTick()

    const { shots } = await listStillShots(user.id, project.id)
    expect(shots).toHaveLength(1)
    expect(shots[0].status).toBe("error")
    expect(shots[0].error_message).toBe("Google could not start the video: Bad picture")
    expect(starts((await savedTimeline(project.id)).timeline)).toEqual(starts(SEEDED))
    expect((await savedTimeline(project.id)).timeline.tracks[0].clips[1].kind).toBe("image")
  })
})

describe("making a moving clip again", () => {
  async function landedLighthouse() {
    const project = await seedProject()
    await makeLighthouseMove(project.id)
    const first = await googleMakesIt()
    await movingStillTick()
    // Its sound turned up since it landed.
    const current = await savedTimeline(project.id)
    const turnedUp: ProjectTimeline = {
      ...current.timeline,
      tracks: current.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((item) =>
          item.id === "seven" ? { ...item, muted: false, volume: 0.6 } : item
        ),
      })),
    }
    await writeProjectTimeline(user.id, project.id, turnedUp, current.version, database)
    return { project, first }
  }

  function makeItAgain(projectId: string) {
    return createStillShot(user.id, {
      projectId,
      clipId: "seven",
      prompts: ["Waves crashing, the lamp off"],
      lengthSeconds: 4,
      quality: "360p",
    })
  }

  it("remembers how the landed clip was made", async () => {
    const { project, first } = await landedLighthouse()
    const seven = (await savedTimeline(project.id)).timeline.tracks[0].clips[1]
    expect(seven.mediaId).toBe(first.outputMediaId)
    expect(seven.origin).toEqual({
      tool: "animate",
      model: VIDEO_MODEL,
      prompt: "Waves crashing, lamp turning",
      firstFrameMediaId: "still",
      referenceMediaIds: [],
      extras: [],
      aspectRatio: "9:16",
      quality: "720p",
    })
  })

  it("starts on the picture it was first made from and takes the clip's place, as loud as it was", async () => {
    const { project, first } = await landedLighthouse()
    const shot = await makeItAgain(project.id)
    const [row] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.shotId, shot.id))
    expect(row).toMatchObject({
      firstFrameMediaId: "still",
      clipId: "seven",
      clipMediaId: first.outputMediaId,
      prompt: "Waves crashing, the lamp off",
      resolution: "360p",
      aspectRatio: "9:16",
    })
    await expect(makeItAgain(project.id)).rejects.toThrow(REMAKE_BUSY_MESSAGE)

    const second = await googleMakesIt(shot.id)
    const before = await savedTimeline(project.id)
    await movingStillTick()
    const after = await savedTimeline(project.id)

    expect(starts(after.timeline)).toEqual(starts(before.timeline))
    expect(after.timeline.tracks[0].clips[1]).toMatchObject({
      id: "seven",
      kind: "video",
      mediaId: second.outputMediaId,
      muted: false,
      volume: 0.6,
      fit: "cover",
      origin: { prompt: "Waves crashing, the lamp off", quality: "360p" },
    })
  })

  it("leaves the shot in Media when the clip was given another file meanwhile", async () => {
    const { project } = await landedLighthouse()
    const shot = await makeItAgain(project.id)
    await googleMakesIt(shot.id)
    const current = await savedTimeline(project.id)
    const replaced: ProjectTimeline = {
      ...current.timeline,
      tracks: current.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((item) =>
          item.id === "seven" ? { ...item, mediaId: "eight-file", origin: undefined } : item
        ),
      })),
    }
    await writeProjectTimeline(user.id, project.id, replaced, current.version, database)

    await movingStillTick()

    const after = await savedTimeline(project.id)
    expect(after.timeline.tracks[0].clips[1].mediaId).toBe("eight-file")
    const [landed] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.shotId, shot.id))
    expect(landed.clipOutcome).toBe("gone")
  })

  it("says which part of the recipe is gone, and asks Google for nothing", async () => {
    const { project } = await landedLighthouse()
    const withRecipe = async (change: Record<string, unknown>) => {
      const current = await savedTimeline(project.id)
      const changed: ProjectTimeline = {
        ...current.timeline,
        tracks: current.timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((item) =>
            item.id === "seven" && item.origin
              ? ({ ...item, origin: { ...item.origin, ...change } } as typeof item)
              : item
          ),
        })),
      }
      await writeProjectTimeline(user.id, project.id, changed, current.version, database)
    }
    await withRecipe({ firstFrameMediaId: "deleted-picture" })
    await expect(makeItAgain(project.id)).rejects.toThrow(REMAKE_START_GONE_MESSAGE)
    await withRecipe({ firstFrameMediaId: "still", tool: "shot", actorId: "deleted-actor" })
    await expect(makeItAgain(project.id)).rejects.toThrow(REMAKE_ACTOR_GONE_MESSAGE)
    const rows = await database.select().from(videoAiGenerations)
    expect(rows).toHaveLength(1)
  })

  it("still lands a shot whose starting picture was deleted from Media meanwhile", async () => {
    const project = await seedProject()
    const shot = await makeLighthouseMove(project.id)
    const piece = await googleMakesIt()
    // What deleting the file from Media does to the row.
    await database
      .update(videoAiGenerations)
      .set({ firstFrameMediaId: null })
      .where(eq(videoAiGenerations.shotId, shot.id))

    await movingStillTick()

    const seven = (await savedTimeline(project.id)).timeline.tracks[0].clips[1]
    expect(seven).toMatchObject({ kind: "video", mediaId: piece.outputMediaId })
    expect(seven.origin).toBeUndefined()
  })
})

describe("making a picture move on Seedance", () => {
  const savedSecret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  beforeEach(() => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-secret"
  })
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
    else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = savedSecret
  })

  it("makes it on Seedance without sound, lands it, and Make it again stays there", async () => {
    const project = await seedProject()
    await saveVideoKey("seedance", "ark-1234")
    await createStillShot(user.id, {
      projectId: project.id,
      clipId: "seven",
      prompts: ["Waves crashing, lamp turning"],
      lengthSeconds: 4,
      quality: "480p",
      company: "seedance",
      sound: false,
    })
    const [asked] = await database.select().from(videoAiGenerations)
    expect(asked).toMatchObject({ model: "seedance-1.5-pro", resolution: "480p", withSound: false })

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "cgt-1" })))
    await videoGenerationTick()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).endsWith("/tasks/cgt-1")
          ? Response.json({
              status: "succeeded",
              content: { video_url: "https://ark-content.tos-ap-southeast-1.volces.com/a.mp4" },
              usage: { completion_tokens: 40000 },
            })
          : new Response(MP4_START)
      )
    )
    await videoGenerationTick()
    await movingStillTick()
    const seven = (await savedTimeline(project.id)).timeline.tracks[0].clips[1]
    expect(seven.origin).toMatchObject({ model: "seedance-1.5-pro", quality: "480p", sound: false })

    await createStillShot(user.id, {
      projectId: project.id,
      clipId: "seven",
      prompts: ["Waves crashing, the lamp off"],
      lengthSeconds: 4,
      quality: "480p",
    })
    const remade = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.status, "queued"))
    expect(remade).toEqual([
      expect.objectContaining({ model: "seedance-1.5-pro", withSound: false }),
    ])
  })

  it("refuses Seedance with no key, saying where it goes", async () => {
    const project = await seedProject()
    await expect(
      createStillShot(user.id, {
        projectId: project.id,
        clipId: "seven",
        prompts: ["Waves"],
        lengthSeconds: 4,
        quality: "720p",
        company: "seedance",
      })
    ).rejects.toThrow("Add a Seedance key in Settings → AI video first")
  })
})
