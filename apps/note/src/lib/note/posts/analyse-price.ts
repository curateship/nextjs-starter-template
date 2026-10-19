import { AI_MODEL_OPTIONS, AI_MODEL_PRICES, DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import { SIMILAR_POSTS_MAX, type AnalyseInputs } from "@/lib/note/posts/posts"

/**
 * What pressing Analyse on posts will cost, worked out in the browser before
 * anything is spent, from the shell's one price list.
 *
 * One Gemini call per post reads the words at about 4 characters a token,
 * each picture at about 1,120 tokens, and a short line for each of up to 200
 * saved posts it compares against, and writes about 1,200 tokens back. A
 * video is written down first, the same as Analyse on a video: the sound in
 * at about 32 tokens a second and the words out at about 4, which the plan
 * then reads too.
 */

const CHARS_PER_TOKEN = 4
const PICTURE_TOKENS = 1_120
const SIMILAR_LINE_TOKENS = 40
const PROMPT_TOKENS = 600
const ANSWER_TOKENS = 1_200
const SOUND_TOKENS_PER_SECOND = 32
const WORD_TOKENS_PER_SECOND = 4
const MERGE_ANSWER_TOKENS = 1_000

function dollars(inputTokens: number, outputTokens: number) {
  const price = AI_MODEL_PRICES[DEFAULT_AI_MODEL.gemini]
  if (!price) return 0
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
}

export function postAnalyseDollars(inputs: AnalyseInputs, similarCount: number): number {
  const seconds = Math.max(0, inputs.videoSeconds)
  const spoken = seconds * WORD_TOKENS_PER_SECOND
  const transcribing = dollars(seconds * SOUND_TOKENS_PER_SECOND, spoken)
  const reading =
    PROMPT_TOKENS +
    Math.ceil(Math.max(0, inputs.chars) / CHARS_PER_TOKEN) +
    spoken +
    Math.max(0, inputs.pictures) * PICTURE_TOKENS +
    Math.min(Math.max(0, similarCount), SIMILAR_POSTS_MAX) * SIMILAR_LINE_TOKENS
  return (seconds ? transcribing : 0) + dollars(reading, ANSWER_TOKENS)
}

function mergeDollars(planChars: number): number {
  return dollars(PROMPT_TOKENS + Math.ceil(Math.max(0, planChars) / CHARS_PER_TOKEN), MERGE_ANSWER_TOKENS)
}

function modelName() {
  return (
    AI_MODEL_OPTIONS.gemini.find((option) => option.id === DEFAULT_AI_MODEL.gemini)?.label ??
    DEFAULT_AI_MODEL.gemini
  )
}

export function cents(amount: number) {
  const exact = amount * 100
  return exact < 1 ? "under 1¢" : `about ${Math.round(exact)}¢`
}

/**
 * The line above the Analyse button: "Analysing costs under 1¢ with Gemini
 * 3.8 Flash." Once a post was analysed, it says what goes, because Analyse
 * again replaces the plan along with every tick and edit (Tyler, 19 Oct 2026:
 * "Replace all, warn first").
 */
export function postPriceLine(inputs: AnalyseInputs, similarCount: number, again: boolean) {
  const line = `${again ? "Analysing again" : "Analysing"} costs ${cents(postAnalyseDollars(inputs, similarCount))} with ${modelName()}`
  return again ? `${line} and replaces the summary, the plan and your ticks and edits.` : `${line}.`
}

/**
 * "Analysing 3 posts costs about 2¢ with Gemini 3.8 Flash." When some of them
 * were analysed before, it says their plans go, the same warning the single
 * Analyse again gives.
 */
export function manyPriceLine(posts: { analyse: AnalyseInputs; status: string }[], similarCount: number) {
  const total = posts.reduce((sum, post) => sum + postAnalyseDollars(post.analyse, similarCount), 0)
  const what = posts.length === 1 ? "1 post" : `${posts.length} posts`
  const line = `Analysing ${what} costs ${cents(total)} with ${modelName()}.`
  const again = posts.filter((post) => post.status === "ready").length
  if (!again) return line
  return `${line} It replaces the plan${again === 1 ? "" : "s"} of the ${again === 1 ? "one" : again} already analysed, ticks and edits included.`
}

export function mergePriceLine(posts: { planChars: number }[]) {
  const chars = posts.reduce((sum, post) => sum + post.planChars, 0)
  return `One plan from ${posts.length} posts costs ${cents(mergeDollars(chars))} with ${modelName()}.`
}
