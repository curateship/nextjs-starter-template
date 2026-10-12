import { z } from "zod"

import { alignWordTimes } from "@/lib/video/caption-words"
import type { CaptionLine } from "@/lib/video/captions"
import { steadinessForModel } from "@/lib/video/voice-direction"

/**
 * Reading a script aloud.
 *
 * The facts both sides need: which voices and models are on offer, how a voice
 * can be shaped, and how the alignment that comes back with the sound turns
 * into words with times against it — which is what lets the words appear on
 * screen as they are said.
 *
 * Nothing here talks to anybody, so it can all be checked without a key.
 */

/**
 * The models offered. All of them hand back where every character falls in
 * the sound, which is what the captions are built from. Only the last three
 * follow directions such as [whispering] (see `voice-direction.ts`).
 */
export const VOICE_MODELS = [
  {
    id: "eleven_multilingual_v2",
    label: "Best",
    note: "The richest voice, and the slowest",
  },
  { id: "eleven_turbo_v2_5", label: "Quicker", note: "A good middle" },
  { id: "eleven_flash_v2_5", label: "Quickest", note: "For a rough check" },
  {
    id: "eleven_v4",
    label: "Eleven v4",
    note: "Follows [directions], 90 languages",
  },
  {
    id: "eleven_v4_turbo",
    label: "Eleven v4 Turbo",
    note: "Follows [directions], quicker, half the price",
  },
  {
    id: "eleven_v3",
    label: "Eleven v3",
    note: "Follows [directions], the older model",
  },
] as const

export type VoiceModelId = (typeof VOICE_MODELS)[number]["id"]
export const VOICE_MODEL_IDS = VOICE_MODELS.map((model) => model.id) as [
  VoiceModelId,
  ...VoiceModelId[],
]

/** Kept tighter than the provider allows: the extremes sound wrong. */
export const VOICE_SPEED_MIN = 0.7
export const VOICE_SPEED_MAX = 1.2

/** The longest script that will be read in one go. */
export const VOICE_TEXT_MAX = 5_000

export const voiceSettingsSchema = z
  .object({
    /** Low wanders and is expressive; high is steady and flat. */
    stability: z.number().min(0).max(1),
    /** How closely it sticks to the original voice. */
    similarityBoost: z.number().min(0).max(1),
    /** How much it acts. Costs speed. */
    styleExaggeration: z.number().min(0).max(1),
    speed: z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX),
    speakerBoost: z.boolean(),
  })
  .strict()

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>

/** What a voice sounds like before anybody touches it. */
export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    stability: 0.5,
    similarityBoost: 0.75,
    styleExaggeration: 0,
    speed: 1,
    speakerBoost: true,
  }
}

/** A voice, whoever it belongs to. */
export type Voice = {
  id: string
  name: string
  /** A word or two about it — accent, age, what it suits. */
  description: string
  /** Which provider it lives on, so the right one is asked to speak. */
  speaker: VoiceSpeakerId
  /** Made from the signed-in person's own sample in this app. */
  yours?: boolean
}

/**
 * Who reads things aloud.
 *
 * ElevenLabs sounds better and can use a voice of your own; OpenAI is a fixed
 * set of voices for a tenth of the price, and works off a key most people
 * already have for other things. Both hand back the sound; only ElevenLabs
 * also says where every character of the script falls inside it, so only its
 * captions land on the exact word.
 */
export const VOICE_SPEAKERS = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    note: "The best voices, and your own. Captions land on the exact word.",
    model: "eleven_multilingual_v2",
  },
  {
    id: "openai",
    label: "OpenAI",
    note: "A fixed set of voices, far cheaper. Captions are spread evenly.",
    model: "gpt-4o-mini-tts",
  },
] as const

export type VoiceSpeakerId = (typeof VOICE_SPEAKERS)[number]["id"]

