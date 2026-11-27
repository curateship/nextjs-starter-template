import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { voiceCostCents, writerCostCents } from "@/lib/video/ai-estimates"
import { FLOW_PICTURE_SIZE, IMAGE_SIZE_UNITS, shotCostCents } from "@/lib/video/asset-factories"
import { aiMusicCostCents, aiMusicLengthMs } from "@/lib/video/ai-music"
import type { WriterId } from "@/lib/video/ai-choices"
import { BRIEF_DEFAULT_PICTURE_MODEL, scenePictureCents } from "@/lib/video/brief"

import { aiSoundCostCents } from "@/lib/video/ai-sound-effects"
import { VIDEO_MODELS } from "@/lib/video/video-models"

import {
  DEFAULT_CLIP_SETTINGS,
  DEFAULT_MUSIC_SETTINGS,
  DEFAULT_SOUND_SETTINGS,
  type FlowKind,
  type FlowNodeSettings,
} from "./node-kinds"

/**
 * About what one AI step costs, before it runs (workspace/docs/flow.md,
 * "Prices"). Everything a step is sent is known only once the nodes feeding
 * it are done, so the builder shows "from about" with the guesses below, and
 * the steps page works it out again from what is really there.
 *
 * - **AI text:** one ask of the saved writer, about 1,500 tokens back.
 * - **AI video:** one ask with every connected video's words in it, about
 *   3,000 tokens back. Writing down a video nobody has written down yet is
 *   added on the steps page, where its length is known.
 * - **AI picture:** one picture on Nano Banana 2, as a brief's scene.
 * - **AI thumbnail:** one picture edit and one short ask to place the words.
 * - **AI voice:** the connected text read by the character; 1,000 characters
 *   until it is known.
 * - **AI clip, music and sound:** what their settings on the canvas ask for
 *   (`flowNodeMakingCents`), a moving clip by its model, size and length,
 *   each track by its length, a sound by its length.
 */
export type FlowEstimateFacts = {
  writer: WriterId | null
  /** Everything the prompt will hold, in characters. */
  promptCharacters: number
  /** AI voice: what it will read, and with which voice model. */
  readCharacters?: number
  voiceModel?: string
  /** AI clip, music and sound: the node's settings; the defaults until known. */
  settings?: Pick<FlowNodeSettings, "clip" | "music" | "sound">
}

const GUESS_READ_CHARACTERS = 1_000
const DEFAULT_VOICE_MODEL = "eleven_multilingual_v2"

export function flowStepEstimateCents(kind: FlowKind, facts: FlowEstimateFacts): number {
  const ask = (answerTokens: number) =>
    facts.writer ? writerCostCents(facts.writer, facts.promptCharacters, answerTokens) : 0
  switch (kind) {
    case "ai-text":
      return ask(1_500)
    case "ai-video":
      return ask(3_000)
    case "ai-picture":
      return aiUnitCostCents(BRIEF_DEFAULT_PICTURE_MODEL, IMAGE_SIZE_UNITS[FLOW_PICTURE_SIZE])
    case "ai-thumbnail":
      return scenePictureCents(BRIEF_DEFAULT_PICTURE_MODEL) + ask(400)
    case "ai-voice":
      return voiceCostCents(facts.voiceModel ?? DEFAULT_VOICE_MODEL, facts.readCharacters ?? GUESS_READ_CHARACTERS)
    case "ai-clip":
    case "ai-music":
    case "ai-sound":
      return flowNodeMakingCents(kind, facts.settings ?? DEFAULT_MAKING)
  }
}

const DEFAULT_MAKING = { clip: DEFAULT_CLIP_SETTINGS, music: DEFAULT_MUSIC_SETTINGS, sound: DEFAULT_SOUND_SETTINGS }

/**
 * What an AI clip, music or sound node's settings cost to make, the price it
 * shows before paying and in the builder.
 */
export function flowNodeMakingCents(kind: "ai-clip" | "ai-music" | "ai-sound", settings: Pick<FlowNodeSettings, "clip" | "music" | "sound">) {
  if (kind === "ai-clip") {
    const { company, size, seconds, sound } = settings.clip
    const model = VIDEO_MODELS[company]
    return shotCostCents(seconds, model.id, size, model.soundSwitch ? sound : true)
  }
  if (kind === "ai-music") return settings.music.tracks * aiMusicCostCents(aiMusicLengthMs(settings.music.seconds * 1000))
  return aiSoundCostCents(settings.sound.seconds)
}
