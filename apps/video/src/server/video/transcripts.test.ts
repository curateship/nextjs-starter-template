import { writeFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FileWord } from "@/lib/video/transcripts"

/**
 * Transcribing a file once, checked against a real database with every
 * provider stubbed. Nothing here spends AI money or touches storage: ffmpeg
 * writes WAV headers that only say how long the sound is and where its piece
 * starts, and the stub transcriber answers from a fake talk with one word
 * every 400 milliseconds.
 */

const keys = vi.hoisted(() => ({
  openai: "openai-key" as string | null,
  gemini: "gemini-key" as string | null,
}))
const choice = vi.hoisted(() => ({ transcriber: "openai" as string | undefined }))
const file = vi.hoisted(() => ({ soundMs: 60_000 }))
const metered = vi.hoisted(
  () =>
    [] as {
      provider: string
      feature: string
      units?: number
      inputTokens: number
    }[]
)
const sent = vi.hoisted(() => [] as { provider: string; startMs: number; durationMs: number }[])

vi.mock("@/server/ai/keys", () => ({
  getAiKey: async (provider: "openai" | "gemini" | "anthropic") =>
    provider === "anthropic" ? null : keys[provider],
}))
vi.mock("@/server/video/settings", () => ({
  getAiDefaults: async () => ({ transcriber: choice.transcriber }),
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (
    context: { provider: string; feature: string },
    call: () => Promise<{
      result: unknown
      usage: { inputTokens: number; units?: number }
    }>
  ) => {
    const { result, usage } = await call()
    metered.push({
      provider: context.provider,
      feature: context.feature,
      units: usage.units,
      inputTokens: usage.inputTokens,
    })
    return result
  },
}))
vi.mock("@/server/video/storage-files", () => ({
  downloadToFile: async (_storagePath: string, target: string) => {
    await writeFile(target, "not really a video")
  },
}))

/** A WAV header saying how long the sound is and where in the file it starts. */
function fakeWav(durationMs: number, startMs: number) {
  const start = Buffer.alloc(16)
  start.write("strt", 0, "ascii")
  start.writeUInt32LE(8, 4)
  start.writeDoubleLE(startMs, 8)
  const data = Buffer.alloc(8)
  data.write("data", 0, "ascii")
  data.writeUInt32LE(Math.round((durationMs / 1000) * 32_000), 4)
  const head = Buffer.alloc(12)
  head.write("RIFF", 0, "ascii")
  head.write("WAVE", 8, "ascii")
  return Buffer.concat([head, start, data])
}

function readFakeWav(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  return {
    startMs: buffer.readDoubleLE(20),
    durationMs: Math.round((buffer.readUInt32LE(32) / 32_000) * 1000),
  }
}

vi.mock("@/server/video/ffmpeg", () => ({
  runFfmpeg: async (args: string[]) => {
    if (args.some((arg) => arg.startsWith("silencedetect"))) return ""
    const out = args.at(-1)!
    const at = args.indexOf("-ss")
    if (at >= 0 && args[args.indexOf("-i") + 1].endsWith("sound.wav")) {
      // A piece cut out of the whole file's sound.
      const startMs = Number(args[at + 1]) * 1000
      const durationMs = Number(args[args.indexOf("-t") + 1]) * 1000
      await writeFile(out, fakeWav(durationMs, startMs))
    } else if (at >= 0) {
      // A clip's own stretch, for listening for the quiet.
      await writeFile(out, fakeWav(Number(args[args.indexOf("-t") + 1]) * 1000, 0))
    } else {
      await writeFile(out, fakeWav(file.soundMs, 0))
    }
    return ""
  },
}))

/** Everything said in the fake file, one word every 400 milliseconds. */
function talk(durationMs: number): FileWord[] {
  const words: FileWord[] = []
  for (let at = 0; at + 300 <= durationMs; at += 400) {
    words.push({ text: `w${at / 400}`, startMs: at, endMs: at + 300 })
  }
  return words
}

