import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  SAFE_CAPTION_ERRORS,
  type CaptionsResult,
} from "@/lib/video/captions"
import {
  AI_KEY_MISSING_MESSAGES,
  isShowableProviderProblem,
} from "@/lib/video/ai-providers"
import {
  SAFE_JUMP_CUT_ERRORS,
  type JumpCutMode,
  type JumpCutSensitivity,
} from "@/lib/video/jump-cuts"
import {
  aiDefaultsSchema,
  pickTranscriber,
  pickWriter,
  type AiDefaults,
} from "@/lib/video/ai-choices"
import { SAFE_HOOK_ERRORS } from "@/lib/video/hooks"
import {
  SAFE_SCRIPT_CHECK_ERRORS,
  type ScriptCheck,
} from "@/lib/video/script-check"
import {
  SAFE_TRANSLATE_ERRORS,
  TRANSLATE_LANGUAGES,
  TRANSLATE_LINE_MAX,
  TRANSLATE_LINES_MAX,
  TRANSLATE_NOTHING_TO_SAY_MESSAGE,
  TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE,
  TRANSLATE_VOICE_MODEL,
  translationScript,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { VIDEO_NOT_FOUND_MESSAGE } from "@/lib/video/project-videos"
import {
  NOTHING_TO_EXPORT_MESSAGE,
  QUEUE_FULL_MESSAGE,
} from "@/lib/video/render"
import { isVoiceOrigin } from "@/lib/video/clip-origin"
import {
  REMAKE_NOT_FOUND_MESSAGE,
  voiceOrigin,
  type SpokenLine,
} from "@/lib/video/remake-clip"
import { parseTimelineForReset } from "@/lib/video/timeline-schema"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import {
  SAFE_VOICE_ERRORS,
  VOICE_MODEL_IDS,
  rememberedVoiceSettings,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_TEXT_MAX,
  voiceDefaultsSchema,
  voiceSettingsSchema,
  type VoiceDefaults,
  type Voice,
} from "@/lib/video/voice"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import type { SavedTranscriptSummary } from "@/lib/video/transcripts"
import { getAiKey } from "@/server/ai/keys"
import { adminPost, userGet, userPost } from "@/server/guards"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { writeVideoCaptions } from "@/server/video/captions"
import {
  requireVideoBudget,
  videoSpendMetadata,
  type SpendTag,
} from "@/server/video/project-spend"
import { getExportErrorMessage } from "@/lib/api/video/exports"
import {
  checkLanguageCopy,
  makeLanguageCopy,
  type LanguageCopyResult,
} from "@/server/video/language-copies"
import { getOwnedVideo } from "@/server/video/project-videos"
import {
  getAiDefaults,
  getVoiceDefaults,
  saveAiDefaults,
  saveVoiceDefaults,
} from "@/server/video/settings"
import { rewriteHook, type HookVariants } from "@/server/video/hooks"
import { checkScript } from "@/server/video/script-check"
import { translateLines } from "@/server/video/translate"
import { listSavedTranscripts } from "@/server/video/transcripts"
import { listVoices, speak } from "@/server/video/voice"
import {
  analyseJumpCuts,
  transcribeClip,
  type ClipTranscript,
  type JumpCutAnalysis,
} from "@/server/video/jump-cuts"

/**
 * The AI tools in the studio.
 *
 * Everything here belongs to whoever is signed in: the project is looked up as
 * theirs, the files it names are looked up as theirs, and what it costs goes on
 * their own budget.
 */

export type { CaptionsResult, LanguageCopyResult }

/** The video a tool is used in, when it is used in one. */
const optionalVideoId = z.string().min(1).max(36).optional()

/**
 * Holds a tool to its video's spend limit, and hands back what the call's
 * meter row carries. A tool used outside the editor has no limit to hold it
 * to and is filed under no video.
 */
async function budget(
  userId: string,
  videoId: string | undefined,
  nextCents: number
): Promise<SpendTag | null> {
  if (!videoId) return null
  return videoSpendMetadata(await requireVideoBudget(userId, videoId, nextCents))
}

/** Make all asks whether a copy's export would be taken before paying. */
const LANGUAGE_COPY_EXPORT_REFUSALS = new Set([
  NOTHING_TO_EXPORT_MESSAGE,
  QUEUE_FULL_MESSAGE,
])

/**
 * What went wrong, in words worth reading.
 *
 * Everything this app writes for itself is shown as it is. Anything else — a
 * library's own wording — is shown too when it is short and reads like a
 * sentence, because a bad reason beats no reason: it is the difference between
 * pressing the button again and giving up on it.
 */
export function getAiToolErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (SAFE_CAPTION_ERRORS.has(message)) return message
  if (SAFE_JUMP_CUT_ERRORS.has(message)) return message
  if (SAFE_VOICE_ERRORS.has(message)) return message
  if (SAFE_HOOK_ERRORS.has(message)) return message
  if (SAFE_SCRIPT_CHECK_ERRORS.has(message)) return message
  if (SAFE_TRANSLATE_ERRORS.has(message)) return message
  if (LANGUAGE_COPY_EXPORT_REFUSALS.has(message)) return message
  if (AI_KEY_MISSING_MESSAGES.has(message)) return message
  if (message === PROJECT_NOT_FOUND_MESSAGE || message === VIDEO_NOT_FOUND_MESSAGE) return message
  if (message === REMAKE_NOT_FOUND_MESSAGE) return message
  if (isProjectSpendLimitMessage(message)) return message
  if (isShowableProviderProblem(message)) return message
  const authProblem = describeAuthError(message)
  if (authProblem) return authProblem
  return readableProblem(message)
    ? `That did not work — ${lowerFirst(message)}`
    : "That did not work. Try again in a moment."
}

