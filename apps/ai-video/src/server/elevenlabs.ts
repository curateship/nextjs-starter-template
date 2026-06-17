import { chunkWords, type CaptionLine } from "@/server/captions"
import { getLlmKey } from "@/server/llm-keys"
import {
  saveGeneratedImageToLibrary,
  serializeMedia,
  type MediaItem,
} from "@/server/media"
import { requireAppOrigin } from "@/server/origin"
import { requireUser } from "@/server/security"

// ElevenLabs text-to-speech integration. Mirrors the Gemini/OpenAI pattern:
// server-only, key resolved via getLlmKey (settings row → env var fallback),
// raw fetch (no SDK). A voiceover becomes a normal audio clip plus — from the
// word timings ElevenLabs returns — the same karaoke caption lines the Captions
// feature produces, so the editor renders/exports both with zero new plumbing.

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"

// A voice the user can pick in the Voice dialog.
export type ElevenLabsVoice = {
  id: string
  name: string
  previewUrl?: string | null
}

// Generation output handed back to the client: the saved audio (media library
// item with a public URL), its length, and the caption lines (clip-relative
// karaoke word timings) to drop on a caption track.
export type VoiceoverResult = {
  media: MediaItem
  durationMs: number
  captions: CaptionLine[]
}

// Character-level timing block from the /with-timestamps endpoint. The three
// arrays are parallel (one entry per character of the spoken text).
type ElevenLabsAlignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

// Resolves the ElevenLabs key (saved settings key wins, else the env var).
// Throws a stable, client-safe message the Voice dialog shows verbatim.
async function requireElevenLabsKey(): Promise<string> {
  const key = await getLlmKey("elevenlabs")
  if (!key) {
    throw new Error("ElevenLabs is not configured")
  }
  return key
}

// Lists the workspace account's saved voices ("My Voices") for the picker. Any
// signed-in user can read them; managing the key stays an admin Settings action.
export async function listVoicesForCurrentUser(): Promise<{
  voices: ElevenLabsVoice[]
}> {
  await requireUser()
  const apiKey = await requireElevenLabsKey()

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/v2/voices?voice_type=saved&page_size=100&sort=name&sort_direction=asc&include_total_count=false`,
    {
      headers: { "xi-api-key": apiKey },
    }
  )
  if (!response.ok) {
    throw await elevenLabsError("Voice list failed", response)
  }

  const payload = (await response.json()) as {
    voices?: {
      voice_id: string
      name: string
      preview_url?: string | null
      verified_languages?: { preview_url?: string | null }[] | null
    }[]
  }
  return {
    voices: (payload.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      previewUrl:
        voice.preview_url ??
        voice.verified_languages?.find((language) => language.preview_url)
          ?.preview_url ??
        null,
    })),
  }
}

// Synthesizes `text` in the chosen voice/model, saves the MP3 to the media
// library, and returns it alongside karaoke caption lines built from the
// word-level timings. Synchronous from the caller's view (a few seconds) — the
// UI just shows a spinner, like caption generation.
export async function generateVoiceoverForCurrentUser(
  voiceId: string,
  text: string,
  modelId: string
): Promise<VoiceoverResult> {
  requireAppOrigin()
  const user = await requireUser()
  const apiKey = await requireElevenLabsKey()

  // `/with-timestamps` returns the audio AND character-level alignment in one
  // call, so we get timings for free without a second forced-alignment pass.
  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, model_id: modelId }),
    }
  )
  if (!response.ok) {
    throw await elevenLabsError("Voiceover generation failed", response)
  }

  const payload = (await response.json()) as {
    audio_base64: string
    alignment: ElevenLabsAlignment | null
  }

  // Default ElevenLabs output is mp3_44100_128 → audio/mpeg.
  const bytes = Buffer.from(payload.audio_base64, "base64")
  const { alignment } = payload
  // Clip length = the last character's end time (covers trailing silence).
  const durationMs = Math.round(
    (alignment?.character_end_times_seconds.at(-1) ?? 0) * 1000
  )

  const media = await saveGeneratedImageToLibrary(
    user.id,
    bytes,
    "audio/mpeg",
    voiceoverName(text)
  )

  // Build the same karaoke caption lines Whisper produces — ≤4-word lines with
  // clip-relative word timings (chunkWords does the second→ms rounding).
  const captions = chunkWords(alignment ? alignmentToWords(alignment) : [])

  return { media: serializeMedia(media), durationMs, captions }
}

// Collapses ElevenLabs' character-level alignment into the word timings
// chunkWords expects (in seconds). Whitespace separates words (and belongs to
// none); a word's start is its first character's start, its end the last
// character's end. Empty runs drop out.
function alignmentToWords(
  alignment: ElevenLabsAlignment
): { word: string; start: number; end: number }[] {
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = alignment

  const words: { word: string; start: number; end: number }[] = []
  let text = ""
  let start = 0
  let end = 0

  // Close the in-progress word: push it (trimmed) and reset the accumulator.
  const flush = () => {
    const word = text.trim()
    if (word) words.push({ word, start, end })
    text = ""
  }

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i]
    if (/\s/.test(char)) {
      flush()
      continue
    }
    // First visible character of a word records its start time.
    if (!text) start = starts[i] ?? end
    text += char
    end = ends[i] ?? start
  }
  flush()
  return words
}

// Builds an Error from a failed ElevenLabs response, surfacing the API's own
// reason so the dialog can show it (the common case is a scoped key missing the
// voices_read / text_to_speech permission). ElevenLabs error bodies are
// { detail: { status, message } } or { detail: "..." }.
async function elevenLabsError(
  label: string,
  response: Response
): Promise<Error> {
  const body = await response.text().catch(() => "")
  let detail = ""
  try {
    const parsed = JSON.parse(body) as { detail?: unknown }
    const raw = parsed.detail
    if (typeof raw === "string") {
      detail = raw
    } else if (raw && typeof raw === "object" && "message" in raw) {
      const message = (raw as { message?: unknown }).message
      if (typeof message === "string") detail = message
    }
  } catch {
    // Non-JSON body — keep a short snippet as the detail.
    detail = body.slice(0, 200)
  }
  console.error(label, response.status, body.slice(0, 300))
  return new Error(
    `${label} (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
  )
}

// A readable media-library name from the spoken text (first ~30 chars).
function voiceoverName(text: string): string {
  const snippet = text.trim().replace(/\s+/g, " ").slice(0, 30)
  return snippet ? `Voiceover — ${snippet}` : "Voiceover"
}
