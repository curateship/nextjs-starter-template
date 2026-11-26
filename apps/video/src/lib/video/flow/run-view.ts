import type { FlowRunStep } from "./flows"
import type { FlowRunStatus } from "./run-shape"

/** The state's colour, from the theme. Failed and waiting on you stand out; the words say the state too. */
export function runStatusClass(status: FlowRunStatus) {
  if (status === "failed") return "text-destructive"
  if (status === "waiting") return "text-primary"
  return "text-muted-foreground"
}

/** The blue of a speaker's name and of the Tip's heading in Tyler's picture of the guide, a lighter one on dark. */
export const GUIDE_BLUE = "text-blue-600 dark:text-blue-400"

/** The draft key for the words of a made step, edited while it waits for an OK. */
export const MADE_DRAFT = "__made"

/** The files each step with a line into this one made, step by step. */
export function fedFiles(steps: FlowRunStep[], step: FlowRunStep) {
  return steps
    .filter((from) => step.feeds.includes(from.nodeId) && from.output?.mediaIds?.length)
    .map((from) => ({ id: from.id, title: from.title, mediaIds: from.output!.mediaIds! }))
}