/** A sentence somebody could act on, rather than a stack trace or a path. */
function readableProblem(message: string) {
  if (message.length < 4 || message.length > 140) return false
  if (message.includes("\n")) return false
  // Paths, urls and error codes tell a person nothing they can use.
  return !/[/\\]|https?:|^[A-Z_]+$|^[A-Z]{3,}\b/.test(message)
}

function lowerFirst(message: string) {
  return message[0].toLowerCase() + message.slice(1)
}

/**
 * Which kinds of AI work this app can actually do right now — whether a key
 * is saved, never anything about the key itself. The panel needs this to say
 * "add a key" instead of offering a button that always fails.
 */
export type AiToolsAvailability = {
  /** Transcribing, writing and rewriting: needs Gemini. */
  words: boolean
  /** Reading a script aloud: needs ElevenLabs. */
  voice: boolean
  /** Whisper and a second opinion on words: needs OpenAI. */
  openai: boolean
  /** Claude as the writer: needs Anthropic. */
  anthropic: boolean
  /** Which AI does what, as chosen. */
  defaults: AiDefaults
  /** What is actually being used, once keys and choice are both accounted for. */
  transcriber: string | null
  writer: string | null
}

const aiToolsAvailabilityFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<AiToolsAvailability> => {
    const [keys, voice, defaults] = await Promise.all([
      getAiKeysSaved(),
      getAiKey("elevenlabs"),
      getAiDefaults(),
    ])
    return {
      words: keys.gemini,
      voice: !!voice,
      openai: keys.openai,
      anthropic: keys.anthropic,
      defaults,
      transcriber: pickTranscriber(defaults, keys)?.id ?? null,
      writer: pickWriter(defaults, keys)?.id ?? null,
    }
  })

export function loadAiToolsAvailability() {
  return aiToolsAvailabilityFn()
}

const writeCaptionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ videoId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<CaptionsResult> => {
    await budget(context.user.id, data.videoId, 0)
    return writeVideoCaptions(context.user.id, data.videoId)
  })

export function writeCaptions(videoId: string) {
  return writeCaptionsFn({ data: { videoId } })
}

const jumpCutsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      mode: z.enum(["dead-air", "filler"]),
      sensitivity: z.enum(["gentle", "balanced", "tight"]),
      // Checked again on the server against the list of terms it knows.
      fillerTerms: z.array(z.string().max(40)).max(40).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<JumpCutAnalysis> => {
    await budget(context.user.id, data.videoId, 0)
    return analyseJumpCuts({
      userId: context.user.id,
      videoId: data.videoId,
      clipId: data.clipId,
      mode: data.mode,
      sensitivity: data.sensitivity,
      fillerTerms: data.fillerTerms,
    })
  })

export function findJumpCuts(options: {
  videoId: string
  clipId: string
  mode: JumpCutMode
  sensitivity: JumpCutSensitivity
  fillerTerms?: string[]
}) {
  return jumpCutsFn({ data: options })
}

const transcriptFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      fresh: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<ClipTranscript> => {
    await budget(context.user.id, data.videoId, 0)
    return transcribeClip({
      userId: context.user.id,
      videoId: data.videoId,
      clipId: data.clipId,
      fresh: data.fresh,
    })
  })

/**
 * Writing down what a clip says. A POST rather than a GET because it can be
 * real work that costs money, not a page's worth of reading. The file's saved
 * words answer for nothing; `fresh` pays to write the file down again.
 */
export function loadClipTranscript(
  videoId: string,
  clipId: string,
  options: { fresh?: boolean } = {}
) {
  return transcriptFn({ data: { videoId, clipId, fresh: options.fresh } })
}

const savedTranscriptsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ mediaIds: z.array(z.string().min(1).max(36)).max(200) })
  )
  .handler(
    async ({ data, context }): Promise<SavedTranscriptSummary[]> =>
      listSavedTranscripts(context.user.id, data.mediaIds)
  )

/**
 * Which of these files of the caller's own already have their words saved,
 * so a window can say "no charge" before anything is pressed.
 */
export function loadSavedTranscripts(mediaIds: string[]) {
  return savedTranscriptsFn({ data: { mediaIds } })
}

const saveAiDefaultsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(aiDefaultsSchema)
  .handler(async ({ data }): Promise<AiDefaults> => saveAiDefaults(data))

/**
 * Remember which AI does what. Saved the moment it is chosen, so the choice is
 * made once rather than every time a window opens.
 */
export function rememberAiChoice(choice: AiDefaults) {
  return saveAiDefaultsFn({ data: choice })
}

const hookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ videoId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<HookVariants> => {
    await budget(context.user.id, data.videoId, 0)
    return rewriteHook({ userId: context.user.id, videoId: data.videoId })
  })

export function rewriteOpeningLine(videoId: string) {
  return hookFn({ data: { videoId } })
}

const checkScriptFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      script: z.string().max(VOICE_TEXT_MAX),
      speed: z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }): Promise<ScriptCheck> => {
    const spend = await budget(context.user.id, data.videoId, 0)
    return checkScript({
      userId: context.user.id,
      script: data.script,
      speed: data.speed,
      spend,
    })
  })

/** Check a script against the five rules before it is read aloud. */
export function checkVoiceScript(script: string, speed: number, videoId?: string) {
  return checkScriptFn({ data: { script, speed, videoId } })
}

const speakHookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      text: z.string().min(1).max(VOICE_TEXT_MAX),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }): Promise<SpokenLine> => {
    const remembered = await getVoiceDefaults()
    // Only meaningful for a voice that has models to choose between; the
    // other provider works it out from the voice itself.
    const modelId = remembered?.modelId ?? "eleven_multilingual_v2"
    const settings = rememberedVoiceSettings(remembered)
    const spend = await budget(context.user.id, data.videoId, aiUnitCostCents(modelId, data.text.length))
    const said = await speak({
      userId: context.user.id,
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      modelId,
      text: data.text,
      settings,
      spend,
    })
    return { ...said, origin: voiceOrigin("hook", { ...data, modelId, settings }) }
  })

/** Say a rewritten opening line out loud, so the sound can replace the old one. */
export function speakHook(text: string, voice: Voice, videoId?: string) {
  return speakHookFn({
    data: { text, voiceId: voice.id, voiceName: voice.name, videoId },
  })
}

const translateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      language: z.enum(TRANSLATE_LANGUAGES),
      lines: z
        .array(z.string().max(TRANSLATE_LINE_MAX))
        .min(1)
        .max(TRANSLATE_LINES_MAX),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    const spend = await budget(context.user.id, data.videoId, 0)
    return translateLines({
      userId: context.user.id,
      language: data.language,
      lines: data.lines,
      spend,
    })
  })

/**
 * Caption lines in another language, one back for each one sent, in order.
 * Nothing on the timeline changes; the editor shows them first.
 */
export function translateCaptionLines(
  language: TranslateLanguage,
  lines: string[],
  videoId?: string
) {
  return translateFn({ data: { language, lines, videoId } })
}

const speakTranslationFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      text: z.string().min(1).max(VOICE_TEXT_MAX),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }): Promise<SpokenLine> => {
    const settings = rememberedVoiceSettings(await getVoiceDefaults())
    return speakTranslated(context.user.id, { ...data, settings })
  })

/**
 * Reads a translation aloud. Always ElevenLabs, always the multilingual
 * model: it is the one that speaks every language on the list.
 */
async function speakTranslated(
  userId: string,
  read: {
    voiceId: string
    voiceName: string
    text: string
    settings?: z.infer<typeof voiceSettingsSchema>
    videoId?: string
  }
): Promise<SpokenLine> {
  const spend = await budget(userId, read.videoId, aiUnitCostCents(TRANSLATE_VOICE_MODEL, read.text.length))
  const said = await speak({
    userId,
    voiceId: read.voiceId,
    voiceName: read.voiceName,
    speaker: "elevenlabs",
    modelId: TRANSLATE_VOICE_MODEL,
    text: read.text,
    settings: read.settings,
    feature: "translation_voice",
    spend,
  })
  return {
    ...said,
    origin: voiceOrigin("translate", { ...read, modelId: TRANSLATE_VOICE_MODEL }),
  }
}

/** Read a translation aloud, so it can be laid over the original. */
export function speakTranslation(text: string, voice: Voice, videoId?: string) {
  return speakTranslationFn({
    data: { text, voiceId: voice.id, voiceName: voice.name, videoId },
  })
}

const makeLanguageCopyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      /** The talking that was translated, turned down on the copy. */
      sourceClipId: z.string().min(1).max(64),
      language: z.enum(TRANSLATE_LANGUAGES),
      lines: z
        .array(
          z.object({
            startMs: z.number().nonnegative().finite(),
            text: z.string().max(TRANSLATE_LINE_MAX),
          })
        )
        .min(1)
        .max(TRANSLATE_LINES_MAX),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
    })
  )
  .handler(async ({ data, context }): Promise<LanguageCopyResult> => {
    const userId = context.user.id
    // Everything that can be refused is refused before the voice is paid for.
    const startsAtMs = Math.min(...data.lines.map((line) => line.startMs))
    await checkLanguageCopy({
      userId,
      videoId: data.videoId,
      sourceClipId: data.sourceClipId,
      startsAtMs,
    })
    const script = translationScript(data.lines)
    if (!script) throw new Error(TRANSLATE_NOTHING_TO_SAY_MESSAGE)
    if (script.length > VOICE_TEXT_MAX) {
      throw new Error(TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE)
    }
    const settings = rememberedVoiceSettings(await getVoiceDefaults())
    const said = await speakTranslated(userId, {
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      text: script,
      settings,
      videoId: data.videoId,
    })
    const made = await makeLanguageCopy({
      userId,
      videoId: data.videoId,
      sourceClipId: data.sourceClipId,
      language: data.language,
      said,
      startsAtMs,
    })
    return {
      ...made,
      // Only words written for people leave the server.
      exportProblem: made.exportProblem
        ? getExportErrorMessage(new Error(made.exportProblem))
        : null,
    }
  })

/**
 * One language of Make all: reads the corrected translation aloud and makes
 * a copy of the project with it laid over the original, then queues the
 * copy's export. The project open in the editor is never changed.
 */
