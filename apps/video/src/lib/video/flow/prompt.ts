import type { FlowStepOutput } from "./run-shape"

/** One node with a line into the one being asked, and what it made. */
export type FlowFeed = {
  title: string
  output: FlowStepOutput
  /** Lines for files it made that the AI can read, such as what is said in a video. */
  extra?: string[]
}

/**
 * What an AI node is sent: the prompt exactly as typed, then one labelled
 * block per node with a line into it, in step order. Nothing else is added
 * about what to do (Tyler, 14 Nov 2026: "No specific things ai should do.
 * That should be completely based on the prompts I give it"). The answer's
 * format is the one thing the app adds, after the blocks, so the reply can be
 * read.
 */
export function buildFlowPrompt(prompt: string, feeds: readonly FlowFeed[], answerFormat: string): string {
  const blocks = feeds.map((feed) => {
    const lines: string[] = []
    if (feed.output.text?.trim()) lines.push(feed.output.text.trim())
    if (feed.extra?.length) lines.push(...feed.extra)
    if (!lines.length) lines.push(feed.output.summary?.trim() || "(nothing to read)")
    return `### ${feed.title}\n${lines.join("\n")}`
  })
  return [prompt.trim(), ...(blocks.length ? ["## What is connected", ...blocks] : []), `## Answer\n${answerFormat}`].join(
    "\n\n"
  )
}

/** Every text the feeding nodes made, in step order, joined for a node that reads one text (AI voice). */
export function feedText(feeds: readonly FlowFeed[]): string {
  return feeds
    .map((feed) => feed.output.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
}
