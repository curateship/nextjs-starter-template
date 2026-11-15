import { voiceCostCents, writerCostCents } from "@/lib/video/ai-estimates"
import { aiMusicCostCents, aiMusicLengthMs } from "@/lib/video/ai-music"
import type { WriterId } from "@/lib/video/ai-choices"
import { BRIEF_DEFAULT_PICTURE_MODEL, scenePictureCents } from "@/lib/video/brief"

import type { FlowKind } from "./node-kinds"

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
 * - **AI music:** a track as long as the connected video; a minute until it
 *   is known.
 */
export type FlowEstimateFacts = {
  writer: WriterId | null
  /** Everything the prompt will hold, in characters. */
  promptCharacters: number
  /** AI voice: what it will read, and with which voice model. */
  readCharacters?: number
  voiceModel?: string
  /** AI music: how long the track will be. */
  lengthMs?: number
}

const GUESS_READ_CHARACTERS = 1_000
const GUESS_MUSIC_MS = 60_000
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
      return scenePictureCents(BRIEF_DEFAULT_PICTURE_MODEL)
    case "ai-thumbnail":
      return scenePictureCents(BRIEF_DEFAULT_PICTURE_MODEL) + ask(400)
    case "ai-voice":
      return voiceCostCents(facts.voiceModel ?? DEFAULT_VOICE_MODEL, facts.readCharacters ?? GUESS_READ_CHARACTERS)
    case "ai-music":
      return aiMusicCostCents(aiMusicLengthMs(facts.lengthMs ?? GUESS_MUSIC_MS))
  }
}
