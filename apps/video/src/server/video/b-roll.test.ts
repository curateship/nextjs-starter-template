import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BROLL_DOWNLOAD_FAILED_MESSAGE,
  BROLL_NO_KEY_MESSAGE,
  BROLL_NO_VOICE_MESSAGE,
  BROLL_PHRASES_FAILED_MESSAGE,
  type BrollSentence,
} from "@/lib/video/b-roll"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  askBrollPhrases,
  brollStatus,
  saveBrollPicks,
  suggestBroll,
  voiceLineWords,
  type BrollPick,
} from "@/server/video/b-roll"
import { forgetPexelsRequests, searchPexelsRows } from "@/server/video/pexels"
import { createOwnedProject, getOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import { videoVoiceovers } from "@/server/video/schema"
import { removePexelsApiKey, savePexelsApiKey } from "@/server/video/settings"
import type { askWriter } from "@/server/video/writer"

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const savedSecret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-secret"
  forgetPexelsRequests()
})

afterEach(async () => {
  await client.close()
  if (savedSecret === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = savedSecret
})

/** A fake writer that hands back the queued answers in turn and keeps the prompts. */
function fakeWriter(...answers: { subject: string; phrases: string[] }[]) {
  const prompts: string[] = []
  const features: string[] = []
  const ask = (async ({ prompt, feature }: { prompt: string; feature: string }) => {
    prompts.push(prompt)
    features.push(feature)
    return answers.shift()
  }) as unknown as typeof askWriter
  return { ask, prompts, features }
}

const sentence = (index: number): BrollSentence => ({
  id: `s${index + 1}`,
  text: `Sentence ${index + 1}.`,
  startMs: index * 2000,
  endMs: index * 2000 + 1800,
})

describe("one phrase per sentence", () => {
  it("comes from one writer call for all the sentences, metered as broll_phrases", async () => {
    const writer = fakeWriter({ subject: "bread", phrases: ["stale bread", "oven", "starch close up"] })
    const answer = await askBrollPhrases(user.id, "p1", "Bread", [0, 1, 2].map(sentence), writer.ask)
    expect(answer.phrases).toEqual(["stale bread", "oven", "starch close up"])
    expect(writer.prompts).toHaveLength(1)
    expect(writer.features).toEqual(["broll_phrases"])
    expect(writer.prompts[0]).toContain("3. Sentence 3.")
    expect(writer.prompts[0]).toContain("never a person's face")
  })

  it("is cut to three words, and an empty one becomes the video's subject", async () => {
    const writer = fakeWriter({ subject: "Sourdough bread.", phrases: ["a loaf of bread on a table", "  "] })
    const answer = await askBrollPhrases(user.id, "p1", "Bread", [0, 1].map(sentence), writer.ask)
    expect(answer.phrases).toEqual(["a loaf of", "Sourdough bread"])
    for (const phrase of answer.phrases) {
      expect(phrase.split(" ").length).toBeGreaterThanOrEqual(1)
      expect(phrase.split(" ").length).toBeLessThanOrEqual(3)
    }
  })

  it("is asked for again once when the count is wrong, naming the miss", async () => {
    const writer = fakeWriter(
      { subject: "bread", phrases: ["oven"] },
      { subject: "bread", phrases: ["oven", "flour"] }
    )
    const answer = await askBrollPhrases(user.id, "p1", "Bread", [0, 1].map(sentence), writer.ask)
    expect(answer.phrases).toEqual(["oven", "flour"])
    expect(writer.prompts[1]).toContain("Your last answer had 1 phrases for 2 sentences")
  })

  it("fails plainly when the second answer is still the wrong count", async () => {
    const writer = fakeWriter(
      { subject: "bread", phrases: ["oven"] },
      { subject: "bread", phrases: ["oven", "flour", "salt"] }
    )
    await expect(
      askBrollPhrases(user.id, "p1", "Bread", [0, 1].map(sentence), writer.ask)
    ).rejects.toThrow(BROLL_PHRASES_FAILED_MESSAGE)
  })
})

describe("the voice line's words on the timeline", () => {
  it("take only the stretch a trimmed clip plays, at its own speed", () => {
    const words = [
      { text: "cut", startMs: 0, endMs: 500 },
      { text: "kept", startMs: 2000, endMs: 2500 },
      { text: "also", startMs: 2600, endMs: 2900 },
      { text: "past", startMs: 3200, endMs: 3600 },
    ]
    const clip = {
      id: "v",
      kind: "audio" as const,
      name: "Voice",
      mediaId: "voice",
      startMs: 10_000,
      durationMs: 1000,
      trimStartMs: 1000,
      speed: 2,
    }
    expect(voiceLineWords([clip], new Map([["voice", words]]))).toEqual([
      { text: "kept", startMs: 10_500, endMs: 10_750 },
      { text: "also", startMs: 10_800, endMs: 10_950 },
    ])
  })
})

/** A voiceover in the library with its kept captions: three sentences, two seconds each. */
async function seedVoiceover(mediaId = "voice-1") {
  const at = now()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp3`,
    originalName: `${mediaId}.mp3`,
    fileSize: 8,
    mimeType: "audio/mpeg",
    fileType: "audio",
    storagePath: `${user.id}/${mediaId}.mp3`,
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(videoVoiceovers).values({
    mediaId,
    script: "Bread goes stale fast. Starch dries out overnight. Toast brings it back.",
    voiceId: "rachel",
    voiceName: "Rachel",
    durationMs: 6000,
    captions: [
      { startMs: 0, endMs: 2000, text: "Bread goes stale fast." },
      { startMs: 2000, endMs: 4000, text: "Starch dries out overnight." },
      { startMs: 4000, endMs: 6000, text: "Toast brings it back." },
    ],
    createdAt: at,
  })
}

/** A project whose voice line is that voiceover, laid at 1 second. */
async function seedProject(tracks?: ProjectTimeline["tracks"]) {
  const project = await createOwnedProject(user.id, "Bread", database)
  const timeline: ProjectTimeline = {
    aspect: "9:16",
    tracks: tracks ?? [
      {
        id: "voice",
        muted: false,
        clips: [
          { id: "v1", kind: "audio", name: "Voice", mediaId: "voice-1", startMs: 1000, durationMs: 6000, trimStartMs: 0, sourceDurationMs: 6000 },
        ],
      },
    ],
  }
  const current = await getOwnedProject(user.id, project.id, database)
  await writeProjectTimeline(user.id, project.id, timeline, current.version, database)
  return project.id
}

/** Pexels answering every search with five clips, counting the requests. */
function countingSearch() {
  let requests = 0
  const fetchImpl = (async (input: URL | string) => {
    requests += 1
    const id = requests
    return Response.json({
      videos: [1, 2, 3, 4, 5].map((n) => ({
        id: id * 10 + n,
        url: `https://www.pexels.com/video/${id * 10 + n}/`,
        image: `https://images.pexels.com/videos/${id * 10 + n}/a.jpg`,
        duration: n * 2,
        width: 1080,
        height: 1920,
        user: { name: "Jane Doe", url: "https://www.pexels.com/@jane" },
        video_files: [
          { link: `https://videos.pexels.com/video-files/${id * 10 + n}/hd.mp4`, width: 720, height: 1280, file_type: "video/mp4" },
        ],
      })),
      query: new URL(String(input)).searchParams.get("query"),
    })
  }) as typeof fetch
  const search: typeof searchPexelsRows = (args) => searchPexelsRows({ ...args, fetchImpl })
  return { search, requests: () => requests }
}

