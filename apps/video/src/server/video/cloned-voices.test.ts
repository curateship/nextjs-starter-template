import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  VOICE_CLONE_DELETE_FAILED_MESSAGE,
  VOICE_CLONE_NOT_FOUND_MESSAGE,
  VOICE_CLONE_PLAN_MESSAGE,
} from "@/lib/video/voice-clone"
import {
  rememberedVoiceSettings,
  VOICE_NOT_YOURS_MESSAGE,
  VOICE_TOO_MANY_PAUSES_MESSAGE,
} from "@/lib/video/voice"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAiUsageEvents,
  customShellMedia,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  deleteClonedVoice,
  listClonedVoices,
  makeClonedVoice,
} from "@/server/video/cloned-voices"
import { videoClonedVoices } from "@/server/video/schema"
import { getVoiceDefaults, saveVoiceDefaults } from "@/server/video/settings"
import { listVoices, speak } from "@/server/video/voice"

const uploaded = new Map<string, string>()
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (storagePath: string, _bytes: Uint8Array, mimeType: string) => {
    uploaded.set(storagePath, mimeType)
  },
  deleteFromR2: async (storagePath: string) => {
    uploaded.delete(storagePath)
  },
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
// Real sound of a known length, so the length check reads it the way it
// reads a recording.
let twelveSeconds = new Uint8Array()
let fiveSeconds = new Uint8Array()
let seventySeconds = new Uint8Array()
beforeAll(() => {
  if (!hasFfmpeg) return
  const dir = mkdtempSync(path.join(tmpdir(), "clone-test-"))
  for (const [seconds, name] of [
    [12, "twelve.mp3"],
    [5, "five.mp3"],
    [70, "seventy.mp3"],
  ] as const) {
    spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=220:duration=${seconds}`,
      path.join(dir, name),
    ])
  }
  twelveSeconds = new Uint8Array(readFileSync(path.join(dir, "twelve.mp3")))
  fiveSeconds = new Uint8Array(readFileSync(path.join(dir, "five.mp3")))
  seventySeconds = new Uint8Array(readFileSync(path.join(dir, "seventy.mp3")))
  rmSync(dir, { recursive: true, force: true })
})

let client: PGlite
let database: CustomShellDb
let me: CustomShellUser
let someoneElse: CustomShellUser
const originalKey = process.env.CUSTOM_SHELL_ELEVENLABS_API_KEY

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []

/** Answers ElevenLabs calls in order and keeps what each one was sent. */
function fakeElevenLabs(...answers: Response[]) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      })
      const answer = answers.shift()
      if (!answer) throw new Error(`Nothing faked for ${url}`)
      return answer
    })
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  me = await insertUser(database, { email: "me@example.com" })
  someoneElse = await insertUser(database, { email: "other@example.com" })
  await insertWorkspace(database, { userId: me.id })
  process.env.CUSTOM_SHELL_ELEVENLABS_API_KEY = "test-key"
  uploaded.clear()
})

afterEach(async () => {
  await client.close()
  vi.unstubAllGlobals()
  if (originalKey === undefined) {
    delete process.env.CUSTOM_SHELL_ELEVENLABS_API_KEY
  } else {
    process.env.CUSTOM_SHELL_ELEVENLABS_API_KEY = originalKey
  }
})

const sample = () => ({
  bytes: twelveSeconds,
  type: "audio/mpeg",
  name: "me.mp3",
})

async function cloneOfMine() {
  fakeElevenLabs(json({ voice_id: "voice-mine", requires_verification: false }))
  return makeClonedVoice(me.id, { name: "My voice", sample: sample() }, database)
}

describe.skipIf(!hasFfmpeg)("making a voice of your own", () => {
  it("sends the sample to ElevenLabs and keeps the voice and the sample", async () => {
    const { voice, needsVerifying } = await cloneOfMine()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/voices/add")
    const sent = calls[0].body as FormData
    expect(sent.get("name")).toBe("My voice")
    expect(sent.get("files")).toBeInstanceOf(Blob)

    expect(voice).toMatchObject({ voiceId: "voice-mine", name: "My voice" })
    expect(needsVerifying).toBe(false)
    expect(uploaded.size).toBe(1)
    expect(await listClonedVoices(me.id, database)).toEqual([voice])
    expect(await listClonedVoices(someoneElse.id, database)).toEqual([])
  })

  it("refuses a five-second sample before anything is sent", async () => {
    fakeElevenLabs()
    await expect(
      makeClonedVoice(
        me.id,
        { name: "Short", sample: { ...sample(), bytes: fiveSeconds } },
        database
      )
    ).rejects.toThrow("The sample runs 5 seconds. It needs 10 to 60 seconds of speech.")
    expect(calls).toHaveLength(0)
  })

  it("refuses a sample over a minute, measured only a second past the limit", async () => {
    fakeElevenLabs()
    await expect(
      makeClonedVoice(
        me.id,
        { name: "Long", sample: { ...sample(), bytes: seventySeconds } },
        database
      )
    ).rejects.toThrow("The sample runs 61 seconds. It needs 10 to 60 seconds of speech.")
    expect(calls).toHaveLength(0)
  })

  it("refuses a file that is not sound", async () => {
    fakeElevenLabs()
    await expect(
      makeClonedVoice(
        me.id,
        {
          name: "Noise",
          sample: { ...sample(), bytes: new TextEncoder().encode("not sound") },
        },
        database
      )
    ).rejects.toThrow("could not be played")
    expect(calls).toHaveLength(0)
  })

  it("says plainly when the plan is the reason, and leaves nothing behind", async () => {
    fakeElevenLabs(
      json(
        {
          detail: {
            status: "can_not_use_instant_voice_cloning",
            message: "Your subscription does not include instant voice cloning.",
          },
        },
        401
      )
    )
    await expect(
      makeClonedVoice(me.id, { name: "Mine", sample: sample() }, database)
    ).rejects.toThrow(
      `${VOICE_CLONE_PLAN_MESSAGE} ElevenLabs said: Your subscription does not include instant voice cloning.`
    )
    expect(uploaded.size).toBe(0)
    expect(await database.select().from(videoClonedVoices)).toEqual([])
    expect(await database.select().from(customShellMedia)).toEqual([])
    // Nothing on the meter, so nothing charged.
    expect(await database.select().from(customShellAiUsageEvents)).toEqual([])
  })

  it("passes on any other refusal in ElevenLabs' own words", async () => {
    fakeElevenLabs(json({ detail: [{ msg: "Audio is too noisy" }] }, 422))
    await expect(
      makeClonedVoice(me.id, { name: "Mine", sample: sample() }, database)
    ).rejects.toThrow("ElevenLabs said: Audio is too noisy")
  })
})

describe.skipIf(!hasFfmpeg)("deleting a voice of your own", () => {
  it("deletes it at ElevenLabs and here, and keeps the sample", async () => {
    const { voice } = await cloneOfMine()
    fakeElevenLabs(json({ status: "ok" }))
    await deleteClonedVoice(me.id, voice.id, database)

    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.elevenlabs.io/v1/voices/voice-mine",
    })
    expect(await listClonedVoices(me.id, database)).toEqual([])
    expect(await database.select().from(customShellMedia)).toHaveLength(1)
  })

  it("keeps it when ElevenLabs will not delete it", async () => {
    const { voice } = await cloneOfMine()
    fakeElevenLabs(json({ detail: { message: "Try later" } }, 500))
    await expect(deleteClonedVoice(me.id, voice.id, database)).rejects.toThrow(
      VOICE_CLONE_DELETE_FAILED_MESSAGE
    )
    expect(await listClonedVoices(me.id, database)).toHaveLength(1)
  })

  it("will not touch somebody else's", async () => {
    const { voice } = await cloneOfMine()
    fakeElevenLabs()
    await expect(
      deleteClonedVoice(someoneElse.id, voice.id, database)
    ).rejects.toThrow(VOICE_CLONE_NOT_FOUND_MESSAGE)
    expect(calls).toHaveLength(0)
  })
})

describe.skipIf(!hasFfmpeg)("your voice in the voice list and when reading", () => {
  const accountVoices = () => json({
    voices: [
      { voice_id: "stock", name: "Rachel", labels: { accent: "American" } },
      { voice_id: "voice-mine", name: "My voice" },
    ],
  })

  it("is first and marked as yours for you", async () => {
    await cloneOfMine()
    fakeElevenLabs(accountVoices())
    const voices = await listVoices(me.id)
    expect(voices.map((voice) => [voice.id, voice.yours ?? false])).toEqual([
      ["voice-mine", true],
      ["stock", false],
    ])
  })

  it("is not in anybody else's list, and they cannot read with it", async () => {
    await cloneOfMine()
    fakeElevenLabs(accountVoices())
    const voices = await listVoices(someoneElse.id)
    expect(voices.map((voice) => voice.id)).toEqual(["stock"])

    fakeElevenLabs()
    await expect(
      speak({
        userId: someoneElse.id,
        voiceId: "voice-mine",
        voiceName: "My voice",
        modelId: "eleven_v4",
        text: "Hello",
      })
    ).rejects.toThrow(VOICE_NOT_YOURS_MESSAGE)
    expect(calls).toHaveLength(0)
  })
})

describe("reading a directed script with the remembered settings", () => {
  /** The answer ElevenLabs gives: some sound, and every character timed. */
  function spokenBack(text: string) {
    const characters = [...text]
    return json({
      audio_base64: Buffer.from("sound").toString("base64"),
      alignment: {
        characters,
        character_start_times_seconds: characters.map((_, i) => i / 10),
        character_end_times_seconds: characters.map((_, i) => (i + 1) / 10),
      },
    })
  }

  it("sends the saved steadiness and expressiveness, as Hook does, and keeps the tags out of the captions", async () => {
    await saveVoiceDefaults(
      {
        voiceId: "stock",
        voiceName: "Rachel",
        modelId: "eleven_v4",
        speed: 1,
        stability: 0.8,
        styleExaggeration: 0.3,
      },
      database
    )
    const sent =
      "[whispering] I found it. ...\nIt changes everything."
    fakeElevenLabs(spokenBack(sent))
    // The Hook and Another language tools read with exactly this.
    const settings = rememberedVoiceSettings(await getVoiceDefaults(database))
    const result = await speak({
      userId: me.id,
      voiceId: "stock",
      voiceName: "Rachel",
      modelId: "eleven_v4",
      text: "[whispering] I found it. [pause 2s] It changes everything.",
      settings,
    })

    // Logged once so the body can be read in the test output.
    console.info("Voiceover request body", JSON.stringify(calls[0].body))
    expect(calls[0].body).toEqual({
      text: sent,
      model_id: "eleven_v4",
      voice_settings: {
        stability: 1,
        similarity_boost: 0.75,
        style: 0.3,
        speed: 1,
        use_speaker_boost: true,
      },
    })
    const captions = result.captions.map((line) => line.text).join(" ")
    expect(captions).toBe("I found it. It changes everything.")
    // Charged for what was sent, tags included.
    const [meter] = await database.select().from(customShellAiUsageEvents)
    expect(meter.metadata).toMatchObject({ units: sent.length })
  })

  it("refuses more than ten pauses before anything is sent", async () => {
    fakeElevenLabs()
    await expect(
      speak({
        userId: me.id,
        voiceId: "stock",
        voiceName: "Rachel",
        modelId: "eleven_v4",
        text: Array.from({ length: 11 }, () => "word [pause 1s]").join(" "),
      })
    ).rejects.toThrow(VOICE_TOO_MANY_PAUSES_MESSAGE)
    expect(calls).toHaveLength(0)
  })
})
