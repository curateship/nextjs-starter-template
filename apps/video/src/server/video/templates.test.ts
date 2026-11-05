import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptCheck } from "@/lib/video/script-check"
import { DEFAULT_TEMPLATE_FIELDS, TEMPLATE_STARTERS, type TemplateFields } from "@/lib/video/templates"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  briefTick,
  remakeChangedScenes,
  startBrief,
  templatePicturesPrompt,
  writeTemplateBrief,
} from "@/server/video/briefs"
import { getOwnedVideo } from "@/server/video/project-videos"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoBriefs,
  videoProjectVideos,
  videoViralVideos,
} from "@/server/video/schema"
import {
  addTemplateReference,
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  saveVideoTemplateCard,
  updateTemplate,
} from "@/server/video/templates"

const writer = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[] }))
const voices = vi.hoisted(() => ({ calls: 0, texts: [] as string[], insert: null as null | ((id: string) => Promise<void>) }))
const pictures = vi.hoisted(() => ({ prompts: [] as string[] }))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
  getFromR2: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }),
}))

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

vi.mock("@/server/video/translate", () => ({
  translateLines: async ({ lines }: { lines: string[] }) => lines.map((line) => `ES ${line}`),
}))

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
vi.mock("@/server/video/asset-factories/images", () => ({
  generateImage: async ({ prompt }: { prompt: string }) => {
    pictures.prompts.push(prompt)
    return { bytes: PNG, mimeType: "image/png" }
  },
}))