describe("Find B-roll", () => {
  it("says it needs a Pexels key when none is saved", async () => {
    await seedVoiceover()
    const projectId = await seedProject()
    expect((await brollStatus(user.id, projectId)).hasKey).toBe(false)
    await expect(suggestBroll(user.id, projectId)).rejects.toThrow(BROLL_NO_KEY_MESSAGE)
  })

  it("says there is no voice line when nothing on the timeline has sound", async () => {
    await savePexelsApiKey("pexels-key", database)
    const projectId = await seedProject([])
    expect(await brollStatus(user.id, projectId)).toEqual({ hasKey: true, voice: null })
    await expect(suggestBroll(user.id, projectId)).rejects.toThrow(BROLL_NO_VOICE_MESSAGE)
  })

  it("cuts a voiceover into its sentences, names a phrase for each and costs one search per sentence", async () => {
    await savePexelsApiKey("pexels-key", database)
    await seedVoiceover()
    const projectId = await seedProject()
    // The voiceover's words are kept, so nothing has to be written down first.
    expect((await brollStatus(user.id, projectId)).voice).toEqual({ talkMs: 6000, toWriteDownMs: 0 })

    const pexels = countingSearch()
    const writer = fakeWriter({ subject: "bread", phrases: ["stale bread", "dry crumb", "toaster"] })
    const found = await suggestBroll(user.id, projectId, pexels.search, writer.ask)

    expect(pexels.requests()).toBe(3)
    expect(found.aspect).toBe("9:16")
    expect(found.stopped).toBeNull()
    expect(found.rows.map(({ text, startMs, endMs, phrase }) => ({ text, startMs, endMs, phrase }))).toEqual([
      // Laid at 1 second, so each sentence is a second later than in the file.
      { text: "Bread goes stale fast.", startMs: 1000, endMs: 3000, phrase: "stale bread" },
      { text: "Starch dries out overnight.", startMs: 3000, endMs: 5000, phrase: "dry crumb" },
      { text: "Toast brings it back.", startMs: 5000, endMs: 7000, phrase: "toaster" },
    ])
    expect(found.rows.every((row) => row.candidates?.length === 4)).toBe(true)
    // Nothing was downloaded: the library holds only the voiceover.
    expect(await database.select().from(customShellMedia)).toHaveLength(1)
  })

  it("refuses another person's project", async () => {
    await savePexelsApiKey("pexels-key", database)
    const stranger = await insertUser(database, { email: "stranger@example.test" })
    await seedVoiceover()
    const projectId = await seedProject()
    await expect(brollStatus(stranger.id, projectId)).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
    await expect(suggestBroll(stranger.id, projectId)).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("asks for a key again once the saved one is removed", async () => {
    await savePexelsApiKey("pexels-key", database)
    await removePexelsApiKey(database)
    const projectId = await seedProject([])
    expect((await brollStatus(user.id, projectId)).hasKey).toBe(false)
  })
})

describe("Place", () => {
  const pick = (startMs: number, id: number): BrollPick => ({
    startMs,
    endMs: startMs + 2000,
    phrase: "stale bread",
    candidate: {
      pexelsId: id,
      pageUrl: `https://www.pexels.com/video/${id}/`,
      photographer: "Jane Doe",
      photographerUrl: "https://www.pexels.com/@jane",
      fileUrl: `https://videos.pexels.com/video-files/${id}/hd.mp4`,
      durationMs: 6000,
    },
  })
  // A tiny MP4 header is enough for the library's own checks.
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50])

  it("saves each ticked clip to the library with the Pexels credit as its alt text", async () => {
    const projectId = await seedProject([])
    const placements = await saveBrollPicks(
      user.id,
      { projectId, picks: [pick(1000, 11), pick(3000, 12)] },
      async () => mp4
    )
    expect(placements.map(({ startMs, endMs, sourceDurationMs }) => ({ startMs, endMs, sourceDurationMs }))).toEqual([
      { startMs: 1000, endMs: 3000, sourceDurationMs: 6000 },
      { startMs: 3000, endMs: 5000, sourceDurationMs: 6000 },
    ])
    const [row] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, placements[0].mediaId))
    expect(row.fileType).toBe("video")
    expect(row.altText).toBe(
      "Video by Jane Doe on Pexels: https://www.pexels.com/video/11/ (photographer: https://www.pexels.com/@jane)"
    )
  })

  it("keeps nothing when one download fails, so Place can be pressed again", async () => {
    const projectId = await seedProject([])
    await expect(
      saveBrollPicks(
        user.id,
        { projectId, picks: [pick(1000, 11), pick(3000, 12), pick(5000, 13)] },
        async (address) => {
          if (address.includes("/12/")) throw new Error("HTTP 500")
          return mp4
        }
      )
    ).rejects.toThrow(BROLL_DOWNLOAD_FAILED_MESSAGE)
    expect(await database.select().from(customShellMedia)).toHaveLength(0)
  })
})
