import { AI_MODEL_PRICES, AI_UNIT_PRICES } from "@/lib/ai/ai-models"
import {
  TRANSCRIBERS,
  WRITERS,
  type TranscriberId,
  type WriterId,
} from "@/lib/video/ai-choices"
import {
  formatCheckCost,
  SCRIPT_BASE_WORDS_PER_MINUTE,
  scriptCheckCostCents,
} from "@/lib/video/script-check"
import { OPENAI_VOICE_MODEL } from "@/lib/video/remake-clip"
import { planTranscriptPieces } from "@/lib/video/transcripts"

/**
 * What an AI tool will cost before it is pressed, in cents to a fraction of a
 * cent, worked out from the shell's price list (`src/lib/ai/ai-models.ts`).
 *
 * Every figure is what the meter will record for the same run, not a quote
 * from the provider's bill: the meter is what the AI usage page and a
 * project's spend limit read. The pattern is `scriptCheckCostCents` in
 * `script-check.ts`.
 *
 * The counts below that are not prices are estimates of how much text a tool
 * sends and gets back. Each one says where it came from.
 */

/** Gemini counts a second of sound as 32 tokens (Google's own figure). */
const GEMINI_AUDIO_TOKENS_PER_SECOND = 32

/** The written instructions sent with each piece of sound, in tokens. */
const TRANSCRIBE_PROMPT_TOKENS = 250

/**
 * What Gemini answers per minute of talking. A minute is about 160 words, and
 * each comes back as `{ "text": "...", "startMs": ..., "endMs": ... }`, about
 * 12 tokens.
 */
const GEMINI_WORDS_TOKENS_PER_MINUTE = 160 * 12

/** About this many characters are said in a minute of talking. */
const CHARACTERS_PER_MINUTE_OF_TALK = 900

/** A token is about four characters of English. */
const CHARACTERS_PER_TOKEN = 4

function tokenCostCents(model: string, inputTokens: number, outputTokens: number) {
  const price = AI_MODEL_PRICES[model]
  if (!price) return 0
  return (
    ((inputTokens * price.inputPerMillion +
      outputTokens * price.outputPerMillion) /
      1_000_000) *
    100
  )
}

function unitCostCents(model: string, units: number) {
  const price = AI_UNIT_PRICES[model]
  if (!price || !Number.isFinite(units) || units <= 0) return 0
  return units * price.dollarsPerUnit * 100
}

/**
 * Writing down this much of a file's sound.
 *
 * Whisper is the price list's rate per minute, overlap included, since that is
 * what it listens to. Gemini is the sound's tokens in plus the words out.
 */
export function transcribeCostCents(id: TranscriberId, soundMs: number) {
  if (!Number.isFinite(soundMs) || soundMs <= 0) return 0
  const pieces = planTranscriptPieces(soundMs)
  const heardMs = pieces.reduce((sum, piece) => sum + piece.durationMs, 0)
  const transcriber = TRANSCRIBERS.find((one) => one.id === id)
  if (!transcriber) return 0
  if (transcriber.id === "openai") {
    return unitCostCents(transcriber.model, heardMs / 60_000)
  }
  const inputTokens =
    (heardMs / 1000) * GEMINI_AUDIO_TOKENS_PER_SECOND +
    pieces.length * TRANSCRIBE_PROMPT_TOKENS
  const outputTokens = (heardMs / 60_000) * GEMINI_WORDS_TOKENS_PER_MINUTE
  return tokenCostCents(transcriber.model, inputTokens, outputTokens)
}

/** Nothing to write down when the file's words are already saved. */
export function captionsCostCents({
  transcriber,
  fileSoundMs,
  saved,
}: {
  transcriber: TranscriberId
  /** The whole file's sound, which is what the first run writes down. */
  fileSoundMs: number
  saved: boolean
}) {
  return saved ? 0 : transcribeCostCents(transcriber, fileSoundMs)
}

/**
 * The Hook prompt's own wording is about this long, before the line itself
 * goes in (`hookPrompt` in `src/server/video/hooks.ts`).
 */
const HOOK_PROMPT_CHARACTERS = 800

/**
 * What each writer answers a hook with, thinking included. Three lines are
 * about 60 tokens; the rest is the thinking GPT and Claude are billed for.
 *
 * GPT's figure is measured: a hook on 19 Oct 2026 came back at 863 tokens
 * out. Gemini's and Claude's are estimates until one is run.
 */
const HOOK_ANSWER_TOKENS: Record<WriterId, number> = {
  gemini: 150,
  openai: 900,
  anthropic: 700,
}

/**
 * Three other opening lines. When nothing is written on screen, the opening
 * seconds are written down first, unless the file's words are saved.
 */
