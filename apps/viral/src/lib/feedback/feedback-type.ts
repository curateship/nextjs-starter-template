import type * as React from "react"

import type { Badge } from "@/components/ui/badge"
import type { FeedbackType } from "@/lib/api/feedback"

/**
 * How a piece of feedback's kind is written and coloured. Four screens show
 * these — the feedback dashboard, its comments, an account's own page and the
 * member feedback popup — so the wording, the order and the colours live here
 * once and every screen moves together when they change.
 */

/** The order the kinds are offered and read in, everywhere. */
export const FEEDBACK_TYPES: readonly FeedbackType[] = [
  "suggestion",
  "bug_report",
  "question",
  "praise",
]

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  suggestion: "Suggestion",
  bug_report: "Bug report",
  question: "Question",
  praise: "Praise",
}

export const feedbackTypeBadgeVariants: Record<
  FeedbackType,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  suggestion: "default",
  bug_report: "destructive",
  question: "outline",
  praise: "secondary",
}

/**
 * The two kinds that need a colour of their own.
 *
 * Each repeats its resting colour under `hover:`, in both themes. In the
 * feedback popup these are clickable filter buttons, and a button variant
 * brings its own hover background — including a separate dark-mode one — that
 * would otherwise wash the yellow or green away under the pointer. Both have to
 * be answered, or the chip stays coloured in light mode and turns grey in dark.
 *
 * On the badges everywhere else this changes nothing: hovering repaints the
 * colour they were already showing.
 */
export const feedbackTypeClassNames: Record<FeedbackType, string> = {
  suggestion: "",
  bug_report: "",
  question:
    "border-yellow-200 bg-yellow-100 text-yellow-900 hover:bg-yellow-100 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200 dark:hover:bg-yellow-950/50",
  praise:
    "border-green-200 bg-green-100 text-green-900 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200 dark:hover:bg-green-950/50",
}
