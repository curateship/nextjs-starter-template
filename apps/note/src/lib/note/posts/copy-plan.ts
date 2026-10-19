import type { PlanStep } from "@/lib/note/posts/posts"

/**
 * What Copy as text and Copy as Markdown put on the clipboard: who wrote the
 * post and where it is, the summary, and the plan with its ticks. A merged
 * plan names the post each step came from.
 */

export type CopyablePlan = {
  title: string
  url: string | null
  summary: string[]
  actionPlan: PlanStep[]
}

function from(step: PlanStep) {
  return step.from ? ` (${step.from})` : ""
}

export function planAsText(plan: CopyablePlan): string {
  const lines = [plan.title]
  if (plan.url) lines.push(plan.url)
  if (plan.summary.length) lines.push("", "Summary", ...plan.summary.map((line) => `- ${line}`))
  if (plan.actionPlan.length) {
    lines.push(
      "",
      "Action plan",
      ...plan.actionPlan.map((step) => `${step.done ? "[x]" : "[ ]"} ${step.text}${from(step)}`)
    )
  }
  return lines.join("\n")
}

/** Markdown special characters in the AI's words are escaped, so a step reads as written. */
function escape(text: string) {
  return text.replace(/([\\`*_[\]#|<>])/g, "\\$1")
}

export function planAsMarkdown(plan: CopyablePlan): string {
  const heading = plan.url ? `# [${escape(plan.title)}](${plan.url})` : `# ${escape(plan.title)}`
  const lines = [heading]
  if (plan.summary.length) lines.push("", "## Summary", "", ...plan.summary.map((line) => `- ${escape(line)}`))
  if (plan.actionPlan.length) {
    lines.push(
      "",
      "## Action plan",
      "",
      ...plan.actionPlan.map((step) => `- [${step.done ? "x" : " "}] ${escape(step.text)}${escape(from(step))}`)
    )
  }
  return lines.join("\n")
}
