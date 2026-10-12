import { z } from "zod"

import { AI_MODEL_PRICES } from "@/lib/ai/ai-models"
import { plural } from "@/lib/format/plural"
import { WRITERS, type WriterId } from "@/lib/video/ai-choices"

/**
 * Checking a script before it is read aloud.
 *
 * Two halves. The sums (how many words, how fast, how long) are plain
 * arithmetic, so they live here and the Voice window shows them as you type.
 * The checklist needs an AI to read the words, and runs on the server in
 * `src/server/video/script-check.ts`. This file holds what both halves agree
 * on: the rules, the shape of the answer, and what a check costs.
 *
 * It is a checklist, not a prediction. Nothing here says a script will do
 * well; it says which rules the script breaks.
 */

/**
 * How fast a voice reads at 1x, in words a minute.
 *
 * The middle of the 160 to 180 a minute that Shorts narration holds people
 * at. It is not measured off the voices themselves: each voice has its own
 * pace, so the length shown is "about", and the real one is whatever the
 * voiceover comes back at.
 */
export const SCRIPT_BASE_WORDS_PER_MINUTE = 170

/** The three paces a Short is usually read at, shown side by side. */
export const SCRIPT_PACES = [160, 170, 180] as const

/** How long a stretch of speech may run without a question or a promise. */
export const SCRIPT_STRETCH_SECONDS = 30

/**
 * The words a script must never use, until somebody saves a list of their own
 * on Settings → Scripts. Once a list is saved it replaces these entirely.
 */
export const SCRIPT_STARTER_BANNED_WORDS = [
  "delve",
  "crucial",
  "game-changer",
  "unlock",
]

/** How many banned words the list may hold, and how long one may be. */
export const SCRIPT_BANNED_WORDS_MAX = 200
export const SCRIPT_BANNED_WORD_LENGTH_MAX = 60

export const scriptBannedWordsSchema = z
  .array(z.string().trim().min(1).max(SCRIPT_BANNED_WORD_LENGTH_MAX))
  .max(SCRIPT_BANNED_WORDS_MAX)

/**
 * The saved list, or null when none was ever saved or what is stored no
 * longer makes sense. Null means the starter words apply.
 */
