import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BRIEF_BREATH_MS,
  BRIEF_BUSY_MESSAGE,
  BRIEF_NOTHING_TO_RETRY_MESSAGE,
  type BriefRequest,
  type BriefScript,
} from "@/lib/video/brief"
import type { ScriptCheck } from "@/lib/video/script-check"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  briefPrompt,
  briefTick,
  listBriefs,
  retryBriefScene,
  saveBriefScenes,
  settleBriefScenes,
  startBrief,
  writeBrief,
} from "@/server/video/briefs"
import { remakeFirstFrame } from "@/server/video/asset-factories/first-frames"
import { createOwnedProject, getOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import { videoBriefs, videoEditorWindows, videoProjectMedia } from "@/server/video/schema"

const writer = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[] }))
const pictures = vi.hoisted(() => ({ calls: 0, failOn: new Set<number>() }))
const voices = vi.hoisted(() => ({ calls: 0, failOn: new Set<number>(), insert: null as null | ((id: string) => Promise<void>) }))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))

// A fake writer: hands back the next answer queued, or throws one that is an Error.
vi.mock("@/server/video/writer", () => ({
  askWriter: async ({ prompt }: { prompt: string }) => {
    writer.prompts.push(prompt)
    const answer = writer.answers.shift()
    if (answer instanceof Error) throw answer
    return answer
  },
}))

const PASSING_CHECK: ScriptCheck = {
  hook: { passed: true, words: [] },
  opener: { passed: true, words: [] },
  keepWatching: { passed: true, words: [] },
  bannedWords: { passed: true, words: [] },
  figures: { passed: true, words: [] },
}
vi.mock("@/server/video/script-check", () => ({ checkScript: async () => PASSING_CHECK }))

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
vi.mock("@/server/video/asset-factories/images", () => ({
  generateImage: async () => {
    pictures.calls += 1
    if (pictures.failOn.has(pictures.calls)) throw new Error("Google could not generate that image: quota.")
    return { bytes: PNG, mimeType: "image/png" }
  },
}))