/** What a transcriber hears of one piece, timed from the piece's start. */
function heard(bytes: Uint8Array) {
  const piece = readFakeWav(bytes)
  const endMs = piece.startMs + piece.durationMs
  return {
    piece,
    words: talk(file.soundMs)
      .filter((word) => word.startMs >= piece.startMs && word.endMs <= endMs)
      .map((word) => ({
        text: word.text,
        startMs: word.startMs - piece.startMs,
        endMs: word.endMs - piece.startMs,
      })),
  }
}

vi.mock("@/server/video/whisper", () => ({
  requireOpenAiKey: async () => "openai-key",
  transcribeWithWhisper: async ({ audio }: { audio: Uint8Array }) => {
    const { piece, words } = heard(audio)
    sent.push({ provider: "openai", ...piece })
    return { text: "", words }
  },
}))
vi.mock("@/server/video/gemini", () => ({
  requireGeminiKey: async () => "gemini-key",
  withGeminiFile: async (
    bytes: Uint8Array,
    _mime: string,
    _key: string,
    _label: string,
    run: (part: unknown) => Promise<unknown>
  ) => run(bytes),
  generateJson: async ({ parts }: { parts: unknown[] }) => {
    const { piece, words } = heard(parts[0] as Uint8Array)
    sent.push({ provider: "gemini", ...piece })
    return { value: { words }, inputTokens: 100, outputTokens: 50 }
  },
}))

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { writeProjectCaptions } from "@/server/video/captions"
import {
  analyseJumpCuts,
  transcribeClip,
  transcribeOpening,
} from "@/server/video/jump-cuts"
import { videoMediaTranscripts, videoProjects } from "@/server/video/schema"
import {
  listSavedTranscripts,
  readSavedTranscript,
  wavDataDurationMs,
} from "@/server/video/transcripts"

const MINUTE = 60_000

let client: PGlite
let database: CustomShellDb
let userId: string
let otherUserId: string
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  userId = (await insertUser(database)).id
  otherUserId = (await insertUser(database)).id
  workspaceId = (await insertWorkspace(database, { userId })).id
  keys.openai = "openai-key"
  keys.gemini = "gemini-key"
  choice.transcriber = "openai"
  file.soundMs = MINUTE
  metered.length = 0
  sent.length = 0
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

async function insertMedia(owner = userId) {
  const id = uuid()
  const at = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: owner,
    filename: "talk.mp4",
    originalName: "talk.mp4",
    fileSize: 1000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${owner}/${id}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

/** A project of one clip of `mediaId`, starting `startMs` along the timeline. */
async function insertProject(
  mediaId: string,
  clip: { startMs?: number; durationMs: number; trimStartMs?: number }
) {
  const id = uuid()
  const at = now()
  await database.insert(videoProjects).values({
    id,
    userId,
    name: "Talk",
    aspect: "9:16",
    timeline: {
      aspect: "9:16",
      tracks: [
        {
          id: "track-1",
          muted: false,
          clips: [
            {
              id: "clip-1",
              kind: "video",
              name: "talk.mp4",
              mediaId,
              startMs: clip.startMs ?? 0,
              durationMs: clip.durationMs,
              trimStartMs: clip.trimStartMs ?? 0,
            },
          ],
        },
      ],
    },
    createdAt: at,
    updatedAt: at,
  })
  return id
}

describe("transcribing a file once", () => {
  it("opens the Words panel twice on one clip for one meter row, and Captions after it for none", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })

    const first = await transcribeClip({ userId, projectId, clipId: "clip-1" })
    const second = await transcribeClip({ userId, projectId, clipId: "clip-1" })
    expect(metered).toHaveLength(1)
    expect(metered[0]).toMatchObject({ provider: "openai", feature: "jump_cut_analysis" })
    expect(second.words).toEqual(first.words)
    expect(first.words).toHaveLength(talk(MINUTE).length)

    const captions = await writeProjectCaptions(userId, projectId)
    expect(metered).toHaveLength(1)
    expect(captions.captions.length).toBeGreaterThan(0)
  })

  it("lets Tighten's filler words read the same saved words", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await writeProjectCaptions(userId, projectId)
    await analyseJumpCuts({
      userId,
      projectId,
      clipId: "clip-1",
      mode: "filler",
      sensitivity: "balanced",
      fillerTerms: ["um"],
    })
    expect(metered).toHaveLength(1)
    expect(metered[0].feature).toBe("caption_generation")
  })

  it("pays again only for Transcribe again, and replaces the saved words", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await transcribeClip({ userId, projectId, clipId: "clip-1" })
    await transcribeClip({ userId, projectId, clipId: "clip-1", fresh: true })
    expect(metered).toHaveLength(2)
    const rows = await database
      .select()
      .from(videoMediaTranscripts)
      .where(eq(videoMediaTranscripts.mediaId, mediaId))
    expect(rows).toHaveLength(1)
  })

  it("places the panel's words along the timeline for a clip that starts later and is trimmed", async () => {
    const mediaId = await insertMedia()
    // The clip shows the file from 10s to 20s, starting 5s along the timeline.
    const projectId = await insertProject(mediaId, {
      startMs: 5_000,
      trimStartMs: 10_000,
      durationMs: 10_000,
    })
    const { words } = await transcribeClip({ userId, projectId, clipId: "clip-1" })
    // The file's word at 10,000ms is the first the clip plays, 5s along.
    expect(words[0]).toEqual({ text: "w25", startMs: 5_000, endMs: 5_300 })
    expect(words.at(-1)!.endMs).toBeLessThanOrEqual(15_000)
  })
})