export function makeLanguageCopyOf(data: {
  videoId: string
  sourceClipId: string
  language: TranslateLanguage
  lines: { startMs: number; text: string }[]
  voice: Voice
}) {
  return makeLanguageCopyFn({
    data: {
      videoId: data.videoId,
      sourceClipId: data.sourceClipId,
      language: data.language,
      lines: data.lines,
      voiceId: data.voice.id,
      voiceName: data.voice.name,
    },
  })
}

const voicesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<Voice[]> => listVoices(context.user.id))

export function loadVoices() {
  return voicesFn()
}

const voiceDefaultsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async (): Promise<VoiceDefaults | null> => getVoiceDefaults())

export function loadVoiceDefaults() {
  return voiceDefaultsFn()
}

const saveVoiceDefaultsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(voiceDefaultsSchema)
  .handler(async ({ data }): Promise<VoiceDefaults | null> => {
    return saveVoiceDefaults(data)
  })

/** Remember this voice, so the window opens on it next time. */
export function rememberVoice(defaults: VoiceDefaults) {
  return saveVoiceDefaultsFn({ data: defaults })
}

const speakFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      modelId: z.enum(VOICE_MODEL_IDS),
      text: z.string().min(1).max(VOICE_TEXT_MAX),
      settings: voiceSettingsSchema.optional(),
      videoId: optionalVideoId,
    })
  )
  .handler(async ({ data, context }): Promise<SpokenLine> => {
    const spend = await budget(
      context.user.id,
      data.videoId,
      aiUnitCostCents(data.modelId, data.text.length)
    )
    const said = await speak({
      userId: context.user.id,
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      modelId: data.modelId,
      text: data.text,
      settings: data.settings,
      spend,
    })
    return { ...said, origin: voiceOrigin("voice", data) }
  })

export function readAloud(options: {
  voiceId: string
  voiceName: string
  modelId: (typeof VOICE_MODEL_IDS)[number]
  text: string
  settings?: z.infer<typeof voiceSettingsSchema>
  /** The project it is read for, which pays for it and holds it to its limit. */
  videoId?: string
}) {
  return speakFn({ data: options })
}

const remakeVoiceFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      videoId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      modelId: z.enum(VOICE_MODEL_IDS),
      text: z.string().min(1).max(VOICE_TEXT_MAX),
    })
  )
  .handler(async ({ data, context }): Promise<SpokenLine> => {
    // The line is read off the saved timeline, so the editor saves first.
    // It keeps the settings it was read with; the window changes the words,
    // the voice and, where there is a choice, the model.
    const video = await getOwnedVideo(context.user.id, data.videoId)
    const clip = parseTimelineForReset(video.timeline)
      .timeline.tracks.flatMap((track) => track.clips)
      .find((candidate) => candidate.id === data.clipId)
    const origin = clip?.kind === "audio" ? clip.origin : undefined
    if (!origin || !isVoiceOrigin(origin)) throw new Error(REMAKE_NOT_FOUND_MESSAGE)
    const read = {
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      modelId: data.modelId,
      text: data.text,
      settings: origin.settings,
      videoId: data.videoId,
    }
    if (origin.tool === "translate") return speakTranslated(context.user.id, read)
    const spend = await budget(
      context.user.id,
      data.videoId,
      aiUnitCostCents(data.modelId, data.text.length)
    )
    const said = await speak({ userId: context.user.id, ...read, spend })
    return { ...said, origin: voiceOrigin(origin.tool, read) }
  })

/**
 * Reads a voice line on the timeline again: new words, another voice or
 * another model, with the settings it was first read with.
 */
export function remakeVoiceLine(data: {
  videoId: string
  clipId: string
  voiceId: string
  voiceName: string
  modelId: (typeof VOICE_MODEL_IDS)[number]
  text: string
}) {
  return remakeVoiceFn({ data })
}

export type {
  AiDefaults,
  SavedTranscriptSummary,
  ClipTranscript,
  HookVariants,
  JumpCutAnalysis,
  ScriptCheck,
  SpokenLine,
  Voice,
  VoiceDefaults,
}
