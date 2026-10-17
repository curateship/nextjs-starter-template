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
  TRANSLATE_VOICE_MODEL,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
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
  type VoiceoverResult,
} from "@/lib/video/voice"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { getAiKey } from "@/server/ai/keys"
import { adminPost, userGet, userPost } from "@/server/guards"
import { getAiKeysSaved } from "@/server/video/ai-keys-saved"
import { writeProjectCaptions } from "@/server/video/captions"
import { requireProjectBudget } from "@/server/video/project-spend"
import {
  getAiDefaults,
  getVoiceDefaults,
  saveAiDefaults,
  saveVoiceDefaults,
} from "@/server/video/settings"
import { rewriteHook, type HookVariants } from "@/server/video/hooks"
import { checkScript } from "@/server/video/script-check"
import { translateLines } from "@/server/video/translate"
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

export type { CaptionsResult }

/** The project a tool is used in, when it is used in one. */
const optionalProjectId = z.string().min(1).max(36).optional()

/**
 * Holds a tool to its project's spend limit. A tool used outside any project
 * has no limit to hold it to.
 */
async function budget(userId: string, projectId: string | undefined, nextCents: number) {
  if (projectId) await requireProjectBudget(userId, projectId, nextCents)
}

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
  if (AI_KEY_MISSING_MESSAGES.has(message)) return message
  if (message === PROJECT_NOT_FOUND_MESSAGE) return message
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
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<CaptionsResult> => {
    await budget(context.user.id, data.projectId, 0)
    return writeProjectCaptions(context.user.id, data.projectId)
  })

export function writeCaptions(projectId: string) {
  return writeCaptionsFn({ data: { projectId } })
}

const jumpCutsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
      mode: z.enum(["dead-air", "filler"]),
      sensitivity: z.enum(["gentle", "balanced", "tight"]),
      // Checked again on the server against the list of terms it knows.
      fillerTerms: z.array(z.string().max(40)).max(40).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<JumpCutAnalysis> => {
    await budget(context.user.id, data.projectId, 0)
    return analyseJumpCuts({
      userId: context.user.id,
      projectId: data.projectId,
      clipId: data.clipId,
      mode: data.mode,
      sensitivity: data.sensitivity,
      fillerTerms: data.fillerTerms,
    })
  })

export function findJumpCuts(options: {
  projectId: string
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
      projectId: z.string().min(1).max(36),
      clipId: z.string().min(1).max(64),
    })
  )
  .handler(async ({ data, context }): Promise<ClipTranscript> => {
    await budget(context.user.id, data.projectId, 0)
    return transcribeClip({
      userId: context.user.id,
      projectId: data.projectId,
      clipId: data.clipId,
    })
  })

/**
 * Writing down what a clip says. A POST rather than a GET because it is real
 * work that costs money, not a page's worth of reading.
 */
export function loadClipTranscript(projectId: string, clipId: string) {
  return transcriptFn({ data: { projectId, clipId } })
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
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<HookVariants> => {
    await budget(context.user.id, data.projectId, 0)
    return rewriteHook({ userId: context.user.id, projectId: data.projectId })
  })

export function rewriteOpeningLine(projectId: string) {
  return hookFn({ data: { projectId } })
}

const checkScriptFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      script: z.string().max(VOICE_TEXT_MAX),
      speed: z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX),
      projectId: optionalProjectId,
    })
  )
  .handler(async ({ data, context }): Promise<ScriptCheck> => {
    await budget(context.user.id, data.projectId, 0)
    return checkScript({
      userId: context.user.id,
      script: data.script,
      speed: data.speed,
      projectId: data.projectId,
    })
  })

/** Check a script against the five rules before it is read aloud. */
export function checkVoiceScript(script: string, speed: number, projectId?: string) {
  return checkScriptFn({ data: { script, speed, projectId } })
}

const speakHookFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      text: z.string().min(1).max(VOICE_TEXT_MAX),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      projectId: optionalProjectId,
    })
  )
  .handler(async ({ data, context }): Promise<VoiceoverResult> => {
    const remembered = await getVoiceDefaults()
    // Only meaningful for a voice that has models to choose between; the
    // other provider works it out from the voice itself.
    const modelId = remembered?.modelId ?? "eleven_multilingual_v2"
    await budget(context.user.id, data.projectId, aiUnitCostCents(modelId, data.text.length))
    return speak({
      userId: context.user.id,
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      modelId,
      text: data.text,
      settings: rememberedVoiceSettings(remembered),
      projectId: data.projectId,
    })
  })

/** Say a rewritten opening line out loud, so the sound can replace the old one. */
export function speakHook(text: string, voice: Voice, projectId?: string) {
  return speakHookFn({
    data: { text, voiceId: voice.id, voiceName: voice.name, projectId },
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
      projectId: optionalProjectId,
    })
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    await budget(context.user.id, data.projectId, 0)
    return translateLines({
      userId: context.user.id,
      language: data.language,
      lines: data.lines,
      projectId: data.projectId,
    })
  })

/**
 * Caption lines in another language, one back for each one sent, in order.
 * Nothing on the timeline changes; the editor shows them first.
 */
export function translateCaptionLines(
  language: TranslateLanguage,
  lines: string[],
  projectId?: string
) {
  return translateFn({ data: { language, lines, projectId } })
}

const speakTranslationFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      text: z.string().min(1).max(VOICE_TEXT_MAX),
      voiceId: z.string().min(1).max(64),
      voiceName: z.string().min(1).max(255),
      projectId: optionalProjectId,
    })
  )
  .handler(async ({ data, context }): Promise<VoiceoverResult> => {
    const remembered = await getVoiceDefaults()
    await budget(
      context.user.id,
      data.projectId,
      aiUnitCostCents(TRANSLATE_VOICE_MODEL, data.text.length)
    )
    return speak({
      userId: context.user.id,
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      // Always ElevenLabs, always the multilingual model: it is the one that
      // speaks every language on the list.
      speaker: "elevenlabs",
      modelId: TRANSLATE_VOICE_MODEL,
      text: data.text,
      settings: rememberedVoiceSettings(remembered),
      feature: "translation_voice",
      projectId: data.projectId,
    })
  })

/** Read a translation aloud, so it can be laid over the original. */
export function speakTranslation(text: string, voice: Voice, projectId?: string) {
  return speakTranslationFn({
    data: { text, voiceId: voice.id, voiceName: voice.name, projectId },
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
      projectId: optionalProjectId,
    })
  )
  .handler(async ({ data, context }): Promise<VoiceoverResult> => {
    await budget(
      context.user.id,
      data.projectId,
      aiUnitCostCents(data.modelId, data.text.length)
    )
    return speak({
      userId: context.user.id,
      voiceId: data.voiceId,
      voiceName: data.voiceName,
      modelId: data.modelId,
      text: data.text,
      settings: data.settings,
      projectId: data.projectId,
    })
  })

export function readAloud(options: {
  voiceId: string
  voiceName: string
  modelId: (typeof VOICE_MODEL_IDS)[number]
  text: string
  settings?: z.infer<typeof voiceSettingsSchema>
  /** The project it is read for, which pays for it and holds it to its limit. */
  projectId?: string
}) {
  return speakFn({ data: options })
}

export type {
  AiDefaults,
  ClipTranscript,
  HookVariants,
  JumpCutAnalysis,
  ScriptCheck,
  Voice,
  VoiceDefaults,
  VoiceoverResult,
}