export function readBannedWords(value: unknown): string[] | null {
  const parsed = scriptBannedWordsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * What was typed in the Settings box, as a list: one word or phrase per line
 * or between commas, spaces tidied, and each word once whatever its capitals.
 * A word too long or a list too long is a problem to show, not something to
 * cut short without saying.
 */
export function parseBannedWords(
  text: string
): { words: string[]; problem: string | null } {
  const seen = new Set<string>()
  const words: string[] = []
  for (const piece of text.split(/[\n,]/)) {
    const word = piece.trim().replace(/\s+/g, " ")
    if (!word || seen.has(word.toLowerCase())) continue
    seen.add(word.toLowerCase())
    words.push(word)
  }
  const tooLong = words.find((word) => word.length > SCRIPT_BANNED_WORD_LENGTH_MAX)
  if (tooLong) {
    return {
      words,
      problem: `"${tooLong.slice(0, 20)}…" is longer than ${SCRIPT_BANNED_WORD_LENGTH_MAX} characters. Banned words are single words or short phrases.`,
    }
  }
  if (words.length > SCRIPT_BANNED_WORDS_MAX) {
    return {
      words,
      problem: `That is ${words.length} words. The list holds up to ${SCRIPT_BANNED_WORDS_MAX}.`,
    }
  }
  return { words, problem: null }
}

export function countWords(script: string) {
  return script.trim().split(/\s+/).filter(Boolean).length
}

/** Seconds, rounded, for this many words at this pace. */
export function secondsToSay(words: number, wordsPerMinute: number) {
  if (words <= 0 || wordsPerMinute <= 0) return 0
  return Math.round((words * 60) / wordsPerMinute)
}

/** The pace the voice will read at, given the speed slider. */
export function wordsPerMinuteAt(speed: number) {
  return Math.round(SCRIPT_BASE_WORDS_PER_MINUTE * speed)
}

export type ScriptFigures = {
  words: number
  /** At the chosen speed. */
  wordsPerMinute: number
  /** How long the voiceover will come out at the chosen speed. */
  seconds: number
  /** The same script at 160, 170 and 180 words a minute. */
  atPaces: { wordsPerMinute: number; seconds: number }[]
}

export function scriptFigures(script: string, speed: number): ScriptFigures {
  const words = countWords(script)
  const wordsPerMinute = wordsPerMinuteAt(speed)
  return {
    words,
    wordsPerMinute,
    seconds: secondsToSay(words, wordsPerMinute),
    atPaces: SCRIPT_PACES.map((pace) => ({
      wordsPerMinute: pace,
      seconds: secondsToSay(words, pace),
    })),
  }
}

/** 67 reads "67 seconds"; 125 reads "2 minutes 5 seconds". */
export function formatRunLength(seconds: number) {
  if (seconds < 100) return `${seconds} ${plural(seconds, "second")}`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const head = `${minutes} ${plural(minutes, "minute")}`
  return rest ? `${head} ${rest} ${plural(rest, "second")}` : head
}

/** 67 reads "1:07". */
function clockTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export type SpeechStretch = { label: string; text: string }

/**
 * The script cut into 30-second stretches of speech at the chosen pace, each
 * labelled with when it is said ("0:30 to 1:00").
 *
 * A last stretch shorter than half a stretch joins the one before it: the
 * closing few seconds of a video have nothing left to promise.
 */
export function speechStretches(
  script: string,
  wordsPerMinute: number
): SpeechStretch[] {
  const words = script.trim().split(/\s+/).filter(Boolean)
  if (!words.length || wordsPerMinute <= 0) return []
  const perStretch = Math.max(
    1,
    Math.round((wordsPerMinute * SCRIPT_STRETCH_SECONDS) / 60)
  )

  const runs: string[][] = []
  for (let start = 0; start < words.length; start += perStretch) {
    runs.push(words.slice(start, start + perStretch))
  }
  const last = runs.at(-1)
  if (runs.length > 1 && last && last.length * 2 < perStretch) {
    runs.pop()
    runs[runs.length - 1].push(...last)
  }

  let said = 0
  return runs.map((run) => {
    const from = secondsToSay(said, wordsPerMinute)
    said += run.length
    const to = secondsToSay(said, wordsPerMinute)
    return {
      label: `${clockTime(from)} to ${clockTime(to)}`,
      text: run.join(" "),
    }
  })
}

/**
 * The words before the first comma or full stop: what has to hook somebody in
 * the first second.
 */
export function openingClause(script: string) {
  const text = script.trim().split(/[,.!?;:\n]/)[0]?.trim() ?? ""
  return { text, words: countWords(text) }
}

/** The five rules, in the order the window lists them. */
export const SCRIPT_RULE_IDS = [
  "hook",
  "opener",
  "keepWatching",
  "bannedWords",
  "figures",
] as const

export type ScriptRuleId = (typeof SCRIPT_RULE_IDS)[number]

const ruleAnswerSchema = z.object({
  passed: z.boolean(),
  words: z.array(z.string().max(300)).max(50),
})

/**
 * The answer the checker must give: every rule, by name, passed or failed,
 * with the words that failed it. A rule missing from the answer fails the
 * whole answer, so a check can never quietly skip one.
 */
export const scriptCheckAnswerSchema = z.object({
  hook: ruleAnswerSchema,
  opener: ruleAnswerSchema,
  keepWatching: ruleAnswerSchema,
  bannedWords: ruleAnswerSchema,
  figures: ruleAnswerSchema,
})

export type ScriptCheck = z.infer<typeof scriptCheckAnswerSchema>

/**
 * What each rule says on screen, passed and failed. A failed rule's words
 * follow its line after a colon.
 */
export const SCRIPT_RULE_TEXT: Record<
  ScriptRuleId,
  { passed: string; failed: string }
> = {
  hook: {
    passed: "Hooks in the first second",
    failed: "Takes more than a second to hook",
  },
  opener: {
    passed: "Gets straight to the point",
    failed: "Opens with a greeting",
  },
  keepWatching: {
    passed: "A question or a promise every 30 seconds",
    failed: "Goes 30 seconds without a question or promise",
  },
  bannedWords: {
    passed: "No banned words",
    failed: "Uses a banned word",
  },
  figures: {
    passed: "Every number written as words",
    failed: "Numbers written as digits",
  },
}

export const SCRIPT_CHECK_NO_TEXT_MESSAGE = "Write a script to check first"
export const SAFE_SCRIPT_CHECK_ERRORS = new Set([SCRIPT_CHECK_NO_TEXT_MESSAGE])

/**
 * Roughly how long the checker's instructions are, before the script itself
 * goes in. The server's prompt is held to this by a test, so the price shown
 * before the press cannot drift from the question actually sent.
 */
export const SCRIPT_CHECK_PROMPT_CHARACTERS = 2_400

/**
 * Roughly how many tokens each writer answers with, thinking included. The
 * answer itself is about 150; the rest is the thinking GPT and Claude are
 * billed for. Gemini's thinking is not on its bill as the meter reads it.
 *
 * GPT's figure is measured: a 1,007-character script on 12 Oct 2026 came back
 * at 2,628 tokens out. Gemini's and Claude's are estimates until one is run.
 */
const SCRIPT_CHECK_ANSWER_TOKENS: Record<WriterId, number> = {
  gemini: 300,
  openai: 2_600,
  anthropic: 1_200,
}

/**
 * What one check of a script this long costs with this writer, in cents, to a
 * fraction of a cent. A token is about four characters of English.
 */
export function scriptCheckCostCents(characters: number, writerId: WriterId) {
  const writer = WRITERS.find((one) => one.id === writerId)
  const price = writer ? AI_MODEL_PRICES[writer.model] : undefined
  if (!price) return 0
  const inputTokens = (SCRIPT_CHECK_PROMPT_CHARACTERS + characters) / 4
  const outputTokens = SCRIPT_CHECK_ANSWER_TOKENS[writerId]
  const dollars =
    (inputTokens * price.inputPerMillion +
      outputTokens * price.outputPerMillion) /
    1_000_000
  return dollars * 100
}

/** 0.04 reads "under 0.1¢", 0.43 reads "about 0.4¢", 4.2 reads "about 4¢". */
export function formatCheckCost(cents: number) {
  if (cents < 0.1) return "under 0.1¢"
  if (cents < 1) return `about ${cents.toFixed(1)}¢`
  return `about ${Math.round(cents)}¢`
}