/** The voices OpenAI offers. They are the same for every account. */
export const OPENAI_VOICES: Voice[] = [
  { id: "alloy", name: "Alloy", description: "Even and neutral", speaker: "openai" },
  { id: "echo", name: "Echo", description: "Warm, lower", speaker: "openai" },
  { id: "fable", name: "Fable", description: "Bright, storytelling", speaker: "openai" },
  { id: "onyx", name: "Onyx", description: "Deep and steady", speaker: "openai" },
  { id: "nova", name: "Nova", description: "Quick and friendly", speaker: "openai" },
  { id: "shimmer", name: "Shimmer", description: "Soft and light", speaker: "openai" },
]

export type VoiceoverResult = {
  /** The sound, now in the media library. */
  mediaId: string
  url: string
  name: string
  durationMs: number
  /** The words as they are said, ready to become captions. */
  captions: CaptionLine[]
}

/**
 * A remembered choice: whose voice, which one, at what quality, how fast, how
 * steady and how expressive. Steadiness and expressiveness came later, so a
 * choice saved before them has neither and reads with the starting values.
 */
export const voiceDefaultsSchema = z
  .object({
    speaker: z.enum(["elevenlabs", "openai"]).optional(),
    voiceId: z.string().min(1).max(64),
    voiceName: z.string().max(255),
    modelId: z.enum(VOICE_MODEL_IDS),
    speed: z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX),
    stability: z.number().min(0).max(1).optional(),
    styleExaggeration: z.number().min(0).max(1).optional(),
  })
  .strict()

export type VoiceDefaults = z.infer<typeof voiceDefaultsSchema>

