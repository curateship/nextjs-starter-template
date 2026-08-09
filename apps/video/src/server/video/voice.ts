import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  alignmentToWords,
  OPENAI_VOICES,
  spreadCaptionsEvenly,
  type VoiceSpeakerId,
  VOICE_FAILED_MESSAGE,
  VOICE_NO_TEXT_MESSAGE,
  VOICE_NO_VOICE_MESSAGE,
  VOICE_NO_VOICES_MESSAGE,
  VOICE_TEXT_MAX,
  voiceoverRequestBody,
  wordsToCaptions,
  type Voice,
  type VoiceAlignment,
  type VoiceSettings,
  type VoiceoverResult,
} from "@/lib/video/voice"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { runFfmpeg } from "@/server/video/ffmpeg"
import { requireOpenAiKey } from "@/server/video/whisper"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Having a script read aloud.
 *
 * One call does both jobs: it hands back the sound and where every character
 * of the script falls inside it. That second part is what lets the words
 * appear on screen exactly as they are spoken, without a second pass to work
 * out the timing.
 *
 * The sound is kept in the media library like anything else, so it can be
 * moved, trimmed and reused rather than living only inside one project.
 */

const BASE_URL = "https://api.elevenlabs.io"

async function requireElevenLabsKey() {
  const key = await getAiKey("elevenlabs")
  if (!key) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)
  return key
}

/** What the provider said went wrong, kept out of the way but in the log. */
async function complain(label: string, response: Response) {
  const body = await response.text().then(
    (text) => text.slice(0, 500),
    () => ""
  )
  console.error(`ElevenLabs ${label}`, response.status, body)
  return new Error(`${label} failed (HTTP ${response.status})`)
}

/**
 * The voices there are to pick from.
 *
 * OpenAI's are a fixed list that needs no asking; ElevenLabs' belong to the
 * account, so they are fetched. Both come back the same shape, each saying
 * which provider it lives on.
 */
export async function listVoices(): Promise<Voice[]> {
  const [voice, openai] = await Promise.all([
    getAiKey("elevenlabs"),
    getAiKey("openai"),
  ])
  const voices: Voice[] = openai ? [...OPENAI_VOICES] : []
  if (!voice) {
    if (!voices.length) throw new Error(ELEVENLABS_KEY_MISSING_MESSAGE)
    return voices
  }
  return [...(await listElevenLabsVoices()), ...voices]
}