export function hookCostCents({
  writer,
  lineCharacters,
  listen,
}: {
  writer: WriterId
  lineCharacters: number
  /** The spoken opening to write down first, when there is no text on screen. */
  listen?: { transcriber: TranscriberId; soundMs: number; saved: boolean }
}) {
  const model = WRITERS.find((one) => one.id === writer)?.model
  if (!model) return 0
  const writing = tokenCostCents(
    model,
    (HOOK_PROMPT_CHARACTERS + lineCharacters) / CHARACTERS_PER_TOKEN,
    HOOK_ANSWER_TOKENS[writer]
  )
  const listening =
    listen && !listen.saved
      ? transcribeCostCents(listen.transcriber, listen.soundMs)
      : 0
  return writing + listening
}

/**
 * Reading these many characters aloud with this voice model. An OpenAI voice
 * is then played to Whisper to time its words, guessed at 900 characters a
 * minute of talking.
 */
export function voiceCostCents(model: string, characters: number) {
  const reading = unitCostCents(model, characters)
  if (model !== OPENAI_VOICE_MODEL) return reading
  return reading + unitCostCents("whisper-1", characters / CHARACTERS_PER_MINUTE_OF_TALK)
}

/** The translation prompt's own wording, before the lines go in. */
const TRANSLATE_PROMPT_CHARACTERS = 850

/**
 * Thinking each writer is billed for on top of the translated lines.
 *
 * GPT's figure is measured twice: 13 seconds of talking came back at about
 * 1,000 tokens out, and eight one-word lines on 19 Oct 2026 at 615. Gemini's
 * and Claude's are estimates until one is run.
 */
const TRANSLATE_THINKING_TOKENS: Record<WriterId, number> = {
  gemini: 0,
  openai: 800,
  anthropic: 600,
}

/**
 * Another language: writing the talking down, unless its words are saved or
 * already in the window, then translating every line. The voice is its own
 * press with its own price (`voiceCostCents`).
 */
export function translateCostCents({
  writer,
  linesCharacters,
  talkMs,
  listen,
}: {
  writer: WriterId
  /** The caption lines' characters, once they are known. */
  linesCharacters?: number
  /** How long the talking runs, for guessing the lines before they exist. */
  talkMs: number
  /** Writing the file down first, when it is not in the window yet. */
  listen?: { transcriber: TranscriberId; fileSoundMs: number; saved: boolean }
}) {
  const model = WRITERS.find((one) => one.id === writer)?.model
  if (!model) return 0
  const characters =
    linesCharacters ??
    (Math.max(0, talkMs) / 60_000) * CHARACTERS_PER_MINUTE_OF_TALK
  // Sent as a JSON list, so each line gains its quotes and comma. Another
  // language usually takes a few more tokens to say the same thing.
  const inputTokens =
    (TRANSLATE_PROMPT_CHARACTERS + characters * 1.15) / CHARACTERS_PER_TOKEN
  const outputTokens =
    (characters * 1.15 * 1.2) / CHARACTERS_PER_TOKEN +
    TRANSLATE_THINKING_TOKENS[writer]
  const translating = tokenCostCents(model, inputTokens, outputTokens)
  const listening =
    listen && !listen.saved
      ? transcribeCostCents(listen.transcriber, listen.fileSoundMs)
      : 0
  return translating + listening
}

/**
 * The Brief to video prompt's own wording, before the brief goes in
 * (`briefPrompt` in `src/server/video/briefs.ts`).
 */
const BRIEF_PROMPT_CHARACTERS = 3_000

/**
 * Thinking each writer is billed for on top of the script. Estimates until a
 * brief is run with each, scaled from the script check's measured figures.
 */
const BRIEF_THINKING_TOKENS: Record<WriterId, number> = {
  gemini: 400,
  openai: 3_000,
  anthropic: 1_500,
}

/**
 * Writing a brief's script, then checking it. A word is about six characters
 * with its space, and each scene of about five seconds adds a picture
 * direction of about 150 characters with its JSON around it.
 */
export function briefScriptCostCents({
  writer,
  lengthSeconds,
  briefCharacters,
}: {
  writer: WriterId
  lengthSeconds: number
  /** What it is about and who it is for, as typed. */
  briefCharacters: number
}) {
  const model = WRITERS.find((one) => one.id === writer)?.model
  if (!model || !Number.isFinite(lengthSeconds) || lengthSeconds <= 0) return 0
  const scriptCharacters = ((lengthSeconds * SCRIPT_BASE_WORDS_PER_MINUTE) / 60) * 6
  const answerCharacters = scriptCharacters + (lengthSeconds / 5) * 150
  const writing = tokenCostCents(
    model,
    (BRIEF_PROMPT_CHARACTERS + briefCharacters) / CHARACTERS_PER_TOKEN,
    answerCharacters / CHARACTERS_PER_TOKEN + BRIEF_THINKING_TOKENS[writer]
  )
  return writing + scriptCheckCostCents(scriptCharacters, writer)
}

/**
 * The B-roll phrase prompt's own wording, before the sentences go in
 * (`brollPhrasesPrompt` in `src/server/video/b-roll.ts`).
 */