/** What was remembered, or nothing when it is unset or no longer makes sense. */
export function readVoiceDefaults(value: unknown): VoiceDefaults | null {
  const parsed = voiceDefaultsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The settings a remembered voice reads with, for the tools that read aloud
 * without asking (Hook and Another language). Nothing remembered means the
 * account's own settings at ElevenLabs.
 */
export function rememberedVoiceSettings(
  remembered: VoiceDefaults | null
): VoiceSettings | undefined {
  if (!remembered) return undefined
  const start = createDefaultVoiceSettings()
  return {
    ...start,
    speed: remembered.speed,
    stability: remembered.stability ?? start.stability,
    styleExaggeration: remembered.styleExaggeration ?? start.styleExaggeration,
  }
}

export const VOICE_NO_TEXT_MESSAGE = "Write something for the voice to read"
export const VOICE_NO_VOICE_MESSAGE = "Pick a voice first"
export const VOICE_FAILED_MESSAGE = "That could not be read aloud"
export const VOICE_NO_VOICES_MESSAGE =
  "That key has no voices on it — add one in your ElevenLabs account"
export const VOICE_TOO_MANY_PAUSES_MESSAGE =
  "A script can hold 10 pauses at most, because more make the voice speed up or crackle"
export const VOICE_NOT_YOURS_MESSAGE =
  "That voice was made from someone else's sample, so only they can read with it"

export const SAFE_VOICE_ERRORS = new Set([
  VOICE_NO_TEXT_MESSAGE,
  VOICE_NO_VOICE_MESSAGE,
  VOICE_FAILED_MESSAGE,
  VOICE_NO_VOICES_MESSAGE,
  VOICE_TOO_MANY_PAUSES_MESSAGE,
  VOICE_NOT_YOURS_MESSAGE,
])

/**
 * The body of the request, with the style folded in only when there is one —
 * the account's own saved settings are never edited from here.
 */
export function voiceoverRequestBody(
  text: string,
  modelId: string,
  settings?: VoiceSettings
) {
  if (!settings) return { text, model_id: modelId }
  return {
    text,
    model_id: modelId,
    voice_settings: {
      stability: steadinessForModel(settings.stability, modelId),
      similarity_boost: settings.similarityBoost,
      style: settings.styleExaggeration,
      speed: settings.speed,
      use_speaker_boost: settings.speakerBoost,
    },
  }
}

/** Where each character of the script falls in the sound, in seconds. */
export type VoiceAlignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export type SpokenWord = { text: string; startMs: number; endMs: number }

/**
 * Characters with times become words with times.
 *
 * A space belongs to no word: it ends the one before it. A word starts where
 * its first letter starts and ends where its last one ends. A direction in
 * square brackets and a `<break>` were sent but never said, so they end the
 * word before them and are not words themselves, and nor is an ellipsis
 * standing on its own, which is how a pause reaches v3 and v4.
 */
export function alignmentToWords(alignment: VoiceAlignment): SpokenWord[] {
  const { characters } = alignment
  const starts = alignment.character_start_times_seconds
  const ends = alignment.character_end_times_seconds
  const words: SpokenWord[] = []

  let text = ""
  let startS = 0
  let endS = 0
  let closer: "]" | ">" | null = null
  const flush = () => {
    if (text.trim() && !/^[.…]+$/.test(text.trim())) {
      words.push({
        text: text.trim(),
        startMs: Math.round(startS * 1000),
        endMs: Math.round(endS * 1000),
      })
    }
    text = ""
  }

  characters.forEach((character, index) => {
    if (closer) {
      if (character === closer) closer = null
      return
    }
    if (sentButNotSaid(characters, index)) {
      flush()
      closer = character === "[" ? "]" : ">"
      return
    }
    if (/\s/.test(character)) {
      flush()
      return
    }
    if (!text) startS = starts[index] ?? 0
    text += character
    endS = ends[index] ?? startS
  })
  flush()
  return words
}

/**
 * Whether a direction starts here: `[` with its `]` on the same line within
 * 40 characters (the same rule `voice-direction.ts` sends tags by), or the
 * start of `<break`. A lone "[" or "3 < 5" is ordinary writing.
 */
function sentButNotSaid(characters: string[], index: number) {
  const character = characters[index]
  if (character === "<") {
    return characters.slice(index, index + 6).join("") === "<break"
  }
  if (character !== "[") return false
  const ahead = characters.slice(index + 1, index + 42)
  const close = ahead.indexOf("]")
  return close > 0 && !ahead.slice(0, close).some((one) => /[[\n]/.test(one))
}

/** Caption chunks are short: four words at most, and no longer than a glance. */
const CAPTION_MAX_WORDS = 4
const CAPTION_MAX_MS = 1_500

/**
 * Lines for a voice that hands back sound but no timings.
 *
 * Without knowing when each word was said, the only honest thing is to share
 * the time out evenly across the words — which reads well enough, because the
 * lines are short and the speech is even. It is not the same as knowing.
 */
export function spreadCaptionsEvenly(text: string, durationMs: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length || durationMs <= 0) return []
  const perWord = durationMs / words.length
  return wordsToCaptions(
    words.map((word, index) => ({
      text: word,
      startMs: Math.round(index * perWord),
      endMs: Math.round((index + 1) * perWord),
    }))
  )
}

/**
 * Words become the short lines that go on screen as they are spoken. Each line
 * keeps the times of its own words, which is what lights them up one by one.
 */
export function wordsToCaptions(words: SpokenWord[]): CaptionLine[] {
  const lines: CaptionLine[] = []
  let run: SpokenWord[] = []

  const flush = () => {
    if (!run.length) return
    const line = {
      startMs: run[0].startMs,
      endMs: run[run.length - 1].endMs,
      // Punctuation belongs against the word before it, not adrift.
      text: run
        .map((word) => word.text)
        .join(" ")
        .replace(/\s+([,.!?;:])/g, "$1"),
    }
    lines.push({ ...line, words: alignWordTimes(line, run) })
    run = []
  }

  for (const word of words) {
    const wouldRunLong =
      run.length > 0 && word.endMs - run[0].startMs > CAPTION_MAX_MS
    if (run.length >= CAPTION_MAX_WORDS || wouldRunLong) flush()
    run.push(word)
  }
  flush()
  return lines
}