// Every reading runs 1.5 seconds per scene number in its words.
vi.mock("@/server/video/voice", () => ({
  speak: async ({ text }: { text: string }) => {
    voices.calls += 1
    if (voices.failOn.has(voices.calls)) throw new Error("Voiceover failed (HTTP 500)")
    const mediaId = `voice-${voices.calls}`
    await voices.insert?.(mediaId)
    return {
      mediaId,
      url: `https://media.test/${mediaId}.mp3`,
      name: text.slice(0, 20),
      durationMs: 1500,
      captions: [{ startMs: 0, endMs: 1500, text }],
    }
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const keys = ["CUSTOM_SHELL_GEMINI_API_KEY", "CUSTOM_SHELL_ELEVENLABS_API_KEY"] as const
const savedKeys = keys.map((key) => process.env[key])

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  for (const key of keys) process.env[key] = "test-key"
  writer.answers = []
  writer.prompts = []
  pictures.calls = 0
  pictures.failOn = new Set()
  voices.calls = 0
  voices.failOn = new Set()
  voices.insert = async (id) => {
    const at = now()
    await database.insert(customShellMedia).values({
      id,
      workspaceId,
      userId: user.id,
      filename: `${id}.mp3`,
      originalName: `${id}.mp3`,
      fileSize: 8,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `${user.id}/${id}.mp3`,
      createdAt: at,
      updatedAt: at,
    })
  }
})

afterEach(async () => {
  await client.close()
  keys.forEach((key, index) => {
    if (savedKeys[index] === undefined) delete process.env[key]
    else process.env[key] = savedKeys[index]
  })
})

function script(seconds: number[]): BriefScript {
  return {
    title: "Why bread goes stale",
    hook: "Your bread is not drying out.",
    scenes: seconds.map((each, index) => ({
      words: `Scene ${index + 1} words.`,
      picture: `Scene ${index + 1} picture`,
      seconds: each,
    })),
  }
}

function request(projectId: string): BriefRequest {
  return {
    projectId,
    about: "Why bread goes stale",
    audience: "Home bakers",
    lengthSeconds: 45,
    platform: "shorts",
    voice: {
      id: "rachel",
      name: "Rachel",
      speaker: "elevenlabs",
      modelId: "eleven_multilingual_v2",
      settings: { stability: 0.5, similarityBoost: 0.75, styleExaggeration: 0, speed: 1, speakerBoost: true },
    },
    pictureModel: "gemini-3.1-flash-image",
  }
}

/** A project with footage up to 9 seconds. */
async function seedProject() {
  const project = await createOwnedProject(user.id, "Bread", database)
  const timeline: ProjectTimeline = {
    aspect: "9:16",
    tracks: [
      {
        id: "footage",
        muted: false,
        clips: [{ id: "a", kind: "video", name: "A", startMs: 0, durationMs: 9000, trimStartMs: 0 }],
      },
    ],
  }
  await writeProjectTimeline(user.id, project.id, timeline, project.version, database)
  return project
}

async function savedTimeline(projectId: string) {
  const project = await getOwnedProject(user.id, projectId, database)
  return { timeline: project.timeline as ProjectTimeline, version: project.version }
}

async function briefRow(id: string) {
  const [row] = await database.select().from(videoBriefs).where(eq(videoBriefs.id, id))
  return row
}

async function writtenBrief(seconds = [15, 15, 15]) {
  const project = await seedProject()
  writer.answers.push(script(seconds))
  const brief = await writeBrief(user.id, request(project.id))
  return { project, brief }
}

describe("writing the script", () => {
  it("keeps the storyboard with the check, and spends nothing on the scenes", async () => {
    const { brief } = await writtenBrief()
    expect(brief).toMatchObject({ status: "draft", title: "Why bread goes stale", check: PASSING_CHECK })
    expect(brief.scenes.map((scene) => [scene.words, scene.seconds, scene.state])).toEqual([
      ["Scene 1 words.", 15, "draft"],
      ["Scene 2 words.", 15, "draft"],
      ["Scene 3 words.", 15, "draft"],
    ])
    expect(pictures.calls + voices.calls).toBe(0)
    // Reopening reads the row and costs nothing.
    expect((await listBriefs(user.id, brief.project_id)).briefs.map((item) => item.id)).toEqual([brief.id])
  })

  it("asks once more when the answer comes back in the wrong shape, then fails with the reason", async () => {
    const project = await seedProject()
    writer.answers.push(new Error("Brief script came back in an unexpected shape"), script([15, 15, 15]))
    await expect(writeBrief(user.id, request(project.id))).resolves.toMatchObject({ status: "draft" })
    expect(writer.prompts).toHaveLength(2)

    writer.answers.push(
      new Error("Brief script came back in an unexpected shape"),
      new Error("Brief script came back in an unexpected shape")
    )
    await expect(writeBrief(user.id, request(project.id))).rejects.toThrow("unexpected shape")
    // A key problem is not asked again.
    writer.prompts = []
    writer.answers.push(new Error("Add a Google Gemini key in Settings first"))
    await expect(writeBrief(user.id, request(project.id))).rejects.toThrow("Gemini key")
    expect(writer.prompts).toHaveLength(1)
  })

  it("asks once more, naming the shortfall, when the scenes run more than a tenth off", async () => {
    const project = await seedProject()
    writer.answers.push(script([10, 10]), script([15, 15, 14]))
    const brief = await writeBrief(user.id, request(project.id))
    expect(writer.prompts).toHaveLength(2)
    expect(writer.prompts[1]).toContain("added up to 20 seconds, but the video must run 45 seconds")
    expect(brief.scenes).toHaveLength(3)
  })

  it("writes the rules into the prompt, with the banned words", () => {
    const prompt = briefPrompt(
      { about: "Bread", audience: "", lengthSeconds: 45, platform: "shorts" },
      ["crucial"]
    )
    expect(prompt).toContain('turn with a "but"')
    expect(prompt).toContain("about 128 words")
    expect(prompt).toContain("crucial")
    expect(prompt).toContain("never any text")
    expect(prompt).toContain("four words or fewer")
    expect(prompt).toContain("Every thirty seconds of speech")
    const long = briefPrompt({ about: "Bread", audience: "", lengthSeconds: 600, platform: "youtube" }, [])
    expect(long).not.toContain('"but"')
    expect(long).toContain("Every thirty seconds of speech")
  })
})

describe("editing the storyboard", () => {
  it("keeps edits, new scenes and removals, and refuses once making has begun", async () => {
    const { brief } = await writtenBrief()
    const [one, , three] = brief.scenes
    const saved = await saveBriefScenes(user.id, {
      briefId: brief.id,
      scenes: [
        { id: one.id, words: "New opening.", picture: one.picture, seconds: 5 },
        { id: three.id, words: three.words, picture: three.picture, seconds: three.seconds },
        { words: "Added.", picture: "A loaf", seconds: 3 },
      ],
    })
    expect(saved.scenes.map((scene) => scene.words)).toEqual(["New opening.", "Scene 3 words.", "Added."])
    expect(saved.scenes[0].id).toBe(one.id)

    await startBrief(user.id, { briefId: brief.id, scenes: saved.scenes, playheadMs: 0 })
    await expect(
      saveBriefScenes(user.id, { briefId: brief.id, scenes: saved.scenes })
    ).rejects.toThrow(BRIEF_BUSY_MESSAGE)
  })
})

describe("making it", () => {
  it("makes every scene in order and, with no editor open, lays them after the last clip", async () => {
    const { project, brief } = await writtenBrief()
    const started = await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    expect(started.landing).toEqual({ startMs: 9000, lanes: {} })
    expect(started.scenes.every((scene) => scene.state === "queued")).toBe(true)

    await briefTick()

    const row = await briefRow(brief.id)
    expect(row.status).toBe("done")
    expect(row.scenes.map((scene) => scene.state)).toEqual(["placed", "placed", "placed"])
    expect(pictures.calls).toBe(3)
    expect(voices.calls).toBe(3)
    const { timeline } = await savedTimeline(project.id)
    // The footage did not move.
    expect(timeline.tracks.find((track) => track.id === "footage")!.clips[0].startMs).toBe(0)
    const lanes = row.landing!.lanes
    const pictureLane = timeline.tracks.find((track) => track.id === lanes.pictures)!
    expect(pictureLane.clips.map((clip) => clip.startMs)).toEqual([
      9000,
      9000 + 1500 + BRIEF_BREATH_MS,
      9000 + 2 * (1500 + BRIEF_BREATH_MS),
    ])
    expect(pictureLane.clips.every((clip) => clip.origin?.tool === "brief")).toBe(true)
    const voiceLane = timeline.tracks.find((track) => track.id === lanes.voice)!
    expect(voiceLane.clips.map((clip) => clip.origin?.tool)).toEqual(["brief-voice", "brief-voice", "brief-voice"])
    // Every file is on the project's Media panel.
    expect(await database.select().from(videoProjectMedia)).toHaveLength(6)
  })

  it("stops at a failed scene: the scenes before it land, and Try again makes only what is missing", async () => {
    const { project, brief } = await writtenBrief()
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    // Scene two's picture is made, then its voice fails.
    voices.failOn = new Set([2])

    await briefTick()

    let row = await briefRow(brief.id)
    expect(row.status).toBe("stopped")
    expect(row.scenes.map((scene) => scene.state)).toEqual(["placed", "failed", "queued"])
    expect(row.scenes[1].error).toBe("Voiceover failed (HTTP 500)")
    expect(row.scenes[1].still).toBeDefined()
    expect(pictures.calls).toBe(2)
    const { timeline } = await savedTimeline(project.id)
    expect(timeline.tracks.find((track) => track.id === row.landing!.lanes.pictures)!.clips).toHaveLength(1)

    await expect(retryBriefScene(user.id, { briefId: brief.id, sceneId: row.scenes[0].id })).rejects.toThrow(
      BRIEF_NOTHING_TO_RETRY_MESSAGE
    )
    await retryBriefScene(user.id, { briefId: brief.id, sceneId: row.scenes[1].id })
    await briefTick()

    row = await briefRow(brief.id)
    expect(row.status).toBe("done")
    // Scene two's picture was not made twice.
    expect(pictures.calls).toBe(3)
    expect(voices.calls).toBe(4)
  })

  it("picks up after a worker that died mid-way, keeping what it made", async () => {
    const { brief } = await writtenBrief()
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    // A worker claimed it, made scene one's picture, and was killed.
    const row = await briefRow(brief.id)
    const stillId = uuid()
    await database.insert(customShellMedia).values({
      id: stillId,
      workspaceId,
      userId: user.id,
      filename: "one.png",
      originalName: "one.png",
      fileSize: 12,
      mimeType: "image/png",
      fileType: "image",
      storagePath: `${user.id}/one.png`,
      createdAt: now(),
      updatedAt: now(),
    })
    await database
      .update(videoBriefs)
      .set({
        leaseToken: "dead-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        scenes: row.scenes.map((scene, index) =>
          index === 0
            ? {
                ...scene,
                still: {
                  mediaId: stillId,
                  name: "one.png",
                  origin: { tool: "brief", model: "gemini-3.1-flash-image", prompt: scene.picture, aspectRatio: "9:16" },
                },
              }
            : scene
        ),
      })
      .where(eq(videoBriefs.id, brief.id))

    // While its lease runs, nobody else touches the brief.
    await briefTick()
    expect(pictures.calls + voices.calls).toBe(0)

    await database
      .update(videoBriefs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(videoBriefs.id, brief.id))
    await briefTick()

    const after = await briefRow(brief.id)
    expect(after.status).toBe("done")
    expect(after.scenes[0].still?.mediaId).toBe(stillId)
    expect(pictures.calls).toBe(2)
    expect(voices.calls).toBe(3)
  })

  it("leaves made scenes to an open editor, and only one of the two lays them", async () => {
    const { project, brief } = await writtenBrief([45])
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    await database.insert(videoEditorWindows).values({
      projectId: project.id,
      windowId: "window-1",
      mode: "edit",
      openedAt: now(),
      seenAt: now(),
    })
    const before = await savedTimeline(project.id)

    await briefTick()

    expect((await savedTimeline(project.id)).version).toBe(before.version)
    const made = await briefRow(brief.id)
    expect(made.scenes[0].state).toBe("made")

    const lanes = { words: "w", pictures: "p", voice: "v" }
    expect(
      await settleBriefScenes(user.id, { briefId: brief.id, sceneIds: [made.scenes[0].id], lanes })
    ).toEqual({ settled: true })
    expect(
      await settleBriefScenes(user.id, { briefId: brief.id, sceneIds: [made.scenes[0].id], lanes })
    ).toEqual({ settled: false })
    const settled = await briefRow(brief.id)
    expect(settled).toMatchObject({ status: "done", landing: { startMs: 9000, lanes } })

    await database.delete(videoEditorWindows)
    await briefTick()
    expect((await savedTimeline(project.id)).version).toBe(before.version)
  })

  it("makes a scene's picture again from its direction, with no actor", async () => {
    const { project, brief } = await writtenBrief([45])
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    await briefTick()
    const { timeline } = await savedTimeline(project.id)
    const picture = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.kind === "image")!

    const remade = await remakeFirstFrame(user.id, {
      projectId: project.id,
      clipId: picture.id,
      prompt: "A loaf, hands out of frame",
      model: "gemini-2.5-flash-image",
    })

    expect(remade.origin).toEqual({
      tool: "brief",
      model: "gemini-2.5-flash-image",
      prompt: "A loaf, hands out of frame",
      aspectRatio: "9:16",
    })
    expect(remade.image.id).not.toBe(picture.mediaId)
    expect(pictures.calls).toBe(2)
  })

  it("starts at the playhead on an empty timeline", async () => {
    const project = await createOwnedProject(user.id, "Empty", database)
    writer.answers.push(script([15, 15, 15]))
    const brief = await writeBrief(user.id, request(project.id))
    const started = await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 2500 })
    expect(started.landing?.startMs).toBe(2500)
  })

  it("refuses somebody else's brief", async () => {
    const { brief } = await writtenBrief()
    const other = await insertUser(database, { email: "other@example.com" })
    await expect(
      startBrief(other.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })
    ).rejects.toThrow("That brief is no longer there.")
  })
})