vi.mock("@/server/video/voice", () => ({
  speak: async ({ text }: { text: string }) => {
    voices.calls += 1
    voices.texts.push(text)
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
  soundDurationMs: async () => 30_000,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const keys = ["CUSTOM_SHELL_GEMINI_API_KEY", "CUSTOM_SHELL_ELEVENLABS_API_KEY"] as const
const savedKeys = keys.map((key) => process.env[key])

const VOICE = {
  id: "rachel",
  name: "Rachel",
  speaker: "elevenlabs" as const,
  modelId: "eleven_multilingual_v2" as const,
  settings: { stability: 0.5, similarityBoost: 0.75, styleExaggeration: 0, speed: 1, speakerBoost: true },
}

async function insertMedia(id: string, fileType: "image" | "video" | "audio") {
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: user.id,
    filename: `${id}.bin`,
    originalName: `${id}.bin`,
    fileSize: 8,
    mimeType: fileType === "image" ? "image/png" : fileType === "video" ? "video/mp4" : "audio/mpeg",
    fileType,
    storagePath: `${user.id}/${id}.bin`,
    createdAt: at,
    updatedAt: at,
  })
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  for (const key of keys) process.env[key] = "test-key"
  writer.answers = []
  writer.prompts = []
  voices.calls = 0
  voices.texts = []
  pictures.prompts = []
  voices.insert = (id) => insertMedia(id, "audio")
})

afterEach(async () => {
  await client.close()
  keys.forEach((key, index) => {
    if (savedKeys[index] === undefined) delete process.env[key]
    else process.env[key] = savedKeys[index]
  })
})

async function newVideo() {
  const made = await createOwnedProject(user.id, "Bread", database)
  return { id: made.video, projectId: made.project.id }
}

/** A template of the person's own with these fields, picked on the video. */
async function templateOnVideo(videoId: string, fields: Partial<TemplateFields> = {}) {
  const [first] = (await listTemplates(user.id, database)).templates
  const saved = await updateTemplate(
    user.id,
    { templateId: first.id, fields: { voice: VOICE, ...fields } },
    database
  )
  await saveVideoTemplateCard(user.id, { videoId, templateId: saved.id }, database)
  return saved
}

describe("the template list", () => {
  it("makes the three starters the first time, and never again once deleted", async () => {
    const first = await listTemplates(user.id, database)
    expect(first.templates.map((one) => one.name)).toEqual(TEMPLATE_STARTERS.map((one) => one.name))
    expect(first.templates[0].fields.instructions).toContain("work-with-me")
    for (const one of first.templates) await deleteTemplate(user.id, one.id, database)
    expect((await listTemplates(user.id, database)).templates).toEqual([])
  })

  it("saves a change field by field, pins to the top, and duplicates every field", async () => {
    const [, second] = (await listTemplates(user.id, database)).templates
    const saved = await updateTemplate(
      user.id,
      { templateId: second.id, name: "Mornings", fields: { lengthSeconds: 90 }, tags: ["Series", " series ", "Ads"], pinned: true },
      database
    )
    expect(saved).toMatchObject({ name: "Mornings", tags: ["Series", "Ads"], pinned: true })
    expect(saved.fields.lengthSeconds).toBe(90)
    expect(saved.fields.instructions).toBe(second.fields.instructions)
    expect((await listTemplates(user.id, database)).templates[0].id).toBe(second.id)

    const copy = await duplicateTemplate(user.id, second.id, database)
    expect(copy).toMatchObject({ name: "Copy of Mornings", pinned: false, tags: ["Series", "Ads"] })
    expect(copy.fields).toEqual(saved.fields)
  })

  it("queues a video reference for its breakdown, and refuses a file of the wrong kind", async () => {
    const [one] = (await listTemplates(user.id, database)).templates
    await insertMedia("picture-1", "image")
    await insertMedia("clip-1", "video")
    const withPicture = await addTemplateReference(user.id, { templateId: one.id, kind: "picture", mediaId: "picture-1" }, database)
    expect(withPicture.references[0]).toMatchObject({ kind: "picture", state: "ready" })
    expect(withPicture.references[0].savedVideoId).toBeUndefined()
    expect(withPicture.cover_url).toBe(`https://media.test/${user.id}/picture-1.bin`)

    const withVideo = await addTemplateReference(user.id, { templateId: one.id, kind: "video", mediaId: "clip-1" }, database)
    const ref = withVideo.references[1]
    expect(ref).toMatchObject({ kind: "video", state: "working" })
    const [saved] = await database.select().from(videoViralVideos).where(eq(videoViralVideos.id, ref.savedVideoId!))
    expect(saved).toMatchObject({ status: "waiting", mediaId: "clip-1", wantsAnalysis: true })

    await expect(
      addTemplateReference(user.id, { templateId: one.id, kind: "picture", mediaId: "clip-1" }, database)
    ).rejects.toThrow("can't be a reference of this kind")
  })
})

describe("a video's own copy of its template", () => {
  it("copies the template's settings when picked; the video's changes and later template edits stay apart", async () => {
    const video = await newVideo()
    const [first, second] = (await listTemplates(user.id, database)).templates
    const picked = await saveVideoTemplateCard(user.id, { videoId: video.id, templateId: first.id }, database)
    expect(picked.changes).toMatchObject({ lengthSeconds: first.fields.lengthSeconds, pace: first.fields.pace })

    // A change in the video's settings window is the video's only.
    const changed = await saveVideoTemplateCard(user.id, { videoId: video.id, changes: { lengthSeconds: 90 } }, database)
    expect(changed.changes.lengthSeconds).toBe(90)
    expect((await listTemplates(user.id, database)).templates.find((one) => one.id === first.id)?.fields.lengthSeconds).toBe(
      first.fields.lengthSeconds
    )

    // Editing the template afterwards never reaches the video.
    await updateTemplate(user.id, { templateId: first.id, fields: { audience: "Changed later" } }, database)
    const after = await saveVideoTemplateCard(user.id, { videoId: video.id, script: "Hello." }, database)
    expect(after.changes.audience).toBe(first.fields.audience)

    // Picking another template replaces the copy, the video's change included.
    const repicked = await saveVideoTemplateCard(user.id, { videoId: video.id, templateId: second.id }, database)
    expect(repicked.changes.lengthSeconds).toBe(second.fields.lengthSeconds)
  })
})

describe("a video's own settings are checked like a template's", () => {
  it("refuses another person's file as the intro, and never takes references from the browser", async () => {
    const video = await newVideo()
    await templateOnVideo(video.id)
    const other = await insertUser(database, { email: "someone-else@example.com" })
    const at = now()
    await database.insert(customShellMedia).values({
      id: "theirs",
      workspaceId,
      userId: other.id,
      filename: "theirs.mp4",
      originalName: "theirs.mp4",
      fileSize: 8,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${other.id}/theirs.mp4`,
      createdAt: at,
      updatedAt: at,
    })
    await expect(
      saveVideoTemplateCard(user.id, { videoId: video.id, changes: { introMediaId: "theirs" } }, database)
    ).rejects.toThrow()
    const saved = await saveVideoTemplateCard(
      user.id,
      { videoId: video.id, changes: { references: [{ id: "r1", kind: "picture", name: "x", mediaId: "theirs" }] } },
      database
    )
    expect(saved.changes.references).toEqual([])
  })
})

describe("Brief to video from a template", () => {
  it("keeps every word of a pasted script, uses its own breaks and notes, and asks only for pictures", async () => {
    const video = await newVideo()
    await templateOnVideo(video.id, { actorId: null })
    writer.answers.push({
      title: "Bread that lasts",
      scenes: [{ picture: "A loaf on a board" }, { picture: "ignored, the note wins" }],
    })
    const brief = await writeTemplateBrief(user.id, {
      videoId: video.id,
      text: "Your bread isn't dry. It's the starch.\n\n[show: bread in a tin] Here's the fix.",
    })
    expect(brief.scenes.map((scene) => [scene.words, scene.picture])).toEqual([
      ["Your bread isn't dry. It's the starch.", "A loaf on a board"],
      ["Here's the fix.", "bread in a tin"],
    ])
    expect(brief).toMatchObject({ title: "Bread that lasts", hook: "Your bread isn't dry.", template_id: expect.any(String) })
    expect(brief.template?.name).toBe("Work with me")
    expect(brief.source).toEqual({ kind: "script", text: expect.stringContaining("Here's the fix.") })
    expect(writer.prompts[0]).toContain("Do not change, add or drop any words")
    expect(writer.prompts[0]).toContain("A calm work-with-me video")
    expect(writer.prompts[0]).toContain('(picture already chosen: "bread in a tin")')
  })

  it("refuses Make it past the template's cap, and puts the template's intro and outro on the video", async () => {
    const video = await newVideo()
    await insertMedia("intro-1", "video")
    await templateOnVideo(video.id, { spendCapCents: 1 })
    writer.answers.push({ title: "T", scenes: [{ picture: "P" }] })
    const brief = await writeTemplateBrief(user.id, { videoId: video.id, text: "One short line." })
    await expect(startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })).rejects.toThrow(
      "This template's cap is $0.01 a video"
    )

    // The video's own settings, which are what its briefs are made with.
    await saveVideoTemplateCard(
      user.id,
      { videoId: video.id, changes: { spendCapCents: null, introMediaId: "intro-1" } },
      database
    )
    writer.answers.push({ title: "T", scenes: [{ picture: "P" }] })
    const again = await writeTemplateBrief(user.id, { videoId: video.id, text: "One short line." })
    await startBrief(user.id, { briefId: again.id, scenes: again.scenes, playheadMs: 0 })
    const row = await getOwnedVideo(user.id, video.id, database)
    expect(row.introMediaId).toBe("intro-1")
  })

  it("once made: stays Draft, starts the language copy, rings the bell, and redoes only a changed scene", async () => {
    const video = await newVideo()
    await templateOnVideo(video.id, { languages: ["Spanish"], captions: { on: false, look: null } })
    writer.answers.push({ title: "Bread", scenes: [{ picture: "P1" }, { picture: "P2" }] })
    const brief = await writeTemplateBrief(user.id, {
      videoId: video.id,
      text: "First line here.\n\nSecond line here.",
    })
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })

    await briefTick()

    const [made] = await database.select().from(videoBriefs).where(eq(videoBriefs.id, brief.id))
    expect(made.status).toBe("done")
    expect(made.finish).toMatchObject({ state: "done", languages: [{ language: "Spanish" }] })
    // A generated video stays Draft (Tyler, 5 Nov 2026).
    expect((await getOwnedVideo(user.id, video.id, database)).status).toBe("draft")
    // Captions off: nothing written on the timeline.
    const timeline = (await getOwnedVideo(user.id, video.id, database)).timeline as { tracks: { clips: { kind: string }[] }[] }
    expect(timeline.tracks.flatMap((track) => track.clips).some((clip) => clip.kind === "text")).toBe(false)
    const bells = await database.select().from(customShellNotifications)
    expect(bells.map((bell) => bell.message)).toContain("Bread is made")

    const copyId = (made.finish as { languages: { videoId: string }[] }).languages[0].videoId
    const [copy] = await database.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, copyId))
    expect(copy).toMatchObject({ name: "Bread (Spanish)", language: "Spanish", languageOf: video.id })
    const [copyBrief] = await database.select().from(videoBriefs).where(eq(videoBriefs.videoId, copyId))
    expect(copyBrief.scenes.map((scene) => scene.words)).toEqual(["ES First line here.", "ES Second line here."])
    // The copy reuses the pictures and asks for no copies of its own.
    expect(copyBrief.scenes.map((scene) => scene.still?.mediaId)).toEqual(made.scenes.map((scene) => scene.still?.mediaId))
    expect((copyBrief.template as { fields: TemplateFields }).fields.languages).toEqual([])

    voices.texts = []
    const redone = await remakeChangedScenes(user.id, {
      briefId: brief.id,
      scenes: [
        { id: made.scenes[0].id, words: made.scenes[0].words },
        { id: made.scenes[1].id, words: "A better second line." },
      ],
    })
    expect(voices.texts).toEqual(["A better second line."])
    expect(redone.changed.map((one) => [one.oldVoiceMediaId, one.stillMediaId])).toEqual([
      [made.scenes[1].voice!.mediaId, made.scenes[1].still!.mediaId],
    ])
    expect(redone.brief.scenes[1].words).toBe("A better second line.")
  })

  it("lays the template's music track under the whole video with the last scene", async () => {
    const video = await newVideo()
    await insertMedia("song-1", "audio")
    await templateOnVideo(video.id, { music: { kind: "track", mediaId: "song-1", name: "Song" } })
    writer.answers.push({ title: "Bread", scenes: [{ picture: "P1" }, { picture: "P2" }] })
    const brief = await writeTemplateBrief(user.id, { videoId: video.id, text: "One.\n\nTwo." })
    await startBrief(user.id, { briefId: brief.id, scenes: brief.scenes, playheadMs: 0 })

    await briefTick()

    const [made] = await database.select().from(videoBriefs).where(eq(videoBriefs.id, brief.id))
    expect(made.landing?.music).toMatchObject({ mediaId: "song-1", durationMs: 30_000, laid: true })
    const timeline = (await getOwnedVideo(user.id, video.id, database)).timeline as {
      tracks: { id: string; duck?: boolean; clips: { mediaId?: string; startMs: number; durationMs: number }[] }[]
    }
    const music = timeline.tracks.find((track) => track.id === made.landing?.music?.lane)
    // Two readings of 1.5 seconds, each with its 0.2-second breath.
    expect(music).toMatchObject({ duck: true, clips: [{ mediaId: "song-1", startMs: 0, durationMs: 3400 }] })
  })

  it("sends the video's own rewritten Script template, with the scenes in place and the answer's format added", async () => {
    const video = await newVideo()
    await templateOnVideo(video.id)
    await saveVideoTemplateCard(
      user.id,
      { videoId: video.id, changes: { scriptPrompt: "Draw cats only.\n\nScenes:\n{{scenes}}\n\nKeep it cosy." } },
      database
    )
    writer.answers.push({ title: "Cats", scenes: [{ picture: "A cat" }] })
    await writeTemplateBrief(user.id, { videoId: video.id, text: "One short line." })
    const sent = writer.prompts[0]
    expect(sent.startsWith('Draw cats only.\n\nScenes:\n1. "One short line."\n\nKeep it cosy.')).toBe(true)
    expect(sent).toContain("Answer with JSON only")
    expect(sent).not.toContain("Write the picture directions")
  })

  it("asks once more when the answer comes back garbled, and not after a missing key", async () => {
    const video = await newVideo()
    await templateOnVideo(video.id)
    writer.answers.push(new Error("Brief script came back in an unexpected shape"), { title: "T", scenes: [{ picture: "P" }] })
    await expect(writeTemplateBrief(user.id, { videoId: video.id, text: "One short line." })).resolves.toMatchObject({
      status: "draft",
    })
    expect(writer.prompts).toHaveLength(2)

    writer.prompts = []
    writer.answers.push(new Error("Add a Google Gemini key in Settings first"))
    await expect(writeTemplateBrief(user.id, { videoId: video.id, text: "One short line." })).rejects.toThrow("Gemini key")
    expect(writer.prompts).toHaveLength(1)
  })

  it("writes the person's own picture notes into what the AI reads", () => {
    const prompt = templatePicturesPrompt(
      { name: "Tips", fields: { ...DEFAULT_TEMPLATE_FIELDS, instructions: "Number every tip." } },
      [{ words: "Tip one.", picture: "a ruler" }],
      ""
    )
    expect(prompt).toContain("Number every tip.")
    expect(prompt).toContain('"Tip one." (picture already chosen: "a ruler")')
  })
})