describe("long recordings", () => {
  it("captions a 25-minute talk all the way through as one press on the meter", async () => {
    file.soundMs = 25 * MINUTE
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: 25 * MINUTE })

    const { captions } = await writeProjectCaptions(userId, projectId)

    // Three pieces of about 8 minutes 20, sent as one charge.
    expect(sent).toHaveLength(3)
    expect(metered).toHaveLength(1)
    expect(metered[0].units).toBeCloseTo(25 + 10 / 60)

    // Every word once, so no gap and no doubled line at the seams.
    const [saved] = await database
      .select()
      .from(videoMediaTranscripts)
      .where(eq(videoMediaTranscripts.mediaId, mediaId))
    const words = saved.words as FileWord[]
    expect(words.map((word) => word.text)).toEqual(
      talk(25 * MINUTE).map((word) => word.text)
    )
    expect(saved.durationMs).toBe(25 * MINUTE)

    // The captions run to the end, and never overlap one another.
    expect(captions.at(-1)!.endMs).toBeGreaterThan(25 * MINUTE - 2_000)
    for (let index = 1; index < captions.length; index += 1) {
      expect(captions[index].startMs).toBeGreaterThanOrEqual(
        captions[index - 1].endMs
      )
    }
    const text = captions.map((line) => line.text).join(" ").split(" ")
    expect(new Set(text).size).toBe(text.length)
  })

  it("sends Gemini the same pieces and adds up its tokens", async () => {
    choice.transcriber = "gemini"
    file.soundMs = 21 * MINUTE
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: 21 * MINUTE })
    await writeProjectCaptions(userId, projectId)
    expect(sent.map((one) => one.provider)).toEqual(["gemini", "gemini", "gemini"])
    expect(metered).toEqual([
      expect.objectContaining({ provider: "gemini", inputTokens: 300 }),
    ])
  })

  it("refuses a recording over 30 minutes before anything is sent", async () => {
    file.soundMs = 31 * MINUTE
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: 5 * MINUTE })
    await expect(writeProjectCaptions(userId, projectId)).rejects.toThrow(
      "Captioning covers up to 30 minutes"
    )
    expect(sent).toHaveLength(0)
    expect(metered).toHaveLength(0)
  })
})

