/**
 * The AI's first idea for one video's prompt at one step (Tyler, 25 Nov 2026:
 * "it should however generate a random image prompt on step 1 (that I can
 * customize)", and for the steps after it, "if an image has a laptop with a
 * candle beside it and facing a window with outside snow falling. THe video
 * step2 can suggest to animate the snow falling and make the candle flicker").
 *
 * The flow is the channel and says how every video is built; the idea is only
 * what is in this one video.
 */

/** The most earlier videos' prompts sent, newest first, so a new idea differs from them. */
export const PROMPT_IDEA_EARLIER_MAX = 20

/** The most of an earlier step's made words sent with an idea request. */
const MADE_TEXT_MAX = 3_000

/** About how long an idea's request and answer are, for its price. */
export const PROMPT_IDEA_CHARACTERS = 3_000
export const PROMPT_IDEA_ANSWER_TOKENS = 300

export type PromptIdeaFeed = {
  title: string
  /** That step's prompt for this video. */
  videoPrompt: string | null
  /** Words typed into the picture's change box after it was made. */
  changedWith: string | null
  /** Words it made, such as a script. */
  text: string | null
}

export type PromptIdeaRequest = {
  flowName: string
  flowDescription: string
  stepTitle: string
  /** The kind's name, such as "AI picture". */
  kindName: string
  /** The node's prompt: how every video is built at this step. */
  structure: string
  feeds: PromptIdeaFeed[]
  /** This step's prompts in the flow's earlier videos, newest first. Only for a step nothing feeds. */
  earlier: string[]
}

/** What the writer is asked for one idea. */
export function promptIdeaRequest(request: PromptIdeaRequest): string {
  const blocks = [
    "You write the prompt for one step of one video on a video channel. The channel's own prompt says how every video is built; your words say only what is in this one video.",
    [`## The channel`, request.flowName.trim(), request.flowDescription.trim()].filter(Boolean).join("\n"),
    `## The step: ${request.stepTitle.trim()} (${request.kindName})\nHow every video of this channel is built at this step:\n${request.structure.trim()}`,
  ]
  const fed = request.feeds.flatMap((feed) => {
    const lines = [
      feed.videoPrompt?.trim() ? `This video's prompt: ${feed.videoPrompt.trim()}` : null,
      feed.changedWith?.trim() ? `Changed afterwards: ${feed.changedWith.trim()}` : null,
      feed.text?.trim() ? `What it made:\n${feed.text.trim().slice(0, MADE_TEXT_MAX)}` : null,
    ].filter((line): line is string => line !== null)
    return lines.length ? [`### ${feed.title.trim()}\n${lines.join("\n")}`] : []
  })
  if (fed.length) blocks.push(`## What the steps before it chose for this video\n${fed.join("\n\n")}`)
  const earlier = request.earlier.map((prompt) => prompt.trim()).filter(Boolean).slice(0, PROMPT_IDEA_EARLIER_MAX)
  if (earlier.length) {
    blocks.push(
      `## What this step was in the channel's earlier videos\n${earlier.map((prompt) => `- ${prompt.replace(/\s+/g, " ")}`).join("\n")}\nPick something clearly different from every one of these.`
    )
  }
  blocks.push(
    [
      "## What to write",
      fed.length
        ? "Only what is particular to this video at this step, built on what the steps before it chose: what is in it, what moves, the mood."
        : "A fresh idea for this video at this step: what is in it, the place, the light, the mood.",
      "Never repeat how every video is built; that is sent beside your words. Two or three plain sentences, no headings and no lists.",
      'Reply with JSON only, in this shape: {"prompt": "your words"}.',
    ].join("\n")
  )
  return blocks.join("\n\n")
}