const BROLL_PROMPT_CHARACTERS = 1_600

/** A sentence of narration runs about four seconds. */
const BROLL_MS_PER_SENTENCE = 4_000

/**
 * The thinking GPT and Claude are billed for on a list of short phrases.
 * Estimates until one is run.
 */
const BROLL_THINKING_TOKENS: Record<WriterId, number> = {
  gemini: 0,
  openai: 1_200,
  anthropic: 800,
}

/**
 * One search phrase per sentence of a voice line this long. The sentences go
 * in numbered, and each phrase comes back as about eight tokens.
 */
export function brollPhrasesCostCents({
  writer,
  talkMs,
}: {
  writer: WriterId
  talkMs: number
}) {
  const model = WRITERS.find((one) => one.id === writer)?.model
  if (!model || !Number.isFinite(talkMs) || talkMs <= 0) return 0
  const sentences = Math.max(1, Math.round(talkMs / BROLL_MS_PER_SENTENCE))
  const said = (talkMs / 60_000) * CHARACTERS_PER_MINUTE_OF_TALK
  return tokenCostCents(
    model,
    (BROLL_PROMPT_CHARACTERS + said + sentences * 6) / CHARACTERS_PER_TOKEN,
    sentences * 8 + 30 + BROLL_THINKING_TOKENS[writer]
  )
}

/**
 * One ask of the saved writer: the words sent, at four characters a token,
 * and about `answerTokens` back, thinking included.
 */
export function writerCostCents(
  writer: WriterId,
  promptCharacters: number,
  answerTokens: number
) {
  const model = WRITERS.find((one) => one.id === writer)?.model
  if (!model) return 0
  return tokenCostCents(model, promptCharacters / CHARACTERS_PER_TOKEN, answerTokens)
}

/**
 * What Gemini counts one picture sent to it as. Google's Gemini 3 models read
 * a picture at 1,120 tokens unless told to read it smaller, so that is used
 * for every picture until a run is measured.
 */
export const GEMINI_PICTURE_TOKENS = 1_120

/** The model that reads pictures for the blur and the thumbnail tools. */
export const PICTURE_READER_MODEL = "gemini-3.8-flash"

/** The most frames sent in one ask when a blur follows something. */
export const BLUR_FOLLOW_FRAMES_PER_ASK = 24

/**
 * Following a blur's spot: a frame every half second, sent in asks of up to
 * 24 with the first frame again at the front of each, and a box of about 30
 * tokens back for each frame.
 */
export function blurFollowCostCents(frames: number) {
  if (frames <= 0) return 0
  const asks = Math.ceil(frames / BLUR_FOLLOW_FRAMES_PER_ASK)
  const pictures = frames + asks
  return tokenCostCents(
    PICTURE_READER_MODEL,
    pictures * GEMINI_PICTURE_TOKENS + asks * 300,
    frames * 30
  )
}

/** Finding the faces on one frame: one picture in, a few boxes back. */
/** The most frames sent in one ask when the teaser's moments are scored. */
export const TEASER_FRAMES_PER_ASK = 30

/**
 * Scoring the teaser's moments (teaser.md): every still is sent once, in
 * asks of up to 30, and about 25 tokens of score and reason come back for
 * each.
 */
export function teaserCostCents(stills: number) {
  if (stills <= 0) return 0
  const asks = Math.ceil(stills / TEASER_FRAMES_PER_ASK)
  return tokenCostCents(PICTURE_READER_MODEL, stills * GEMINI_PICTURE_TOKENS + asks * 300, stills * 25)
}

/**
 * Gemini watching a reference video shot by shot (templates.md, part 8):
 * Google counts a second of video with its sound at about 300 tokens, and
 * the breakdown back runs to about 3,000. A video of unknown length is
 * priced as a minute.
 */
export function videoBreakdownCostCents(durationSeconds: number | null) {
  const seconds = durationSeconds && durationSeconds > 0 ? durationSeconds : 60
  return tokenCostCents(PICTURE_READER_MODEL, seconds * 300 + 800, 3_000)
}

export function findFacesCostCents() {
  return tokenCostCents(PICTURE_READER_MODEL, GEMINI_PICTURE_TOKENS + 200, 400)
}

/**
 * What a button says after its label: "no charge" for nothing at all,
 * otherwise `formatCheckCost`'s "about 4¢", and dollars from a dollar up.
 */
export function formatAiEstimate(cents: number) {
  if (!Number.isFinite(cents) || cents <= 0) return "no charge"
  if (cents >= 100) return `about $${(cents / 100).toFixed(2)}`
  return formatCheckCost(cents)
}

/** "Write them · about 4¢", or the label alone when there is no estimate. */
export function withEstimate(label: string, cents: number | null) {
  return cents === null ? label : `${label} · ${formatAiEstimate(cents)}`
}