describe("which saved words answer which run", () => {
  it("never lets Gemini's estimated words answer a Whisper run", async () => {
    choice.transcriber = "gemini"
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await writeProjectCaptions(userId, projectId)
    choice.transcriber = "openai"
    await writeProjectCaptions(userId, projectId)
    expect(metered.map((one) => one.provider)).toEqual(["gemini", "openai"])
  })

  it("lets Whisper's measured words answer a Gemini run", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await writeProjectCaptions(userId, projectId)
    choice.transcriber = "gemini"
    await writeProjectCaptions(userId, projectId)
    expect(metered.map((one) => one.provider)).toEqual(["openai"])
  })

  it("shows a file's saved words only to whoever owns the file", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await writeProjectCaptions(userId, projectId)
    expect(await listSavedTranscripts(userId, [mediaId])).toEqual([
      { mediaId, transcriber: "openai", durationMs: MINUTE },
    ])
    expect(await listSavedTranscripts(otherUserId, [mediaId])).toEqual([])
    expect(await readSavedTranscript(otherUserId, mediaId, "openai")).toBeNull()
  })

  it("never reads somebody else's saved words through a timeline that names their file", async () => {
    const theirs = await insertMedia(otherUserId)
    await database.insert(videoMediaTranscripts).values({
      mediaId: theirs,
      transcriber: "openai",
      model: "whisper-1",
      words: talk(MINUTE),
      durationMs: MINUTE,
      createdAt: new Date(),
    })
    const projectId = await insertProject(theirs, { durationMs: MINUTE })
    await expect(writeProjectCaptions(userId, projectId)).rejects.toThrow()
    await expect(
      transcribeClip({ userId, projectId, clipId: "clip-1" })
    ).rejects.toThrow()
    expect(sent).toHaveLength(0)
    expect(metered).toHaveLength(0)
  })
})

describe("the Hook tool's spoken opening", () => {
  it("sends only the opening of a file nobody has written down, and keeps nothing", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    const words = await transcribeOpening({
      userId,
      projectId,
      clipId: "clip-1",
      windowMs: 12_000,
    })
    expect(sent).toEqual([{ provider: "openai", startMs: 0, durationMs: 12_000 }])
    expect(metered).toEqual([
      expect.objectContaining({ feature: "jump_cut_analysis", units: 0.2 }),
    ])
    expect(words.at(-1)!.endMs).toBeLessThanOrEqual(12_000)
    expect(await database.select().from(videoMediaTranscripts)).toHaveLength(0)
  })

  it("reads the opening out of the saved words for nothing", async () => {
    const mediaId = await insertMedia()
    // The clip plays the file from 10s on.
    const projectId = await insertProject(mediaId, {
      durationMs: 30_000,
      trimStartMs: 10_000,
    })
    await writeProjectCaptions(userId, projectId)
    metered.length = 0
    sent.length = 0
    const words = await transcribeOpening({
      userId,
      projectId,
      clipId: "clip-1",
      windowMs: 12_000,
    })
    expect(sent).toHaveLength(0)
    expect(metered).toHaveLength(0)
    // The file's word at 10,000ms is the first the opening plays.
    expect(words[0]).toEqual({ text: "w25", startMs: 0, endMs: 300 })
    expect(words.at(-1)!.endMs).toBeLessThanOrEqual(12_000)
  })
})

describe("deleting the file", () => {
  it("takes its saved words with it", async () => {
    const mediaId = await insertMedia()
    const projectId = await insertProject(mediaId, { durationMs: MINUTE })
    await writeProjectCaptions(userId, projectId)
    await database.delete(customShellMedia).where(eq(customShellMedia.id, mediaId))
    const left = await database.select().from(videoMediaTranscripts)
    expect(left).toHaveLength(0)
  })
})

describe("wavDataDurationMs", () => {
  it("reads the length out of the data chunk, past any chunk before it", () => {
    expect(wavDataDurationMs(fakeWav(90_000, 0))).toBe(90_000)
  })

  it("answers nothing for a file that is not a WAV", () => {
    expect(wavDataDurationMs(Buffer.from("not a wav at all"))).toBeNull()
  })
})