async function listElevenLabsVoices(): Promise<Voice[]> {
  const apiKey = await requireElevenLabsKey()
  const response = await fetch(`${BASE_URL}/v1/voices`, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw await complain("Voices", response)

  const payload = (await response.json()) as {
    voices?: {
      voice_id?: string
      name?: string
      labels?: Record<string, string>
      description?: string
    }[]
  }
  const voices = (payload.voices ?? []).flatMap((voice) =>
    voice.voice_id
      ? [
          {
            id: voice.voice_id,
            speaker: "elevenlabs" as const,
            name: voice.name ?? "Unnamed voice",
            description:
              voice.description?.trim() ||
              Object.values(voice.labels ?? {})
                .filter(Boolean)
                .join(" · "),
          },
        ]
      : []
  )
  if (!voices.length) throw new Error(VOICE_NO_VOICES_MESSAGE)
  return voices
}

/**
 * Reads the script aloud and puts the sound in the library.
 *
 * The whole thing is one call on the meter, charged by how many characters
 * were read — which is how this provider charges — so a failed reading costs
 * nothing at all.
 */
export async function speak({
  userId,
  voiceId,
  modelId,
  text,
  settings,
  speaker,
}: {
  userId: string
  voiceId: string
  modelId: string
  text: string
  settings?: VoiceSettings
  /** Left out, it is worked out from the voice itself. */
  speaker?: VoiceSpeakerId
}): Promise<VoiceoverResult> {
  const script = text.trim()
  if (!script) throw new Error(VOICE_NO_TEXT_MESSAGE)
  if (!voiceId) throw new Error(VOICE_NO_VOICE_MESSAGE)

  const who =
    speaker ??
    (OPENAI_VOICES.some((voice) => voice.id === voiceId)
      ? "openai"
      : "elevenlabs")
  if (who === "openai") {
    return speakWithOpenAi({ userId, voiceId, text: script, settings })
  }

  const apiKey = await requireElevenLabsKey()

  const payload = await runAiCall(
    {
      userId,
      provider: "elevenlabs",
      model: modelId,
      feature: "voiceover",
      metadata: { characters: script.length },
    },
    async () => {
      const response = await fetch(
        `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            voiceoverRequestBody(
              script.slice(0, VOICE_TEXT_MAX),
              modelId,
              settings
            )
          ),
          signal: AbortSignal.timeout(120_000),
        }
      )
      if (!response.ok) throw await complain("Voiceover", response)

      const answer = (await response.json()) as {
        audio_base64?: string
        alignment?: VoiceAlignment | null
      }
      return {
        result: answer,
        // Charged by the character, which is what this provider counts.
        usage: { inputTokens: 0, outputTokens: 0, units: script.length },
      }
    }
  )

  if (!payload.audio_base64) throw new Error(VOICE_FAILED_MESSAGE)
  const bytes = new Uint8Array(Buffer.from(payload.audio_base64, "base64"))
  const words = payload.alignment ? alignmentToWords(payload.alignment) : []
  // How long it runs is where the last thing said finishes — which covers the
  // breath of silence at the end.
  const durationMs = words.at(-1)?.endMs ?? 0

  const stored = await keepInLibrary(userId, bytes, voiceoverName(script))
  return { ...stored, durationMs, captions: wordsToCaptions(words) }
}

/** Sound goes into the library like anything else, so it can be reused. */
async function keepInLibrary(
  userId: string,
  bytes: Uint8Array,
  name: string
): Promise<{ mediaId: string; url: string; name: string }> {
  const filename = `${uuid()}-voiceover.mp3`
  const storagePath = `${userId}/${filename}`
  await uploadToR2(storagePath, bytes, "audio/mpeg")

  const at = now()
  const row = {
    id: uuid(),
    // The site the voiceover was made in is the site that keeps it.
    workspaceId: await workspaceIdForRequest(userId),
    userId,
    filename,
    originalName: `${name}.mp3`,
    altText: null,
    fileSize: bytes.byteLength,
    mimeType: "audio/mpeg",
    fileType: "audio",
    storagePath,
    createdAt: at,
    updatedAt: at,
  }
  try {
    await db.insert(customShellMedia).values(row)
  } catch (error) {
    // A file nothing points at is rubbish; take it back out.
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  return { mediaId: row.id, url: getPublicMediaUrl(storagePath), name }
}

/**
 * The same job, asked of OpenAI.
 *
 * It hands back the sound and nothing else — no word timings — so the caption
 * lines are spread evenly across however long the sound turned out to be.
 * That is said out loud in the window rather than hidden.
 */
async function speakWithOpenAi({
  userId,
  voiceId,
  text,
  settings,
}: {
  userId: string
  voiceId: string
  text: string
  settings?: VoiceSettings
}): Promise<VoiceoverResult> {
  const apiKey = await requireOpenAiKey()
  const model = "gpt-4o-mini-tts"

  const bytes = await runAiCall(
    {
      userId,
      provider: "openai",
      model,
      feature: "voiceover",
      metadata: { characters: text.length },
    },
    async () => {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice: voiceId,
          input: text,
          response_format: "mp3",
          speed: settings?.speed ?? 1,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) throw await complain("Voiceover", response)
      return {
        result: new Uint8Array(await response.arrayBuffer()),
        // Charged by the character, the same as the other voice.
        usage: { inputTokens: 0, outputTokens: 0, units: text.length },
      }
    }
  )
  if (!bytes.byteLength) throw new Error(VOICE_FAILED_MESSAGE)

  const durationMs = await mp3DurationMs(bytes)
  const stored = await keepInLibrary(userId, bytes, voiceoverName(text))
  return {
    ...stored,
    durationMs,
    captions: spreadCaptionsEvenly(text, durationMs),
  }
}

/** How long a piece of sound runs, asked of ffmpeg rather than guessed. */
async function mp3DurationMs(bytes: Uint8Array): Promise<number> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-voice-"))
  try {
    const file = path.join(dir, "voice.mp3")
    await writeFile(file, bytes)
    // ffmpeg prints the length while it reads the file; nothing is written out.
    const noise = await runFfmpeg(
      ["-i", file, "-f", "null", "-"],
      VOICE_FAILED_MESSAGE
    )
    const match = noise.match(/time=(\d+):(\d+):(\d+\.\d+)/g)?.at(-1)
    const parts = match?.match(/(\d+):(\d+):(\d+\.\d+)/)
    if (!parts) return 0
    return Math.round(
      (Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3])) * 1000
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** A short name for the library, taken from what was said. */
function voiceoverName(script: string) {
  const words = script.replace(/\s+/g, " ").trim()
  return words.length > 40 ? `${words.slice(0, 39)}…` : words || "Voiceover"
}
